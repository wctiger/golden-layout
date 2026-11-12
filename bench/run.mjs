// Benchmark runner: drives the legacy and the rewritten layout through the same scenarios
// in headless Chromium and writes raw results to bench/results/. See docs/BENCHMARK_PLAN.md.
//
//   node bench/run.mjs                 full run
//   node bench/run.mjs --quick         small size, 5 samples, unthrottled
//   node bench/run.mjs --scenarios mount,splitter --sizes small,medium --samples 10 --cpu 1,4
import { execFileSync } from 'node:child_process';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { cpus, platform, release, totalmem } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { chromium } from 'playwright';

const here = import.meta.dirname;
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const quick = flag('quick');
const SAMPLES = Number(option('samples', quick ? 5 : 20));
const WARMUPS = Number(option('warmups', quick ? 1 : 3));
const SIZES = option('sizes', quick ? 'small' : 'small,medium,large').split(',');
const CPU = option('cpu', quick ? '1' : '1,4')
  .split(',')
  .map(Number);
const VERSIONS = ['legacy', 'next'];
const VIEWPORT = { width: 1600, height: 900 };

/* ---------------------------------------------------------------- helpers */

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

function serve(root) {
  const server = createServer((request, response) => {
    const path = normalize(decodeURIComponent(new URL(request.url, 'http://x').pathname));
    let file = join(root, path);
    if (!file.startsWith(root)) return response.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) return response.writeHead(404).end();
    response.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(response);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function metrics(cdp) {
  const { metrics: list } = await cdp.send('Performance.getMetrics');
  return Object.fromEntries(list.map((metric) => [metric.name, metric.value]));
}

/** Runs `work` and reports what the page spent on script, layout and style while it ran. */
async function measure(cdp, work) {
  const before = await metrics(cdp);
  const extra = (await work()) ?? {};
  const after = await metrics(cdp);
  const ms = (name) => (after[name] - before[name]) * 1000;
  return {
    script: ms('ScriptDuration'),
    layout: ms('LayoutDuration'),
    style: ms('RecalcStyleDuration'),
    cpu: ms('ScriptDuration') + ms('LayoutDuration') + ms('RecalcStyleDuration'),
    // All main-thread work. Unlike the sum above it does not count a layout twice when
    // script forces one, so this is the figure the versions are compared on.
    task: ms('TaskDuration'),
    layouts: after.LayoutCount - before.LayoutCount,
    styleRecalcs: after.RecalcStyleCount - before.RecalcStyleCount,
    ...extra,
  };
}

const frame = (page) => page.evaluate(() => window.benchTools.frames(1));
const totalRenders = (page) => page.evaluate(() => window.benchShared.totalRenders());

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
}

/** Moves the pointer along a path one step per animation frame, recording frame gaps. */
async function gesture(page, cdp, from, stops, steps, { release = true } = {}) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const rendersBefore = await totalRenders(page);
  const longBefore = await page.evaluate(() => window.benchTools.longTasks());
  await page.evaluate(() => window.benchTools.startFrames());
  const moved = await measure(cdp, async () => {
    let previous = from;
    for (const stop of stops) {
      for (let i = 1; i <= steps; i++) {
        await page.mouse.move(
          previous.x + ((stop.x - previous.x) * i) / steps,
          previous.y + ((stop.y - previous.y) * i) / steps,
        );
        await frame(page);
      }
      previous = stop;
    }
  });
  const frames = await page.evaluate(() => window.benchTools.stopFrames());
  const rendersDuring = (await totalRenders(page)) - rendersBefore;
  const dropped = release
    ? await measure(cdp, async () => {
        await page.mouse.up();
        await page.evaluate(() => window.benchTools.frames(2));
      })
    : null;
  const count = stops.length * steps;
  return {
    task: moved.task / count,
    dropTask: dropped?.task ?? 0,
    totalTask: moved.task + (dropped?.task ?? 0),
    cpu: moved.cpu / count,
    script: moved.script / count,
    layout: moved.layout / count,
    style: moved.style / count,
    layouts: moved.layouts / count,
    frameP50: percentile(frames, 50),
    frameP95: percentile(frames, 95),
    frameMax: Math.max(0, ...frames),
    droppedFrames: frames.filter((gap) => gap > 25).length,
    longTasks: (await page.evaluate(() => window.benchTools.longTasks())) - longBefore,
    panelRenders: rendersDuring,
    dropCpu: dropped?.cpu ?? 0,
    // The whole gesture, moves and release: comparable even where one version defers work.
    totalCpu: moved.cpu + (dropped?.cpu ?? 0),
  };
}

/** Performs an in-page action and waits two frames for the work it scheduled. */
const act = (page, cdp, body, arg) =>
  measure(cdp, async () => {
    const before = await totalRenders(page);
    const wall = await page.evaluate(
      async ({ source, value }) => {
        const start = performance.now();
        // oxlint-disable-next-line no-implied-eval, no-new-func -- runs scenario source in the page
        await new Function('arg', `return (async () => { ${source} })()`)(value);
        await window.benchTools.frames(2);
        return performance.now() - start;
      },
      { source: body, value: arg },
    );
    return { wall, panelRenders: (await totalRenders(page)) - before };
  });

/* -------------------------------------------------------------- scenarios */

const lastStack = { small: 's2', medium: 's5', large: 's15' };
const lastPanel = { small: 'p3', medium: 'p15', large: 'p63' };

/** Each scenario gets a freshly loaded page. `primary` names the metric that is compared. */
const scenarios = {
  mount: {
    title: 'Initial mount',
    primary: 'task',
    unit: 'ms',
    mounted: false,
    run: (page, cdp, size) => act(page, cdp, 'await window.bench.mount(arg)', size),
  },
  splitter: {
    title: 'Splitter drag (whole gesture: 60 moves and release)',
    primary: 'totalTask',
    unit: 'ms',
    async run(page, cdp) {
      const from = await page.evaluate(() => window.bench.splitterPoint());
      return gesture(page, cdp, from, [{ x: from.x + 300, y: from.y }], 60);
    },
  },
  resize: {
    title: 'Container resize (per size)',
    primary: 'task',
    unit: 'ms',
    async run(page, cdp) {
      const before = await totalRenders(page);
      await page.evaluate(() => window.benchTools.startFrames());
      const result = await measure(cdp, async () => {
        for (let i = 1; i <= 30; i++) {
          await page.evaluate(([w, h]) => window.bench.resize(w, h), [1600 - i * 20, 900 - i * 10]);
          await frame(page);
        }
      });
      const frames = await page.evaluate(() => window.benchTools.stopFrames());
      return {
        task: result.task / 30,
        cpu: result.cpu / 30,
        script: result.script / 30,
        layout: result.layout / 30,
        style: result.style / 30,
        layouts: result.layouts / 30,
        frameP95: percentile(frames, 95),
        frameMax: Math.max(0, ...frames),
        panelRenders: (await totalRenders(page)) - before,
      };
    },
  },
  tabs: {
    title: 'Tab switch (per switch)',
    primary: 'task',
    unit: 'ms',
    async run(page, cdp, size) {
      const count = { small: 2, medium: 3, large: 4 }[size];
      const result = await act(
        page,
        cdp,
        `for (let round = 0; round < 5; round++) for (let i = 0; i < arg; i++) {
           window.bench.activate('p' + ((i + 1) % arg)); await window.benchTools.frames(1);
         }`,
        count,
      );
      const switches = count * 5;
      return {
        ...result,
        task: result.task / switches,
        cpu: result.cpu / switches,
        script: result.script / switches,
        layout: result.layout / switches,
        style: result.style / switches,
      };
    },
  },
  open: {
    title: 'Open a panel',
    primary: 'task',
    unit: 'ms',
    run: (page, cdp) => act(page, cdp, "window.bench.openPanel('s0', 'pNew')"),
  },
  close: {
    title: 'Close panels until a stack collapses',
    primary: 'task',
    unit: 'ms',
    async run(page, cdp, size) {
      const panels = await page.evaluate(
        ({ stack, last }) => {
          const ids = [];
          const end = Number(last.slice(1));
          for (let i = end; i >= 0 && window.bench.stackOf('p' + i) === stack; i--)
            ids.push('p' + i);
          return ids;
        },
        { stack: lastStack[size], last: lastPanel[size] },
      );
      return act(
        page,
        cdp,
        'for (const id of arg) { window.bench.closePanel(id); await window.benchTools.frames(1); }',
        panels,
      );
    },
  },
  redock: {
    title: 'Re-dock drag (whole gesture: 60 moves and drop)',
    primary: 'totalTask',
    unit: 'ms',
    async run(page, cdp, size) {
      const from = await page.evaluate(() => window.bench.tabPoint('p1'));
      const target = await page.evaluate((id) => window.bench.stackBody(id), lastStack[size]);
      const result = await gesture(
        page,
        cdp,
        from,
        [
          { x: 800, y: 450 },
          { x: 300, y: 700 },
          { x: target.left + target.width - 20, y: target.top + target.height / 2 },
        ],
        20,
      );
      const landed = await page.evaluate(() => window.bench.stackOf('p1'));
      return { ...result, moved: landed !== 's0' ? 1 : 0 };
    },
  },
  maximise: {
    title: 'Maximise and restore',
    primary: 'task',
    unit: 'ms',
    run: (page, cdp) =>
      act(
        page,
        cdp,
        `window.bench.toggleMaximise('s0'); await window.benchTools.frames(2);
         window.bench.toggleMaximise('s0');`,
      ),
  },
  shared: {
    title: 'Shared data update (per update, all panels)',
    primary: 'task',
    unit: 'ms',
    async run(page, cdp) {
      const result = await act(
        page,
        cdp,
        `for (let i = 1; i <= 100; i++) { window.benchShared.setShared(i); await window.benchTools.frames(1); }`,
      );
      return {
        ...result,
        task: result.task / 100,
        cpu: result.cpu / 100,
        script: result.script / 100,
        layout: result.layout / 100,
      };
    },
  },
  local: {
    title: 'Panel-local update (per update, one panel)',
    primary: 'task',
    unit: 'ms',
    async run(page, cdp) {
      const result = await act(
        page,
        cdp,
        `for (let i = 1; i <= 100; i++) { window.benchShared.setLocal('p0', i); await window.benchTools.frames(1); }`,
      );
      return {
        ...result,
        task: result.task / 100,
        cpu: result.cpu / 100,
        script: result.script / 100,
        layout: result.layout / 100,
      };
    },
  },
  serialize: {
    title: 'Serialize the layout 1,000 times',
    primary: 'wallJs',
    unit: 'ms',
    async run(page) {
      const wallJs = await page.evaluate(() => {
        const start = performance.now();
        let length = 0;
        for (let i = 0; i < 1000; i++) length += window.bench.serialize();
        return length > 0 ? performance.now() - start : -1;
      });
      return { wallJs };
    },
  },
  churn: {
    title: 'Mount and destroy 50 times (heap growth)',
    primary: 'heapKb',
    unit: 'kB',
    mounted: false,
    async run(page, cdp, size) {
      const cycle = (times) =>
        page.evaluate(
          async ({ spec, count }) => {
            for (let i = 0; i < count; i++) {
              await window.bench.mount(spec);
              window.bench.destroy();
              await window.benchTools.frames(1);
            }
          },
          { spec: size, count: times },
        );
      const settle = async () => {
        await cdp.send('HeapProfiler.collectGarbage');
        await cdp.send('HeapProfiler.collectGarbage');
        return metrics(cdp);
      };
      await cycle(3);
      const before = await settle();
      const result = await measure(cdp, () => cycle(50));
      const after = await settle();
      return {
        task: result.task / 50,
        cpu: result.cpu / 50,
        heapKb: (after.JSHeapUsedSize - before.JSHeapUsedSize) / 1024,
        nodes: after.Nodes - before.Nodes,
        listeners: after.JSEventListeners - before.JSEventListeners,
      };
    },
  },
};

const SCENARIOS = option('scenarios', Object.keys(scenarios).join(',')).split(',');

/* ------------------------------------------------------------------ sizes */

function bundleSizes() {
  execFileSync('npx', ['vp', 'build', '-c', 'bench/vite.size.config.ts'], {
    cwd: join(here, '..'),
    stdio: 'inherit',
  });
  const sized = (...files) => {
    const buffers = files.map((file) => readFileSync(file));
    const all = Buffer.concat(buffers);
    return { min: all.length, gzip: gzipSync(all).length, brotli: brotliCompressSync(all).length };
  };
  const out = join(here, 'dist-size');
  const vendor = join(here, 'legacy', 'vendor');
  const themes = join(here, '..', 'examples', 'themes');
  return {
    legacy: {
      // The vendored jQuery is already minified; re-bundling it only makes it larger.
      js: sized(join(out, 'legacy.js'), join(vendor, 'jquery.js')),
      jsWithoutJquery: sized(join(out, 'legacy.js')),
      css: sized(
        join(vendor, 'goldenlayout-base.css'),
        join(vendor, 'goldenlayout-dark-theme.css'),
      ),
    },
    next: {
      js: sized(join(out, 'next.js')),
      css: sized(join(here, '..', 'src', 'styles', 'golden-layout.css'), join(themes, 'dark.css')),
    },
  };
}

/* ------------------------------------------------------------------- main */

async function sample(browser, origin, version, name, size, cpu) {
  const scenario = scenarios[name];
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  try {
    await cdp.send('Performance.enable');
    if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
    await page.goto(`${origin}/${version}/`);
    await page.waitForFunction(() => window.bench !== undefined);
    if (scenario.mounted !== false) {
      await page.evaluate((spec) => window.bench.mount(spec), size);
      await page.evaluate(() => window.benchTools.frames(3));
    }
    return await scenario.run(page, cdp, size);
  } finally {
    await context.close();
  }
}

async function main() {
  const root = join(here, '..');
  console.log('Building benchmark pages...');
  execFileSync('npx', ['vp', 'build', '-c', 'bench/vite.config.ts'], {
    cwd: root,
    stdio: 'inherit',
  });
  const sizes = bundleSizes();

  const server = await serve(join(here, 'dist'));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ args: ['--enable-precise-memory-info'] });
  const results = [];
  const started = Date.now();

  try {
    for (const cpu of CPU) {
      for (const size of SIZES) {
        for (const name of SCENARIOS) {
          const samples = { legacy: [], next: [] };
          // Interleaved, so drift in the machine affects both versions alike.
          for (let i = 0; i < WARMUPS + SAMPLES; i++) {
            for (const version of i % 2 ? [...VERSIONS].reverse() : VERSIONS) {
              const result = await sample(browser, origin, version, name, size, cpu);
              if (i >= WARMUPS) samples[version].push(result);
            }
          }
          results.push({ scenario: name, size, cpu, samples });
          const median = (version) =>
            percentile(
              samples[version].map((s) => s[scenarios[name].primary]),
              50,
            ).toFixed(2);
          console.log(
            `cpu x${cpu}  ${size.padEnd(6)} ${name.padEnd(9)} legacy ${median('legacy').padStart(9)}  next ${median('next').padStart(9)} ${scenarios[name].unit}`,
          );
        }
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  const output = {
    meta: {
      date: new Date().toISOString(),
      durationSeconds: Math.round((Date.now() - started) / 1000),
      samples: SAMPLES,
      warmups: WARMUPS,
      viewport: VIEWPORT,
      chromium: browser.version(),
      node: process.version,
      os: `${platform()} ${release()}`,
      cpuModel: cpus()[0]?.model ?? 'unknown',
      cpuCount: cpus().length,
      memoryGb: Math.round(totalmem() / 2 ** 30),
      react: JSON.parse(readFileSync(join(root, 'node_modules/react/package.json'), 'utf8'))
        .version,
      quick,
    },
    scenarios: Object.fromEntries(
      Object.entries(scenarios).map(([key, value]) => [
        key,
        { title: value.title, primary: value.primary, unit: value.unit },
      ]),
    ),
    sizes,
    results,
  };
  mkdirSync(join(here, 'results'), { recursive: true });
  const file = join(here, 'results', quick ? 'quick.json' : option('out', 'full.json'));
  writeFileSync(file, `${JSON.stringify(output)}\n`);
  console.log(`Wrote ${file} in ${output.meta.durationSeconds}s`);
}

await main();

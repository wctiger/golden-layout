// Turns raw benchmark results into bench/REPORT.md.
//
//   node bench/report.mjs                              full-cpu1.json and full-cpu4.json
//   node bench/report.mjs bench/results/quick.json     any result files
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const here = import.meta.dirname;
// --out takes a value: consume the pair, so the value is not mistaken for an input file.
const argv = process.argv.slice(2);
const files = [];
const extraOverrides = [];
let outFile = join(here, 'REPORT.md');
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--out') {
    if (!argv[i + 1]) throw new Error('--out needs a file path');
    outFile = argv[++i];
  } else if (argv[i] === '--override') {
    // --override <results file> <note>: cells in the file replace the matching main cells.
    if (!argv[i + 1] || !argv[i + 2]) throw new Error('--override needs a file and a note');
    extraOverrides.push({ path: argv[++i], note: argv[++i] });
  } else if (argv[i].startsWith('--')) {
    throw new Error(`Unknown option ${argv[i]}`);
  } else {
    files.push(argv[i]);
  }
}
const inputs = files.length
  ? files
  : ['full-cpu1.json', 'full-cpu4.json'].map((name) => join(here, 'results', name));
const runs = inputs
  .filter((file) => existsSync(file))
  .map((file) => JSON.parse(readFileSync(file, 'utf8')));
if (runs.length === 0) throw new Error(`No result files found: ${inputs.join(', ')}`);

/**
 * Re-measurements that supersede cells of the main runs: a cell in an override file replaces
 * the main cell with the same scenario, size and CPU setting. Only used for the default report.
 */
const OVERRIDES = [
  {
    file: 'supp-splitter.json',
    note:
      'measured again after the splitter was changed to resize on release, on the benchmark ' +
      'build plus that one change',
    text:
      'Splitter results use the [resize-on-release run](results/supp-splitter.json) for both ' +
      'versions. Only the splitter marker moves during the drag. Both versions resize the panels ' +
      'once on release.',
  },
];
const overrides = [
  ...(files.length ? [] : OVERRIDES).map((override) => ({
    ...override,
    path: join(here, 'results', override.file),
  })),
  ...extraOverrides.map((override) => ({
    ...override,
    file: override.path.replace(/^.*bench\/results\//, ''),
  })),
]
  .filter((override) => existsSync(override.path))
  .map((override) => ({ ...override, run: JSON.parse(readFileSync(override.path, 'utf8')) }));
const sameCell = (a, b) => a.scenario === b.scenario && a.size === b.size && a.cpu === b.cpu;
for (const override of overrides) {
  for (const run of runs) {
    run.results = run.results.map(
      (entry) => override.run.results.find((replacement) => sameCell(entry, replacement)) ?? entry,
    );
  }
}

const meta = runs[0].meta;
const scenarios = runs[0].scenarios;
const sizes = runs[0].sizes;
const results = runs.flatMap((run) => run.results);

/** The first version is the baseline; changes are the second version's, relative to it. */
const [BASE, OTHER] = meta.versions ?? ['legacy', 'next'];
const againstLegacy = BASE === 'legacy' && OTHER === 'next';
const LABELS = {
  legacy: 'Legacy',
  next: againstLegacy ? 'Rewrite' : 'This library',
  dockview: 'dockview',
};
const label = (version) => LABELS[version] ?? version;

/* ------------------------------------------------------------- statistics */

const sorted = (values) => [...values].sort((a, b) => a - b);
const quantile = (values, q) => {
  const list = sorted(values);
  if (list.length === 0) return NaN;
  const position = (list.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return list[low] + (list[high] - list[low]) * (position - low);
};
const median = (values) => quantile(values, 0.5);

/** Deterministic generator, so the report is the same every time it is built. */
function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 95% bootstrap confidence interval for the median. */
function medianInterval(values, seed) {
  const random = mulberry32(seed);
  const medians = [];
  for (let i = 0; i < 2000; i++) {
    const resample = values.map(() => values[Math.floor(random() * values.length)]);
    medians.push(median(resample));
  }
  return [quantile(medians, 0.025), quantile(medians, 0.975)];
}

function compare(entry, metric, seed) {
  const pick = (version) => entry.samples[version].map((sample) => sample[metric]);
  const legacy = pick(BASE);
  const next = pick(OTHER);
  const legacyMedian = median(legacy);
  const nextMedian = median(next);
  const legacyCi = medianInterval(legacy, seed);
  const nextCi = medianInterval(next, seed + 1);
  const overlap = legacyCi[0] <= nextCi[1] && nextCi[0] <= legacyCi[1];
  const change = legacyMedian === 0 ? 0 : (nextMedian - legacyMedian) / Math.abs(legacyMedian);
  return { legacyMedian, nextMedian, legacyCi, nextCi, change, real: !overlap, legacy, next };
}

/* ------------------------------------------------------------- formatting */

const fixed = (value, unit) => {
  if (!Number.isFinite(value)) return 'n/a';
  const digits = Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2;
  return `${value.toFixed(digits)}${unit ? ` ${unit}` : ''}`;
};
const percent = (change) => `${change > 0 ? '+' : ''}${(change * 100).toFixed(0)}%`;
const interval = (ci) => `${fixed(ci[0])} to ${fixed(ci[1])}`;
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;
const table = (head, rows) =>
  [
    `| ${head.join(' | ')} |`,
    `| ${head.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');

function verdict(result, lowerIsBetter = true) {
  if (!result.real) return 'no measurable difference';
  const better = lowerIsBetter ? result.change < 0 : result.change > 0;
  return better
    ? `${label(OTHER).toLowerCase()} better (${percent(result.change)})`
    : `${label(BASE).toLowerCase()} better (${percent(result.change)})`;
}

const cpuLevels = [...new Set(results.map((entry) => entry.cpu))].sort((a, b) => a - b);
const sizeNames = ['small', 'medium', 'large'].filter((size) =>
  results.some((e) => e.size === size),
);
const scenarioNames = Object.keys(scenarios).filter((name) =>
  results.some((e) => e.scenario === name),
);
const find = (scenario, size, cpu) =>
  results.find((e) => e.scenario === scenario && e.size === size && e.cpu === cpu);
const PANELS = { small: 4, medium: 16, large: 64 };
const cpuLabel = (cpu) => (cpu === 1 ? 'unthrottled' : `${cpu}x CPU throttle`);

/* ----------------------------------------------------------------- report */

const out = [];
out.push(
  againstLegacy
    ? '# Benchmark report: rewrite versus legacy 1.5.9'
    : `# Benchmark report: ${label(OTHER).toLowerCase()} versus ${label(BASE)}`,
);
out.push('');
out.push(
  'Generated by `node bench/report.mjs` from the raw results in `bench/results/`. ' +
    'The method is in [docs/BENCHMARK_PLAN.md](../docs/BENCHMARK_PLAN.md).',
);
out.push('');
out.push('## Environment');
out.push('');
out.push(
  table(
    ['Item', 'Value'],
    [
      ['Date', meta.date.slice(0, 10)],
      [
        'Browser',
        `Chromium ${meta.chromium}, headless, ${meta.viewport.width} x ${meta.viewport.height}`,
      ],
      ['React', `${meta.react}, production build, same bundle for both versions`],
      ['Machine', `${meta.cpuCount} x ${meta.cpuModel}, ${meta.memoryGb} GB, ${meta.os}`],
      ['Node', meta.node],
      [
        'Samples',
        runs
          .map(
            (run) =>
              `${[...new Set(run.results.map((e) => cpuLabel(e.cpu)))].join(', ')}: ${run.meta.samples} measured per version after ${run.meta.warmups} discarded warm-ups`,
          )
          .join('; ') + '. Fresh page per sample, versions interleaved',
      ],
    ],
  ),
);
out.push('');
out.push(
  'A difference is reported only when the 95% bootstrap confidence intervals of the two medians ' +
    'do not overlap. Otherwise the row reads "no measurable difference". Times are main-thread ' +
    'task time reported by Chromium for the page (`TaskDuration`): all script, style, layout and ' +
    'paint work, which is not quantised to frames the way wall-clock time is.',
);
for (const override of overrides) {
  const replaced = [
    ...new Set(override.run.results.map((entry) => scenarios[entry.scenario].title)),
  ];
  out.push('');
  out.push(
    override.text ??
      `The rows for ${replaced.join(', ')} come from \`bench/results/${override.file}\`: ` +
        `${override.note} (${override.run.meta.samples} samples per cell).`,
  );
}

/* ---- completeness ---- */

// A run that was interrupted has saved only some of its cells. Say so, rather than let a
// shorter table pass for a complete one.
const missing = [];
for (const run of runs) {
  const seen = (key) => [...new Set(run.results.map((entry) => entry[key]))];
  for (const cpu of seen('cpu')) {
    for (const size of seen('size')) {
      for (const scenario of seen('scenario')) {
        const present = run.results.some(
          (e) => e.cpu === cpu && e.size === size && e.scenario === scenario,
        );
        if (!present) missing.push({ cpu, size, scenario });
      }
    }
  }
}
if (missing.length > 0) {
  out.push('');
  out.push(
    `> **Incomplete results.** ${missing.length} cells were not measured, because a run stopped ` +
      'before it finished. They are marked "not measured" below and are not counted in the targets: ' +
      missing.map((cell) => `${cell.scenario} / ${cell.size} / ${cpuLabel(cell.cpu)}`).join('; ') +
      '.',
  );
}

const misses = [];
const wins = [];
let seed = 1;

for (const cpu of cpuLevels) {
  out.push('');
  out.push(`## Results, ${cpuLabel(cpu)}`);
  out.push('');
  const rows = [];
  for (const name of scenarioNames) {
    for (const size of sizeNames) {
      const entry = find(name, size, cpu);
      if (!entry) {
        if (missing.some((c) => c.cpu === cpu && c.size === size && c.scenario === name)) {
          rows.push([
            scenarios[name].title,
            `${size} (${PANELS[size]})`,
            '',
            '',
            '',
            'not measured',
          ]);
        }
        continue;
      }
      const { primary, unit } = scenarios[name];
      const result = compare(entry, primary, (seed += 2));
      const text = verdict(result);
      rows.push([
        scenarios[name].title,
        `${size} (${PANELS[size]})`,
        fixed(result.legacyMedian, unit),
        fixed(result.nextMedian, unit),
        percent(result.change),
        text,
      ]);
      const record = { name, size, cpu, result, unit };
      if (result.real && result.change > 0.1) misses.push(record);
      if (result.real && result.change < 0) wins.push(record);
    }
  }
  out.push(
    table(['Scenario', 'Size (panels)', label(BASE), label(OTHER), 'Change', 'Verdict'], rows),
  );
}

/* ---- targets ---- */

const worst = (scenario, metric, version = 'next') => {
  const values = results
    .filter((entry) => entry.scenario === scenario)
    .flatMap((entry) => entry.samples[version].map((sample) => sample[metric] ?? 0));
  return values.length ? Math.max(...values) : NaN;
};
const medianOf = (scenario, size, cpu, metric, version) => {
  const entry = find(scenario, size, cpu);
  return entry ? median(entry.samples[version].map((sample) => sample[metric])) : NaN;
};

if (againstLegacy) {
  out.push('');
  out.push('## Targets');
  out.push('');
  const targets = [];

  targets.push([
    'No scenario more than 10% slower than legacy at the median',
    misses.length === 0 ? 'met' : `missed in ${misses.length} of ${results.length} cells`,
    misses.length === 0
      ? 'No cell is measurably more than 10% slower.'
      : [...new Set(misses.map((miss) => scenarios[miss.name].title))].join('; '),
  ]);

  const frameTarget = ['splitter', 'redock'].map((name) =>
    medianOf(name, 'medium', 1, 'frameP95', 'next'),
  );
  const framesOk = frameTarget.every((value) => Number.isFinite(value) && value <= 17);
  targets.push([
    'Splitter and re-dock drags hold a 60 Hz frame at p95, medium size, unthrottled',
    frameTarget.some(Number.isNaN) ? 'not run' : framesOk ? 'met' : 'missed',
    `p95 frame gap: splitter ${fixed(frameTarget[0], 'ms')}, re-dock ${fixed(frameTarget[1], 'ms')} (one 60 Hz frame is 16.7 ms)`,
  ]);

  const gestureRenders = ['splitter', 'resize', 'redock'].map((name) =>
    worst(name, 'panelRenders'),
  );
  targets.push([
    'Zero panel re-renders during splitter drag, container resize and re-dock drag',
    gestureRenders.some(Number.isNaN)
      ? 'not run'
      : gestureRenders.every((count) => count === 0)
        ? 'met'
        : 'missed',
    `most panel renders seen in any sample: splitter ${gestureRenders[0]}, resize ${gestureRenders[1]}, re-dock ${gestureRenders[2]}`,
  ]);

  const localRenders = results
    .filter((entry) => entry.scenario === 'local')
    .flatMap((entry) => entry.samples.next.map((sample) => sample.panelRenders));
  targets.push([
    'A panel-local update re-renders only that panel',
    localRenders.length === 0
      ? 'not run'
      : localRenders.every((count) => count === 100)
        ? 'met'
        : 'missed',
    `100 updates caused ${Math.min(...localRenders)} to ${Math.max(...localRenders)} panel renders in total`,
  ]);

  const churnRows = sizeNames.map((size) => find('churn', size, 1)).filter(Boolean);
  const churnWorse = churnRows.filter((entry) => {
    const result = compare(entry, 'heapKb', (seed += 2));
    return result.real && result.change > 0.1;
  });
  const leaks = churnRows.flatMap((entry) =>
    entry.samples.next.map((s) => Math.abs(s.nodes) + Math.abs(s.listeners)),
  );
  targets.push([
    'No heap growth across mount and destroy beyond noise',
    churnRows.length === 0
      ? 'not run'
      : churnWorse.length === 0 && Math.max(...leaks) === 0
        ? 'met'
        : 'see note',
    `after 50 cycles and a forced GC the rewrite retains ${churnRows
      .map(
        (entry) =>
          `${fixed(median(entry.samples.next.map((s) => s.heapKb)), 'kB')} (${entry.size})`,
      )
      .join(', ')}, against ${churnRows
      .map((entry) => fixed(median(entry.samples.legacy.map((s) => s.heapKb)), 'kB'))
      .join(', ')} for legacy; leaked DOM nodes and listeners: ${Math.max(0, ...leaks)}`,
  ]);

  targets.push([
    'Smaller minified and gzipped JavaScript than legacy plus jQuery',
    sizes.next.js.gzip < sizes.legacy.js.gzip ? 'met' : 'missed',
    `${kb(sizes.next.js.gzip)} against ${kb(sizes.legacy.js.gzip)}`,
  ]);

  out.push(table(['Target', 'Result', 'Evidence'], targets));
}

/* ---- size ---- */

out.push('');
out.push('## Download size');
out.push('');
const sizeRow = (name, value) => [name, kb(value.min), kb(value.gzip), kb(value.brotli)];
if (againstLegacy) {
  out.push(
    table(
      ['Bundle', 'Minified', 'Gzip', 'Brotli'],
      [
        sizeRow('Legacy JavaScript, with jQuery 1.11', sizes.legacy.js),
        sizeRow('Legacy JavaScript, without jQuery', sizes.legacy.jsWithoutJquery),
        sizeRow('Rewrite JavaScript', sizes.next.js),
        sizeRow('Legacy CSS (base and dark theme)', sizes.legacy.css),
        sizeRow('Rewrite CSS (base and dark theme)', sizes.next.css),
      ],
    ),
  );
  out.push('');
  out.push(
    'React is excluded from every row. Legacy cannot run without jQuery, so its real cost is the first row.',
  );
} else {
  const cssNote = { next: 'base and dark theme', dockview: 'the shipped stylesheet, all themes' };
  out.push(
    table(
      ['Bundle', 'Minified', 'Gzip', 'Brotli'],
      [BASE, OTHER].flatMap((version) =>
        sizes[version]
          ? [
              sizeRow(`${label(version)} JavaScript`, sizes[version].js),
              sizeRow(
                `${label(version)} CSS (${cssNote[version] ?? 'as shipped'})`,
                sizes[version].css,
              ),
            ]
          : [],
      ),
    ),
  );
  out.push('');
  out.push(
    'React is excluded from every row. JavaScript is minified from the package as imported.',
  );
}

/* ---- detail ---- */

out.push('');
out.push('## Detail');
out.push('');
out.push(
  'Medians, with the 95% confidence interval of the primary metric. "Layouts" is the number of layout passes Chromium ran.',
);

const detailColumns = {
  default: [
    ['script', 'Script', 'ms'],
    ['layout', 'Layout', 'ms'],
    ['style', 'Style', 'ms'],
    ['layouts', 'Layouts', ''],
    ['panelRenders', 'Panel renders', ''],
  ],
  gesture: [
    ['task', 'Per move', 'ms'],
    ['dropTask', 'Release', 'ms'],
    ['layouts', 'Layouts per move', ''],
    ['frameP95', 'Frame p95', 'ms'],
    ['droppedFrames', 'Dropped frames', ''],
    ['panelRenders', 'Panel renders', ''],
  ],
  resize: [
    ['script', 'Script', 'ms'],
    ['layout', 'Layout', 'ms'],
    ['layouts', 'Layouts', ''],
    ['frameP95', 'Frame p95', 'ms'],
    ['panelRenders', 'Panel renders', ''],
  ],
  serialize: [],
  churn: [
    ['task', 'Time per cycle', 'ms'],
    ['nodes', 'Leaked nodes', ''],
    ['listeners', 'Leaked listeners', ''],
  ],
};
const columnsFor = (name) =>
  name === 'splitter' || name === 'redock'
    ? detailColumns.gesture
    : (detailColumns[name] ?? detailColumns.default);

for (const name of scenarioNames) {
  out.push('');
  out.push(`### ${scenarios[name].title}`);
  out.push('');
  const columns = columnsFor(name);
  const { primary, unit } = scenarios[name];
  const rows = [];
  for (const cpu of cpuLevels) {
    for (const size of sizeNames) {
      const entry = find(name, size, cpu);
      if (!entry) continue;
      const result = compare(entry, primary, (seed += 2));
      for (const version of [BASE, OTHER]) {
        rows.push([
          cpuLabel(cpu),
          size,
          label(version),
          fixed(version === OTHER ? result.nextMedian : result.legacyMedian, unit),
          interval(version === OTHER ? result.nextCi : result.legacyCi),
          ...columns.map(([key, , columnUnit]) =>
            fixed(median(entry.samples[version].map((sample) => sample[key] ?? NaN)), columnUnit),
          ),
        ]);
      }
    }
  }
  out.push(
    table(
      ['CPU', 'Size', 'Version', 'Median', '95% CI', ...columns.map(([, label]) => label)],
      rows,
    ),
  );
}

/* ---- notes ---- */

const notes = join(here, 'NOTES.md');
if (againstLegacy && existsSync(notes) && !meta.quick) {
  out.push('');
  out.push(readFileSync(notes, 'utf8').trim());
}

writeFileSync(outFile, `${out.join('\n')}\n`);
console.log(
  `Wrote ${outFile}: ${results.length} cells, ${missing.length} missing, ${wins.length} measurably better, ${misses.length} more than 10% worse`,
);
for (const miss of misses) {
  console.log(`  miss: ${miss.name} ${miss.size} cpu x${miss.cpu} ${percent(miss.result.change)}`);
}

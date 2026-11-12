# Benchmark plan: rewrite versus legacy 1.5.9

Companion to [REWRITE_PLAN.md](./REWRITE_PLAN.md).

## Purpose

Show, with numbers, how the React rewrite compares with the legacy jQuery version on the things a user feels: load, interaction smoothness, memory and download size. The benchmark also guards the rewrite against regressions while it is being built.

## Baseline

The legacy baseline is `dist/goldenlayout.js` at commit `129242c`, not a rebuild from `src/js`.

- That file carries the hand-applied React 18 patch (`createRoot` per panel, state capture commented out). `src/js` still calls the removed `ReactDOM.render`, so a rebuild from source would not run on React 18.
- `dist/goldenlayout.min.js` was not re-minified after the patch, so the harness minifies the patched file itself for the size comparison.
- The rewrite's phase 1 deletes `dist/` and `lib/`. Before that happens:
  - tag `129242c` as `legacy-1.5.9`;
  - copy `dist/goldenlayout.js`, `lib/jquery.js`, and the base and dark-theme CSS into `bench/legacy/vendor/`.

## Fairness rules

- Both versions run on the same React and React DOM version, production builds.
- Both render the same panel component, from one shared source file.
- One fixture generator emits the same logical layout in both schemas.
- Both use equivalent themes with the same border width and header height.
- Input is real mouse input through Playwright, so legacy receives mouse events and the rewrite receives pointer events from the same gesture.
- Fixed viewport (1600 x 900), headless Chromium, one pinned browser version, no other tabs.

Two things are deliberately not equal, and the report calls them out:

- Legacy mounts one React root per panel; the rewrite uses one tree. This is the design difference being measured.
- Legacy includes jQuery in its size and parse cost, because it cannot run without it.

## Scenarios

Each scenario runs at three layout sizes: small (4 panels), medium (16 panels in 6 stacks) and large (64 panels in 16 stacks).

| # | Scenario | What it does |
|---|---|---|
| 1 | Initial mount | From empty container to all visible panels painted |
| 2 | Splitter drag | Drag one splitter 300 px over 60 steps |
| 3 | Container resize | Resize the container through 30 sizes |
| 4 | Tab switch | Activate every tab in a stack in turn |
| 5 | Open panel | Add a panel to an existing stack |
| 6 | Close panel | Close a panel, including one that collapses its stack |
| 7 | Re-dock drag | Drag a tab over several stacks and drop it on a stack edge |
| 8 | Maximise toggle | Maximise and restore a stack |
| 9 | Shared data update | Push one external data change that every panel displays, 100 times |
| 10 | Panel-local update | Update state inside one panel, 100 times |
| 11 | Serialize | Produce the saved layout object 1,000 times |
| 12 | Mount / destroy churn | Mount and destroy the layout 50 times, then force GC |

Scenario 9 is where one tree versus many roots should differ most. Scenario 10 checks that the single tree does not leak renders into other panels.

## Metrics

| Metric | Source | Applies to |
|---|---|---|
| Wall time to completion | `performance.now()` around the action plus two animation frames | 1, 4, 5, 6, 8, 11 |
| Frame time p50 / p95 / max, dropped frames | `requestAnimationFrame` deltas during the gesture | 2, 3, 7 |
| Long tasks (over 50 ms) | `PerformanceObserver` | all interactive |
| Script, layout and style-recalc duration; layout and recalc counts | CDP `Performance.getMetrics` deltas | all |
| React commits and panel render counts | React `<Profiler>` in the shared panel component | 9, 10 (and 2, to confirm zero panel renders in the rewrite) |
| JS heap after forced GC, DOM node count, listener count | CDP `HeapProfiler.collectGarbage` and `Performance.getMetrics` | 1, 12 |
| Bundle size: minified, gzip, brotli | Build output; legacy counted with jQuery | static |
| Parse and evaluate time | CDP trace of script evaluation | static |

## Harness

- Location: `bench/`, outside the published package.
- Two static pages built by Vite: `bench/legacy/` and `bench/next/`. Each exposes the same small driver object on `window` (`mount`, `destroy`, `openPanel`, `closePanel`, `activateTab`, `serialize`, `pushSharedData`, plus element locators for splitters and tabs).
- A Node runner using Playwright and a CDP session drives both pages through the driver, so scenario code is written once.
- Run protocol per scenario and size:
  - fresh page per sample;
  - 3 warm-up iterations discarded, then 20 measured samples;
  - legacy and rewrite samples interleaved to cancel machine drift;
  - a second pass with 4x CPU throttling to approximate a slower machine.
- Statistics: median, p95 and a bootstrap 95% confidence interval for the median. A difference is reported as real only when the intervals do not overlap.
- Output: raw JSON per run in `bench/results/`, and a generated `bench/REPORT.md` with one table per scenario and the machine and browser details.
- Command: `vp run bench` (full) and `vp run bench -- --quick` (small size, 5 samples) for use while developing.

## Targets

Proposed pass criteria for the rewrite, to confirm before the first full run:

- No scenario is more than 10% slower than legacy at the median, at any size.
- Splitter drag and re-dock drag hold p95 frame time under 16.7 ms at the medium size, unthrottled.
- Zero panel re-renders during splitter drag, container resize and re-dock.
- Scenario 10 re-renders only the one panel.
- No heap growth across mount / destroy churn beyond noise.
- Minified and gzipped size is smaller than legacy plus jQuery.

A miss is recorded in the report with a cause, and either fixed or accepted explicitly.

## Sequencing

- [ ] **A. Preserve the baseline.** Tag and vendor the legacy files. Must happen before rewrite phase 1.
- [ ] **B. Harness and legacy numbers.** Build the runner, the shared panel component, the fixture generator and the legacy page. Record legacy results. Can run alongside rewrite phases 2 and 3.
- [ ] **C. Rewrite page, non-drag scenarios.** Add the `next` page after rewrite phase 4 and run scenarios 1, 3 to 6 and 8 to 12.
- [ ] **D. Drag scenarios.** Add scenarios 2 and 7 after rewrite phase 5.
- [ ] **E. Full report.** Run everything at both CPU settings, write `bench/REPORT.md`, and resolve any missed target.
- [ ] **F. CI.** A manually triggered GitHub Actions job that runs the quick benchmark and uploads the report. It does not gate merges, because shared runners are too noisy for timing thresholds.

## Limits

- Headless Chromium on one machine; the numbers are comparative, not absolute.
- Only Chromium is measured.
- Popouts, responsive mode and touch are not benchmarked, because the rewrite drops them.
- Legacy is measured with its React 18 patch, in which panel state capture is disabled, so it does slightly less work per update than stock 1.5.9 did.

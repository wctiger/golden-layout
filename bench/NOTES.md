## Reading the results

Across the 72 measured cells the rewrite is measurably better in 42, measurably more than 10%
worse in 18, and within noise in the rest. The 18 fall into four groups, each with a cause.

### Splitter drag: the two versions do different work (6 cells)

The legacy layout only moves the splitter bar while you drag and resizes the panels once, on
release. The rewrite resizes the panels on every pointer move, so the content reflows live. The
whole-gesture figure therefore compares 60 live resizes with one deferred resize.

| 64 panels       | Per move, legacy | Per move, rewrite | On release, legacy | On release, rewrite |
| --------------- | ---------------- | ----------------- | ------------------ | ------------------- |
| Unthrottled     | 2.4 ms           | 11.2 ms           | 36.6 ms            | 3.2 ms              |
| 4x CPU throttle | 9.3 ms           | 44.3 ms           | 181 ms             | 13.3 ms             |

- Unthrottled, every frame of the rewrite's drag fits in 16.7 ms at every size: no dropped frames.
- Under a 4x CPU throttle with 64 panels (16 visible at once), it does not: a move costs 44 ms,
  the p95 frame gap is 33 ms, and 55 of 60 frames are late. The drag runs at about 30 frames a
  second. At 16 panels it drops 3 of 60 frames.
- Legacy stays smooth during the drag in every cell, then blocks for up to 181 ms on release.

**Changed after this run, and measured again.** The splitter now behaves as legacy does: dragging
moves a marker and the panels are resized once, on release. The splitter rows in the main tables
describe the earlier live-resize build. Re-measured on the benchmark build plus that one change
(`bench/results/supp-splitter.json`, 20 samples per cell):

| Whole splitter gesture | Legacy | Rewrite, resize on release | Verdict                  |
| ---------------------- | ------ | -------------------------- | ------------------------ |
| 4 panels, unthrottled  | 111 ms | 102 ms                     | no measurable difference |
| 16 panels, unthrottled | 146 ms | 119 ms                     | rewrite better (-18%)    |
| 64 panels, unthrottled | 178 ms | 150 ms                     | no measurable difference |
| 4 panels, 4x throttle  | 493 ms | 466 ms                     | no measurable difference |
| 16 panels, 4x throttle | 725 ms | 554 ms                     | rewrite better (-24%)    |
| 64 panels, 4x throttle | 936 ms | 669 ms                     | rewrite better (-29%)    |

No cell is worse than legacy any more, and the rewrite drops no frames in any of them: with 64
panels under the throttle a move costs 9.6 ms and the release 87 ms, against 12.4 ms and 228 ms
for legacy. With this change, 12 of the 72 cells remain more than 10% worse, not 18.

### Shared data update: panels are scroll containers (6 cells)

Every panel shows a value from one external store, and all of them re-render on each change.
Script and layout time are close between the versions; the rewrite spends more on paint.

The cause is that a rewrite panel scrolls (`overflow: auto`), while a legacy panel clips
(`overflow: hidden`). The benchmark panel's 40 rows overflow their box, so each rewrite panel is
a scroll container and the browser rasterises its whole content, not only the visible part.

A supplementary run confirms it. With the rewrite's panels clipped like legacy
(`bench/results/supp-overflow.json`, unthrottled, same build otherwise):

| Shared data update | Legacy  | Rewrite, clipped | Rewrite, as shipped |
| ------------------ | ------- | ---------------- | ------------------- |
| 4 panels           | 3.77 ms | 4.32 ms          | 4.64 ms             |
| 16 panels          | 6.13 ms | 6.61 ms          | 8.86 ms             |
| 64 panels          | 15.7 ms | 16.2 ms          | 21.1 ms             |

Clipped, no size shows a measurable difference from legacy. So one React tree does not cost more
than a root per panel here; scrolling panels do. Scrolling is the shipped default because a panel
whose content overflows is otherwise unreachable. A panel that manages its own scrolling can set
`overflow: hidden` on `.gl-panel` and get the cheaper paint.

The same run moves the splitter gesture only a little (453 ms against 677 ms at 64 panels), so
scrolling was a small part of that gap and live resizing was the rest.

### Maximise and restore (3 cells), partly fixed after the run

The measured build hid the panels behind a maximised stack with `display: none`, so every
maximise and restore laid out and restyled each visible panel again. A fix made after the run
keeps their boxes and only makes them invisible. Re-measured on the benchmark build plus that one
change (`bench/results/supp-maximise.json`):

| Maximise and restore   | Legacy  | Rewrite, before | Rewrite, after | After against legacy     |
| ---------------------- | ------- | --------------- | -------------- | ------------------------ |
| 4 panels, unthrottled  | 12.6 ms | 13.8 ms         | 11.8 ms        | no measurable difference |
| 16 panels, unthrottled | 13.9 ms | 15.2 ms         | 16.8 ms        | legacy better (+21%)     |
| 64 panels, unthrottled | 17.6 ms | 38.0 ms         | 27.6 ms        | legacy better (+57%)     |
| 4 panels, 4x throttle  | 52.9 ms | 50.8 ms         | 51.3 ms        | no measurable difference |
| 16 panels, 4x throttle | 96.5 ms | 66.9 ms         | 70.2 ms        | rewrite better (-27%)    |
| 64 panels, 4x throttle | 142 ms  | 150 ms          | 177 ms         | no measurable difference |

The fix removes about a quarter of the cost at 64 panels unthrottled, and shows no gain under
the throttle. The target is still missed at 64 panels unthrottled: 27.6 ms against 17.6 ms for a maximise and a restore together, about 5 ms more per
action. The legacy and "after" figures come from the supplementary run and the "before" figures from
the main passes, so compare across those two with care: under the throttle, legacy itself moved
from 108 ms to 142 ms between the runs.

The remainder is rendering work, not script. A profile of 200 toggles at 64 panels shows about
1 ms of JavaScript per toggle; the rest is the browser restyling and repainting the stacks and
panels that are hidden while one is maximised, and shown again on restore. Legacy leaves them
painted underneath the maximised stack.

One experiment got closer: covering the frame with an opaque maximised stack instead of hiding
every other stack cut the 64-panel figure from 28 ms to 23 ms (legacy 17 ms). It was not adopted,
because the covered tabs and buttons would stay reachable with the Tab key while invisible.
Hiding them properly was judged worth about 5 ms on a 64-panel maximise.

### Mount and destroy: retained memory (3 cells flagged, no leak)

After 50 mount and destroy cycles and a forced garbage collection, the rewrite retains 8% to 37%
more than legacy in this test (roughly 170 to 190 kB against 130 to 160 kB). Neither version leaks
a DOM node or an event listener.

A longer check (16 panels, heap after every 100 cycles, up to 1,000) shows this is warm-up that
takes longer to settle, not a leak:

| Heap after cycles | 3        | 103      | 203      | 303      | 503      | 703      | 1,003    |
| ----------------- | -------- | -------- | -------- | -------- | -------- | -------- | -------- |
| Legacy            | 2,720 kB | 2,896 kB | 2,905 kB | 2,919 kB | 2,922 kB | 2,927 kB | 2,931 kB |
| Rewrite           | 2,179 kB | 2,395 kB | 2,436 kB | 2,454 kB | 2,465 kB | 2,509 kB | 2,519 kB |

- Both versions grow most in the first 100 cycles.
- The rewrite keeps settling for about 300 cycles, takes one further step of about 45 kB near
  cycle 600, and is flat otherwise: over the last 400 cycles it grows 10 kB, legacy 3 kB.
- The rewrite's heap is about 15% smaller than legacy's throughout.

The 50-cycle scenario in the main tables catches the rewrite before it has settled, which is
why it reads as worse there. This check is a single run per version.

## Deviations from the plan

- **Primary metric.** The plan named script, layout and style time. Their sum counts a layout
  twice when script forces it, which penalised whichever version measured the DOM. Scenarios are
  compared on Chromium's main-thread task time instead; the breakdown is kept in the detail tables.
- **Frame target.** Frames are paced by the display, so a frame gap cannot be under 16.7 ms. The
  target is read as "no late frames at p95".
- **React commit counts** are not reported. Panel render counts are, which is what the targets use.
- **Parse and evaluate time** was not measured separately.
- **What was measured.** Both passes ran on one build: commit `1303bbe`. Later work (the UI
  enhancements of issue #10, the review fixes, and the change of the splitter to resize on
  release) is not in these numbers.
- **Legacy baseline.** As planned, legacy is the committed 1.5.9 bundle with its React 18 patch,
  in which automatic panel state capture is disabled.

## Limits

- One machine, headless Chromium, no GPU. The numbers are comparative, not absolute.
- The benchmark panel is 40 rows of text. Panels with heavier content shift every figure, and
  shift the splitter trade-off further toward the deferred resize.
- The two supplementary runs measured fewer cells and were run after the main passes.

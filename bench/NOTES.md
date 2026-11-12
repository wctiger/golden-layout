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

**Changed after this run.** The splitter now behaves as legacy does: dragging moves a marker
and the panels are resized once, on release. The splitter rows in this report describe the
earlier live-resize build and were not measured again, so they overstate the current cost of a
drag. The 6 cells flagged here should no longer apply; that is an expectation, not a measurement.

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
from 108 ms to 142 ms between the runs. The remaining cause is not identified.

### Mount and destroy: retained memory (3 cells flagged, no leak found)

After 50 mount and destroy cycles and a forced garbage collection, the rewrite retains 8% to 37%
more than legacy in this test (roughly 170 to 190 kB against 130 to 160 kB). Neither version leaks
a DOM node or an event listener.

A longer check (16 panels, three runs each, heap after every 50 cycles) shows where that goes:

| Heap after cycles | 3        | 53       | 103      | 153      | 203      |
| ----------------- | -------- | -------- | -------- | -------- | -------- |
| Legacy            | 2,720 kB | 2,895 kB | 2,905 kB | 2,921 kB | 2,918 kB |
| Rewrite           | 2,152 kB | 2,338 kB | 2,378 kB | 2,400 kB | 2,415 kB |

- Most of the growth is in the first 50 cycles in both versions, which is warm-up.
- After that, legacy is flat within noise. The rewrite still grows, by about 40, 22 and 15 kB per
  50 cycles: under 1 kB a cycle and falling, but not yet zero at 200 cycles.
- The rewrite's total heap is about 20% smaller than legacy's throughout.

I have not found what the rewrite retains. It is not DOM, and the amount is small and shrinking,
so I am reporting it as an open observation rather than a confirmed leak.

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

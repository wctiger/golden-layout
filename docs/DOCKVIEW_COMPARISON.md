# This library versus dockview

A comparison of this repository's layout manager (called "this library" below) with
[dockview](https://github.com/dockview/dockview) 8.9.0, for one purpose: building a dashboard
that a coding agent generates and that end users and coding agents keep modifying, with the
layout library's source code in the application rather than installed as a package.

Measured on 2026-11-12. dockview figures come from its published packages (`dockview-react`,
`dockview`, `dockview-core`, `dockview-enterprise`, all 8.9.0) and a clone of its repository at
commit `37f246e` (2026-11-08).

## Summary

**Recommendation: build the dashboard on this library**, provided it does not need floating
windows, popout windows, touch input or edge side bars on day one. If it does, use dockview, as
an installed package rather than vendored source.

- **Functionality: dockview is far broader.** It has floating groups, popout windows, edge
  groups, tab groups, touch and pen input, custom tab components, per-group size limits and
  deeper keyboard and screen-reader support. This library covers the core docking features and
  adds in-place tab renaming, which dockview lacks, and a hook for panel state saved with the
  layout.
- **Performance: this library is faster in most of what a dashboard does.** It mounts in about
  half the time, saves layouts 2 to 4 times faster, retains 3 to 7 times less memory after
  mount and destroy, and stays smooth when dragging a splitter where dockview drops frames on a
  slow machine. dockview is faster at switching tabs, at re-docking drags, and when every panel
  re-renders at once. Of 72 measurements, 35 favour this library and 19 favour dockview by more
  than 10%; the rest are close or within noise.
- **Customisation: different strengths.** dockview offers more extension points without
  touching its code. This library is about 13 times smaller, written in plain React, and the same
  idioms as the dashboard, so an agent can read all of it before changing any part, with its tests as a check. Its
  layout format is a small JSON tree an agent can write by hand.
- **Dependencies: both need only React.** This library's JavaScript is 15.5 kB gzipped against
  102.5 kB. dockview's MIT code shares a repository with a proprietary enterprise package, and
  ships breaking releases often (four major versions in 2026).

The main risk in choosing this library is that it is new: it has a thorough test suite but no
users, and every future feature is yours to build.

## The two libraries at a glance

|                      | This library                                                                          | dockview 8.9.0                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Age and use          | Written in this repository in the last few days; no users yet                         | Released since 2020, 252 versions, actively maintained                                                                       |
| Licence              | MIT                                                                                   | MIT for the core and React binding; `dockview-enterprise` add-on is proprietary, paid per developer per year                 |
| Architecture         | React all the way down: a pure TypeScript reducer model, rendered by React components | A framework-agnostic core in vanilla TypeScript that manages the DOM imperatively, with thin React, Vue and Angular bindings |
| Source size          | 3,470 lines of TypeScript, 524 lines of CSS                                           | 41,529 lines in the core plus 2,052 in the React binding, and 3,668 lines of SCSS                                            |
| Tests                | 240 tests (96 in Node, 144 in Chromium), 3,636 lines                                  | 74,139 lines of core tests (Jest and jsdom), plus Playwright end-to-end tests                                                |
| Runtime dependencies | None besides React 18+                                                                | None besides React 16.8+                                                                                                     |
| Release pace         | Not applicable                                                                        | Four major versions in 2026 alone (5.0 in February to 8.0 in August)                                                         |

## Functionality

Both cover the core of a docking layout: rows, columns and tabbed groups, splitters, dragging
tabs to reorder and re-dock, dragging new panels in from outside, maximise, tab overflow, header
position, a tab context menu, and saving and restoring the layout as JSON. dockview goes well
beyond that.

| Feature                                      | This library                                             | dockview (free)                                                                                                   | dockview Enterprise (paid)                              |
| -------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Rows, columns, tabbed groups, splitters      | Yes                                                      | Yes                                                                                                               |                                                         |
| Splitter behaviour                           | Marker while dragging, resize on release                 | Live resize while dragging                                                                                        |                                                         |
| Drag tabs and whole groups to re-dock        | Yes, mouse only                                          | Yes, mouse, touch and pen                                                                                         | Drop "compass"                                          |
| Drag new panels in from outside              | `useDragSource` on any element                           | Native HTML5 drag with `onUnhandledDragOver` / `onDidDrop`                                                        |                                                         |
| Maximise a group                             | Yes                                                      | Yes                                                                                                               |                                                         |
| Floating groups (windows inside the page)    | No                                                       | Yes                                                                                                               | Smart guides and snapping                               |
| Popout browser windows                       | No (removed from 1.x)                                    | Yes                                                                                                               |                                                         |
| Edge groups (side bars, bottom panel)        | No                                                       | Yes                                                                                                               | Auto-hide                                               |
| Tab groups (coloured chips inside a tab bar) | No                                                       | Yes, with rename and colours                                                                                      |                                                         |
| Tab overflow                                 | Dropdown                                                 | Dropdown                                                                                                          | Multiple rows, search, most-recently-used               |
| Pinned tabs                                  | No                                                       | No                                                                                                                | Yes                                                     |
| Header on any side, or no headers            | Yes                                                      | Yes                                                                                                               |                                                         |
| Tab context menu                             | Rename, close right, close others, close all; extensible | Close, close others, close all, close left, close right, maximise, float, popout; extensible                      | Pin                                                     |
| Rename a panel from its tab                  | Yes (double-click, F2, menu)                             | No; you build it into a custom tab                                                                                |                                                         |
| Panel state saved with the layout            | `usePanelState()` hook                                   | Panel `params`, updated through the panel API                                                                     |                                                         |
| Undo and redo of layout changes              | No                                                       | No                                                                                                                | Yes                                                     |
| Panels keep their DOM when hidden or moved   | Always (iframes, scroll and canvas survive)              | Optional (`renderer: 'always'`); the default detaches hidden panels, losing scroll position and reloading iframes |                                                         |
| Per-group size limits                        | One global minimum, from CSS                             | Minimum and maximum per group                                                                                     |                                                         |
| Selection of a group                         | Yes                                                      | Active group only                                                                                                 |                                                         |
| Keyboard                                     | Tabs focusable; Enter, F2, Shift+F10, menu arrows        | ARIA tabs pattern with arrow keys, Delete to close                                                                | Keyboard navigation between groups and keyboard docking |
| Screen reader support                        | Roles and labels                                         | Roles, labels and a live region announcing changes                                                                |                                                         |
| Other layout types                           | No                                                       | Split view, grid view and pane (accordion) view components                                                        |                                                         |
| Frameworks                                   | React                                                    | React, Vue, Angular, plain TypeScript                                                                             |                                                         |

For a dashboard the gaps that matter most in this library are **floating groups**, **popout
windows**, **touch** and **edge groups**: each is a substantial piece of work to add. Undo and
redo is the opposite case: this library's layout is a pure reducer over plain data, so a history
is a few dozen lines, while in dockview it is a paid feature.

## Performance

Both libraries were driven through the same twelve scenarios by the harness used for the
legacy comparison, rendering the same panel component in the same layouts (4, 16 and 64 panels),
unthrottled and with a 4x CPU throttle: 72 measurements, 10 samples each. Figures are main-thread
time unless stated. The full tables are in [`bench/DOCKVIEW_REPORT.md`](../bench/DOCKVIEW_REPORT.md).

| Scenario                              | Result                                                           | Figures (unthrottled, 4 / 16 / 64 panels)         |
| ------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------- |
| Initial mount                         | This library about twice as fast                                 | 29 / 43 / 100 ms against 53 / 88 / 178 ms         |
| Save the layout (1,000 times)         | This library 2 to 4 times faster                                 | 4 / 6 / 18 ms against 11 / 15 / 57 ms             |
| Splitter drag, whole gesture          | This library 63% to 80% less                                     | 120 / 122 / 156 ms against 323 / 408 / 775 ms     |
| Memory retained after 50 mount cycles | This library 3 to 7 times less                                   | 182 / 194 / 182 kB against 616 / 1,008 / 1,239 kB |
| Update inside one panel               | This library about 20% less at 16 and 64 panels                  | 1.2 / 1.3 / 1.5 ms against 1.3 / 1.6 / 1.8 ms     |
| Close panels                          | This library equal or better                                     |                                                   |
| Maximise and restore                  | Equal, or this library slightly better                           |                                                   |
| Container resize                      | Equal, except dockview 20% better at 16 panels                   |                                                   |
| Open a panel                          | dockview better at 4 panels, this library at 64                  | 11.9 / 9.6 / 11.9 ms against 7.5 / 8.5 / 14.2 ms  |
| Tab switch                            | dockview 17% to 36% less (within noise at 4 panels, unthrottled) | 3.6 / 4.5 / 5.4 ms against 3.1 / 3.5 / 4.1 ms     |
| Every panel re-renders at once        | dockview 16% to 44% less                                         | 5.2 / 10.6 / 24.5 ms against 4.4 / 7.9 / 18.1 ms  |
| Re-dock drag, whole gesture           | dockview about half                                              | 188 / 227 / 297 ms against 91 / 117 / 147 ms      |

What lies behind the differences:

- **Splitter.** dockview resizes the panels on every pointer move; this library moves a marker
  and resizes once on release. With 64 panels under the 4x throttle, dockview took 55 ms per move
  and 39 of 60 frames arrived late, so the drag ran at about 30 frames a second. This library
  dropped no frames in any splitter measurement, at the cost of a larger single resize on release
  (up to 84 ms against dockview's 55 ms).
- **Re-dock drag.** dockview uses the browser's native drag image, which the browser draws itself;
  this library moves a live preview of the dragged panel. Both stay at 60 frames a second, and
  the drop itself costs about the same.
- **Tab switch.** dockview swaps DOM elements directly, with almost no script. This library runs a
  small React render, under 1 ms. Both are well under one frame.
- **All panels re-rendering.** The extra time is paint, not script. This library's panels are
  scroll containers, so the browser paints their whole content; dockview's panels clip, and an
  app adds its own scrolling. The legacy comparison showed that clipping removes this gap.
- **Memory.** Neither library leaked a DOM node or an event listener. The 50-cycle figure
  catches this library before its heap settles (over 1,000 cycles it levels off); dockview was not
  run for longer, so its larger figure may also be partly warm-up.
- **Download size.** JavaScript is 15.5 kB gzipped for this library against 102.5 kB for dockview.
  dockview's single stylesheet, with all 18 themes, is 12.6 kB gzipped against 3.1 kB.

One behaviour difference matters more than these timings. By default dockview detaches hidden
panels from the page, so a panel loses its scroll position and an iframe reloads when its tab is
hidden; its documentation says to opt in to `renderer: 'always'` for iframes. This library keeps
every panel in the page, and keeps its scroll position across tab switches (checked).

## Customisation and extension

You will build from source, and the dashboard will be changed by both people and coding
agents. That makes three questions matter: how much can be changed without touching the
library, how hard it is to change the library itself, and how easily an agent can generate and
edit layouts.

### Without changing the library

| Extension point | This library                                            | dockview                                                          |
| --------------- | ------------------------------------------------------- | ----------------------------------------------------------------- |
| Panel content   | Any React component, from a registry                    | Any React component, from a registry                              |
| Tab appearance  | Fixed: title and close button                           | Custom tab component, per panel or default                        |
| Header controls | `renderStackActions` area, left of the built-in buttons | Left, right and prefix action components                          |
| Context menu    | `tabContextMenu(context, defaults)`                     | `getTabContextMenuItems`, built-ins plus React components         |
| Empty layout    | Plain empty element                                     | Watermark component                                               |
| Drop behaviour  | Fixed geometry                                          | `dropPositionResolver`, overlay model, `onWillDrop` to veto       |
| Text and labels | `labels`, with functions for panel-aware text           | `messages` for announcements; most text is in your own components |
| Theming         | 53 CSS variables on one root class; 4 example themes    | 126 CSS variables; 18 built-in themes; theme objects              |
| Events          | One `onChange(state, action)` with typed actions        | 34 events on the layout API, more on each panel and group         |

dockview has more extension points, most notably custom tabs and drop control. This library has
fewer, so a change outside them means editing its source; with the source in your application
that is an ordinary edit, not a fork.

### Changing the library itself

|                     | This library                                                                     | dockview                                                                                                |
| ------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Code to understand  | 3,470 lines in 26 files; fits in one agent context                               | About 45,000 lines in the core and React binding                                                        |
| Style of code       | React components and hooks over a pure reducer: the same idioms as the dashboard | Imperative DOM classes with dockview's own event and lifecycle system, bridged to React through portals |
| Where a change goes | Usually one component or the reducer                                             | Often the core, then the React binding                                                                  |
| Styles              | One plain CSS file                                                               | 21 SCSS files; a Sass compiler is needed                                                                |
| Tests to keep green | 240, run in a few seconds by one tool                                            | A large Jest suite plus Playwright; a monorepo with Nx and 48 development packages                      |
| Upstream updates    | None to merge                                                                    | Four major versions in 2026; a vendored copy drifts quickly                                             |

### Agents generating and editing layouts

- **This library.** A layout is a small typed tree (`row`, `column`, `stack`, `panel`) with
  relative sizes. An agent can write one by hand, and invalid input fails with a message naming
  the problem. Every change is one typed action, so an agent can describe, replay or test a
  change as data.
- **dockview.** The saved form records pixel sizes, orientation and a separate panel table, so
  agents usually build layouts with a sequence of `addPanel` calls rather than by writing JSON.
  It is well documented, publishes `llms.txt` files for agents, and is likely to be in a coding
  model's training data; this library is not, so an agent must read its README and source.

## Dependencies

|                                  | This library                                    | dockview                                                                                                                                                                     |
| -------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime dependencies             | React and React DOM 18 or later                 | React and React DOM 16.8 or later; `dockview-react` pulls in `dockview` and `dockview-core`                                                                                  |
| JavaScript, minified and gzipped | 15.5 kB                                         | 102.5 kB                                                                                                                                                                     |
| CSS, minified and gzipped        | 3.1 kB (base and dark theme)                    | 12.6 kB (one stylesheet, all 18 themes)                                                                                                                                      |
| Building from source             | TypeScript and a bundler; CSS needs no compiler | TypeScript, a bundler and Sass                                                                                                                                               |
| Licence risk                     | MIT                                             | MIT, as long as no `dockview-enterprise` feature is used; that package's source sits in the same repository under a commercial licence, so a vendored copy must leave it out |

## Recommendation

For a dashboard that a coding agent generates, and that end users and agents keep changing,
choose **this library**, with the source in the application.

1. **Agents can own all of it.** At 3,470 lines in React idioms, an agent can read the whole
   library before changing it, and a change is usually one component or one reducer case. With
   dockview, an agent would mostly work around a 45,000-line imperative core through its options,
   or carry a fork that four major releases a year make hard to keep current.
2. **The layout is data an agent can write.** A small, validated JSON tree with relative sizes,
   and one typed action per change, suit generating, diffing, testing and undoing layouts. Undo
   and redo, a paid feature in dockview, is a short addition here.
3. **It is fast where a dashboard spends its time.** Loading and saving layouts, updates inside
   a panel, and dragging splitters on large layouts all favour it, with a bundle a seventh of the
   size. Where dockview is faster (tab switches, re-dock drags, everything re-rendering at once)
   both stay within a frame, and the largest gap has a known fix: let panels clip.
4. **No licence boundary to police.** Everything is MIT and in your repository.

Choose **dockview** instead if any of these are requirements: floating or popout windows,
touch or pen input, edge side bars, tab groups, or strong keyboard and screen-reader support out
of the box. Use it as an installed package, customise it through its options and React
components, and do not vendor its source.

If you choose this library, the first additions worth making are:

- a custom tab renderer prop (dockview's most useful extension point that this library lacks);
- per-panel minimum and maximum sizes;
- undo and redo over the action stream;
- an `overflow` option for panels, so content that manages its own scrolling avoids the extra
  paint;
- touch input, if any user will be on a tablet.

## Method and limits

- **Versions.** dockview 8.9.0 (`dockview-react`, with `dockview` and `dockview-core`), default
  options and the dark theme. This library at commit `a980015`, including the features of issue
  #10.
- **Fairness.** Both render the same panel component through their React bindings, build the
  same layouts with equal sizes, and keep every panel mounted. Header heights differ (dockview's
  defaults were left as they are). The dockview page is in `bench/dockview/`; `dockview-react` is
  a development dependency used only by the benchmark.
- **Splitter correction.** In the first pass the benchmark grabbed dockview's splitter where two
  splitters cross in the 64-panel layout, so that drag did nothing. The splitter was measured
  again for both libraries with a corrected grab point, and every drag was checked to have
  resized (`bench/results/dockview-splitter.json`).
- **Samples.** 10 per cell, fewer than the 20 used against legacy. A difference counts only when
  the 95% confidence intervals of the two medians do not overlap.
- **Limits.** One machine, headless Chromium, mouse input only. dockview's touch support,
  floating groups and popouts were not exercised. Feature and source figures come from dockview's
  published packages and its repository at commit `37f246e`; the enterprise features were read
  from that package, not used.

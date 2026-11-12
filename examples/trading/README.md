# Trading desk example

A port of the trading demo from [dockview](https://github.com/dockview/dockview)
(`packages/docs/sandboxes/react/dockview/demo-dockview`, commit `37f246e`) to golden-layout. It
shows a dense dashboard of panels that re-render on a timer: an order book with time and sales,
FX quote tiles, an order blotter, positions, a candle chart, a watchlist, a price alert, a
correlation matrix, a volatility surface, a technical-signals grid and a news feed.

```sh
npm run dev
```

## What changed in the port

- The panels, the simulated market and the colour tokens are dockview's code, adapted for
  strict TypeScript. They never depended on dockview, apart from the points below.
- The layout is dockview's default arrangement, without its left, right and bottom edge groups,
  because golden-layout has no edge groups.
- The FX panel nests a second `<GoldenLayout>` for its G10, EM and Crosses tabs, where dockview's
  version nests a second dockview.
- dockview's demo wraps each ticking panel in a `VisibilityGate` that unmounts it while hidden.
  Here the toolbar's **Hidden panels** menu picks what a hidden panel does: keep rendering (the
  library's behaviour), pause inside React's `<Activity>` (React 19.2 and later), or unmount. The
  gate uses golden-layout's `usePanelVisible()` hook.
- The toolbar's meter counts panel renders per second with React's `<Profiler>`, split into
  visible and hidden panels. The production build uses React's profiling build so that the meter
  still works there.
- The theme builder, settings, event log, debug panels, floating groups, popouts and the
  dockview Enterprise features are left out.

## Licence

The files ported from dockview carry this notice:

```
MIT Licence

Copyright (c) 2021 mathuo

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

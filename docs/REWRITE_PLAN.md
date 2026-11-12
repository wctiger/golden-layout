# Rewrite as a React 18+ / TypeScript library on Vite+

## Goal

Rewrite this fork as a React-first layout manager:

- React 18+ does all rendering; no jQuery and no imperative DOM code.
- Everything is strict TypeScript.
- All legacy build tooling is replaced by Vite+ (Vite, Vitest, Oxlint, Oxfmt, library build).
- Every surviving behavioural test case is ported.

This is a clean break. The JavaScript API and the serialized layout format are both new, and nothing is compatible with 1.x.

## Decisions

| Area                 | Decision                                                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public API           | React-first: a `<GoldenLayout>` component plus hooks, over a headless TypeScript model                                                                                         |
| Rendering            | One React tree for the whole layout, not one root per panel                                                                                                                    |
| Panel mounting       | All panels render in one flat, keyed layer at the layout root and are positioned over their slots, so re-docking never remounts a panel. Inactive tabs stay mounted but hidden |
| Layout state         | One top-level serializable state is the single source of truth                                                                                                                 |
| Panel state          | Each panel node has an optional `state` field, read and written through `usePanelState()`                                                                                      |
| Change notification  | `onChange(nextLayout, action)` with typed actions; no event emitter                                                                                                            |
| Schema               | New and lean; no compatibility with 1.x configs                                                                                                                                |
| Node identity        | One required unique `id` per node (no multi-ID)                                                                                                                                |
| Drag and drop        | Hand-rolled on Pointer Events, mouse only                                                                                                                                      |
| Runtime dependencies | React (peer, `>=18`) only                                                                                                                                                      |
| Styling              | One base stylesheet driven entirely by CSS variables; themes are external examples                                                                                             |
| Packaging            | ESM and generated `.d.ts` only; package name unchanged                                                                                                                         |
| CI                   | GitHub Actions                                                                                                                                                                 |

## New schema (direction)

```ts
type LayoutNode =
  | { type: 'row' | 'column'; id: string; size?: number; children: LayoutNode[] }
  | {
      type: 'stack';
      id: string;
      size?: number;
      activeId?: string;
      headerPosition?: 'top' | 'left' | 'right' | 'bottom';
      children: PanelNode[];
    }
  | PanelNode;

type PanelNode = {
  type: 'panel';
  id: string;
  component: string;
  title?: string;
  closable?: boolean;
  reorderable?: boolean;
  props?: Record<string, unknown>;
  state?: unknown;
};
```

- `settings` and `labels` become component props and are not serialized.
- `dimensions` (border width, header height and so on) become CSS variables, which lets flexbox do most of the sizing that JavaScript does today.

## Feature scope

### Kept

- Row / column / stack tree with draggable splitters and minimum sizes
- Tabs: activate, close, drag to reorder (global and per item)
- Drag a tab or stack to re-dock, with drop-zone indicator and drag proxy
- `constrainDragToContainer`
- External drag sources (drag a new panel in from outside the layout)
- Maximise / minimise a stack
- Tab overflow dropdown (simplified)
- Header position per stack and `hasHeaders: false`
- Per-item closable flag, titles, close and maximise icons, labels
- Serialization of the layout state
- Queries by id, type, component name and filter
- Programmatic tree edits, as model actions
- Selection
- XSS-safe titles (automatic in React; tests stay as regression tests)
- Auto-resize to container, via `ResizeObserver`
- Per-panel lifecycle, as hooks (`usePanelSize`, `usePanelVisible`)

### Dropped

- jQuery and non-React (plain function) panels
- Popouts, including `openPopouts`, the popout settings, labels and icon
- EventHub and the event emitter, including bubbling and `stopPropagation`
- Config minifier
- Responsive mode
- Transition indicator
- Touch support
- The `componentWillUpdate` state-capture hack
- Bower, jspm, typings, committed `dist/` and `lib/`

## Rendering performance approach

- Context carries a stable store reference, never the state itself.
- Components subscribe to slices with `useSyncExternalStore` and selectors.
- The reducer shares structure, so untouched nodes keep their identity.
- Transient interaction (splitter drags, the drop indicator) stays out of the tree and commits once on release.
- Each panel is memoised and wrapped in its own error boundary.

## Phases

One commit per phase, each with its tests, so every commit is green.

- [ ] **1. Tooling reset.** Delete the legacy source, `dist/`, `lib/`, and the Grunt, Gulp, Karma, Bower, jspm, typings, TSLint and Travis files. Set up Vite+ with strict TypeScript, the ESM and `.d.ts` library build, lint and format, React `>=18` as a peer dependency, and a GitHub Actions workflow for lint, typecheck, test and build.
- [ ] **2. Headless model.** Pure TypeScript, no React: the new schema; a reducer with typed actions for add, remove, replace, move, activate, resize, maximise, select, set title and set panel state; queries by id, type, component and filter; validation; and the tree clean-up rules (empty stacks removed, single-child rows collapsed).
- [ ] **3. Store and React bindings.** A store exposed through a stable context and `useSyncExternalStore` selectors; `<GoldenLayout>` with a component registry and `onChange(layout, action)`; the hooks `usePanelState`, `usePanelSize` and `usePanelVisible`.
- [ ] **4. Renderer.** The frame tree (rows, columns, stacks, headers, tabs, splitters) laid out with flexbox, and the flat keyed panel layer positioned over the slots with per-panel error boundaries. Also header position and `hasHeaders`, close and maximise controls, labels, the tab overflow dropdown, selection, and container resizing via `ResizeObserver`.
- [ ] **5. Drag and drop.** Tab reorder, re-docking with drop-zone geometry and indicator, the drag proxy, `constrainDragToContainer`, and external drag sources.
- [ ] **6. Styling.** One base stylesheet driven by CSS variables, including the dimensions. The four themes move to `examples/themes/` as variable overrides and are not part of the package.
- [ ] **7. Test migration audit.** A mapping table from each old test file and case to its new equivalent, confirming nothing surviving was missed.
- [ ] **8. Demo and docs.** A Vite demo app with a theme switcher replaces `index.html`, `start.js` and `react-18/`. The README is rewritten with the new API and schema.

## Test migration

The current suite has about 122 cases in 21 files on Jasmine 1.3 and Karma.

- Each surviving behavioural case is ported one-to-one, rewritten against the new API.
- Pure model tests run in Node; rendering and drag tests run in Vitest browser mode on Chromium.
- Dropped: all disabled (`xit`) cases, the popout tests, the event-emitter tests (20) and the minifier tests (5).
- The creation and bubbling event tests are re-expressed as assertions on the action stream; assertions specific to bubbling and `stopPropagation` go.
- The multi-ID tests collapse to single-ID lookups.
- About 90 cases remain.

## Branch

Work lands on `claude/festive-meitner-kk4utt`.

# golden-layout

A docking layout manager for React 18+: rows, columns and tabbed stacks of panels that users
resize, reorder, re-dock by drag and drop, and maximize.

[Open the live demo](https://wctiger.github.io/golden-layout/) · [Browse the examples](./examples)

This is a ground-up rewrite of the jQuery-era golden-layout 1.x. It is written in TypeScript,
renders entirely with React, and has no runtime dependency other than React. It is **not
compatible** with 1.x: see [Differences from 1.x](#differences-from-1x).

- One React tree for the whole layout, so panels share your providers and context.
- Panels never remount when they move, so their React state, DOM and scroll position survive
  re-docking.
- The layout is one serializable object. `JSON.stringify(layout)` saves it.
- Styling is plain CSS custom properties. A theme is a block of variable overrides.

This React rewrite is unpublished. To run the demo or build the library from source, see
[Development](#development).

## The layout schema

A layout is a tree of four node types.

| Type     | Holds                    | Notes                                               |
| -------- | ------------------------ | --------------------------------------------------- |
| `row`    | rows, columns and stacks | Children side by side, with splitters between them  |
| `column` | rows, columns and stacks | Children top to bottom                              |
| `stack`  | panels only              | A tabbed group; one panel is active                 |
| `panel`  | nothing                  | A leaf that renders one component from the registry |

```ts
interface LayoutState {
  root: RowOrColumnNode | StackNode | null;
  maximizedId: string | null; // the maximized stack, if any
  selectedId: string | null; // the selected item, if any
}

interface RowOrColumnNode {
  type: 'row' | 'column';
  id: string;
  size: number; // weight relative to siblings
  closable?: boolean; // false keeps it when it has fewer than two children
  children: (RowOrColumnNode | StackNode)[];
}

interface StackNode {
  type: 'stack';
  id: string;
  size: number;
  activeId: string | null;
  headerPosition?: 'top' | 'bottom' | 'left' | 'right';
  closable?: boolean; // false keeps it when empty and hides its close button
  children: PanelNode[];
}

interface PanelNode {
  type: 'panel';
  id: string;
  component: string; // name in the components registry
  title: string;
  closable?: boolean; // false hides the close button
  reorderable?: boolean; // false prevents dragging the tab
  renamable?: boolean; // false prevents editing the title in the tab
  props?: Record<string, unknown>; // static props for the component
  state?: unknown; // see usePanelState
}
```

What you write (`LayoutConfig`) is the same tree with the derivable parts optional:

- `id` is generated when omitted (`panel-1`, `stack-2`, ...). Every id is unique.
- `size` defaults to an equal share.
- `title` defaults to the component name.
- `activeId` defaults to the first panel.
- A panel placed directly in a row or column, or at the root, is wrapped in a stack.

A saved `LayoutState` is itself a valid `LayoutConfig`, so saving and loading round-trips.
Invalid configs throw a `LayoutError` with a message naming the problem.

## `<GoldenLayout>` props

| Prop                 | Type                                   | Purpose                                                                     |
| -------------------- | -------------------------------------- | --------------------------------------------------------------------------- |
| `components`         | `Record<string, ComponentType>`        | Required. The components panels can render, by name                         |
| `initialLayout`      | `LayoutConfig`                         | The starting layout. Read once                                              |
| `layout`             | `Layout`                               | A handle from `createLayout`, instead of `initialLayout`                    |
| `onChange`           | `(state, action) => void`              | Called after every change, with the action that caused it                   |
| `onPanelError`       | `(error, panelId) => void`             | Called when a panel throws; the panel shows the message                     |
| `renderStackActions` | `(context) => ReactNode`               | Your own controls in each stack header, see [Stack actions](#stack-actions) |
| `tabContextMenu`     | `(context, defaults) => TabMenuItem[]` | Customises the tab menu, see [Tab menu](#tab-menu)                          |
| `settings`           | `Partial<Settings>`                    | Behaviour switches, below                                                   |
| `labels`             | `Partial<Labels>`                      | Tooltips and menu text, see [Labels](#labels)                               |
| `className`          | `string`                               | Added to the root element; where a theme class goes                         |
| `style`              | `CSSProperties`                        | Inline style for the root; can set CSS variables                            |
| `ref`                | `Ref<Layout>`                          | Receives the layout handle                                                  |

### Settings

| Setting                    | Default | Effect                                              |
| -------------------------- | ------- | --------------------------------------------------- |
| `hasHeaders`               | `true`  | Show a tab header on every stack                    |
| `reorderEnabled`           | `true`  | Allow tabs and stacks to be dragged                 |
| `renameEnabled`            | `true`  | Allow tab titles to be edited                       |
| `selectionEnabled`         | `false` | Select a stack by clicking its header background    |
| `showMaximizeIcon`         | `true`  | Show the maximize button                            |
| `showCloseIcon`            | `true`  | Show the close-stack button                         |
| `constrainDragToContainer` | `true`  | Keep the drag proxy inside the layout               |
| `dragThreshold`            | `10`    | Pixels the pointer travels before a press is a drag |

## The layout handle

One handle drives a whole layout. Get it in any of three ways:

```tsx
// 1. Create it yourself, to use it outside React as well.
const layout = createLayout(initialLayout);
<GoldenLayout layout={layout} components={components} />;

// 2. From a ref.
const ref = useRef<Layout>(null);
<GoldenLayout ref={ref} initialLayout={initialLayout} components={components} />;

// 3. From inside any panel.
const layout = useGoldenLayout();
```

```ts
layout.addPanel({ component: 'chart', title: 'Chart' }); // joins the root; returns the id
layout.addPanel({ component: 'chart' }, { parent: 'stack-1', index: 0 }); // as a tab
layout.addPanel({ component: 'chart' }, { target: 'stack-1', side: 'right' }); // docked
layout.closeItem('orders'); // honours closable: false
layout.removeItem('orders'); // unconditional
layout.closeItems(['orders', 'trades']); // several at once, as one change
layout.moveItem('orders', { target: 'stack-2', side: 'bottom' });
layout.setActive('orders');
layout.toggleMaximize('orders');
layout.select('stack-1');
layout.setTitle('orders', 'Orders (3)');
layout.startRename('orders'); // puts the tab title into edit mode
layout.resize('row-1', [2, 1]);
layout.updateItem('stack-1', { headerPosition: 'left' });
layout.setLayout(savedLayout);

layout.getState(); // the current LayoutState
layout.getById('orders');
layout.getParent('orders');
layout.getByType('stack');
layout.getByComponent('chart');
layout.filter((node) => node.type === 'panel' && node.closable === false);

const unsubscribe = layout.subscribe((state, action, previous) => {});
```

Items are plain immutable data. You act on them by id through the handle; they have no methods
and no DOM references.

### Actions

Every method above dispatches one action, and `onChange` and `subscribe` receive it. You can
also call `layout.dispatch(action)` directly.

| Action          | Fields         | Effect                                                                                  |
| --------------- | -------------- | --------------------------------------------------------------------------------------- |
| `addItem`       | `item`, `to?`  | Add an item into a parent or docked against a target                                    |
| `removeItem`    | `id`           | Remove an item                                                                          |
| `closeItem`     | `id`           | Remove an item unless it is not closable                                                |
| `closeItems`    | `ids`          | Close several items as one change, skipping non-closable ones                           |
| `replaceItem`   | `id`, `item`   | Swap an item for a new one in place                                                     |
| `moveItem`      | `id`, `to`     | Move a panel or stack                                                                   |
| `setActive`     | `id`           | Make a panel the active tab                                                             |
| `resize`        | `id`, `sizes`  | Set the sizes of a row's or column's children                                           |
| `maximize`      | `id`           | Maximize the stack (or the stack of the panel)                                          |
| `restore`       |                | Leave maximized mode                                                                    |
| `select`        | `id` or `null` | Select an item, or clear the selection                                                  |
| `setTitle`      | `id`, `title`  | Rename a panel                                                                          |
| `setPanelState` | `id`, `state`  | Replace a panel's saved state                                                           |
| `updateItem`    | `id`, `patch`  | Change `closable`, `reorderable`, `renamable`, `props`, `component` or `headerPosition` |
| `setLayout`     | `layout`       | Replace the whole layout                                                                |

A destination (`to`) is either `{ parent, index? }` or `{ target, side }`.

An action that changes nothing leaves the state object untouched and notifies no one. Untouched
nodes keep their identity across changes. After a removal the tree is tidied: an empty stack is
removed, and a row or column left with one child is replaced by that child.

To see what an action created or removed, compare states:

```ts
import { diffLayout } from 'golden-layout';

layout.subscribe((state, action, previous) => {
  const { created, removed } = diffLayout(previous, state);
});
```

## Hooks

Use these inside a component rendered as a panel.

| Hook                     | Returns                                                                   |
| ------------------------ | ------------------------------------------------------------------------- |
| `usePanelState(initial)` | `[state, setState]`, like `useState`, stored in the panel's `state`       |
| `usePanelVisible()`      | `true` while the panel is the active tab and not behind a maximized stack |
| `usePanelSize()`         | `{ width, height }` in pixels, updated on resize                          |
| `usePanel()`             | `{ id, setTitle, close, activate, toggleMaximize }`                       |
| `usePanelId()`           | The panel's id                                                            |
| `useGoldenLayout()`      | The layout handle                                                         |
| `useLayoutSelector(fn)`  | A slice of layout state; re-renders only when the slice changes           |

### Panel state

A panel keeps ordinary `useState` state for as long as it is in the layout, including while it
is dragged to another stack and while its tab is inactive. Use `usePanelState` for state that
should also be saved and restored with the layout:

```tsx
function Orders() {
  const [filter, setFilter] = usePanelState({ status: 'open' });
  return <OrdersGrid status={filter.status} onStatus={(status) => setFilter({ status })} />;
}
```

The value must be serializable. A default that is never changed is not written to the layout.

## Labels

`labels` sets the text of tooltips, accessible names and tab menu entries. Tooltips are the
browser's own (`title` attributes).

| Label              | Default                   | Used for                                                  |
| ------------------ | ------------------------- | --------------------------------------------------------- |
| `close`            | `close`                   | A tab's close button: "close Orders"                      |
| `maximize`         | `maximize`                | The maximize button, named after the stack's active panel |
| `minimize`         | `minimize`                | The same button while the stack is maximized              |
| `closeStack`       | `close all tabs`          | The header button that closes the whole stack             |
| `tabDropdown`      | `additional tabs`         | The chevron shown when tabs overflow                      |
| `rename`           | `Rename panel`            | Tab menu                                                  |
| `closeTabsToRight` | `Close tabs to the right` | Tab menu                                                  |
| `closeOtherTabs`   | `Close other tabs`        | Tab menu                                                  |
| `closeAllTabs`     | `Close all tabs`          | Tab menu                                                  |

`close`, `maximize` and `minimize` name the panel they act on. Given a string, the panel title
is appended. Given a function, it builds the whole text:

```tsx
const labels = {
  close: ({ title }: { title: string }) => `Close ${title}`,
  maximize: 'Expand', // becomes "Expand Orders"
};

<GoldenLayout labels={labels} ... />
```

Define label functions outside the component, or memoize them. A new function on every render
is a new label, and re-renders the layout's headers and panels.

## Renaming tabs

Double-click a tab title, or press **F2** on a focused tab, to edit it in place. **Enter** or
clicking away commits; **Escape** cancels. An empty title is not accepted. A commit is one
`setTitle` action.

- `settings={{ renameEnabled: false }}` turns renaming off for the layout.
- `renamable: false` on a panel turns it off for that panel.
- `layout.startRename(panelId)` starts an edit from your own code.

## Tab menu

Right-clicking a tab, or pressing **Shift+F10** on a focused tab, opens a menu with four
entries. Each acts on the tab's own stack, and the bulk closes skip panels marked
`closable: false`.

| Entry                   | Effect                          |
| ----------------------- | ------------------------------- |
| Rename panel            | Starts editing the title        |
| Close tabs to the right | Closes every tab after this one |
| Close other tabs        | Closes every tab but this one   |
| Close all tabs          | Closes every tab in the stack   |

An entry that would do nothing is disabled. A bulk close is one `closeItems` action.

`tabContextMenu` receives the context and the default entries, and returns the entries to show:

```tsx
<GoldenLayout
  tabContextMenu={(context, defaults) => [
    ...defaults,
    {
      id: 'duplicate',
      label: 'Duplicate',
      separatorBefore: true,
      onSelect: ({ layout, panel, stack }) =>
        layout.addPanel({ component: panel.component, title: panel.title }, { parent: stack.id }),
    },
  ]}
  ...
/>
```

- The context is `{ layout, panel, stack, index }`.
- An entry is `{ id, label, disabled?, separatorBefore?, onSelect(context) }`.
- Return the defaults filtered, reordered or relabelled as you like.
- Returning an empty array shows no menu and leaves the browser's own menu in place.

## Stack actions

`renderStackActions` puts your own controls in each stack header, to the left of the built-in
buttons. It is called once per stack with that stack and its active panel:

```tsx
<GoldenLayout
  renderStackActions={({ layout, stack, activePanel, maximized }) => (
    <button
      className="gl-control"
      title="Add a chart"
      onClick={() => layout.addPanel({ component: 'chart' }, { parent: stack.id })}
    >
      +
    </button>
  )}
  ...
/>
```

- The `gl-control` class gives a button the size and hover style of the built-in ones.
- The area takes its natural width; the tabs get what is left.
- Returning `null` renders nothing.
- It is called as a plain function, so use hooks inside a component you return, not directly
  in the callback.
- It runs again when its stack changes, not when another stack does.

## Dragging new panels in

`useDragSource` makes any element a source of new items:

```tsx
function Palette({ layout }: { layout: Layout }) {
  const source = useDragSource(() => ({ type: 'panel', component: 'chart', title: 'New chart' }), {
    layout,
    title: 'Chart',
  });
  return <button {...source}>Drag me into the layout</button>;
}
```

The item may be a config or a function that builds one on drop. Inside the layout the `layout`
option can be left out.

## Styling and themes

Import `golden-layout/style.css` once. It contains the structure and a neutral default look.
Every colour and dimension is a CSS custom property on `.gl-root`, so a theme is a rule of
overrides:

```css
.my-theme.gl-root {
  --gl-background: #101418;
  --gl-content-background: #1b2229;
  --gl-content-text: #e6edf3;
  --gl-header-height: 30px;
}
```

```tsx
<GoldenLayout className="my-theme" ... />
```

Switching themes is swapping that class; nothing re-renders. Four example themes (dark, light,
soda and translucent, ported from 1.x) are in [`examples/themes`](./examples/themes). Copy one as a starting point for your own theme.

All class names use the `gl-` prefix.

### Variables

| Variable                          | Default                          | Styles                                    |
| --------------------------------- | -------------------------------- | ----------------------------------------- |
| `--gl-font-family`                | system UI stack                  | All layout chrome                         |
| `--gl-font-size`                  | `13px`                           | All layout chrome                         |
| `--gl-header-height`              | `26px`                           | Stack headers                             |
| `--gl-tab-padding`                | `10px`                           | Space before and after a tab's title      |
| `--gl-tab-gap`                    | `1px`                            | Space between tabs                        |
| `--gl-tab-radius`                 | `0px`                            | Outer corners of a tab                    |
| `--gl-tab-max-width`              | `240px`                          | Longest tab title before it is cut        |
| `--gl-control-size`               | `20px`                           | Header buttons                            |
| `--gl-splitter-size`              | `5px`                            | Visible splitter thickness                |
| `--gl-splitter-grab-size`         | `15px`                           | Width of the area that grabs a splitter   |
| `--gl-min-item-width`             | `40px`                           | Narrowest a stack can be made             |
| `--gl-min-item-height`            | `40px`                           | Shortest a stack can be made              |
| `--gl-drag-proxy-width`           | `300px`                          | Drag proxy                                |
| `--gl-drag-proxy-height`          | `200px`                          | Drag proxy                                |
| `--gl-background`                 | `#d4d4d4`                        | Behind everything, seen through splitters |
| `--gl-content-background`         | `#ffffff`                        | Panel area                                |
| `--gl-content-text`               | `#1f1f1f`                        | Panel text                                |
| `--gl-content-border`             | `none`                           | Panel area border                         |
| `--gl-content-shadow`             | `none`                           | Panel area shadow                         |
| `--gl-header-background`          | `#e8e8e8`                        | Stack headers                             |
| `--gl-header-selected-background` | `#c5dcf7`                        | Header of the selected stack              |
| `--gl-tab-background`             | `transparent`                    | Inactive tabs                             |
| `--gl-tab-text`                   | `#5a5a5a`                        | Inactive tabs                             |
| `--gl-tab-border`                 | `none`                           | All tabs                                  |
| `--gl-tab-shadow`                 | `none`                           | Inactive tabs                             |
| `--gl-tab-hover-background`       | `#dcdcdc`                        | Hovered tab                               |
| `--gl-tab-active-background`      | `#ffffff`                        | Active tab                                |
| `--gl-tab-active-text`            | `#1f1f1f`                        | Active tab                                |
| `--gl-tab-active-shadow`          | `none`                           | Active tab                                |
| `--gl-control-color`              | `#5a5a5a`                        | Header button icons                       |
| `--gl-control-opacity`            | `0.6`                            | Header and tab buttons at rest            |
| `--gl-control-hover-background`   | `rgba(0, 0, 0, 0.1)`             | Hovered button                            |
| `--gl-splitter-background`        | `transparent`                    | Splitters at rest                         |
| `--gl-splitter-hover-background`  | `#8f8f8f`                        | Hovered or dragged splitter               |
| `--gl-drop-indicator-background`  | `rgba(0, 0, 0, 0.1)`             | Drop target highlight                     |
| `--gl-drop-indicator-border`      | `1px dashed rgba(0, 0, 0, 0.45)` | Drop target highlight                     |
| `--gl-drop-indicator-shadow`      | `none`                           | Drop target highlight                     |
| `--gl-drag-proxy-opacity`         | `0.92`                           | Drag proxy                                |
| `--gl-drag-proxy-shadow`          | `2px 2px 8px rgba(0, 0, 0, 0.3)` | Drag proxy                                |
| `--gl-menu-background`            | `#ffffff`                        | Tab overflow menu                         |
| `--gl-menu-text`                  | `#1f1f1f`                        | Tab overflow menu                         |
| `--gl-menu-border`                | `1px solid #b5b5b5`              | Tab overflow menu                         |
| `--gl-menu-shadow`                | `0 2px 8px rgba(0, 0, 0, 0.2)`   | Tab overflow menu                         |
| `--gl-menu-hover-background`      | `#e8e8e8`                        | Hovered menu entry                        |
| `--gl-scrollbar-size`             | `10px`                           | Panel scrollbar thickness                 |
| `--gl-scrollbar-radius`           | `5px`                            | Panel scrollbar thumb corners             |
| `--gl-scrollbar-track`            | `transparent`                    | Panel scrollbar track                     |
| `--gl-scrollbar-thumb`            | `#b9b9b9`                        | Panel scrollbar thumb                     |
| `--gl-scrollbar-thumb-hover`      | `#8f8f8f`                        | Hovered scrollbar thumb                   |
| `--gl-title-input-background`     | `#ffffff`                        | Field shown while a tab is renamed        |
| `--gl-title-input-text`           | `#1f1f1f`                        | Field shown while a tab is renamed        |
| `--gl-title-input-border`         | `1px solid #3b82d6`              | Field shown while a tab is renamed        |
| `--gl-focus-ring`                 | `2px solid #3b82d6`              | Keyboard focus outline                    |

Sizes are read from the rendered DOM, so the dimension variables can be changed at any time.

## Browser support

Chromium-based browsers are the supported target, and the tests run in Chromium. The styled
panel scrollbars use `::-webkit-scrollbar` and appear only there; nothing else depends on it.

## Differences from 1.x

Nothing from 1.x carries over unchanged: the JavaScript API, the config format and the CSS
class names are all new.

**Added in [PR #11](https://github.com/wctiger/golden-layout/pull/11)**

- Rename a tab in place by double-clicking its title or pressing F2.
- Open the customizable tab menu with a right-click or Shift+F10 to rename a tab or close
  multiple tabs at once.
- Add controls to a stack header with `renderStackActions`.
- Close and maximize controls include the panel title in their tooltips. Labels can vary by panel.
- Panels have styled scrollbars with CSS variables for their size and colors.

The [benchmark report](./bench/REPORT.md) compares the rewrite with 1.5.9 on interaction
timing, retained memory and bundle size.

**Removed**

- jQuery, and panels written as plain functions over a DOM container. Panels are React
  components.
- Popout windows, with `openPopouts` and the popout settings.
- The event emitter and EventHub, including bubbling events. Use `onChange(state, action)`.
- The config minifier. A saved layout is already compact.
- Responsive mode, and touch support.
- Item objects with methods (`item.addChild`, `item.parent`, `container.getElement()`).
- The `settings`, `dimensions` and `labels` blocks inside the config. Settings and labels are
  props; dimensions are CSS variables.
- Bower, jspm, the UMD build and the global `GoldenLayout`.

**Changed**

- A 1.x config will not load. `content` is `children`, `component` items are `panel`,
  `componentName` is `component`, `componentState` is `state`, `width` and `height` are one
  `size`, and `isClosable` is `closable`.
- Every item has exactly one id.
- A stack holds panels only. Rows and columns can no longer be nested inside a tab.
- Titles are plain text, never HTML.
- Class names are `gl-*` instead of `lm_*`, and themes are sets of CSS variables.

## Development

The project uses [Vite+](https://viteplus.dev).

```sh
npm install
npm run dev      # the demo app, from examples/demo
npm test         # model tests in Node, rendering tests in Chromium
npm run check    # format, lint and typecheck
npm run build    # ESM bundle, types and stylesheet into dist/
npm run bench    # benchmark against the legacy 1.5.9 build, see bench/
```

The rendering tests need Chromium: `npx playwright install chromium`.

- [`docs/TEST_MIGRATION.md`](./docs/TEST_MIGRATION.md) maps every 1.x test to its replacement.
- [`docs/REWRITE_PLAN.md`](./docs/REWRITE_PLAN.md) and
  [`docs/BENCHMARK_PLAN.md`](./docs/BENCHMARK_PLAN.md) record the decisions behind the rewrite.

## License

MIT

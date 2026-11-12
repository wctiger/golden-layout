# Test migration audit

Every case in the legacy suite (commit `129242c`, `test/*.js`), and what became of it.

## Summary

The legacy suite has **106 cases in 21 files**. (The rewrite plan estimated about 122, with
20 event-emitter cases and 7 disabled ones. The exact figures are 106 cases, 9 event-emitter
cases and 2 disabled ones; the estimate came from a loose text match.)

| Status  | Cases | Meaning                                                               |
| ------- | ----- | --------------------------------------------------------------------- |
| ported  | 57    | Same behaviour, asserted against the new API                          |
| changed | 19    | Kept, but the expected behaviour differs by design; the note says how |
| merged  | 10    | Set-up or teardown step that is now part of other cases               |
| dropped | 20    | Removed with its feature, under the agreed list below                 |

86 of 106 cases survive. The 20 dropped cases are all on the agreed list:

- the popout suite (5 cases, 2 of them disabled), because popouts are removed;
- the event-emitter suite (9 cases), because the utility is removed;
- the minifier suite (5 cases), because the minifier is removed;
- the `stopPropagation` case, because bubbling is replaced by the action stream.

No case was dropped for any other reason. Responsive mode and the transition indicator had no
legacy tests.

The legacy cases ran in order and shared one layout per file. The browser cases are now
independent: each mounts its own layout, which is why the old "creates a layout" and "destroys
the layout" steps are mostly marked merged.

## Where the tests run

- `tests/model/*.test.ts`: Node, no DOM. The model, the store, settings, drop-zone geometry and
  the stylesheet checks.
- `tests/browser/*.test.tsx`: Vitest browser mode on Chromium, with real mouse input for
  splitters and drag and drop.

CI runs the whole suite on React 18 and React 19.

## Case by case

### `test/component-creation-events-tests.js` → `tests/browser/component-lifecycle.test.tsx`

| Legacy case          | Status | New case, or reason                                                                    |
| -------------------- | ------ | -------------------------------------------------------------------------------------- |
| creates a layout     | merged | mounting is part of each case                                                          |
| registers listeners  | merged | the component subscribes with `usePanelVisible()` when it mounts                       |
| has called listeners | ported | reports the active panel as shown exactly once on creation                             |
| destroys the layout  | merged | teardown is automatic after each case; covered by initialisation "destroys the layout" |

### `test/component-state-save-tests.js` → `tests/browser/component-state.test.tsx`

| Legacy case                                           | Status | New case, or reason                                                         |
| ----------------------------------------------------- | ------ | --------------------------------------------------------------------------- |
| Can create a most basic layout                        | ported | hands the saved state to the component, and the default where none is saved |
| returns the initial state                             | ported | returns the initial state when the layout is saved                          |
| emits stateChanged when a component updates its state | ported | reports one change when a component updates its state                       |
| returns the updated state                             | ported | returns the updated state                                                   |
| Destroys the layout                                   | ported | unmounts every panel when the layout is destroyed                           |

### `test/create-config.tests.js` → `tests/model/settings.test.ts`

| Legacy case                                           | Status | New case, or reason                              |
| ----------------------------------------------------- | ------ | ------------------------------------------------ |
| doesn't change the default config when calling extend | ported | doesn't change the defaults when overriding them |

### `test/create-from-config-tests.js` → `tests/model/create-from-config.test.ts`

| Legacy case                                                     | Status  | New case, or reason                                                                                                                 |
| --------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| creates the right primitive types: component only               | ported  | creates the right primitive types: panel only                                                                                       |
| creates the right primitive types: stack and component          | ported  | creates the right primitive types: stack and panel                                                                                  |
| creates the right primitive types: row and two component        | ported  | creates the right primitive types: row and two panels                                                                               |
| creates the right primitive types: stack -> column -> component | changed | creates the right primitive types: column -> stack -> panel, and rejects stack -> column. Stacks hold panels only in the new schema |

### `test/deferred-create-drag-tests.js` → `tests/browser/drag.test.tsx`

| Legacy case                         | Status | New case, or reason                                             |
| ----------------------------------- | ------ | --------------------------------------------------------------- |
| creates a layout                    | ported | supports drag creation with deferred content > creates a layout |
| creates a drag source               | ported | creates a drag source from a function                           |
| creates a new components if dragged | ported | creates a new panel if dragged, building its config on drop     |
| destroys the layout                 | ported | removes the drag source with the layout                         |

### `test/disabled-selection-tests.js` → `tests/browser/selection.test.tsx`

| Legacy case                                                         | Status | New case, or reason                                                    |
| ------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------- |
| creates a layout                                                    | ported | selection, when disabled > creates a layout                            |
| attaches event listeners and retrieves stacks                       | ported | finds both stacks                                                      |
| clicks a header, but nothing happens since enableSelection == false | ported | clicks a header, but nothing happens since selection is not enabled    |
| destroys the layout                                                 | merged | teardown is automatic; covered by initialisation "destroys the layout" |

### `test/drag-tests.js` → `tests/browser/drag.test.tsx`

| Legacy case                         | Status | New case, or reason                       |
| ----------------------------------- | ------ | ----------------------------------------- |
| creates a layout                    | ported | supports drag creation > creates a layout |
| creates a drag source               | ported | creates a drag source                     |
| creates a new components if dragged | ported | creates a new panel if dragged            |
| destroys the layout                 | ported | removes the drag source with the layout   |

### `test/empty-item-tests.js` → `tests/model/empty-item.test.ts`

| Legacy case                                               | Status | New case, or reason                                                                                       |
| --------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------- |
| Creates an initial layout                                 | ported | creates an initial layout with an empty stack                                                             |
| can manipulate the layout tree with an empty item present | ported | can manipulate the layout tree with an empty item present                                                 |
| can add children to the empty stack                       | ported | can add children to the empty stack                                                                       |
| destroys the layout                                       | merged | a headless model has nothing to destroy; view teardown is covered by initialisation "destroys the layout" |

### `test/enabled-selection-tests.js` → `tests/browser/selection.test.tsx`

| Legacy case                                   | Status  | New case, or reason                                                                                                               |
| --------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| creates a layout                              | ported  | selection, when enabled > creates a layout                                                                                        |
| attaches event listeners and retrieves stacks | ported  | finds both stacks, with nothing selected                                                                                          |
| clicks a header and it selects a stack        | ported  | clicks a header and it selects a stack                                                                                            |
| clicks changes selection                      | ported  | clicking another header changes the selection                                                                                     |
| changes selection programatically             | changed | changes selection programmatically. One `select` action per change, where the legacy layout emitted a deselect and a select event |
| destroys the layout                           | merged  | teardown is automatic; covered by initialisation "destroys the layout"                                                            |

### `test/event-bubble-tests.js` → `tests/model/action-stream.test.ts`

| Legacy case           | Status  | New case, or reason                                                                                                                                                |
| --------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| creates a layout      | ported  | creates a layout                                                                                                                                                   |
| emits bubbling events | changed | reports a change to a deeply nested item, naming its origin. Bubbling through ancestors is gone (agreed drop); the origin is carried by the action                 |
| stops propagation     | dropped | `stopPropagation` has no equivalent (agreed drop). Replaced by "calls every listener exactly once per change" and "reports nothing when an action changes nothing" |
| destroys the layout   | merged  | a headless model has nothing to destroy                                                                                                                            |

### `test/event-emitter-tests.js` → removed

| Legacy case                                                              | Status  | New case, or reason                               |
| ------------------------------------------------------------------------ | ------- | ------------------------------------------------- |
| is possible to inherit from EventEmitter                                 | dropped | the EventEmitter utility is removed (agreed drop) |
| notifies callbacks                                                       | dropped | the EventEmitter utility is removed (agreed drop) |
| triggers an 'all' event                                                  | dropped | the EventEmitter utility is removed (agreed drop) |
| triggers sets the right context                                          | dropped | the EventEmitter utility is removed (agreed drop) |
| unbinds events                                                           | dropped | the EventEmitter utility is removed (agreed drop) |
| unbinds all events if no context is provided                             | dropped | the EventEmitter utility is removed (agreed drop) |
| unbinds events for a specific context only                               | dropped | the EventEmitter utility is removed (agreed drop) |
| throws an exception when trying to unsubscribe for a non existing method | dropped | the EventEmitter utility is removed (agreed drop) |
| throws an exception when attempting to bind a non-function               | dropped | the EventEmitter utility is removed (agreed drop) |

### `test/id-tests.js` → `tests/model/ids.test.ts`

| Legacy case                                          | Status  | New case, or reason                                                                   |
| ---------------------------------------------------- | ------- | ------------------------------------------------------------------------------------- |
| creates a layout                                     | merged  | the layout is created once for the suite                                              |
| finds the item                                       | ported  | finds the item                                                                        |
| has no id initially                                  | changed | gives an item without an id a generated one. Every item now has exactly one id        |
| adds the first id as a string                        | changed | uses the id given as a string                                                         |
| adds the second id to an array                       | changed | keeps ids apart when a second item is added. Multi-id collapsed to single-id (agreed) |
| doesn't add duplicated ids                           | changed | doesn't add duplicated ids. A duplicate id is now rejected with an error              |
| removes ids                                          | changed | removes ids with their item                                                           |
| throws error when trying to remove a non-existant id | ported  | throws when trying to remove a non-existent id                                        |
| destroys the layout                                  | merged  | a headless model has nothing to destroy                                               |

### `test/initialisation-tests.js` → `tests/browser/initialisation.test.tsx`

| Legacy case                                     | Status  | New case, or reason                                                                  |
| ----------------------------------------------- | ------- | ------------------------------------------------------------------------------------ |
| Finds the layoutmanager on the global namespace | changed | exports the component and the layout factory. There is no global; the package is ESM |
| Can create a most basic layout                  | ported  | can create a most basic layout                                                       |
| Destroys the layout                             | ported  | destroys the layout                                                                  |

### `test/item-creation-events-tests.js` → `tests/model/item-creation-events.test.ts`

| Legacy case                  | Status  | New case, or reason                                                                                                 |
| ---------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------- |
| creates a layout             | ported  | starts with an empty layout and nothing reported                                                                    |
| registeres listeners         | ported  | registers a listener                                                                                                |
| has called listeners         | changed | has called the listener once, with every created item. Per-type events are replaced by one change plus `diffLayout` |
| provided the right arguments | ported  | provided the right arguments                                                                                        |
| destroys the layout          | changed | reports removed items, and stops reporting after unsubscribing                                                      |

### `test/minifier-tests.js` → removed

| Legacy case                                     | Status  | New case, or reason                          |
| ----------------------------------------------- | ------- | -------------------------------------------- |
| has minification methods                        | dropped | the config minifier is removed (agreed drop) |
| doesn't manipulate the original config          | dropped | the config minifier is removed (agreed drop) |
| minifies and unminifies the config directly     | dropped | the config minifier is removed (agreed drop) |
| doesn't change single character keys and values | dropped | the config minifier is removed (agreed drop) |
| works with existing minified configurations     | dropped | the config minifier is removed (agreed drop) |

### `test/popout-tests.js` → removed

| Legacy case                          | Status  | New case, or reason                    |
| ------------------------------------ | ------- | -------------------------------------- |
| creates a layout                     | dropped | popouts are removed (agreed drop)      |
| opens testComponent in a new window  | dropped | popouts are removed (agreed drop)      |
| serialises the new window (disabled) | dropped | disabled case, and popouts are removed |
| closes the open window (disabled)    | dropped | disabled case, and popouts are removed |
| destroys the layout                  | dropped | popouts are removed (agreed drop)      |

### `test/selector-tests.js` → `tests/model/selectors.test.ts`

| Legacy case                                          | Status  | New case, or reason                                                               |
| ---------------------------------------------------- | ------- | --------------------------------------------------------------------------------- |
| creates a layout with elements that have ids         | ported  | creates a layout with items that have ids                                         |
| finds an item by string id                           | ported  | finds an item by string id                                                        |
| returns an empty array if no item was found for id   | ported  | returns nothing if no item was found for an id                                    |
| finds items by an id from an array                   | changed | finds a group of items with a filter. Shared ids are gone; grouping uses a filter |
| finds items by type                                  | ported  | finds items by type                                                               |
| returns an empty array if no item was found for type | ported  | returns an empty array if no item was found for a type                            |
| finds the component instance by name                 | ported  | finds panels by component name                                                    |
| allows for chaining                                  | ported  | allows searching beneath an item                                                  |

### `test/tab-tests.js` → `tests/browser/tabs.test.tsx`

| Legacy case                               | Status | New case, or reason                                                                                                                                          |
| ----------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| creates a layout                          | ported | creates a layout with one tab per panel                                                                                                                      |
| attached a drag listener to the first tab | ported | makes the first tab draggable and not the one with reorderable: false (behaviour confirmed in drag.test.tsx "does not drag a tab marked reorderable: false") |
| destroys the layout                       | ported | removes the tabs with the layout                                                                                                                             |

### `test/title-tests.js` → `tests/browser/titles.test.tsx`

| Legacy case                                                | Status  | New case, or reason                                                 |
| ---------------------------------------------------------- | ------- | ------------------------------------------------------------------- |
| creates a layout                                           | ported  | creates a layout                                                    |
| applies titles from configuration                          | ported  | applies titles from configuration, defaulting to the component name |
| displays the title on the tab                              | ported  | displays the title on the tab                                       |
| updates the title when calling setTitle on the item        | ported  | updates the title when calling setTitle on the layout               |
| updates the title when calling setTitle from the container | ported  | updates the title when calling setTitle from inside the panel       |
| Persists the title                                         | ported  | persists the title                                                  |
| supports html in title                                     | changed | shows markup in a title as text. Titles are plain text, never HTML  |
| destroys the layout                                        | ported  | removes the titles with the layout                                  |

### `test/tree-manipulation-tests.js` → `tests/model/tree-manipulation.test.ts`

| Legacy case                                   | Status  | New case, or reason                                                                                                                   |
| --------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Creates an initial layout                     | merged  | the layout is created once for the suite                                                                                              |
| has the right initial structure               | ported  | has the right initial structure                                                                                                       |
| adds a child to the stack                     | ported  | adds a child to the stack                                                                                                             |
| replaces a component with a row of components | changed | replaces a stack with a row of panels. A tab can no longer hold a row, so that is asserted to throw and the stack is replaced instead |
| Has setup parents correctly                   | ported  | has set up parents correctly                                                                                                          |
| Destroys a component and its parent           | ported  | destroys a panel and its parent                                                                                                       |

### `test/xss_tests.js` → `tests/browser/xss.test.tsx`

| Legacy case                   | Status  | New case, or reason                     |
| ----------------------------- | ------- | --------------------------------------- |
| escapes tags                  | changed | escapes tags                            |
| escapes javascript urls       | changed | does not run javascript urls            |
| escapes expression statements | changed | does not evaluate expression statements |
| escapes onload statements     | changed | does not attach onload handlers         |
| escapes onerror statements    | changed | does not attach onerror handlers        |

## Tests with no legacy counterpart

Added because the rewrite introduced the behaviour or made it testable:

- `tests/model/reducer.test.ts`: moving and docking, tidying after removals, resize, maximise,
  selection, serialization and structural sharing.
- `tests/model/create-from-config.test.ts` (normalization block): generated ids, defaults,
  round-tripping and validation errors.
- `tests/model/drop-geometry.test.ts`: the pure drop-zone functions.
- `tests/model/themes.test.ts`: one stylesheet, variables only, themes are overrides only.
- `tests/browser/renderer.test.tsx`: frame layout, header sides, splitters, panel identity across
  moves, maximise and tab overflow.
- `tests/browser/drag.test.tsx` (tab and stack blocks): every drag path, cancel, constraints and
  zero re-renders during a drag.
- `tests/browser/theming.test.tsx`: defaults, theme classes and runtime theme switching.
- `tests/browser/initialisation.test.tsx`: `initialLayout` with a ref, StrictMode, and the
  unregistered-component error.

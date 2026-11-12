import { IdAllocator, normalizeLayout } from './model/normalize';
import { filterItems, findByComponent, findById, findByType, parentOf } from './model/queries';
import type { Scope } from './model/queries';
import { reduce } from './model/reducer';
import type {
  Action,
  ContainerNode,
  Destination,
  ItemPatch,
  LayoutConfig,
  LayoutNode,
  LayoutState,
  NodeConfig,
  NodeType,
  PanelConfig,
  PanelNode,
} from './model/types';

/** Called after every change with the new state, the action that caused it, and the old state. */
export type LayoutListener = (state: LayoutState, action: Action, previous: LayoutState) => void;

/**
 * The handle for one layout: holds its state, applies actions, and answers queries.
 * Create it with `createLayout` and pass it to `<GoldenLayout layout={...}>`, or read it
 * inside the tree with `useGoldenLayout()`.
 */
export interface Layout {
  /** The current state: plain, immutable, serializable data. */
  getState(): LayoutState;
  /** Same as `getState`, so `JSON.stringify(layout)` saves the layout. */
  toJSON(): LayoutState;
  subscribe(listener: LayoutListener): () => void;
  dispatch(action: Action): void;

  /** Adds an item and returns its id. Without `to` it joins the root. */
  addItem(item: NodeConfig, to?: Destination): string;
  /** Adds a panel and returns its id. */
  addPanel(panel: Omit<PanelConfig, 'type'>, to?: Destination): string;
  /** Removes an item unconditionally. */
  removeItem(id: string): void;
  /** Removes an item unless it is marked `closable: false`. */
  closeItem(id: string): void;
  /** Swaps an item for a new one in the same place and returns the new id. */
  replaceItem(id: string, item: NodeConfig): string;
  moveItem(id: string, to: Destination): void;
  /** Makes a panel the active tab of its stack. */
  setActive(id: string): void;
  /** Sets the relative sizes of a row's or column's children. */
  resize(id: string, sizes: number[]): void;
  maximise(id: string): void;
  restore(): void;
  toggleMaximise(id: string): void;
  select(id: string | null): void;
  setTitle(id: string, title: string): void;
  setPanelState<S>(id: string, state: S | ((previous: S) => S)): void;
  updateItem(id: string, patch: ItemPatch): void;
  setLayout(layout: LayoutConfig): void;

  getById(id: string): LayoutNode | undefined;
  getParent(id: string): ContainerNode | null;
  /** Items of a type, in the whole layout or beneath `scope`. */
  getByType<T extends NodeType>(type: T, scope?: LayoutNode): Extract<LayoutNode, { type: T }>[];
  getByComponent(component: string, scope?: LayoutNode): PanelNode[];
  filter(predicate: (node: LayoutNode) => boolean, scope?: LayoutNode): LayoutNode[];
}

export function createLayout(config?: LayoutConfig): Layout {
  let state = normalizeLayout(config);
  const listeners = new Set<LayoutListener>();

  const dispatch = (action: Action): void => {
    const previous = state;
    const next = reduce(previous, action);
    if (next === previous) return;
    state = next;
    for (const listener of [...listeners]) listener(next, action, previous);
  };

  /** Gives the item an id up front, so the caller can be told what was created. */
  const withId = <T extends NodeConfig>(item: T): T & { id: string } =>
    item.id === undefined
      ? { ...item, id: new IdAllocator(state.root).next(item.type) }
      : (item as T & { id: string });

  const scoped = (scope: LayoutNode | undefined): Scope => scope ?? state;

  const layout: Layout = {
    getState: () => state,
    toJSON: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispatch,

    addItem(item, to) {
      const identified = withId(item);
      dispatch({ type: 'addItem', item: identified, to });
      return identified.id;
    },
    addPanel: (panel, to) => layout.addItem({ ...panel, type: 'panel' }, to),
    removeItem: (id) => dispatch({ type: 'removeItem', id }),
    closeItem: (id) => dispatch({ type: 'closeItem', id }),
    replaceItem(id, item) {
      const identified = withId(item);
      dispatch({ type: 'replaceItem', id, item: identified });
      return identified.id;
    },
    moveItem: (id, to) => dispatch({ type: 'moveItem', id, to }),
    setActive: (id) => dispatch({ type: 'setActive', id }),
    resize: (id, sizes) => dispatch({ type: 'resize', id, sizes }),
    maximise: (id) => dispatch({ type: 'maximise', id }),
    restore: () => dispatch({ type: 'restore' }),
    toggleMaximise(id) {
      const node = findById(state, id);
      const stackId = node?.type === 'panel' ? parentOf(state, id)?.id : id;
      if (state.maximisedId !== null && state.maximisedId === stackId)
        dispatch({ type: 'restore' });
      else dispatch({ type: 'maximise', id });
    },
    select: (id) => dispatch({ type: 'select', id }),
    setTitle: (id, title) => dispatch({ type: 'setTitle', id, title }),
    setPanelState(id, next) {
      const node = findById(state, id);
      const value =
        typeof next === 'function' && node?.type === 'panel'
          ? (next as (previous: unknown) => unknown)(node.state)
          : next;
      dispatch({ type: 'setPanelState', id, state: value });
    },
    updateItem: (id, patch) => dispatch({ type: 'updateItem', id, patch }),
    setLayout: (next) => dispatch({ type: 'setLayout', layout: next }),

    getById: (id) => findById(state, id),
    getParent: (id) => parentOf(state, id),
    getByType: (type, scope) => findByType(scoped(scope), type),
    getByComponent: (component, scope) => findByComponent(scoped(scope), component),
    filter: (predicate, scope) => filterItems(scoped(scope), predicate),
  };
  return layout;
}

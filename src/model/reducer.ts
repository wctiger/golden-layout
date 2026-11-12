import { IdAllocator, normalizeItem, normalizeLayout, normalizePanel } from './normalize';
import { getIndex, isWithin, replaceNode, requireEntry, stackOf } from './tree';
import type {
  Action,
  ContainerNode,
  Destination,
  LayoutNode,
  LayoutState,
  NodeConfig,
  PanelNode,
  RowOrColumnNode,
  Side,
  StackNode,
} from './types';
import { LayoutError } from './types';

type Root = ContainerNode | null;

function average(nodes: readonly ContainerNode[]): number {
  if (nodes.length === 0) return 1;
  return nodes.reduce((sum, node) => sum + node.size, 0) / nodes.length;
}

function clampIndex(index: number | undefined, length: number): number {
  if (index === undefined) return length;
  return Math.max(0, Math.min(Math.trunc(index), length));
}

/**
 * Tidies the tree after `startId` lost a child, working upwards:
 * an empty container is removed, and a row or column left with a single child is replaced
 * by that child. Items marked `closable: false` are kept as they are.
 */
function cleanup(root: Root, startId: string | null): Root {
  let currentId = startId;
  while (root && currentId !== null) {
    const entry = getIndex(root).get(currentId);
    if (!entry || entry.node.type === 'panel') break;
    const node = entry.node;
    if (node.closable === false) break;

    if (node.children.length === 0) {
      currentId = entry.parent ? entry.parent.id : null;
      root = replaceNode(root, node.id, null);
      continue;
    }

    if (node.type !== 'stack' && node.children.length === 1) {
      const only = node.children[0]!;
      const parent = entry.parent;
      if (parent && only.type === parent.type && only.type !== 'stack') {
        // A row inside a row (or column inside a column) adds nothing: splice it in.
        const total = only.children.reduce((sum, child) => sum + child.size, 0) || 1;
        const spliced = only.children.map((child) => ({
          ...child,
          size: (child.size / total) * node.size,
        }));
        root = replaceNode(root, node.id, spliced);
      } else {
        root = replaceNode(root, node.id, { ...only, size: node.size });
      }
    }
    break;
  }
  return root;
}

function insertIntoParent(
  root: ContainerNode,
  parentId: string,
  index: number | undefined,
  item: LayoutNode,
  ids: IdAllocator,
): ContainerNode {
  const parent = requireEntry(root, parentId).node;
  if (parent.type === 'panel') {
    throw new LayoutError(`Cannot add into "${parentId}": a panel has no children`);
  }

  if (parent.type === 'stack') {
    if (item.type !== 'panel' && item.type !== 'stack') {
      throw new LayoutError(`Cannot add a ${item.type} into stack "${parentId}": only panels fit`);
    }
    const panels = item.type === 'stack' ? item.children : [item];
    if (panels.length === 0) return root;
    const at = clampIndex(index, parent.children.length);
    const children = [...parent.children.slice(0, at), ...panels, ...parent.children.slice(at)];
    const activeId = item.type === 'stack' ? (item.activeId ?? panels[0]!.id) : item.id;
    return replaceNode(root, parent.id, { ...parent, children, activeId })!;
  }

  const size = average(parent.children);
  const child: ContainerNode =
    item.type === 'panel'
      ? { type: 'stack', id: ids.next('stack'), size, activeId: item.id, children: [item] }
      : { ...item, size };
  const at = clampIndex(index, parent.children.length);
  const children = [...parent.children.slice(0, at), child, ...parent.children.slice(at)];
  return replaceNode(root, parent.id, { ...parent, children })!;
}

function dock(
  root: ContainerNode,
  targetId: string,
  side: Side,
  item: LayoutNode,
  ids: IdAllocator,
): ContainerNode {
  let entry = requireEntry(root, targetId);
  if (entry.node.type === 'panel') entry = requireEntry(root, entry.parent!.id);
  const target = entry.node as ContainerNode;
  const parent = entry.parent as RowOrColumnNode | null;

  const orientation = side === 'left' || side === 'right' ? 'row' : 'column';
  const before = side === 'left' || side === 'top';
  const added: ContainerNode =
    item.type === 'panel'
      ? { type: 'stack', id: ids.next('stack'), size: 1, activeId: item.id, children: [item] }
      : item;

  if (parent && parent.type === orientation) {
    // Same direction as the parent: become a sibling and share the target's space.
    const half = target.size / 2;
    const pair = [
      { ...added, size: half },
      { ...target, size: half },
    ];
    if (!before) pair.reverse();
    return replaceNode(root, target.id, pair)!;
  }

  const pair = [
    { ...added, size: 1 },
    { ...target, size: 1 },
  ];
  if (!before) pair.reverse();
  const wrapper: RowOrColumnNode = {
    type: orientation,
    id: ids.next(orientation),
    size: target.size,
    children: pair,
  };
  return replaceNode(root, target.id, wrapper)!;
}

function place(
  root: Root,
  item: LayoutNode,
  to: Destination | undefined,
  ids: IdAllocator,
): ContainerNode {
  if (to && 'parent' in to) {
    if (!root) throw new LayoutError(`No item with id "${to.parent}" in the layout`);
    return insertIntoParent(root, to.parent, to.index, item, ids);
  }
  if (to) {
    if (!root) throw new LayoutError(`No item with id "${to.target}" in the layout`);
    return dock(root, to.target, to.side, item, ids);
  }
  // No destination: fill an empty layout, join the root, or sit beside it.
  if (!root) {
    return item.type === 'panel'
      ? { type: 'stack', id: ids.next('stack'), size: 1, activeId: item.id, children: [item] }
      : { ...item, size: 1 };
  }
  if (root.type === 'stack' && item.type !== 'panel')
    return dock(root, root.id, 'right', item, ids);
  return insertIntoParent(root, root.id, undefined, item, ids);
}

function buildItem(config: NodeConfig, ids: IdAllocator): LayoutNode {
  return config.type === 'panel' ? normalizePanel(config, ids) : normalizeItem(config, ids);
}

function remove(root: ContainerNode, id: string): Root {
  const entry = requireEntry(root, id);
  const parentId = entry.parent ? entry.parent.id : null;
  return cleanup(replaceNode(root, id, null), parentId);
}

function move(root: ContainerNode, id: string, to: Destination): Root {
  const entry = requireEntry(root, id);
  const item = entry.node;
  const parent = entry.parent;
  if (!parent) throw new LayoutError('The root item cannot be moved');

  const anchorId = 'parent' in to ? to.parent : to.target;
  const anchor = requireEntry(root, anchorId);
  if (!('parent' in to)) {
    // Docking a stack, or the only panel of a stack, against that same stack changes nothing.
    const targetStackId = anchor.node.type === 'panel' ? anchor.parent!.id : anchor.node.id;
    const ownStackId = item.type === 'panel' ? parent.id : item.id;
    const alone = item.type !== 'panel' || parent.children.length === 1;
    if (targetStackId === ownStackId && alone) return root;
  }
  if (isWithin(root, anchorId, id) && item.type !== 'panel') {
    throw new LayoutError(`Cannot move "${id}" into itself`);
  }

  if ('parent' in to) {
    if (anchor.node.id === parent.id) {
      // Reorder among the current siblings. `index` is the position after removal.
      const rest = (parent.children as LayoutNode[]).filter((child) => child !== item);
      const at = clampIndex(to.index, rest.length);
      const children = [...rest.slice(0, at), item, ...rest.slice(at)];
      if (children.every((child, i) => child === parent.children[i])) return root;
      const next =
        parent.type === 'stack'
          ? { ...parent, children: children as PanelNode[], activeId: item.id }
          : { ...parent, children: children as ContainerNode[] };
      return replaceNode(root, parent.id, next);
    }
  }

  const ids = new IdAllocator(root);
  // Detach without tidying, so the destination is still addressable, then tidy the old spot.
  const detached = replaceNode(root, id, null)!;
  const destination: Destination =
    !('parent' in to) && to.target === id ? { target: parent.id, side: to.side } : to;
  const placed = place(detached, item, destination, ids);
  return cleanup(placed, parent.id);
}

function settle(state: LayoutState, root: Root): LayoutState {
  if (root === state.root) return state;
  const index = getIndex(root);
  return {
    root,
    maximisedId:
      state.maximisedId !== null && index.get(state.maximisedId)?.node.type === 'stack'
        ? state.maximisedId
        : null,
    selectedId: state.selectedId !== null && index.has(state.selectedId) ? state.selectedId : null,
  };
}

/**
 * The single place layout state changes. Pure: returns a new state, or the same object
 * when the action changes nothing. Nodes the action does not touch keep their identity.
 */
export function reduce(state: LayoutState, action: Action): LayoutState {
  const { root } = state;

  switch (action.type) {
    case 'setLayout':
      return normalizeLayout(action.layout);

    case 'addItem': {
      const ids = new IdAllocator(root);
      const item = buildItem(action.item, ids);
      return settle(state, place(root, item, action.to, ids));
    }

    case 'removeItem': {
      if (!root) throw new LayoutError(`No item with id "${action.id}" in the layout`);
      return settle(state, remove(root, action.id));
    }

    case 'closeItem': {
      const { node } = requireEntry(root, action.id);
      if (node.closable === false) return state;
      if (node.type === 'stack' && node.children.some((panel) => panel.closable === false)) {
        return state;
      }
      return settle(state, remove(root!, action.id));
    }

    case 'replaceItem': {
      const entry = requireEntry(root, action.id);
      const ids = new IdAllocator(replaceNode(root!, action.id, null));
      const inStack = entry.node.type === 'panel';
      let item: LayoutNode;
      if (entry.node.type === 'panel') {
        if (action.item.type !== 'panel') {
          throw new LayoutError(
            `Cannot replace panel "${action.id}" with a ${action.item.type}: a stack can only contain panels`,
          );
        }
        item = normalizePanel(action.item, ids);
      } else {
        item = { ...normalizeItem(action.item, ids), size: entry.node.size };
      }
      let next = replaceNode(root!, action.id, item);
      if (inStack && next) {
        const stack = stackOf(next, item.id);
        if (entry.parent && (entry.parent as StackNode).activeId === action.id) {
          next = replaceNode(next, stack.id, { ...stack, activeId: item.id });
        }
      }
      return settle(state, next);
    }

    case 'moveItem': {
      if (!root) throw new LayoutError(`No item with id "${action.id}" in the layout`);
      return settle(state, move(root, action.id, action.to));
    }

    case 'setActive': {
      const stack = stackOf(root, action.id);
      const panelId = action.id === stack.id ? stack.activeId : action.id;
      if (stack.activeId === panelId) return state;
      return settle(state, replaceNode(root!, stack.id, { ...stack, activeId: panelId }));
    }

    case 'resize': {
      const { node } = requireEntry(root, action.id);
      if (node.type === 'panel' || node.type === 'stack') {
        throw new LayoutError(
          `Only rows and columns can be resized, "${action.id}" is a ${node.type}`,
        );
      }
      if (action.sizes.length !== node.children.length) {
        throw new LayoutError(
          `"${action.id}" has ${node.children.length} children but ${action.sizes.length} sizes were given`,
        );
      }
      if (action.sizes.some((size) => !(size > 0) || !Number.isFinite(size))) {
        throw new LayoutError('Sizes must be positive numbers');
      }
      if (node.children.every((child, i) => child.size === action.sizes[i])) return state;
      const children = node.children.map((child, i) =>
        child.size === action.sizes[i] ? child : { ...child, size: action.sizes[i]! },
      );
      return settle(state, replaceNode(root!, node.id, { ...node, children }));
    }

    case 'maximise': {
      const stack = stackOf(root, action.id);
      return state.maximisedId === stack.id ? state : { ...state, maximisedId: stack.id };
    }

    case 'restore':
      return state.maximisedId === null ? state : { ...state, maximisedId: null };

    case 'select': {
      if (action.id !== null) requireEntry(root, action.id);
      return state.selectedId === action.id ? state : { ...state, selectedId: action.id };
    }

    case 'setTitle': {
      const { node } = requireEntry(root, action.id);
      if (node.type !== 'panel')
        throw new LayoutError(`Only panels have titles, "${action.id}" is a ${node.type}`);
      if (node.title === action.title) return state;
      return settle(state, replaceNode(root!, node.id, { ...node, title: action.title }));
    }

    case 'setPanelState': {
      const { node } = requireEntry(root, action.id);
      if (node.type !== 'panel')
        throw new LayoutError(`Only panels have state, "${action.id}" is a ${node.type}`);
      if (Object.is(node.state, action.state)) return state;
      return settle(state, replaceNode(root!, node.id, { ...node, state: action.state }));
    }

    case 'updateItem': {
      const { node } = requireEntry(root, action.id);
      const entries = Object.entries(action.patch) as [keyof LayoutNode, unknown][];
      if (entries.every(([key, value]) => Object.is(node[key], value))) return state;
      return settle(state, replaceNode(root!, node.id, { ...node, ...action.patch } as LayoutNode));
    }

    default: {
      const unknown: never = action;
      throw new LayoutError(`Unknown action ${JSON.stringify(unknown)}`);
    }
  }
}

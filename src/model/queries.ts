import { getIndex, walk } from './tree';
import type {
  ContainerNode,
  LayoutNode,
  LayoutState,
  NodeOfType,
  NodeType,
  PanelNode,
} from './types';

/** A whole layout, or any node to search beneath (the node itself is not included). */
export type Scope = LayoutState | LayoutNode;

function isState(scope: Scope): scope is LayoutState {
  return !('type' in scope);
}

/** Every item in the scope matching the predicate, in document order. */
export function filterItems(scope: Scope, predicate: (node: LayoutNode) => boolean): LayoutNode[] {
  const found: LayoutNode[] = [];
  const visit = (node: LayoutNode): void => {
    if (predicate(node)) found.push(node);
  };
  if (isState(scope)) walk(scope.root, visit);
  else if (scope.type !== 'panel') for (const child of scope.children) walk(child, visit);
  return found;
}

export function findById(scope: Scope, id: string): LayoutNode | undefined {
  if (isState(scope)) return getIndex(scope.root).get(id)?.node;
  return filterItems(scope, (node) => node.id === id)[0];
}

export function findByType<T extends NodeType>(scope: Scope, type: T): NodeOfType<T>[] {
  return filterItems(scope, (node) => node.type === type) as NodeOfType<T>[];
}

export function findByComponent(scope: Scope, component: string): PanelNode[] {
  return filterItems(
    scope,
    (node) => node.type === 'panel' && node.component === component,
  ) as PanelNode[];
}

export function parentOf(state: LayoutState, id: string): ContainerNode | null {
  return getIndex(state.root).get(id)?.parent ?? null;
}

export interface LayoutDiff {
  created: LayoutNode[];
  removed: LayoutNode[];
}

/** Which items exist in `next` but not `prev`, and the reverse, compared by id. */
export function diffLayout(prev: LayoutState, next: LayoutState): LayoutDiff {
  const before = getIndex(prev.root);
  const after = getIndex(next.root);
  const created: LayoutNode[] = [];
  const removed: LayoutNode[] = [];
  for (const [id, entry] of after) if (!before.has(id)) created.push(entry.node);
  for (const [id, entry] of before) if (!after.has(id)) removed.push(entry.node);
  return { created, removed };
}

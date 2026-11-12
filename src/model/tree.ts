import type { ContainerNode, LayoutNode, LayoutState, PanelNode, StackNode } from './types';
import { LayoutError } from './types';

export interface IndexEntry {
  node: LayoutNode;
  parent: ContainerNode | null;
}

export type LayoutIndex = ReadonlyMap<string, IndexEntry>;

const EMPTY_INDEX: LayoutIndex = new Map();
const indexCache = new WeakMap<LayoutNode, LayoutIndex>();

/** Id lookup table for a tree. Cached per root object, so it is free between changes. */
export function getIndex(root: LayoutNode | null): LayoutIndex {
  if (!root) return EMPTY_INDEX;
  let index = indexCache.get(root);
  if (!index) {
    const map = new Map<string, IndexEntry>();
    const visit = (node: LayoutNode, parent: ContainerNode | null): void => {
      map.set(node.id, { node, parent });
      if (node.type !== 'panel') {
        for (const child of node.children) visit(child, node);
      }
    };
    visit(root, null);
    index = map;
    indexCache.set(root, index);
  }
  return index;
}

export function requireEntry(root: LayoutNode | null, id: string): IndexEntry {
  const entry = getIndex(root).get(id);
  if (!entry) throw new LayoutError(`No item with id "${id}" in the layout`);
  return entry;
}

/** Depth-first, parent before children. */
export function walk(node: LayoutNode | null, visit: (node: LayoutNode) => void): void {
  if (!node) return;
  visit(node);
  if (node.type !== 'panel') {
    for (const child of node.children) walk(child, visit);
  }
}

/** Every panel in the tree, in document order. */
export function allPanels(state: LayoutState): PanelNode[] {
  const panels: PanelNode[] = [];
  walk(state.root, (node) => {
    if (node.type === 'panel') panels.push(node);
  });
  return panels;
}

function withChildren(parent: ContainerNode, children: LayoutNode[]): ContainerNode {
  if (parent.type === 'stack') {
    const panels = children as PanelNode[];
    let activeId = parent.activeId;
    if (!panels.some((panel) => panel.id === activeId)) {
      // The active tab left: fall back to its left neighbour, as the tab strip would.
      const oldIndex = parent.children.findIndex((panel) => panel.id === activeId);
      const fallback = panels[Math.max(Math.min(oldIndex, panels.length) - 1, 0)];
      activeId = fallback ? fallback.id : null;
    }
    return { ...parent, children: panels, activeId };
  }
  return { ...parent, children: children as ContainerNode[] };
}

/**
 * Returns a new tree in which the node `id` is replaced by `replacement` (zero, one or
 * several nodes). Only the path from the root to the node is copied; everything else keeps
 * its identity.
 */
export function replaceNode(
  root: ContainerNode,
  id: string,
  replacement: LayoutNode | readonly LayoutNode[] | null,
): ContainerNode | null {
  const index = getIndex(root);
  const entry = index.get(id);
  if (!entry) throw new LayoutError(`No item with id "${id}" in the layout`);

  let current: readonly LayoutNode[] =
    replacement === null
      ? []
      : Array.isArray(replacement)
        ? replacement
        : [replacement as LayoutNode];
  let child: LayoutNode = entry.node;
  let parent = entry.parent;

  while (parent) {
    const replaced: LayoutNode[] = [];
    for (const sibling of parent.children) {
      if (sibling === child) replaced.push(...current);
      else replaced.push(sibling);
    }
    current = [withChildren(parent, replaced)];
    child = parent;
    parent = index.get(parent.id)?.parent ?? null;
  }

  const next = current[0];
  if (!next) return null;
  if (current.length > 1 || next.type === 'panel') {
    throw new LayoutError('The layout root must be a single row, column or stack');
  }
  return next;
}

export function stackOf(root: LayoutNode | null, id: string): StackNode {
  const entry = requireEntry(root, id);
  if (entry.node.type === 'stack') return entry.node;
  if (entry.node.type === 'panel' && entry.parent?.type === 'stack') return entry.parent;
  throw new LayoutError(`Item "${id}" is not a stack or a panel`);
}

/** True when `id` is `ancestorId` or lies beneath it. */
export function isWithin(root: LayoutNode | null, id: string, ancestorId: string): boolean {
  const index = getIndex(root);
  let current = index.get(id);
  while (current) {
    if (current.node.id === ancestorId) return true;
    current = current.parent ? index.get(current.parent.id) : undefined;
  }
  return false;
}

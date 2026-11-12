import { walk } from './tree';
import type {
  ContainerNode,
  LayoutConfig,
  LayoutNode,
  LayoutState,
  NodeConfig,
  PanelConfig,
  PanelNode,
  RowOrColumnNode,
  Side,
  StackNode,
} from './types';
import { LayoutError } from './types';

const SIDES: readonly Side[] = ['left', 'right', 'top', 'bottom'];

/** Tracks the ids in use so generated ids never collide. */
export class IdAllocator {
  private readonly used = new Set<string>();
  private readonly counters: Record<string, number> = {};

  constructor(root?: LayoutNode | null) {
    walk(root ?? null, (node) => this.used.add(node.id));
  }

  claim(id: string): void {
    if (this.used.has(id)) throw new LayoutError(`Duplicate item id "${id}"`);
    this.used.add(id);
  }

  next(type: string): string {
    let id: string;
    do {
      this.counters[type] = (this.counters[type] ?? 0) + 1;
      id = `${type}-${this.counters[type]}`;
    } while (this.used.has(id));
    this.used.add(id);
    return id;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Claims every explicit id first, so generated ids cannot take one that appears later. */
function claimIds(config: unknown, ids: IdAllocator): void {
  if (!isObject(config)) throw new LayoutError('A layout item must be an object');
  const { type, id, children } = config;
  if (type !== 'row' && type !== 'column' && type !== 'stack' && type !== 'panel') {
    throw new LayoutError(`Unknown item type "${String(type)}"`);
  }
  if (id !== undefined) {
    if (typeof id !== 'string' || id === '') {
      throw new LayoutError(`Item ids must be non-empty strings, got ${JSON.stringify(id)}`);
    }
    ids.claim(id);
  }
  if (children !== undefined) {
    if (type === 'panel') throw new LayoutError('A panel cannot have children');
    if (!Array.isArray(children)) throw new LayoutError('"children" must be an array');
    for (const child of children) claimIds(child, ids);
  }
}

function sizeOf(config: { size?: number }): number | undefined {
  if (config.size === undefined) return undefined;
  if (typeof config.size !== 'number' || !(config.size > 0) || !Number.isFinite(config.size)) {
    throw new LayoutError(`"size" must be a positive number, got ${String(config.size)}`);
  }
  return config.size;
}

function buildPanel(config: PanelConfig, ids: IdAllocator): PanelNode {
  if (typeof config.component !== 'string' || config.component === '') {
    throw new LayoutError('A panel needs a "component" name');
  }
  const panel: PanelNode = {
    type: 'panel',
    id: config.id ?? ids.next('panel'),
    component: config.component,
    title: config.title ?? config.component,
  };
  if (config.closable !== undefined) panel.closable = config.closable;
  if (config.reorderable !== undefined) panel.reorderable = config.reorderable;
  if (config.props !== undefined) panel.props = config.props;
  if (config.state !== undefined) panel.state = config.state;
  return panel;
}

function wrapPanel(panel: PanelNode, size: number | undefined, ids: IdAllocator): StackNode {
  return {
    type: 'stack',
    id: ids.next('stack'),
    size: size ?? 1,
    activeId: panel.id,
    children: [panel],
  };
}

function buildContainer(config: NodeConfig, ids: IdAllocator): ContainerNode {
  if (config.type === 'panel') {
    return wrapPanel(buildPanel(config, ids), sizeOf(config), ids);
  }

  if (config.type === 'stack') {
    const id = config.id ?? ids.next('stack');
    const children = (config.children ?? []).map((child) => {
      if (child.type !== 'panel') {
        throw new LayoutError(
          `Stack "${id}" contains a ${String((child as NodeConfig).type)}: a stack can only contain panels`,
        );
      }
      return buildPanel(child, ids);
    });
    let activeId = config.activeId ?? children[0]?.id ?? null;
    if (activeId !== null && !children.some((child) => child.id === activeId)) {
      throw new LayoutError(
        `Stack "${id}" has activeId "${activeId}", which is not one of its panels`,
      );
    }
    if (children.length === 0) activeId = null;
    const stack: StackNode = { type: 'stack', id, size: sizeOf(config) ?? 1, activeId, children };
    if (config.headerPosition !== undefined) {
      if (!SIDES.includes(config.headerPosition)) {
        throw new LayoutError(`Unknown headerPosition "${String(config.headerPosition)}"`);
      }
      stack.headerPosition = config.headerPosition;
    }
    if (config.closable !== undefined) stack.closable = config.closable;
    return stack;
  }

  const id = config.id ?? ids.next(config.type);
  const childConfigs = config.children ?? [];
  const explicit = childConfigs.map(sizeOf).filter((size) => size !== undefined);
  const fallback = explicit.length
    ? explicit.reduce((sum, size) => sum + size, 0) / explicit.length
    : 1;
  const children = childConfigs.map((child) => {
    const node = buildContainer(child, ids);
    return sizeOf(child) === undefined ? { ...node, size: fallback } : node;
  });
  const node: RowOrColumnNode = { type: config.type, id, size: sizeOf(config) ?? 1, children };
  if (config.closable !== undefined) node.closable = config.closable;
  return node;
}

/** Validates an item config and turns it into a node. A bare panel is wrapped in a stack. */
export function normalizeItem(config: NodeConfig, ids: IdAllocator): ContainerNode {
  claimIds(config, ids);
  return buildContainer(config, ids);
}

/** Validates a panel config and turns it into a panel node, without wrapping it. */
export function normalizePanel(config: PanelConfig, ids: IdAllocator): PanelNode {
  claimIds(config, ids);
  return buildPanel(config, ids);
}

export const EMPTY_LAYOUT: LayoutState = Object.freeze({
  root: null,
  maximisedId: null,
  selectedId: null,
});

/**
 * Validates a layout config and fills in everything that can be derived: ids, sizes,
 * titles, active tabs, and the stack around a panel that sits directly in a row or column.
 * A normalized layout is itself a valid config, so `normalizeLayout(state)` round-trips.
 */
export function normalizeLayout(config: LayoutConfig = {}): LayoutState {
  if (typeof config !== 'object' || config === null) {
    throw new LayoutError('A layout config must be an object');
  }
  const ids = new IdAllocator();
  const root = config.root ? normalizeItem(config.root, ids) : null;
  const known = new Map<string, LayoutNode>();
  walk(root, (node) => known.set(node.id, node));

  const maximisedId = config.maximisedId ?? null;
  if (maximisedId !== null && known.get(maximisedId)?.type !== 'stack') {
    throw new LayoutError(`maximisedId "${maximisedId}" is not a stack in the layout`);
  }
  const selectedId = config.selectedId ?? null;
  if (selectedId !== null && !known.has(selectedId)) {
    throw new LayoutError(`selectedId "${selectedId}" is not an item in the layout`);
  }
  return { root, maximisedId, selectedId };
}

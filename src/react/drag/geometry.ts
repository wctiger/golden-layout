import type { Side } from '../../model/types';

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** The measured boxes of one stack, in any single coordinate space. */
export interface StackGeometry {
  id: string;
  /** `null` when the layout runs without headers. */
  header: Rect | null;
  /** Direction the tabs run in: `x` for a header on top or bottom, `y` for left or right. */
  headerAxis: 'x' | 'y';
  tabs: Rect[];
  /** How many panels the stack holds. Not `tabs.length`: without a header there are no tabs. */
  panelCount: number;
  body: Rect;
}

export interface LayoutGeometry {
  /** The item at the root of the frame, or `null` for an empty layout. */
  root: { id: string; rect: Rect; isStack: boolean } | null;
  /** The whole layout element, used when there is no root item. */
  bounds: Rect;
  stacks: StackGeometry[];
}

export type DropPlace =
  /** Become a tab of a stack, at `index` among its current tabs. */
  | { kind: 'tab'; stackId: string; index: number }
  /** Dock against a side of an item, splitting its space. */
  | { kind: 'side'; targetId: string; side: Side }
  /** Fill an empty layout. */
  | { kind: 'empty' };

export interface DropTarget {
  place: DropPlace;
  /** What to highlight while the pointer is here. */
  highlight: Rect;
}

/** Width of the strip along each edge of the layout that docks against the root item. */
export const ROOT_EDGE = 12;
const TAB_MARKER = 4;

export function contains(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.left &&
    point.x <= rect.left + rect.width &&
    point.y >= rect.top &&
    point.y <= rect.top + rect.height
  );
}

/** The half of `rect` lying on `side`: what an item docked there will occupy. */
export function halfOf(rect: Rect, side: Side): Rect {
  const { left, top, width, height } = rect;
  switch (side) {
    case 'left':
      return { left, top, width: width / 2, height };
    case 'right':
      return { left: left + width / 2, top, width: width / 2, height };
    case 'top':
      return { left, top, width, height: height / 2 };
    case 'bottom':
      return { left, top: top + height / 2, width, height: height / 2 };
  }
}

/**
 * Which side of a stack body the point docks against: the outer quarters dock left and
 * right, and the middle half docks top or bottom.
 */
export function bodySide(body: Rect, point: Point): Side {
  const fx = body.width > 0 ? (point.x - body.left) / body.width : 0.5;
  const fy = body.height > 0 ? (point.y - body.top) / body.height : 0.5;
  if (fx < 0.25) return 'left';
  if (fx > 0.75) return 'right';
  return fy < 0.5 ? 'top' : 'bottom';
}

/** The position among `tabs` a tab dropped at `point` would take. */
export function tabInsertIndex(tabs: readonly Rect[], axis: 'x' | 'y', point: Point): number {
  let index = 0;
  for (const tab of tabs) {
    const centre = axis === 'x' ? tab.left + tab.width / 2 : tab.top + tab.height / 2;
    if ((axis === 'x' ? point.x : point.y) > centre) index++;
  }
  return index;
}

function tabMarker(stack: StackGeometry, header: Rect, index: number): Rect {
  const horizontal = stack.headerAxis === 'x';
  const next = stack.tabs[index];
  const last = stack.tabs[stack.tabs.length - 1];
  let edge: number;
  if (next) edge = horizontal ? next.left : next.top;
  else if (last) edge = horizontal ? last.left + last.width : last.top + last.height;
  else edge = horizontal ? header.left : header.top;
  return horizontal
    ? { left: edge - TAB_MARKER / 2, top: header.top, width: TAB_MARKER, height: header.height }
    : { left: header.left, top: edge - TAB_MARKER / 2, width: header.width, height: TAB_MARKER };
}

function rootEdge(root: Rect, point: Point): Side | null {
  if (!contains(root, point)) return null;
  if (point.x - root.left < ROOT_EDGE) return 'left';
  if (root.left + root.width - point.x < ROOT_EDGE) return 'right';
  if (point.y - root.top < ROOT_EDGE) return 'top';
  if (root.top + root.height - point.y < ROOT_EDGE) return 'bottom';
  return null;
}

/** Where an item dropped at `point` would go, or `null` when the point is over nothing. */
export function findDropTarget(geometry: LayoutGeometry, point: Point): DropTarget | null {
  const { root } = geometry;
  if (!root) {
    return contains(geometry.bounds, point)
      ? { place: { kind: 'empty' }, highlight: geometry.bounds }
      : null;
  }

  // Headers come first: a header that runs along the edge of the layout stays usable.
  for (const stack of geometry.stacks) {
    if (stack.header && contains(stack.header, point)) {
      const index = tabInsertIndex(stack.tabs, stack.headerAxis, point);
      return {
        place: { kind: 'tab', stackId: stack.id, index },
        highlight: tabMarker(stack, stack.header, index),
      };
    }
  }

  // The outer edges of the layout split the whole layout. When the root is a single stack
  // its own sides already mean that, so the strips would only get in the way of its header.
  if (!root.isStack) {
    const side = rootEdge(root.rect, point);
    if (side) {
      return {
        place: { kind: 'side', targetId: root.id, side },
        highlight: halfOf(root.rect, side),
      };
    }
  }

  for (const stack of geometry.stacks) {
    if (!contains(stack.body, point)) continue;

    if (stack.panelCount === 0) {
      // An empty stack has nothing to dock against: fill it.
      return { place: { kind: 'tab', stackId: stack.id, index: 0 }, highlight: stack.body };
    }
    if (!stack.header) {
      // Without a header, the centre of the body is where a tab is added.
      const fx = (point.x - stack.body.left) / (stack.body.width || 1);
      const fy = (point.y - stack.body.top) / (stack.body.height || 1);
      if (fx >= 0.25 && fx <= 0.75 && fy >= 0.25 && fy <= 0.75) {
        return {
          place: { kind: 'tab', stackId: stack.id, index: stack.panelCount },
          highlight: stack.body,
        };
      }
    }
    const side = bodySide(stack.body, point);
    return {
      place: { kind: 'side', targetId: stack.id, side },
      highlight: halfOf(stack.body, side),
    };
  }
  return null;
}

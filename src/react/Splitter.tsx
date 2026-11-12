import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { RowOrColumnNode } from '../model/types';
import { useLayoutContext } from './context';

/** The smallest an item may get along an axis, from the CSS minimums of the stacks in it. */
export function minimumSize(element: HTMLElement, horizontal: boolean): number {
  if (element.classList.contains('gl-stack')) {
    const style = getComputedStyle(element);
    return parseFloat(horizontal ? style.minWidth : style.minHeight) || 0;
  }
  const along = element.classList.contains('gl-row') === horizontal;
  let total = 0;
  for (const child of Array.from(element.children) as HTMLElement[]) {
    let size: number;
    if (child.classList.contains('gl-splitter')) {
      const rect = child.getBoundingClientRect();
      size = along ? (horizontal ? rect.width : rect.height) : 0;
    } else {
      size = minimumSize(child, horizontal);
    }
    total = along ? total + size : Math.max(total, size);
  }
  return total;
}

interface DragState {
  pointerId: number;
  start: number;
  before: HTMLElement;
  after: HTMLElement;
  beforeSize: number;
  afterSize: number;
  beforeMin: number;
  afterMin: number;
  weight: number;
  original: [string, string];
  sizes: [number, number];
}

interface SplitterProps {
  parent: RowOrColumnNode;
  /** The splitter sits between children `index` and `index + 1`. */
  index: number;
}

/**
 * Drag handle between two items. While dragging it writes flex weights straight to the two
 * elements, so nothing re-renders; the new sizes are committed to the layout on release.
 */
export function Splitter({ parent, index }: SplitterProps): ReactNode {
  const { layout } = useLayoutContext();
  const drag = useRef<DragState | null>(null);
  const horizontal = parent.type === 'row';

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || event.pointerType === 'touch') return;
    const element = event.currentTarget;
    const before = element.previousElementSibling as HTMLElement | null;
    const after = element.nextElementSibling as HTMLElement | null;
    const first = parent.children[index];
    const second = parent.children[index + 1];
    if (!before || !after || !first || !second) return;
    event.preventDefault();
    element.setPointerCapture(event.pointerId);
    element.classList.add('gl-dragging');
    const size = (target: HTMLElement): number => {
      const rect = target.getBoundingClientRect();
      return horizontal ? rect.width : rect.height;
    };
    drag.current = {
      pointerId: event.pointerId,
      start: horizontal ? event.clientX : event.clientY,
      before,
      after,
      beforeSize: size(before),
      afterSize: size(after),
      beforeMin: minimumSize(before, horizontal),
      afterMin: minimumSize(after, horizontal),
      weight: first.size + second.size,
      original: [before.style.flexGrow, after.style.flexGrow],
      sizes: [first.size, second.size],
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const state = drag.current;
    if (!state || event.pointerId !== state.pointerId) return;
    const total = state.beforeSize + state.afterSize;
    if (total <= 0) return;
    const delta = (horizontal ? event.clientX : event.clientY) - state.start;
    const low = Math.min(state.beforeMin, total / 2);
    const high = Math.max(total - state.afterMin, total / 2);
    const beforeSize = Math.max(low, Math.min(state.beforeSize + delta, high));
    const first = (state.weight * beforeSize) / total;
    state.sizes = [first, state.weight - first];
    state.before.style.flexGrow = String(state.sizes[0]);
    state.after.style.flexGrow = String(state.sizes[1]);
  };

  const finish = (event: ReactPointerEvent<HTMLDivElement>, commit: boolean): void => {
    const state = drag.current;
    if (!state || event.pointerId !== state.pointerId) return;
    drag.current = null;
    event.currentTarget.classList.remove('gl-dragging');
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!commit || state.sizes.some((size) => !(size > 0))) {
      [state.before.style.flexGrow, state.after.style.flexGrow] = state.original;
      return;
    }
    const current = layout.getById(parent.id);
    if (!current || current.type === 'panel' || current.type === 'stack') return;
    const sizes = current.children.map((child) => child.size);
    sizes[index] = state.sizes[0];
    sizes[index + 1] = state.sizes[1];
    layout.resize(parent.id, sizes);
  };

  return (
    <div
      className="gl-splitter"
      role="separator"
      aria-orientation={horizontal ? 'vertical' : 'horizontal'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => finish(event, true)}
      onPointerCancel={(event) => finish(event, false)}
    />
  );
}

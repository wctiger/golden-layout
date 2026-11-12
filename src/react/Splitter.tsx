import { useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
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
  /** The splitter's own box when the drag began, relative to the layout element. */
  origin: { left: number; top: number; width: number; height: number };
  beforeSize: number;
  afterSize: number;
  beforeMin: number;
  afterMin: number;
  weight: number;
  sizes: [number, number];
}

interface SplitterProps {
  parent: RowOrColumnNode;
  /** The splitter sits between children `index` and `index + 1`. */
  index: number;
}

/**
 * Drag handle between two items. Dragging moves only a marker that shows where the edge
 * will be; the items are resized once, on release. Nothing is laid out or rendered while
 * the pointer moves, so the drag stays smooth however heavy the panels are.
 */
export function Splitter({ parent, index }: SplitterProps): ReactNode {
  const { layout, view } = useLayoutContext();
  const drag = useRef<DragState | null>(null);
  const ghost = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const horizontal = parent.type === 'row';

  const placeGhost = (offset: number): void => {
    const state = drag.current;
    const element = ghost.current;
    if (!state || !element) return;
    element.style.left = `${state.origin.left + (horizontal ? offset : 0)}px`;
    element.style.top = `${state.origin.top + (horizontal ? 0 : offset)}px`;
    element.style.width = `${state.origin.width}px`;
    element.style.height = `${state.origin.height}px`;
  };

  // The marker is mounted by the state change below; put it over the splitter at once.
  useLayoutEffect(() => {
    if (dragging) placeGhost(0);
  });

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || event.pointerType === 'touch') return;
    const element = event.currentTarget;
    const before = element.previousElementSibling as HTMLElement | null;
    const after = element.nextElementSibling as HTMLElement | null;
    const first = parent.children[index];
    const second = parent.children[index + 1];
    const root = view.root;
    if (!before || !after || !first || !second || !root) return;
    event.preventDefault();
    element.setPointerCapture(event.pointerId);
    const size = (target: HTMLElement): number => {
      const rect = target.getBoundingClientRect();
      return horizontal ? rect.width : rect.height;
    };
    const rect = element.getBoundingClientRect();
    const bounds = root.getBoundingClientRect();
    drag.current = {
      pointerId: event.pointerId,
      start: horizontal ? event.clientX : event.clientY,
      origin: {
        left: rect.left - bounds.left - root.clientLeft,
        top: rect.top - bounds.top - root.clientTop,
        width: rect.width,
        height: rect.height,
      },
      beforeSize: size(before),
      afterSize: size(after),
      beforeMin: minimumSize(before, horizontal),
      afterMin: minimumSize(after, horizontal),
      weight: first.size + second.size,
      sizes: [first.size, second.size],
    };
    setDragging(true);
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
    placeGhost(beforeSize - state.beforeSize);
  };

  const finish = (event: ReactPointerEvent<HTMLDivElement>, commit: boolean): void => {
    const state = drag.current;
    if (!state || event.pointerId !== state.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!commit || state.sizes.some((size) => !(size > 0))) return;
    const current = layout.getById(parent.id);
    if (!current || current.type === 'panel' || current.type === 'stack') return;
    const sizes = current.children.map((child) => child.size);
    sizes[index] = state.sizes[0];
    sizes[index + 1] = state.sizes[1];
    layout.resize(parent.id, sizes);
  };

  return (
    <div
      className={dragging ? 'gl-splitter gl-dragging' : 'gl-splitter'}
      role="separator"
      aria-orientation={horizontal ? 'vertical' : 'horizontal'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => finish(event, true)}
      onPointerCancel={(event) => finish(event, false)}
    >
      {dragging &&
        view.overlay &&
        // Drawn in the overlay: the panels sit above the frame and would hide it here.
        createPortal(<div className="gl-splitter-ghost" ref={ghost} />, view.overlay)}
    </div>
  );
}

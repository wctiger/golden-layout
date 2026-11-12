import { describe, expect, it } from 'vite-plus/test';
import { bodySide, findDropTarget, halfOf, tabInsertIndex } from '../../src/index';
import type { LayoutGeometry, Rect, StackGeometry } from '../../src/index';

const rect = (left: number, top: number, width: number, height: number): Rect => ({
  left,
  top,
  width,
  height,
});

/** Two stacks side by side in a row, each 400 x 600 with a 20px header and two 80px tabs. */
const stack = (id: string, left: number): StackGeometry => ({
  id,
  header: rect(left, 0, 400, 20),
  headerAxis: 'x',
  tabs: [rect(left, 0, 80, 20), rect(left + 80, 0, 80, 20)],
  panelCount: 2,
  body: rect(left, 20, 400, 580),
});

const geometry: LayoutGeometry = {
  bounds: rect(0, 0, 800, 600),
  root: { id: 'row', rect: rect(0, 0, 800, 600), isStack: false },
  stacks: [stack('left', 0), stack('right', 400)],
};

describe('drop-zone geometry', () => {
  it('splits a stack body into left and right quarters and top and bottom halves', () => {
    const body = rect(0, 0, 400, 400);
    expect(bodySide(body, { x: 50, y: 200 })).toBe('left');
    expect(bodySide(body, { x: 350, y: 200 })).toBe('right');
    expect(bodySide(body, { x: 200, y: 50 })).toBe('top');
    expect(bodySide(body, { x: 200, y: 350 })).toBe('bottom');
    expect(bodySide(body, { x: 101, y: 199 })).toBe('top');
  });

  it('highlights the half an item will occupy', () => {
    const body = rect(100, 50, 400, 200);
    expect(halfOf(body, 'left')).toEqual(rect(100, 50, 200, 200));
    expect(halfOf(body, 'right')).toEqual(rect(300, 50, 200, 200));
    expect(halfOf(body, 'top')).toEqual(rect(100, 50, 400, 100));
    expect(halfOf(body, 'bottom')).toEqual(rect(100, 150, 400, 100));
  });

  it('finds the insertion index among tabs from their centres', () => {
    const tabs = [rect(0, 0, 80, 20), rect(80, 0, 80, 20), rect(160, 0, 80, 20)];
    expect(tabInsertIndex(tabs, 'x', { x: 10, y: 5 })).toBe(0);
    expect(tabInsertIndex(tabs, 'x', { x: 41, y: 5 })).toBe(1);
    expect(tabInsertIndex(tabs, 'x', { x: 130, y: 5 })).toBe(2);
    expect(tabInsertIndex(tabs, 'x', { x: 700, y: 5 })).toBe(3);
    expect(tabInsertIndex([], 'x', { x: 700, y: 5 })).toBe(0);
  });

  it('runs along the other axis for a header on the side', () => {
    const tabs = [rect(0, 0, 20, 80), rect(0, 80, 20, 80)];
    expect(tabInsertIndex(tabs, 'y', { x: 5, y: 100 })).toBe(1);
    expect(tabInsertIndex(tabs, 'y', { x: 5, y: 130 })).toBe(2);
  });

  it('targets a tab position over a header, with a marker at the insertion edge', () => {
    const target = findDropTarget(geometry, { x: 500, y: 14 });
    expect(target?.place).toEqual({ kind: 'tab', stackId: 'right', index: 1 });
    expect(target?.highlight).toEqual(rect(450, 0, 60, 20));

    const end = findDropTarget(geometry, { x: 780, y: 14 });
    expect(end?.place).toEqual({ kind: 'tab', stackId: 'right', index: 2 });
    expect(end?.highlight.left).toBe(530);

    // At the start of the strip the marker stays inside the header instead of hanging off it.
    const first = findDropTarget(geometry, { x: 405, y: 14 });
    expect(first?.place).toEqual({ kind: 'tab', stackId: 'right', index: 0 });
    expect(first?.highlight).toEqual(rect(400, 0, 60, 20));
  });

  it('targets a side of the stack under the pointer over a body', () => {
    const target = findDropTarget(geometry, { x: 720, y: 300 });
    expect(target?.place).toEqual({ kind: 'side', targetId: 'right', side: 'right' });
    expect(target?.highlight).toEqual(rect(600, 20, 200, 580));

    expect(findDropTarget(geometry, { x: 200, y: 500 })?.place).toEqual({
      kind: 'side',
      targetId: 'left',
      side: 'bottom',
    });
  });

  it('targets the root along the outer edges of the layout', () => {
    const target = findDropTarget(geometry, { x: 3, y: 300 });
    expect(target?.place).toEqual({ kind: 'side', targetId: 'row', side: 'left' });
    expect(target?.highlight).toEqual(rect(0, 0, 400, 600));
    expect(findDropTarget(geometry, { x: 400, y: 597 })?.place).toEqual({
      kind: 'side',
      targetId: 'row',
      side: 'bottom',
    });
    // A header along the top edge wins over the edge strip, so its tabs stay reachable.
    expect(findDropTarget(geometry, { x: 400, y: 3 })?.place).toMatchObject({ kind: 'tab' });
  });

  it('has no root edges when the root is a single stack', () => {
    const single: LayoutGeometry = {
      bounds: rect(0, 0, 400, 600),
      root: { id: 'left', rect: rect(0, 0, 400, 600), isStack: true },
      stacks: [stack('left', 0)],
    };
    expect(findDropTarget(single, { x: 3, y: 300 })?.place).toEqual({
      kind: 'side',
      targetId: 'left',
      side: 'left',
    });
    expect(findDropTarget(single, { x: 3, y: 3 })?.place).toMatchObject({ kind: 'tab' });
  });

  it('fills an empty stack, and an empty layout', () => {
    const emptyStack: LayoutGeometry = {
      ...geometry,
      stacks: [{ ...stack('left', 0), tabs: [], panelCount: 0 }, stack('right', 400)],
    };
    expect(findDropTarget(emptyStack, { x: 200, y: 300 })).toEqual({
      place: { kind: 'tab', stackId: 'left', index: 0 },
      highlight: rect(0, 20, 400, 580),
    });

    const empty: LayoutGeometry = { bounds: rect(0, 0, 800, 600), root: null, stacks: [] };
    expect(findDropTarget(empty, { x: 10, y: 10 })?.place).toEqual({ kind: 'empty' });
    expect(findDropTarget(empty, { x: 900, y: 10 })).toBeNull();
  });

  it('adds a tab from the centre of a body when there are no headers', () => {
    const headless: LayoutGeometry = {
      ...geometry,
      // Without a header the renderer reports no tabs at all; the panel count still says
      // the stack is populated.
      stacks: [{ ...stack('left', 0), header: null, tabs: [], body: rect(0, 0, 400, 600) }],
    };
    expect(findDropTarget(headless, { x: 200, y: 300 })?.place).toEqual({
      kind: 'tab',
      stackId: 'left',
      index: 2,
    });
    expect(findDropTarget(headless, { x: 200, y: 100 })?.place).toMatchObject({ side: 'top' });
    expect(findDropTarget(headless, { x: 20, y: 300 })?.place).toEqual({
      kind: 'side',
      targetId: 'left',
      side: 'left',
    });
  });

  it('returns nothing outside every item', () => {
    expect(findDropTarget(geometry, { x: 900, y: 300 })).toBeNull();
  });
});

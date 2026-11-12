import { describe, expect, it } from 'vite-plus/test';
import { LayoutError, createLayout, normalizeLayout, reduce } from '../../src/index';
import type { LayoutConfig, RowOrColumnNode, StackNode } from '../../src/index';
import { verifyPath } from './helpers';

const twoStacks: LayoutConfig = {
  root: {
    type: 'row',
    id: 'row',
    children: [
      {
        type: 'stack',
        id: 'left',
        children: [
          { type: 'panel', id: 'a', component: 'c' },
          { type: 'panel', id: 'b', component: 'c' },
          { type: 'panel', id: 'c', component: 'c' },
        ],
      },
      { type: 'stack', id: 'right', children: [{ type: 'panel', id: 'd', component: 'c' }] },
    ],
  },
};

const ids = (stack: unknown): string[] => (stack as StackNode).children.map((p) => p.id);

describe('moving items', () => {
  it('reorders a tab within its stack and activates it', () => {
    const layout = createLayout(twoStacks);
    layout.moveItem('a', { parent: 'left', index: 2 });
    expect(ids(layout.getById('left'))).toEqual(['b', 'c', 'a']);
    expect((layout.getById('left') as StackNode).activeId).toBe('a');
  });

  it('does nothing when a tab is dropped where it already is', () => {
    const layout = createLayout(twoStacks);
    const before = layout.getState();
    layout.moveItem('a', { parent: 'left', index: 0 });
    expect(layout.getState()).toBe(before);
  });

  it('moves a tab into another stack at an index', () => {
    const layout = createLayout(twoStacks);
    layout.moveItem('b', { parent: 'right', index: 0 });
    expect(ids(layout.getById('left'))).toEqual(['a', 'c']);
    expect(ids(layout.getById('right'))).toEqual(['b', 'd']);
    expect((layout.getById('right') as StackNode).activeId).toBe('b');
  });

  it('removes the source stack when its last tab moves away, and collapses the row', () => {
    const layout = createLayout(twoStacks);
    layout.moveItem('d', { parent: 'left' });
    expect(layout.getById('right')).toBeUndefined();
    expect(layout.getState().root?.id).toBe('left');
    expect(ids(layout.getState().root)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('docks beside a stack in the direction of its parent by sharing its space', () => {
    const layout = createLayout(twoStacks);
    layout.moveItem('a', { target: 'right', side: 'left' });
    const row = layout.getState().root as RowOrColumnNode;
    expect(row.children.map((child) => child.size)).toEqual([1, 0.5, 0.5]);
    expect(ids(row.children[1])).toEqual(['a']);
    expect(row.children[2]?.id).toBe('right');
  });

  it('docks across the direction of the parent by wrapping the target', () => {
    const layout = createLayout(twoStacks);
    layout.moveItem('a', { target: 'right', side: 'bottom' });
    const column = verifyPath('row.1.column', layout.getState()) as RowOrColumnNode;
    expect(column.size).toBe(1);
    expect(column.children[0]?.id).toBe('right');
    expect(ids(column.children[1])).toEqual(['a']);
  });

  it('docks against the root to split the whole layout', () => {
    const layout = createLayout(twoStacks);
    layout.moveItem('a', { target: 'row', side: 'top' });
    verifyPath('column.0.stack.0.panel', layout.getState());
    expect(verifyPath('column.1.row', layout.getState()).id).toBe('row');
  });

  it('still docks when removing the item collapses its old row', () => {
    const layout = createLayout(twoStacks);
    layout.moveItem('d', { target: 'left', side: 'top' });
    const column = layout.getState().root as RowOrColumnNode;
    expect(column.type).toBe('column');
    expect(ids(column.children[0])).toEqual(['d']);
    expect(column.children[1]?.id).toBe('left');
    expect(layout.getById('row')).toBeUndefined();
  });

  it('treats docking the only tab of a stack against that stack as a no-op', () => {
    const layout = createLayout(twoStacks);
    const before = layout.getState();
    layout.moveItem('d', { target: 'right', side: 'left' });
    layout.moveItem('d', { target: 'd', side: 'bottom' });
    expect(layout.getState()).toBe(before);
  });

  it('splits a stack when one of several tabs is docked against it', () => {
    const layout = createLayout(twoStacks);
    layout.moveItem('a', { target: 'left', side: 'right' });
    const row = layout.getState().root as RowOrColumnNode;
    expect(row.children).toHaveLength(3);
    expect(ids(row.children[0])).toEqual(['b', 'c']);
    expect(ids(row.children[1])).toEqual(['a']);
  });

  it('moves a whole stack, merging its tabs into another stack', () => {
    const layout = createLayout(twoStacks);
    layout.moveItem('left', { parent: 'right', index: 1 });
    expect(layout.getState().root?.id).toBe('right');
    expect(ids(layout.getById('right'))).toEqual(['d', 'a', 'b', 'c']);
  });

  it('refuses to move an item into itself or to move the root', () => {
    const layout = createLayout(twoStacks);
    expect(() => layout.moveItem('row', { parent: 'left' })).toThrow(LayoutError);
    expect(() => layout.moveItem('a', { parent: 'ghost' })).toThrow(LayoutError);
  });
});

describe('tidying after removals', () => {
  it('activates the left neighbour when the active tab is removed', () => {
    const layout = createLayout(twoStacks);
    layout.setActive('c');
    layout.removeItem('c');
    expect((layout.getById('left') as StackNode).activeId).toBe('b');
    layout.setActive('a');
    layout.removeItem('a');
    expect((layout.getById('left') as StackNode).activeId).toBe('b');
  });

  it('splices a row into its parent row instead of nesting them', () => {
    const layout = createLayout({
      root: {
        type: 'row',
        children: [
          { type: 'panel', id: 'x', component: 'c', size: 2 },
          {
            type: 'column',
            size: 2,
            children: [
              {
                type: 'row',
                children: [
                  { type: 'panel', id: 'y', component: 'c', size: 1 },
                  { type: 'panel', id: 'z', component: 'c', size: 3 },
                ],
              },
              { type: 'panel', id: 'gone', component: 'c' },
            ],
          },
        ],
      },
    });
    layout.removeItem('gone');
    const row = layout.getState().root as RowOrColumnNode;
    expect(row.children.map((child) => child.type)).toEqual(['stack', 'stack', 'stack']);
    expect(row.children.map((child) => child.size)).toEqual([2, 0.5, 1.5]);
  });

  it('clears maximize and selection when their item disappears', () => {
    const layout = createLayout({ ...twoStacks, maximizedId: 'right', selectedId: 'right' });
    layout.removeItem('d');
    expect(layout.getState()).toMatchObject({ maximizedId: null, selectedId: null });
  });

  it('honours closable: closeItem is a no-op, removeItem is not', () => {
    const layout = createLayout({
      root: {
        type: 'stack',
        id: 's',
        children: [
          { type: 'panel', id: 'fixed', component: 'c', closable: false },
          { type: 'panel', id: 'free', component: 'c' },
        ],
      },
    });
    layout.closeItem('fixed');
    expect(layout.getById('fixed')).toBeDefined();
    layout.closeItem('s');
    expect(layout.getById('s')).toBeDefined();
    layout.closeItem('free');
    expect(layout.getById('free')).toBeUndefined();
    layout.removeItem('fixed');
    expect(layout.getState().root).toBeNull();
  });
});

describe('closing several items at once', () => {
  it('closes them as one change and tidies once', () => {
    const layout = createLayout(twoStacks);
    const actions: string[] = [];
    layout.subscribe((_state, action) => actions.push(action.type));

    layout.closeItems(['a', 'b', 'c']);

    expect(actions).toEqual(['closeItems']);
    expect(layout.getState().root?.id).toBe('right');
  });

  it('skips items that are not closable and keeps their stack', () => {
    const layout = createLayout(twoStacks);
    layout.updateItem('b', { closable: false });
    layout.closeItems(['a', 'b', 'c']);
    expect(ids(layout.getById('left'))).toEqual(['b']);
  });

  it('changes nothing when there is nothing to close, and rejects unknown ids', () => {
    const layout = createLayout(twoStacks);
    layout.updateItem('d', { closable: false });
    const before = layout.getState();
    layout.closeItems(['d']);
    layout.closeItems([]);
    expect(layout.getState()).toBe(before);
    expect(() => layout.closeItems(['a', 'ghost'])).toThrow(LayoutError);
    expect(layout.getState()).toBe(before);
  });
});

describe('other actions', () => {
  it('resizes the children of a row and validates the sizes', () => {
    const layout = createLayout(twoStacks);
    layout.resize('row', [3, 1]);
    expect((layout.getState().root as RowOrColumnNode).children.map((c) => c.size)).toEqual([3, 1]);
    expect(() => layout.resize('row', [1])).toThrow(LayoutError);
    expect(() => layout.resize('row', [1, 0])).toThrow(LayoutError);
    expect(() => layout.resize('left', [1, 1, 1])).toThrow(LayoutError);
  });

  it('maximizes the stack of a panel and restores it', () => {
    const layout = createLayout(twoStacks);
    layout.toggleMaximize('a');
    expect(layout.getState().maximizedId).toBe('left');
    layout.toggleMaximize('left');
    expect(layout.getState().maximizedId).toBeNull();
    layout.maximize('right');
    layout.restore();
    expect(layout.getState().maximizedId).toBeNull();
  });

  it('selects and deselects items', () => {
    const layout = createLayout(twoStacks);
    layout.select('left');
    expect(layout.getState().selectedId).toBe('left');
    layout.select(null);
    expect(layout.getState().selectedId).toBeNull();
    expect(() => layout.select('ghost')).toThrow(LayoutError);
  });

  it('adds to an empty layout, to the root stack, and beside it', () => {
    const layout = createLayout();
    const first = layout.addPanel({ component: 'c' });
    verifyPath('stack.0.panel', layout.getState());
    layout.addPanel({ component: 'c' });
    expect(layout.getState().root?.children).toHaveLength(2);
    layout.addItem({ type: 'stack', children: [{ type: 'panel', component: 'c' }] });
    verifyPath('row.1.stack.0.panel', layout.getState());
    expect(layout.getById(first)?.type).toBe('panel');
  });

  it('patches item flags with updateItem', () => {
    const layout = createLayout(twoStacks);
    layout.updateItem('a', { closable: false });
    layout.updateItem('left', { headerPosition: 'bottom' });
    expect(layout.getById('a')).toMatchObject({ closable: false });
    expect(layout.getById('left')).toMatchObject({ headerPosition: 'bottom' });
  });

  it('serializes with JSON.stringify and loads the result back', () => {
    const layout = createLayout(twoStacks);
    layout.setPanelState('a', { n: 1 });
    layout.setPanelState<{ n: number }>('a', (previous) => ({ n: previous.n + 1 }));
    const copy = createLayout(JSON.parse(JSON.stringify(layout)));
    expect(copy.getState()).toEqual(layout.getState());
    expect(copy.getById('a')).toMatchObject({ state: { n: 2 } });
  });
});

describe('structural sharing', () => {
  it('keeps the identity of every item an action does not touch', () => {
    const before = normalizeLayout(twoStacks);
    const after = reduce(before, { type: 'setTitle', id: 'a', title: 'A' });
    const [leftBefore, rightBefore] = before.root!.children as StackNode[];
    const [leftAfter, rightAfter] = after.root!.children as StackNode[];

    expect(after).not.toBe(before);
    expect(leftAfter).not.toBe(leftBefore);
    expect(leftAfter!.children[0]).not.toBe(leftBefore!.children[0]);
    expect(leftAfter!.children[1]).toBe(leftBefore!.children[1]);
    expect(rightAfter).toBe(rightBefore);
  });

  it('never mutates the state it is given', () => {
    const before = normalizeLayout(twoStacks);
    const snapshot = JSON.stringify(before);
    reduce(before, { type: 'moveItem', id: 'a', to: { target: 'right', side: 'bottom' } });
    reduce(before, { type: 'removeItem', id: 'd' });
    reduce(before, {
      type: 'addItem',
      item: { type: 'panel', component: 'c' },
      to: { parent: 'row' },
    });
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

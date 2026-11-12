import { describe, expect, it } from 'vite-plus/test';
import { LayoutError, createLayout, normalizeLayout } from '../../src/index';
import { verifyPath } from './helpers';

// Ported from test/create-from-config-tests.js
describe('creates the right structure based on the provided config', () => {
  it('creates the right primitive types: panel only', () => {
    const layout = createLayout({ root: { type: 'panel', component: 'testComponent' } });
    const { root } = layout.getState();
    expect(root?.type).toBe('stack');
    expect(root?.children).toHaveLength(1);
    verifyPath('stack.0.panel', layout.getState());
  });

  it('creates the right primitive types: stack and panel', () => {
    const layout = createLayout({
      root: { type: 'stack', children: [{ type: 'panel', component: 'testComponent' }] },
    });
    expect(layout.getState().root?.children).toHaveLength(1);
    verifyPath('stack.0.panel', layout.getState());
  });

  it('creates the right primitive types: row and two panels', () => {
    const layout = createLayout({
      root: {
        type: 'row',
        children: [
          { type: 'panel', component: 'testComponent' },
          { type: 'panel', component: 'testComponent' },
        ],
      },
    });
    const state = layout.getState();
    expect(state.root?.type).toBe('row');
    expect(state.root?.children).toHaveLength(2);
    verifyPath('row.0.stack.0.panel', state);
    verifyPath('row.1.stack.0.panel', state);
  });

  // The legacy case nested a column inside a stack. Stacks now hold panels only, so the
  // same config is rejected, and the supported nesting is column -> stack -> panel.
  it('creates the right primitive types: column -> stack -> panel, and rejects stack -> column', () => {
    expect(() =>
      normalizeLayout({
        root: {
          type: 'stack',
          // @ts-expect-error a stack cannot contain a column
          children: [{ type: 'column', children: [{ type: 'panel', component: 'testComponent' }] }],
        },
      }),
    ).toThrow(LayoutError);

    const state = normalizeLayout({
      root: { type: 'column', children: [{ type: 'panel', component: 'testComponent' }] },
    });
    expect(state.root?.children).toHaveLength(1);
    verifyPath('column.0.stack.0.panel', state);
  });
});

describe('normalization', () => {
  it('fills in ids, titles, sizes and the active tab', () => {
    const state = normalizeLayout({
      root: {
        type: 'row',
        children: [
          { type: 'panel', component: 'a', size: 3 },
          { type: 'stack', children: [{ type: 'panel', component: 'b', id: 'b', title: 'Bee' }] },
        ],
      },
    });
    const first = verifyPath('row.0.stack', state);
    const second = verifyPath('row.1.stack', state);
    expect(first).toMatchObject({ size: 3, activeId: 'panel-1' });
    expect(second).toMatchObject({ size: 3, activeId: 'b' });
    expect(verifyPath('row.0.stack.0.panel', state)).toMatchObject({ id: 'panel-1', title: 'a' });
    expect(verifyPath('row.1.stack.0.panel', state)).toMatchObject({ title: 'Bee' });
  });

  it('round-trips: a normalized layout is a valid config that normalizes to itself', () => {
    const state = normalizeLayout({
      root: {
        type: 'column',
        children: [
          { type: 'panel', component: 'a' },
          { type: 'row', children: [{ type: 'panel', component: 'b', state: { n: 1 } }] },
        ],
      },
    });
    expect(normalizeLayout(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it('never generates an id that an explicit id uses later in the tree', () => {
    const state = normalizeLayout({
      root: {
        type: 'row',
        children: [
          { type: 'panel', component: 'a' },
          { type: 'panel', component: 'b', id: 'panel-1' },
        ],
      },
    });
    const ids = createLayout(state)
      .filter(() => true)
      .map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each([
    ['an unknown type', { root: { type: 'grid' } }],
    ['a duplicate id', { root: { type: 'row', id: 'x', children: [{ type: 'stack', id: 'x' }] } }],
    ['a panel without a component', { root: { type: 'panel' } }],
    ['a bad activeId', { root: { type: 'stack', activeId: 'nope', children: [] } }],
    ['a non-positive size', { root: { type: 'stack', size: 0 } }],
    ['a maximizedId that is not a stack', { root: { type: 'row', id: 'r' }, maximizedId: 'r' }],
    ['an unknown selectedId', { root: { type: 'row' }, selectedId: 'ghost' }],
  ])('rejects %s', (_name, config) => {
    expect(() => normalizeLayout(config as never)).toThrow(LayoutError);
  });

  it('accepts an empty layout', () => {
    expect(normalizeLayout()).toEqual({ root: null, maximizedId: null, selectedId: null });
  });
});

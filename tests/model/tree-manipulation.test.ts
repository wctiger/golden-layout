import { describe, expect, it } from 'vite-plus/test';
import { LayoutError, createLayout } from '../../src/index';
import type { StackNode } from '../../src/index';
import { verifyPath } from './helpers';

// Ported from test/tree-manipulation-tests.js
describe('the layout can be manipulated at runtime', () => {
  const layout = createLayout({ root: { type: 'panel', component: 'testComponent' } });
  const rootId = (): string => layout.getState().root!.id;

  it('has the right initial structure', () => {
    verifyPath('stack.0.panel', layout.getState());
  });

  it('adds a child to the stack', () => {
    layout.addPanel({ component: 'testComponent' }, { parent: rootId() });

    expect(layout.getState().root?.children).toHaveLength(2);
    verifyPath('stack.1.panel', layout.getState());
  });

  // The legacy case replaced a tab with a row, nesting a layout inside a stack. Stacks now
  // hold panels only, so that is rejected and the stack itself is what gets replaced.
  it('replaces a stack with a row of panels', () => {
    const secondPanel = verifyPath('stack.1.panel', layout.getState());
    expect(() => layout.replaceItem(secondPanel.id, { type: 'row', children: [] })).toThrow(
      LayoutError,
    );

    layout.replaceItem(rootId(), {
      type: 'row',
      children: [
        { type: 'panel', component: 'testComponent' },
        { type: 'panel', component: 'testComponent' },
      ],
    });

    verifyPath('row.0.stack.0.panel', layout.getState());
    verifyPath('row.1.stack.0.panel', layout.getState());
  });

  it('has set up parents correctly', () => {
    const panel = verifyPath('row.1.stack.0.panel', layout.getState());
    const stack = layout.getParent(panel.id);
    expect(stack?.type).toBe('stack');
    const row = layout.getParent(stack!.id);
    expect(row?.type).toBe('row');
    expect(layout.getParent(row!.id)).toBeNull();
    expect(layout.getState().root).toBe(row);
  });

  it('destroys a panel and its parent', () => {
    const stack = verifyPath('row.1.stack', layout.getState()) as StackNode;
    expect(stack.children).toHaveLength(1);

    layout.removeItem(stack.children[0]!.id);

    // The emptied stack is gone, and the row, left with one child, gives way to it.
    expect(layout.getById(stack.id)).toBeUndefined();
    verifyPath('stack.0.panel', layout.getState());
  });

  it('empties the layout when the last panel is removed', () => {
    const panel = verifyPath('stack.0.panel', layout.getState());
    layout.removeItem(panel.id);
    expect(layout.getState().root).toBeNull();
  });
});

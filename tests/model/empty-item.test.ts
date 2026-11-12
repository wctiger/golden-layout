import { describe, expect, it } from 'vite-plus/test';
import { createLayout } from '../../src/index';
import type { StackNode } from '../../src/index';
import { verifyPath } from './helpers';

// Ported from test/empty-item-tests.js
describe('the layout can handle empty stacks', () => {
  const layout = createLayout({
    root: {
      type: 'row',
      children: [
        { type: 'panel', component: 'testComponent', state: { text: 'Component 1' } },
        { type: 'panel', component: 'testComponent', state: { text: 'Component 2' } },
        { type: 'stack', id: 'empty', closable: false, children: [] },
      ],
    },
  });

  it('creates an initial layout with an empty stack', () => {
    const stack = verifyPath('row.2.stack', layout.getState()) as StackNode;
    expect(stack.children).toHaveLength(0);
    expect(stack.activeId).toBeNull();
  });

  it('can manipulate the layout tree with an empty item present', () => {
    const row = layout.getState().root!;
    expect(row.type).toBe('row');

    layout.addPanel({ component: 'testComponent' }, { parent: row.id });

    expect(layout.getState().root?.children).toHaveLength(4);
    verifyPath('row.3.stack.0.panel', layout.getState());
  });

  it('can add children to the empty stack', () => {
    const id = layout.addPanel({ component: 'testComponent' }, { parent: 'empty' });

    const stack = verifyPath('row.2.stack', layout.getState()) as StackNode;
    expect(stack.children).toHaveLength(1);
    expect(stack.activeId).toBe(id);
  });

  it('keeps a non-closable stack when it becomes empty again', () => {
    const stack = layout.getById('empty') as StackNode;
    layout.removeItem(stack.children[0]!.id);
    expect((layout.getById('empty') as StackNode).children).toHaveLength(0);
  });
});

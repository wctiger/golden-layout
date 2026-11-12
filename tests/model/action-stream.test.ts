import { describe, expect, it, vi } from 'vite-plus/test';
import { createLayout } from '../../src/index';
import type { Action } from '../../src/index';
import { verifyPath } from './helpers';

// Ported from test/event-bubble-tests.js. Items no longer emit events that bubble through
// their ancestors (and so there is nothing to stop propagating): a change made anywhere in
// the tree is reported once, at the layout, with the action naming the item it came from.
describe('changes anywhere in the tree are reported at the layout', () => {
  const layout = createLayout({
    root: {
      type: 'row',
      children: [
        { type: 'column', children: [{ type: 'panel', id: 'deep', component: 'testComponent' }] },
        { type: 'row' },
      ],
    },
  });

  it('creates a layout', () => {
    verifyPath('row.0.column.0.stack.0.panel', layout.getState());
    verifyPath('row.1.row', layout.getState());
  });

  it('reports a change to a deeply nested item, naming its origin', () => {
    const actions: Action[] = [];
    const unsubscribe = layout.subscribe((_state, action) => actions.push(action));

    layout.setTitle('deep', 'renamed');

    expect(actions).toEqual([{ type: 'setTitle', id: 'deep', title: 'renamed' }]);
    expect(layout.getById((actions[0] as { id: string }).id)?.type).toBe('panel');
    unsubscribe();
  });

  it('calls every listener exactly once per change, in subscription order', () => {
    const calls: string[] = [];
    const offA = layout.subscribe(() => calls.push('a'));
    const offB = layout.subscribe(() => calls.push('b'));

    layout.setTitle('deep', 'again');

    expect(calls).toEqual(['a', 'b']);
    offA();
    offB();
  });

  it('reports nothing when an action changes nothing', () => {
    const listener = vi.fn();
    const unsubscribe = layout.subscribe(listener);
    const before = layout.getState();

    layout.setTitle('deep', 'again');
    layout.setActive('deep');
    layout.restore();

    expect(listener).not.toHaveBeenCalled();
    expect(layout.getState()).toBe(before);
    unsubscribe();
  });
});

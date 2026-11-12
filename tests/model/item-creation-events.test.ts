import { describe, expect, it } from 'vite-plus/test';
import { EMPTY_LAYOUT, createLayout, diffLayout } from '../../src/index';
import type { Action, LayoutNode, LayoutState } from '../../src/index';

// Ported from test/item-creation-events-tests.js. The itemCreated / stackCreated / ...
// events are replaced by the action stream: every change reports its action, and
// diffLayout says which items that action created or removed.
describe('reports the items an action creates', () => {
  const layout = createLayout();
  const created: LayoutNode[] = [];
  // Cases share state, so calls are recorded by hand rather than with a mock that resets.
  const calls: [LayoutState, Action, LayoutState][] = [];
  const listener = (state: LayoutState, action: Action, previous: LayoutState): void => {
    calls.push([state, action, previous]);
    created.push(...diffLayout(previous, state).created);
  };
  const ofType = (type: string): LayoutNode[] => created.filter((node) => node.type === type);

  it('starts with an empty layout and nothing reported', () => {
    expect(layout.getState()).toEqual(EMPTY_LAYOUT);
    expect(calls).toHaveLength(0);
  });

  it('registers a listener', () => {
    layout.subscribe(listener);
    expect(calls).toHaveLength(0);

    layout.setLayout({
      root: {
        type: 'row',
        children: [
          { type: 'column', children: [{ type: 'panel', component: 'testComponent' }] },
          { type: 'stack' },
        ],
      },
    });
  });

  it('has called the listener once, with every created item', () => {
    expect(calls).toHaveLength(1);
    expect(created).toHaveLength(5);
    expect(ofType('stack')).toHaveLength(2);
    expect(ofType('row')).toHaveLength(1);
    expect(ofType('column')).toHaveLength(1);
    expect(ofType('panel')).toHaveLength(1);
  });

  it('provided the right arguments', () => {
    const [state, action, previous] = calls[0]!;
    expect(action.type).toBe('setLayout');
    expect(previous).toEqual(EMPTY_LAYOUT);
    expect(state).toBe(layout.getState());
  });

  it('reports the stack created implicitly around a panel added to a row', () => {
    created.length = 0;
    layout.addPanel({ component: 'testComponent' }, { parent: layout.getState().root!.id });

    expect(calls).toHaveLength(2);
    expect(calls[1]![1].type).toBe('addItem');
    expect(created.map((node) => node.type).sort()).toEqual(['panel', 'stack']);
  });

  it('reports removed items, and stops reporting after unsubscribing', () => {
    const removed: LayoutNode[] = [];
    const unsubscribe = layout.subscribe((state, _action, previous) => {
      removed.push(...diffLayout(previous, state).removed);
    });
    const panel = layout.getByType('panel')[1]!;

    layout.removeItem(panel.id);
    expect(removed.map((node) => node.type).sort()).toEqual(['panel', 'stack']);

    unsubscribe();
    layout.removeItem(layout.getByType('panel')[0]!.id);
    expect(removed).toHaveLength(2);
  });
});

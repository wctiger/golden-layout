import type { ReactNode } from 'react';
import { describe, expect, it } from 'vite-plus/test';
import { usePanelState } from '../../src/index';
import type { Action, PanelNode } from '../../src/index';
import { mountLayout, panelElement } from './helpers';

// Ported from test/component-state-save-tests.js
describe("sets and retrieves a component's state", () => {
  const renders: Record<string, number> = {};
  let setTestValue: (value: string) => void = () => {};

  function Stateful({ name }: { name: string }): ReactNode {
    const [state, setState] = usePanelState({ testValue: 'default' });
    renders[name] = (renders[name] ?? 0) + 1;
    if (name === 'first') setTestValue = (testValue) => setState({ testValue });
    return <span className="value">{state.testValue}</span>;
  }

  const config = {
    root: {
      type: 'row' as const,
      children: [
        {
          type: 'panel' as const,
          id: 'first',
          component: 'stateful',
          props: { name: 'first' },
          state: { testValue: 'initial' },
        },
        { type: 'panel' as const, id: 'second', component: 'stateful', props: { name: 'second' } },
      ],
    },
  };

  it('hands the saved state to the component, and the default where none is saved', async () => {
    const { root } = await mountLayout(config, { components: { stateful: Stateful } });
    expect(panelElement(root, 'first').textContent).toBe('initial');
    expect(panelElement(root, 'second').textContent).toBe('default');
  });

  it('returns the initial state when the layout is saved', async () => {
    const { layout } = await mountLayout(config, { components: { stateful: Stateful } });
    const saved = JSON.parse(JSON.stringify(layout));
    expect(saved.root.children[0].children[0].state.testValue).toBe('initial');
    // A default that was never changed is not written into the layout.
    expect(saved.root.children[1].children[0].state).toBeUndefined();
  });

  it('reports one change when a component updates its state', async () => {
    const actions: Action[] = [];
    const { root } = await mountLayout(config, {
      components: { stateful: Stateful },
      onChange: (_state, action) => actions.push(action),
    });

    setTestValue('updated');

    await expect.poll(() => panelElement(root, 'first').textContent).toBe('updated');
    expect(actions).toEqual([
      { type: 'setPanelState', id: 'first', state: { testValue: 'updated' } },
    ]);
  });

  it('returns the updated state', async () => {
    const { layout, root } = await mountLayout(config, { components: { stateful: Stateful } });
    setTestValue('updated');
    await expect.poll(() => panelElement(root, 'first').textContent).toBe('updated');
    expect((layout.getById('first') as PanelNode).state).toEqual({ testValue: 'updated' });
    expect(JSON.parse(JSON.stringify(layout)).root.children[0].children[0].state.testValue).toBe(
      'updated',
    );
  });

  it('re-renders only the panel whose state changed', async () => {
    const { root } = await mountLayout(config, { components: { stateful: Stateful } });
    const before = { ...renders };

    setTestValue('again');

    await expect.poll(() => panelElement(root, 'first').textContent).toBe('again');
    expect(renders.first).toBe(before.first! + 1);
    expect(renders.second).toBe(before.second);
  });

  it('unmounts every panel when the layout is destroyed', async () => {
    const { layout, unmount } = await mountLayout(config, { components: { stateful: Stateful } });
    await unmount();
    expect(document.querySelectorAll('.value')).toHaveLength(0);
    // The state object outlives the view and can be mounted again.
    expect(layout.getByType('panel')).toHaveLength(2);
  });
});

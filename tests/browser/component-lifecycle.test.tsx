import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vite-plus/test';
import { usePanelSize, usePanelVisible } from '../../src/index';
import { isShown, mountLayout, panelElement } from './helpers';

// Ported from test/component-creation-events-tests.js. The container's `show` / `shown`
// events are now the value of usePanelVisible(), and `resize` the value of usePanelSize().
describe('tells components when they are shown', () => {
  const shown: Record<string, number> = {};
  const hidden: Record<string, number> = {};
  const sizes: Record<string, { width: number; height: number }> = {};

  function Recorder({ name }: { name: string }): ReactNode {
    const visible = usePanelVisible();
    const size = usePanelSize();
    sizes[name] = size;
    useEffect(() => {
      const log = visible ? shown : hidden;
      log[name] = (log[name] ?? 0) + 1;
    }, [visible, name]);
    return <div>{name}</div>;
  }

  const config = {
    root: {
      type: 'stack' as const,
      id: 'stack',
      children: [
        { type: 'panel' as const, id: 'one', component: 'recorder', props: { name: 'one' } },
        { type: 'panel' as const, id: 'two', component: 'recorder', props: { name: 'two' } },
      ],
    },
  };

  it('reports the active panel as shown exactly once on creation', async () => {
    const { root } = await mountLayout(config, { components: { recorder: Recorder } });
    expect(shown.one).toBe(1);
    expect(shown.two).toBeUndefined();
    expect(hidden.two).toBe(1);
    expect(isShown(panelElement(root, 'one'))).toBe(true);
    expect(isShown(panelElement(root, 'two'))).toBe(false);
  });

  it('keeps inactive tabs mounted, and reports the switch when another tab is activated', async () => {
    const { root, layout } = await mountLayout(config, { components: { recorder: Recorder } });
    const before = { shownTwo: shown.two ?? 0, hiddenOne: hidden.one ?? 0 };
    expect(panelElement(root, 'two').textContent).toBe('two');

    layout.setActive('two');

    await expect.poll(() => isShown(panelElement(root, 'two'))).toBe(true);
    expect(isShown(panelElement(root, 'one'))).toBe(false);
    expect(shown.two).toBe(before.shownTwo + 1);
    expect(hidden.one).toBe(before.hiddenOne + 1);
  });

  it('reports the panel size and follows the container', async () => {
    const { root, container } = await mountLayout(config, { components: { recorder: Recorder } });
    await expect.poll(() => sizes.one).toEqual({ width: 800, height: 574 });

    (container.firstElementChild as HTMLElement).style.width = '500px';

    await expect.poll(() => sizes.one).toEqual({ width: 500, height: 574 });
    expect(panelElement(root, 'one').getBoundingClientRect().width).toBe(500);
  });
});

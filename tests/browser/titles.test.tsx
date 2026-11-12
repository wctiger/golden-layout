import type { ReactNode } from 'react';
import { describe, expect, it } from 'vite-plus/test';
import { usePanel } from '../../src/index';
import type { PanelApi, PanelNode } from '../../src/index';
import { mountLayout } from './helpers';

// Ported from test/title-tests.js
describe('titles', () => {
  const apis: Record<string, PanelApi> = {};
  function Titled(): ReactNode {
    const panel = usePanel();
    apis[panel.id] = panel;
    return null;
  }

  const config = {
    root: {
      type: 'stack' as const,
      children: [
        { type: 'panel' as const, id: 'hasTitle', component: 'titled', title: 'First Title' },
        { type: 'panel' as const, id: 'noTitle', component: 'titled' },
      ],
    },
  };
  const mount = () => mountLayout(config, { components: { titled: Titled } });
  const titles = (root: HTMLElement): (string | null)[] =>
    [...root.querySelectorAll('.gl-tab .gl-title')].map((element) => element.textContent);

  it('creates a layout', async () => {
    const { root } = await mount();
    expect(root.querySelectorAll('.gl-tab')).toHaveLength(2);
  });

  it('applies titles from configuration, defaulting to the component name', async () => {
    const { layout } = await mount();
    expect((layout.getById('hasTitle') as PanelNode).title).toBe('First Title');
    expect((layout.getById('noTitle') as PanelNode).title).toBe('titled');
  });

  it('displays the title on the tab', async () => {
    const { root } = await mount();
    expect(titles(root)).toEqual(['First Title', 'titled']);
  });

  it('updates the title when calling setTitle on the layout', async () => {
    const { root, layout } = await mount();
    layout.setTitle('hasTitle', 'Second Title');
    await expect.poll(() => titles(root)[0]).toBe('Second Title');
  });

  it('updates the title when calling setTitle from inside the panel', async () => {
    const { root } = await mount();
    apis.hasTitle!.setTitle('Third Title');
    await expect.poll(() => titles(root)[0]).toBe('Third Title');
  });

  it('persists the title', async () => {
    const { layout } = await mount();
    apis.hasTitle!.setTitle('Third Title');
    expect(JSON.parse(JSON.stringify(layout)).root.children[0].title).toBe('Third Title');
  });

  // The legacy tab rendered a title as HTML, after filtering it. Titles are plain text now:
  // markup is shown literally and never becomes elements.
  it('shows markup in a title as text', async () => {
    const { root, layout } = await mount();
    layout.setTitle('hasTitle', 'title <b>with</b> html');
    await expect.poll(() => titles(root)[0]).toBe('title <b>with</b> html');
    const tab = root.querySelector('.gl-tab')!;
    expect(tab.querySelector('b')).toBeNull();
    expect(tab.getAttribute('title')).toBe('title <b>with</b> html');
  });

  it('removes the titles with the layout', async () => {
    const { container, unmount } = await mount();
    await unmount();
    expect(container.querySelector('.gl-title')).toBeNull();
  });
});

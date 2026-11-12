import { describe, expect, it } from 'vite-plus/test';
import { userEvent } from 'vite-plus/test/browser/context';
import type { PanelNode, StackNode } from '../../src/index';
import { isShown, mountLayout, panelElement } from './helpers';

const config = {
  root: {
    type: 'stack' as const,
    id: 'stack',
    children: [
      { type: 'panel' as const, id: 'one', component: 'testComponent' },
      { type: 'panel' as const, id: 'two', component: 'testComponent', reorderable: false },
      { type: 'panel' as const, id: 'three', component: 'testComponent', closable: false },
    ],
  },
};

const tab = (root: HTMLElement, id: string): HTMLElement =>
  root.querySelector<HTMLElement>(`.gl-tab[data-panel-id="${id}"]`)!;

// Ported from test/tab-tests.js
describe('tabs apply their configuration', () => {
  it('creates a layout with one tab per panel', async () => {
    const { root } = await mountLayout(config);
    expect(root.querySelectorAll('.gl-header')).toHaveLength(1);
    expect(root.querySelectorAll('.gl-tab')).toHaveLength(3);
  });

  it('makes the first tab draggable and not the one with reorderable: false', async () => {
    const { root, layout } = await mountLayout(config);

    expect((layout.getById('one') as PanelNode).reorderable).toBeUndefined();
    expect(tab(root, 'one').dataset.reorderable).toBe('true');

    expect((layout.getById('two') as PanelNode).reorderable).toBe(false);
    expect(tab(root, 'two').dataset.reorderable).toBe('false');
  });

  it('makes no tab draggable when reordering is disabled for the layout', async () => {
    const { root } = await mountLayout(config, { settings: { reorderEnabled: false } });
    expect(tab(root, 'one').dataset.reorderable).toBe('false');
  });

  it('removes the tabs with the layout', async () => {
    const { container, unmount } = await mountLayout(config);
    await unmount();
    expect(container.querySelector('.gl-tab')).toBeNull();
  });
});

describe('tab interaction', () => {
  it('activates a tab on press and shows its panel', async () => {
    const { root, layout } = await mountLayout(config);
    expect(tab(root, 'one').classList.contains('gl-active')).toBe(true);

    await userEvent.click(tab(root, 'two'));

    expect((layout.getById('stack') as StackNode).activeId).toBe('two');
    await expect.poll(() => tab(root, 'two').classList.contains('gl-active')).toBe(true);
    expect(tab(root, 'two').getAttribute('aria-selected')).toBe('true');
    expect(isShown(panelElement(root, 'two'))).toBe(true);
    expect(isShown(panelElement(root, 'one'))).toBe(false);
  });

  it('closes a panel from its tab, and offers no close button when closable is false', async () => {
    const { root, layout } = await mountLayout(config);
    expect(tab(root, 'three').querySelector('.gl-tab-close')).toBeNull();

    await userEvent.click(tab(root, 'one').querySelector('.gl-tab-close')!);

    expect(layout.getById('one')).toBeUndefined();
    await expect.poll(() => root.querySelectorAll('.gl-tab').length).toBe(2);
    expect(root.querySelector('.gl-panel[data-panel-id="one"]')).toBeNull();
  });

  it('hides the close-stack button while a panel in the stack cannot be closed', async () => {
    const { root, layout } = await mountLayout(config);
    expect(root.querySelector('.gl-control.gl-close')).toBeNull();

    layout.removeItem('three');

    await expect.poll(() => root.querySelector('.gl-control.gl-close')).not.toBeNull();
    await userEvent.click(root.querySelector('.gl-control.gl-close')!);
    expect(layout.getState().root).toBeNull();
    await expect.poll(() => root.querySelector('.gl-stack')).toBeNull();
  });

  it('uses the labels for the controls', async () => {
    const { root } = await mountLayout(config, { labels: { maximize: 'grow' } });
    expect(root.querySelector('.gl-control.gl-maximize')?.getAttribute('title')).toBe(
      'grow testComponent',
    );
    expect(tab(root, 'one').querySelector('.gl-tab-close')?.getAttribute('title')).toBe(
      'close testComponent',
    );
  });
});

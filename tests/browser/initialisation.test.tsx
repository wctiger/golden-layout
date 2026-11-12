import { StrictMode } from 'react';
import { describe, expect, it } from 'vite-plus/test';
import { render } from 'vitest-browser-react';
import { GoldenLayout, createLayout } from '../../src/index';
import type { Layout } from '../../src/index';
import { isShown, mountLayout, panelElement, testComponents, verifyPath } from './helpers';

// Ported from test/initialisation-tests.js
describe('can initialise the layout', () => {
  it('exports the component and the layout factory', () => {
    expect(GoldenLayout).toBeDefined();
    expect(typeof createLayout).toBe('function');
  });

  it('can create a most basic layout', async () => {
    const { layout, container, root } = await mountLayout({
      root: { type: 'panel', id: 'only', component: 'testComponent' },
    });

    expect(container.querySelectorAll('.gl-root')).toHaveLength(1);
    verifyPath('stack.0.panel', layout);
    const panel = panelElement(root, 'only');
    expect(panel.textContent).toBe('that worked');
    expect(isShown(panel)).toBe(true);
    expect(panel.getBoundingClientRect().width).toBe(800);
  });

  it('destroys the layout', async () => {
    const { container, unmount } = await mountLayout({
      root: { type: 'panel', component: 'testComponent' },
    });
    await unmount();
    expect(container.querySelector('.gl-root')).toBeNull();
    expect(document.querySelector('.gl-panel')).toBeNull();
  });

  it('creates its own layout from initialLayout and exposes it through a ref', async () => {
    let handle: Layout | null = null;
    const screen = await render(
      <div style={{ width: 400, height: 300 }}>
        <GoldenLayout
          ref={(value) => {
            handle = value;
          }}
          components={testComponents}
          initialLayout={{ root: { type: 'panel', id: 'p', component: 'testComponent' } }}
        />
      </div>,
    );
    expect(handle).not.toBeNull();
    expect(handle!.getById('p')?.type).toBe('panel');
    expect(screen.container.querySelector('.gl-panel')?.textContent).toBe('that worked');
  });

  it('works under StrictMode', async () => {
    const { root, layout } = await mountLayout(
      {
        root: {
          type: 'row',
          children: [
            { type: 'panel', id: 'a', component: 'testComponent' },
            { type: 'panel', id: 'b', component: 'testComponent' },
          ],
        },
      },
      {},
      (node) => <StrictMode>{node}</StrictMode>,
    );
    expect(isShown(panelElement(root, 'a'))).toBe(true);
    expect(panelElement(root, 'b').getBoundingClientRect().width).toBeGreaterThan(300);

    layout.removeItem('a');
    await expect.poll(() => root.querySelectorAll('.gl-panel').length).toBe(1);
    await expect.poll(() => panelElement(root, 'b').getBoundingClientRect().width).toBe(800);
  });

  it('shows a clear error in the panel when its component is not registered', async () => {
    const errors: [unknown, string][] = [];
    const { root } = await mountLayout(
      {
        root: {
          type: 'row',
          children: [
            { type: 'panel', id: 'bad', component: 'missing' },
            { type: 'panel', id: 'good', component: 'testComponent' },
          ],
        },
      },
      { onPanelError: (error, id) => errors.push([error, id]) },
    );
    expect(panelElement(root, 'bad').textContent).toContain('"missing"');
    expect(panelElement(root, 'bad').textContent).toContain('testComponent');
    expect(panelElement(root, 'good').textContent).toBe('that worked');
    expect(errors).toHaveLength(1);
    expect(errors[0]![1]).toBe('bad');
  });
});

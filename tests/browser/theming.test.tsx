import type { ReactNode } from 'react';
import { describe, expect, it } from 'vite-plus/test';
import { mountLayout, panelElement } from './helpers';
import '../../examples/themes/dark.css';
import '../../examples/themes/light.css';
import '../../examples/themes/soda.css';
import '../../examples/themes/translucent.css';

let renders = 0;
const countRender = (): void => {
  renders++;
};
function Counted(): ReactNode {
  countRender();
  return <div>content</div>;
}

const config = {
  root: {
    type: 'row' as const,
    children: [
      { type: 'panel' as const, id: 'a', component: 'counted' },
      { type: 'panel' as const, id: 'b', component: 'counted' },
    ],
  },
};
const mount = (props = {}) => mountLayout(config, { components: { counted: Counted }, ...props });
const css = (element: Element, property: string): string =>
  getComputedStyle(element).getPropertyValue(property);

describe('theming', () => {
  it('works with the base stylesheet alone, using the neutral defaults', async () => {
    const { root } = await mount();
    expect(css(root, '--gl-header-height').trim()).toBe('26px');
    expect(css(root.querySelector('.gl-stack-content')!, 'background-color')).toBe(
      'rgb(255, 255, 255)',
    );
    expect(root.querySelector('.gl-header')!.getBoundingClientRect().height).toBe(26);
    expect(root.querySelector('.gl-splitter')!.getBoundingClientRect().width).toBe(5);
  });

  it('applies a theme from a class on the layout', async () => {
    const { root } = await mount({ className: 'gl-theme-dark' });
    expect(css(root, 'background-color')).toBe('rgb(0, 0, 0)');
    expect(css(root.querySelector('.gl-stack-content')!, 'background-color')).toBe(
      'rgb(34, 34, 34)',
    );
    expect(css(root.querySelector('.gl-tab.gl-active')!, 'color')).toBe('rgb(221, 221, 221)');
    expect(css(panelElement(root, 'a'), 'color')).toBe('rgb(221, 221, 221)');
  });

  it('applies a theme from a class on an ancestor', async () => {
    const { root, container } = await mount();
    container.classList.add('gl-theme-light');
    expect(css(root.querySelector('.gl-stack-content')!, 'background-color')).toBe(
      'rgb(225, 225, 225)',
    );
    container.classList.remove('gl-theme-light');
  });

  it('switches themes at runtime by swapping a class, with no re-render', async () => {
    const { root } = await mount({ className: 'gl-theme-dark' });
    const before = renders;

    root.classList.replace('gl-theme-dark', 'gl-theme-soda');
    expect(css(root.querySelector('.gl-stack-content')!, 'background-color')).toBe(
      'rgb(39, 40, 34)',
    );
    expect(root.querySelector('.gl-header')!.getBoundingClientRect().height).toBe(28);

    root.classList.replace('gl-theme-soda', 'gl-theme-translucent');
    expect(css(root.querySelector('.gl-splitter')!, 'width')).toBe('8px');
    // The panel follows the wider splitter without React being involved.
    await expect.poll(() => panelElement(root, 'a').getBoundingClientRect().width).toBe(396);
    expect(renders).toBe(before);
  });

  it('takes dimensions from variables set inline', async () => {
    const { root } = await mount({
      style: { '--gl-header-height': '40px', '--gl-splitter-size': '11px' },
    });
    expect(root.querySelector('.gl-header')!.getBoundingClientRect().height).toBe(40);
    expect(root.querySelector('.gl-splitter')!.getBoundingClientRect().width).toBe(11);
    expect(panelElement(root, 'a').getBoundingClientRect().height).toBe(560);
  });
});

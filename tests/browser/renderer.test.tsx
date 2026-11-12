import { useState } from 'react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vite-plus/test';
import { userEvent } from 'vite-plus/test/browser/context';
import type { RowOrColumnNode } from '../../src/index';
import { isShown, mountLayout, panelElement } from './helpers';
import { centerOf, mouseDrag } from './pointer';

const renders: Record<string, number> = {};
const countRender = (name: string): void => {
  renders[name] = (renders[name] ?? 0) + 1;
};

/** Counts its renders and keeps a local counter, to detect re-renders and remounts. */
function Probe({ name }: { name: string }): ReactNode {
  const [clicks, setClicks] = useState(0);
  countRender(name);
  return (
    <button type="button" className="probe" onClick={() => setClicks((n) => n + 1)}>
      {name}:{clicks}
    </button>
  );
}

const probe = (id: string) => ({
  type: 'panel' as const,
  id,
  component: 'probe',
  props: { name: id },
});

const twoByOne = {
  root: {
    type: 'row' as const,
    id: 'row',
    children: [
      { type: 'stack' as const, id: 'left', children: [probe('a'), probe('b')] },
      {
        type: 'column' as const,
        id: 'column',
        children: [
          { type: 'stack' as const, id: 'top', children: [probe('c')] },
          { type: 'stack' as const, id: 'bottom', children: [probe('d')] },
        ],
      },
    ],
  },
};

const mount = (config: Parameters<typeof mountLayout>[0] = twoByOne, props = {}) =>
  mountLayout(config, { components: { probe: Probe }, ...props });
const item = (root: HTMLElement, id: string): HTMLElement =>
  root.querySelector<HTMLElement>(`[data-item-id="${id}"]`)!;
const width = (element: Element): number => element.getBoundingClientRect().width;
const height = (element: Element): number => element.getBoundingClientRect().height;

describe('layout of the frame', () => {
  it('lays out a nested layout by weight and puts each panel over its stack', async () => {
    const { root } = await mount();
    // 800 wide with one 5px splitter; 600 high with one 5px splitter.
    expect(width(item(root, 'left'))).toBeCloseTo(397.5, 1);
    expect(height(item(root, 'top'))).toBeCloseTo(297.5, 1);

    const slot = item(root, 'bottom').querySelector('.gl-stack-content')!.getBoundingClientRect();
    const panel = panelElement(root, 'd').getBoundingClientRect();
    expect(panel.left).toBeCloseTo(slot.left, 1);
    expect(panel.top).toBeCloseTo(slot.top, 1);
    expect(panel.width).toBeCloseTo(slot.width, 1);
    expect(panel.height).toBeCloseTo(slot.height, 1);
    expect(isShown(panelElement(root, 'b'))).toBe(false);
  });

  it('respects configured sizes', async () => {
    const { root } = await mount({
      root: {
        type: 'row',
        children: [
          { ...probe('a'), size: 3 },
          { ...probe('b'), size: 1 },
        ],
      },
    });
    const [first, second] = [...root.querySelectorAll('.gl-stack')];
    expect(width(first!) / width(second!)).toBeCloseTo(3, 1);
  });

  it('follows its container without re-rendering any panel', async () => {
    const { root, container } = await mount();
    const before = { ...renders };

    (container.firstElementChild as HTMLElement).style.width = '600px';
    (container.firstElementChild as HTMLElement).style.height = '400px';

    await expect.poll(() => width(panelElement(root, 'a'))).toBeCloseTo(297.5, 1);
    await expect.poll(() => height(panelElement(root, 'd'))).toBeLessThan(200);
    expect(renders).toEqual(before);
  });

  it('puts the header on the configured side, or leaves it out', async () => {
    const { root, layout, rerender } = await mount();
    const header = (): DOMRect =>
      item(root, 'top').querySelector('.gl-header')!.getBoundingClientRect();
    const slot = (): DOMRect =>
      item(root, 'top').querySelector('.gl-stack-content')!.getBoundingClientRect();
    expect(header().bottom).toBeLessThanOrEqual(slot().top);

    layout.updateItem('top', { headerPosition: 'bottom' });
    await expect.poll(() => header().top >= slot().bottom).toBe(true);

    layout.updateItem('top', { headerPosition: 'left' });
    await expect.poll(() => header().right <= slot().left).toBe(true);
    expect(header().height).toBeGreaterThan(header().width);

    layout.updateItem('top', { headerPosition: 'right' });
    await expect.poll(() => header().left >= slot().right).toBe(true);

    await rerender({ settings: { hasHeaders: false } });
    expect(root.querySelector('.gl-header')).toBeNull();
    await expect.poll(() => height(panelElement(root, 'c'))).toBeCloseTo(297.5, 1);
  });
});

describe('splitters', () => {
  it('moves only a marker while dragging, then resizes once on release', async () => {
    const actions: string[] = [];
    const { root, layout } = await mount(twoByOne, {
      onChange: (_state: unknown, action: { type: string }) => actions.push(action.type),
    });
    const splitter = root.querySelector<HTMLElement>('.gl-row > .gl-splitter')!;
    const before = { ...renders };
    const start = centerOf(splitter);

    await mouseDrag(start, { x: start.x + 100, y: start.y }, { release: false });

    // Mid-drag: nothing has been resized. A marker shows where the edge will land.
    expect(width(item(root, 'left'))).toBeCloseTo(397.5, 0);
    expect(width(panelElement(root, 'a'))).toBeCloseTo(397.5, 0);
    expect(actions).toEqual([]);
    const ghost = root.querySelector('.gl-splitter-ghost')!.getBoundingClientRect();
    expect(ghost.left).toBeCloseTo(splitter.getBoundingClientRect().left + 100, 0);
    expect(ghost.width).toBe(5);
    expect(ghost.height).toBe(600);
    const point = { x: ghost.left + 2, y: ghost.top + 100 };
    expect(document.elementFromPoint(point.x, point.y)?.closest('.gl-panel')).not.toBeNull();
    expect(splitter.classList.contains('gl-dragging')).toBe(true);

    await userEvent.pointer('[/MouseLeft]');

    expect(root.querySelector('.gl-splitter-ghost')).toBeNull();

    expect(actions).toEqual(['resize']);
    const [first, second] = (layout.getState().root as RowOrColumnNode).children;
    expect(first!.size / second!.size).toBeCloseTo(497.5 / 297.5, 1);
    await expect.poll(() => width(item(root, 'left'))).toBeCloseTo(497.5, 0);
    expect(renders).toEqual(before);
  });

  it('resizes along a column', async () => {
    const { root } = await mount();
    const splitter = root.querySelector<HTMLElement>('.gl-column > .gl-splitter')!;
    const start = centerOf(splitter);

    await mouseDrag(start, { x: start.x, y: start.y - 60 });

    await expect.poll(() => height(item(root, 'top'))).toBeCloseTo(237.5, 0);
    expect(height(item(root, 'bottom'))).toBeCloseTo(357.5, 0);
  });

  it('stops at the minimum size of the items on either side', async () => {
    const { root } = await mount();
    const splitter = root.querySelector<HTMLElement>('.gl-row > .gl-splitter')!;
    const start = centerOf(splitter);

    await mouseDrag(start, { x: 2, y: start.y });
    await expect.poll(() => width(item(root, 'left'))).toBeCloseTo(40, 0);

    const again = centerOf(root.querySelector<HTMLElement>('.gl-row > .gl-splitter')!);
    await mouseDrag(again, { x: 799, y: again.y });
    await expect.poll(() => width(item(root, 'column'))).toBeCloseTo(40, 0);
  });
});

describe('panels keep their identity', () => {
  it('preserves local React state and the DOM node when a panel moves to another stack', async () => {
    const { root, layout } = await mount();
    const element = panelElement(root, 'a');
    await userEvent.click(element.querySelector('.probe')!);
    await userEvent.click(element.querySelector('.probe')!);
    expect(element.textContent).toBe('a:2');
    const before = { ...renders };

    layout.moveItem('a', { parent: 'bottom' });

    await expect.poll(() => isShown(panelElement(root, 'a'))).toBe(true);
    const slot = item(root, 'bottom').querySelector('.gl-stack-content')!.getBoundingClientRect();
    expect(panelElement(root, 'a')).toBe(element);
    expect(element.textContent).toBe('a:2');
    expect(element.getBoundingClientRect().top).toBeCloseTo(slot.top, 1);
    expect(isShown(panelElement(root, 'd'))).toBe(false);
    // Nothing re-rendered either: moving is positioning only.
    expect(renders).toEqual(before);
  });

  it('keeps state when a panel is docked into a new row or column', async () => {
    const { root, layout } = await mount();
    const element = panelElement(root, 'b');
    layout.setActive('b');
    await expect.poll(() => isShown(element)).toBe(true);
    await userEvent.click(element.querySelector('.probe')!);

    layout.moveItem('b', { target: 'row', side: 'bottom' });

    await expect.poll(() => width(element)).toBe(800);
    expect(element.textContent).toBe('b:1');
  });
});

describe('maximize', () => {
  it('lets a stack fill the layout and restores it', async () => {
    const { root, layout } = await mount();
    await userEvent.click(item(root, 'top').querySelector('.gl-control.gl-maximize')!);

    expect(layout.getState().maximizedId).toBe('top');
    await expect.poll(() => width(panelElement(root, 'c'))).toBe(800);
    expect(item(root, 'top').classList.contains('gl-maximized')).toBe(true);
    expect(isShown(panelElement(root, 'a'))).toBe(false);
    expect(isShown(panelElement(root, 'd'))).toBe(false);
    const button = item(root, 'top').querySelector('.gl-control.gl-maximize')!;
    expect(button.getAttribute('title')).toBe('minimize probe');
    expect(height(item(root, 'top'))).toBe(600);
    expect(getComputedStyle(item(root, 'left')).visibility).toBe('hidden');

    await userEvent.click(button);

    expect(layout.getState().maximizedId).toBeNull();
    await expect.poll(() => isShown(panelElement(root, 'a'))).toBe(true);
    expect(width(panelElement(root, 'c'))).toBeCloseTo(397.5, 1);
  });

  it('hides the maximize button when showMaximizeIcon is off', async () => {
    const { root } = await mount(twoByOne, { settings: { showMaximizeIcon: false } });
    expect(root.querySelector('.gl-control.gl-maximize')).toBeNull();
  });
});

describe('tab overflow', () => {
  const many = {
    root: {
      type: 'row' as const,
      children: [
        {
          type: 'stack' as const,
          id: 'crowded',
          size: 1,
          children: Array.from({ length: 12 }, (_, i) => ({
            ...probe(`p${i}`),
            title: `A fairly long tab title ${i}`,
          })),
        },
        { ...probe('other'), size: 1 },
      ],
    },
  };

  it('offers a dropdown only when the tabs do not fit', async () => {
    const { root } = await mount(many);
    const crowded = item(root, 'crowded');
    await expect.poll(() => crowded.querySelector('.gl-tab-dropdown')).not.toBeNull();
    expect(root.querySelectorAll('.gl-tab-dropdown')).toHaveLength(1);
  });

  it('activates a tab chosen from the dropdown and scrolls it into view', async () => {
    const { root, layout } = await mount(many);
    const crowded = item(root, 'crowded');
    await expect.poll(() => crowded.querySelector('.gl-tab-dropdown')).not.toBeNull();

    await userEvent.click(crowded.querySelector('.gl-tab-dropdown')!);
    const entries = [...root.querySelectorAll<HTMLElement>('.gl-tab-menu > li')];
    expect(entries).toHaveLength(12);
    await userEvent.click(entries[11]!);

    expect(layout.getById('crowded')).toMatchObject({ activeId: 'p11' });
    await expect.poll(() => root.querySelector('.gl-tab-menu')).toBeNull();
    const strip = crowded.querySelector('.gl-tabs')!.getBoundingClientRect();
    const tab = crowded.querySelector('.gl-tab.gl-active')!.getBoundingClientRect();
    expect(tab.right).toBeLessThanOrEqual(strip.right + 1);
    expect(tab.left).toBeGreaterThanOrEqual(strip.left - 1);
    expect(isShown(panelElement(root, 'p11'))).toBe(true);
  });
});

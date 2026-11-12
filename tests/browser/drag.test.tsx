import { useState } from 'react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vite-plus/test';
import { userEvent } from 'vite-plus/test/browser/context';
import { GoldenLayout, createLayout, useDragSource, usePanelState } from '../../src/index';
import type { NodeConfig, RowOrColumnNode, StackNode } from '../../src/index';
import { render } from 'vitest-browser-react';
import { isShown, mountLayout, panelElement, verifyPath } from './helpers';
import { centerOf, mouseDrag, mouseMove, mouseUp } from './pointer';

const renders: Record<string, number> = {};
const countRender = (name: string): void => {
  renders[name] = (renders[name] ?? 0) + 1;
};

function Probe({ name }: { name: string }): ReactNode {
  const [clicks, setClicks] = useState(0);
  countRender(name);
  return (
    <button type="button" className="probe" onClick={() => setClicks((n) => n + 1)}>
      {name}:{clicks}
    </button>
  );
}

/** A panel whose content is a drag source, as in the legacy drag tests. */
function SourcePanel({ deferred }: { deferred?: boolean }): ReactNode {
  const item: NodeConfig = {
    type: 'panel',
    component: 'dropped',
    state: { text: 'dragged in' },
  };
  const source = useDragSource(deferred ? () => item : item);
  return <div id="dragsource" style={{ width: 40, height: 40 }} {...source} />;
}

function Dropped(): ReactNode {
  const [state] = usePanelState<{ text: string }>({ text: '' });
  return <div className="dragged">{state.text}</div>;
}

const components = { probe: Probe, source: SourcePanel, dropped: Dropped };
const probe = (id: string, extra: object = {}) => ({
  type: 'panel' as const,
  id,
  component: 'probe',
  props: { name: id },
  ...extra,
});

const twoStacks = {
  root: {
    type: 'row' as const,
    id: 'row',
    children: [
      { type: 'stack' as const, id: 'left', children: [probe('a'), probe('b'), probe('c')] },
      { type: 'stack' as const, id: 'right', children: [probe('d')] },
    ],
  },
};

const mount = (config: Parameters<typeof mountLayout>[0] = twoStacks, props = {}) =>
  mountLayout(config, { components, ...props });
const tab = (root: HTMLElement, id: string): HTMLElement =>
  root.querySelector<HTMLElement>(`.gl-tab[data-panel-id="${id}"]`)!;
const item = (root: HTMLElement, id: string): HTMLElement =>
  root.querySelector<HTMLElement>(`[data-item-id="${id}"]`)!;
const body = (root: HTMLElement, id: string): DOMRect =>
  item(root, id).querySelector('.gl-stack-content')!.getBoundingClientRect();
const ids = (node: unknown): string[] => (node as StackNode).children.map((child) => child.id);

// Ported from test/drag-tests.js
describe('supports drag creation', () => {
  const config = {
    root: { type: 'stack' as const, children: [{ type: 'panel' as const, component: 'source' }] },
  };

  it('creates a layout', async () => {
    const { layout } = await mount(config);
    verifyPath('stack.0.panel', layout);
  });

  it('creates a drag source', async () => {
    const { root } = await mount(config);
    expect(root.querySelectorAll('#dragsource')).toHaveLength(1);
  });

  it('creates a new panel if dragged', async () => {
    const { root, layout } = await mount(config);
    expect(document.querySelectorAll('.dragged')).toHaveLength(0);
    const source = root.querySelector('#dragsource')!.getBoundingClientRect();

    await mouseDrag(
      { x: source.left + 5, y: source.top + 5 },
      { x: source.left + 55, y: source.top + 55 },
    );

    await expect.poll(() => document.querySelectorAll('.dragged')).toHaveLength(1);
    // Dropped in the left quarter of the stack: it becomes the first item of a new row.
    const created = verifyPath('row.0.stack.0.panel', layout);
    expect(panelElement(root, created.id).querySelector('.dragged')?.textContent).toBe(
      'dragged in',
    );
    verifyPath('row.1.stack.0.panel', layout);
  });

  it('removes the drag source with the layout', async () => {
    const { unmount } = await mount(config);
    await unmount();
    expect(document.querySelector('#dragsource')).toBeNull();
  });
});

// Ported from test/deferred-create-drag-tests.js
describe('supports drag creation with deferred content', () => {
  const config = {
    root: {
      type: 'stack' as const,
      children: [{ type: 'panel' as const, component: 'source', props: { deferred: true } }],
    },
  };

  it('creates a layout', async () => {
    const { layout } = await mount(config);
    verifyPath('stack.0.panel', layout);
  });

  it('creates a drag source from a function', async () => {
    const { root } = await mount(config);
    expect(root.querySelectorAll('#dragsource')).toHaveLength(1);
  });

  it('creates a new panel if dragged, building its config on drop', async () => {
    const { root, layout } = await mount(config);
    const source = root.querySelector('#dragsource')!.getBoundingClientRect();

    await mouseDrag(
      { x: source.left + 5, y: source.top + 5 },
      { x: source.left + 55, y: source.top + 55 },
    );

    await expect.poll(() => document.querySelectorAll('.dragged')).toHaveLength(1);
    const created = verifyPath('row.0.stack.0.panel', layout);
    expect(panelElement(root, created.id).querySelector('.dragged')).not.toBeNull();
  });

  it('removes the drag source with the layout', async () => {
    const { unmount } = await mount(config);
    await unmount();
    expect(document.querySelector('#dragsource')).toBeNull();
  });
});

describe('drag sources outside the layout', () => {
  it('drops into the layout named by the `layout` option, and fills an empty layout', async () => {
    const layout = createLayout();
    function Palette(): ReactNode {
      const source = useDragSource(
        { type: 'panel', id: 'fresh', component: 'dropped', state: { text: 'from outside' } },
        { layout, title: 'New panel' },
      );
      return <div id="palette" style={{ width: 60, height: 30 }} {...source} />;
    }
    const screen = await render(
      <div>
        <Palette />
        <div style={{ width: 600, height: 400 }}>
          <GoldenLayout layout={layout} components={components} />
        </div>
      </div>,
    );
    const root = screen.container.querySelector<HTMLElement>('.gl-root')!;

    await mouseDrag(centerOf(screen.container.querySelector('#palette')!), centerOf(root), {
      release: false,
    });
    expect(root.querySelector('.gl-drag-proxy .gl-title')?.textContent).toBe('New panel');
    expect(root.querySelector('.gl-drop-indicator')!.getBoundingClientRect().width).toBe(600);
    await mouseUp();

    await expect.poll(() => layout.getById('fresh')?.type).toBe('panel');
    await expect.poll(() => panelElement(root, 'fresh').textContent).toBe('from outside');
  });
});

describe('dragging tabs', () => {
  it('does not start a drag before the pointer has moved past the threshold', async () => {
    const { root, layout } = await mount();
    const start = centerOf(tab(root, 'b'));
    const before = layout.getState();

    await mouseDrag(start, { x: start.x + 5, y: start.y + 3 }, { release: false });
    expect(root.querySelector('.gl-drag-proxy')).toBeNull();
    await mouseUp();

    // Pressing the tab still activated it; nothing moved.
    expect(ids(layout.getById('left'))).toEqual(ids(before.root!.children[0]));
    expect((layout.getById('left') as StackNode).activeId).toBe('b');
  });

  it('shows a proxy with the tab title and an indicator over the drop target', async () => {
    const { root } = await mount();
    const start = centerOf(tab(root, 'a'));
    const target = body(root, 'right');

    await mouseDrag(
      start,
      { x: target.right - 20, y: target.top + target.height / 2 },
      { release: false },
    );

    const proxy = root.querySelector<HTMLElement>('.gl-drag-proxy')!;
    expect(proxy.querySelector('.gl-title')?.textContent).toBe('probe');
    expect(root.classList.contains('gl-dragging')).toBe(true);
    const indicator = root.querySelector('.gl-drop-indicator')!.getBoundingClientRect();
    expect(indicator.left).toBeCloseTo(target.left + target.width / 2, 0);
    expect(indicator.width).toBeCloseTo(target.width / 2, 0);
    expect(indicator.height).toBeCloseTo(target.height, 0);

    // The dragged panel itself is the preview inside the proxy.
    const content = proxy.querySelector('.gl-drag-proxy-content')!.getBoundingClientRect();
    const dragged = panelElement(root, 'a').getBoundingClientRect();
    expect(dragged.left).toBeCloseTo(content.left, 0);
    expect(dragged.width).toBeCloseTo(content.width, 0);

    await mouseUp();
    await expect.poll(() => root.querySelector('.gl-drag-proxy')).toBeNull();
    expect(root.querySelector('.gl-drop-indicator')).toBeNull();
    expect(root.classList.contains('gl-dragging')).toBe(false);
  });

  it('docks a tab against the side of another stack', async () => {
    const { root, layout } = await mount();
    const target = body(root, 'right');

    await mouseDrag(centerOf(tab(root, 'a')), {
      x: target.right - 20,
      y: target.top + target.height / 2,
    });

    const row = layout.getState().root as RowOrColumnNode;
    expect(row.children.map((child) => ids(child))).toEqual([['b', 'c'], ['d'], ['a']]);
    await expect
      .poll(() => panelElement(root, 'a').getBoundingClientRect().right)
      .toBeCloseTo(800, 0);
  });

  it('docks above or below by wrapping the target in a column', async () => {
    const { root, layout } = await mount();
    const target = body(root, 'right');

    await mouseDrag(centerOf(tab(root, 'a')), {
      x: target.left + target.width / 2,
      y: target.bottom - 30,
    });

    const column = verifyPath('row.1.column', layout) as RowOrColumnNode;
    expect(column.children.map((child) => ids(child))).toEqual([['d'], ['a']]);
  });

  it('moves a tab into another stack through its header', async () => {
    const { root, layout } = await mount();
    const target = tab(root, 'd').getBoundingClientRect();

    await mouseDrag(centerOf(tab(root, 'b')), { x: target.left + 4, y: target.top + 10 });

    expect(ids(layout.getById('right'))).toEqual(['b', 'd']);
    expect(ids(layout.getById('left'))).toEqual(['a', 'c']);
    await expect.poll(() => isShown(panelElement(root, 'b'))).toBe(true);
    expect(panelElement(root, 'b').getBoundingClientRect().left).toBeGreaterThan(400);
  });

  it('reorders tabs within a header', async () => {
    const { root, layout } = await mount();
    const last = tab(root, 'c').getBoundingClientRect();

    await mouseDrag(centerOf(tab(root, 'a')), { x: last.right - 3, y: last.top + 10 });
    expect(ids(layout.getById('left'))).toEqual(['b', 'c', 'a']);

    const first = tab(root, 'b').getBoundingClientRect();
    await mouseDrag(centerOf(tab(root, 'a')), { x: first.left + 3, y: first.top + 10 });
    expect(ids(layout.getById('left'))).toEqual(['a', 'b', 'c']);
  });

  it('splits the whole layout when dropped on its outer edge', async () => {
    const { root, layout } = await mount();
    const bounds = root.getBoundingClientRect();

    await mouseDrag(centerOf(tab(root, 'a')), { x: bounds.left + 300, y: bounds.bottom - 4 });

    const column = layout.getState().root as RowOrColumnNode;
    expect(column.type).toBe('column');
    expect(column.children[0]?.id).toBe('row');
    expect(ids(column.children[1])).toEqual(['a']);
  });

  it('keeps the panel mounted, with its state, and re-renders no panel during the drag', async () => {
    const { root, layout } = await mount();
    const element = panelElement(root, 'a');
    await userEvent.click(element.querySelector('.probe')!);
    expect(element.textContent).toBe('a:1');
    const before = { ...renders };
    const target = body(root, 'right');

    await mouseDrag(
      centerOf(tab(root, 'a')),
      { x: target.right - 20, y: target.top + 200 },
      {
        via: [
          { x: 300, y: 300 },
          { x: 500, y: 100 },
        ],
        steps: 6,
      },
    );

    await expect.poll(() => layout.getParent('a')?.id).not.toBe('left');
    expect(panelElement(root, 'a')).toBe(element);
    expect(element.textContent).toBe('a:1');
    expect(renders).toEqual(before);
  });

  it('does nothing when the only tab of a stack is dropped on that stack', async () => {
    const { root, layout } = await mount();
    const before = layout.getState();
    const own = body(root, 'right');

    await mouseDrag(
      centerOf(tab(root, 'd')),
      { x: own.left + 30, y: own.top + 200 },
      { release: false },
    );
    expect(root.querySelector('.gl-drag-proxy')).not.toBeNull();
    expect(root.querySelector('.gl-drop-indicator')).toBeNull();
    await mouseUp();

    expect(layout.getState()).toBe(before);
  });

  it('cancels with Escape and leaves the layout untouched', async () => {
    const { root, layout } = await mount();
    const before = layout.getState();
    const target = body(root, 'right');

    await mouseDrag(
      centerOf(tab(root, 'b')),
      { x: target.right - 20, y: target.top + 200 },
      { release: false },
    );
    expect(root.querySelector('.gl-drag-proxy')).not.toBeNull();
    await userEvent.keyboard('{Escape}');

    expect(root.querySelector('.gl-drag-proxy')).toBeNull();
    await mouseUp();
    expect(ids(layout.getById('left'))).toEqual(ids(before.root!.children[0]));
    await expect.poll(() => isShown(panelElement(root, 'b'))).toBe(true);
    expect(panelElement(root, 'b').getBoundingClientRect().left).toBeLessThan(400);
  });

  it('does not drag a tab marked reorderable: false, or any tab when reordering is off', async () => {
    const fixed = await mount({
      root: {
        type: 'row',
        children: [
          { type: 'stack', id: 'left', children: [probe('a', { reorderable: false }), probe('b')] },
          { type: 'stack', id: 'right', children: [probe('d')] },
        ],
      },
    });
    const target = body(fixed.root, 'right');
    await mouseDrag(
      centerOf(tab(fixed.root, 'a')),
      { x: target.right - 20, y: target.top + 200 },
      { release: false },
    );
    expect(fixed.root.querySelector('.gl-drag-proxy')).toBeNull();
    await mouseUp();
    expect(ids(fixed.layout.getById('left'))).toEqual(['a', 'b']);
    await fixed.unmount();

    const off = await mount(twoStacks, { settings: { reorderEnabled: false } });
    const offTarget = body(off.root, 'right');
    await mouseDrag(centerOf(tab(off.root, 'b')), {
      x: offTarget.right - 20,
      y: offTarget.top + 200,
    });
    expect(ids(off.layout.getById('left'))).toEqual(['a', 'b', 'c']);
  });

  it('keeps the proxy inside the layout when constrained, and lets it leave when not', async () => {
    const constrained = await mount();
    const bounds = constrained.root.getBoundingClientRect();
    await mouseDrag(
      centerOf(tab(constrained.root, 'a')),
      { x: bounds.right + 150, y: bounds.bottom + 80 },
      { release: false },
    );
    const proxy = constrained.root.querySelector('.gl-drag-proxy')!.getBoundingClientRect();
    expect(proxy.right).toBeLessThanOrEqual(bounds.right + 1);
    expect(proxy.bottom).toBeLessThanOrEqual(bounds.bottom + 1);
    await userEvent.keyboard('{Escape}');
    await mouseUp();
    await constrained.unmount();

    const free = await mount(twoStacks, { settings: { constrainDragToContainer: false } });
    const freeBounds = free.root.getBoundingClientRect();
    const before = free.layout.getState();
    await mouseDrag(
      centerOf(tab(free.root, 'a')),
      { x: freeBounds.right + 150, y: 300 },
      { release: false },
    );
    expect(free.root.querySelector('.gl-drag-proxy')!.getBoundingClientRect().left).toBeGreaterThan(
      freeBounds.right,
    );
    expect(free.root.querySelector('.gl-drop-indicator')).toBeNull();
    await mouseUp();
    // Released outside the layout: nothing happens.
    expect(free.layout.getState().root).toBe(before.root);
  });
});

describe('dragging a whole stack', () => {
  it('moves the stack when its header background is dragged', async () => {
    const { root, layout } = await mount();
    const header = item(root, 'left').querySelector('.gl-header')!.getBoundingClientRect();
    const target = body(root, 'right');

    await mouseDrag(
      { x: header.left + 320, y: header.top + 10 },
      { x: target.left + target.width / 2, y: target.bottom - 30 },
    );

    const column = layout.getState().root as RowOrColumnNode;
    expect(column.type).toBe('column');
    expect(column.children.map((child) => child.id)).toEqual(['right', 'left']);
    expect(ids(column.children[1])).toEqual(['a', 'b', 'c']);
  });

  it('merges the stack into another when dropped on its header', async () => {
    const { root, layout } = await mount();
    const header = item(root, 'left').querySelector('.gl-header')!.getBoundingClientRect();
    const target = item(root, 'right').querySelector('.gl-header')!.getBoundingClientRect();

    await mouseDrag(
      { x: header.left + 320, y: header.top + 10 },
      { x: target.left + 300, y: target.top + 10 },
    );

    expect(layout.getState().root?.id).toBe('right');
    expect(ids(layout.getById('right'))).toEqual(['d', 'a', 'b', 'c']);
  });

  it('does not select the stack that the drag was released over', async () => {
    const { root, layout } = await mount(twoStacks, { settings: { selectionEnabled: true } });
    const header = item(root, 'left').querySelector('.gl-header')!.getBoundingClientRect();
    const target = item(root, 'right').querySelector('.gl-header')!.getBoundingClientRect();

    await mouseDrag(
      { x: header.left + 320, y: header.top + 10 },
      { x: target.left + 300, y: target.top + 10 },
    );
    await mouseMove({ x: 10, y: 590 });

    expect(layout.getState().selectedId).toBeNull();
  });
});

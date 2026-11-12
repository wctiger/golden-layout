import { useEffect, useLayoutEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vite-plus/test';
import { userEvent } from 'vite-plus/test/browser/context';
import { useDragSource, usePanel } from '../../src/index';
import type { Action, RowOrColumnNode, StackNode } from '../../src/index';
import { isShown, mountLayout, panelElement, verifyPath } from './helpers';
import { centerOf, mouseDrag } from './pointer';

// Regression tests for the review findings on PR #11.

function Clicker({ name }: { name: string }): ReactNode {
  const [clicks, setClicks] = useState(0);
  return (
    <button type="button" className="clicker" onClick={() => setClicks((n) => n + 1)}>
      {name}:{clicks}
    </button>
  );
}

const clicker = (id: string) => ({
  type: 'panel' as const,
  id,
  component: 'clicker',
  props: { name: id },
});

describe('onChange and panel mount effects', () => {
  function TitlesItself({ when }: { when: 'effect' | 'layoutEffect' }): ReactNode {
    const panel = usePanel();
    useEffect(() => {
      if (when === 'effect') panel.setTitle('Ready');
    }, [panel, when]);
    useLayoutEffect(() => {
      if (when === 'layoutEffect') panel.setTitle('Ready early');
    }, [panel, when]);
    return null;
  }

  it.each([
    ['a mount effect', 'effect', 'Ready'],
    ['a mount layout effect', 'layoutEffect', 'Ready early'],
  ] as const)('reports a change dispatched from %s', async (_name, when, title) => {
    const actions: Action[] = [];
    const { root } = await mountLayout(
      { root: { type: 'panel', id: 'p', component: 'self', props: { when } } },
      { components: { self: TitlesItself }, onChange: (_state, action) => actions.push(action) },
    );
    await expect.poll(() => root.querySelector('.gl-title')?.textContent).toBe(title);
    expect(actions).toEqual([{ type: 'setTitle', id: 'p', title }]);
  });
});

describe('keyboard on the tab close button', () => {
  it('closes the panel with Enter and with Space', async () => {
    const { root, layout } = await mountLayout(
      {
        root: { type: 'stack', id: 's', children: [clicker('a'), clicker('b'), clicker('c')] },
      },
      { components: { clicker: Clicker } },
    );
    const close = (id: string): HTMLElement =>
      root.querySelector<HTMLElement>(`.gl-tab[data-panel-id="${id}"] .gl-tab-close`)!;

    close('a').focus();
    await userEvent.keyboard('{Enter}');
    expect(layout.getById('a')).toBeUndefined();

    close('b').focus();
    await userEvent.keyboard(' ');
    expect(layout.getById('b')).toBeUndefined();
    expect((layout.getById('s') as StackNode).children).toHaveLength(1);
  });

  it('still activates a tab with Enter when the tab itself has focus', async () => {
    const { root, layout } = await mountLayout(
      {
        root: { type: 'stack', id: 's', children: [clicker('a'), clicker('b')] },
      },
      { components: { clicker: Clicker } },
    );
    root.querySelector<HTMLElement>('.gl-tab[data-panel-id="b"]')!.focus();
    await userEvent.keyboard('{Enter}');
    expect((layout.getById('s') as StackNode).activeId).toBe('b');
  });
});

describe('drag and drop without headers', () => {
  function Source(): ReactNode {
    const source = useDragSource({
      type: 'panel',
      id: 'dropped',
      component: 'clicker',
      props: { name: 'dropped' },
    });
    return <div id="source" style={{ width: 30, height: 30 }} {...source} />;
  }
  const components = { clicker: Clicker, source: Source };
  const config = {
    root: {
      type: 'stack' as const,
      id: 's',
      children: [{ type: 'panel' as const, id: 'src', component: 'source' }],
    },
  };

  it('splits a populated stack when dropped near its side', async () => {
    const { root, layout } = await mountLayout(config, {
      components,
      settings: { hasHeaders: false },
    });
    const bounds = root.getBoundingClientRect();

    await mouseDrag(centerOf(root.querySelector('#source')!), {
      x: bounds.right - 40,
      y: bounds.top + 300,
    });

    const row = layout.getState().root as RowOrColumnNode;
    expect(row.type).toBe('row');
    expect(row.children.map((child) => (child as StackNode).children.map((p) => p.id))).toEqual([
      ['src'],
      ['dropped'],
    ]);
  });

  it('adds a tab when dropped in the centre', async () => {
    const { root, layout } = await mountLayout(config, {
      components,
      settings: { hasHeaders: false },
    });
    await mouseDrag(centerOf(root.querySelector('#source')!), centerOf(root));

    const stack = verifyPath('stack', layout) as StackNode;
    expect(stack.children.map((p) => p.id)).toEqual(['src', 'dropped']);
    expect(stack.activeId).toBe('dropped');
  });
});

describe('a maximized stack', () => {
  const config = {
    root: {
      type: 'row' as const,
      children: [
        { type: 'stack' as const, id: 'left', children: [clicker('a')] },
        { type: 'stack' as const, id: 'right', children: [clicker('b')] },
      ],
    },
  };

  it('leaves its panel on top, so the panel still receives clicks', async () => {
    const { root, layout } = await mountLayout(config, { components: { clicker: Clicker } });
    const button = panelElement(root, 'a').querySelector<HTMLElement>('.clicker')!;
    const hit = (): Element | null => {
      const point = centerOf(button);
      return document.elementFromPoint(point.x, point.y);
    };
    expect(hit()).toBe(button);

    layout.maximize('left');
    await expect.poll(() => panelElement(root, 'a').getBoundingClientRect().width).toBe(800);

    expect(hit()).toBe(button);
    await userEvent.click(button);
    expect(button.textContent).toBe('a:1');
    expect(isShown(panelElement(root, 'b'))).toBe(false);

    // The header of the maximized stack is reachable too.
    await userEvent.click(root.querySelector('.gl-stack.gl-maximized .gl-control.gl-maximize')!);
    expect(layout.getState().maximizedId).toBeNull();
    await expect.poll(() => isShown(panelElement(root, 'b'))).toBe(true);
    await userEvent.click(panelElement(root, 'b').querySelector('.clicker')!);
    expect(panelElement(root, 'b').textContent).toBe('b:1');
  });

  it('keeps splitters and menus in their layers', async () => {
    const { root } = await mountLayout(config, { components: { clicker: Clicker } });
    const splitter = root.querySelector('.gl-splitter')!;
    const point = centerOf(splitter);
    expect(document.elementFromPoint(point.x, point.y)).toBe(splitter);

    await userEvent.click(root.querySelector('.gl-tab[data-panel-id="a"]')!, { button: 'right' });
    const menu = root.querySelector('.gl-context-menu')!;
    const inside = centerOf(menu);
    expect(menu.contains(document.elementFromPoint(inside.x, inside.y))).toBe(true);
  });
});

describe('panel ids with special characters', () => {
  it('returns focus to the tab when its menu is dismissed', async () => {
    const id = 'he said "hi" [1]';
    const { root } = await mountLayout(
      {
        root: {
          type: 'stack',
          children: [{ type: 'panel', id, component: 'clicker', props: { name: 'q' } }],
        },
      },
      { components: { clicker: Clicker } },
    );
    const tab = root.querySelector<HTMLElement>('.gl-tab')!;
    expect(tab.dataset.panelId).toBe(id);

    await userEvent.click(tab, { button: 'right' });
    expect(root.querySelector('.gl-context-menu')).not.toBeNull();
    await userEvent.keyboard('{Escape}');

    expect(root.querySelector('.gl-context-menu')).toBeNull();
    expect(document.activeElement).toBe(tab);
  });
});

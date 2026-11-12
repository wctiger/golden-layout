import { useState } from 'react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vite-plus/test';
import { userEvent } from 'vite-plus/test/browser/context';
import type {
  Action,
  GoldenLayoutProps,
  LayoutConfig,
  PanelNode,
  StackActionsContext,
  StackNode,
  TabMenuContext,
} from '../../src/index';
import { mountLayout, panelElement } from './helpers';
import { centerOf, mouseDrag, mouseUp } from './pointer';
import '../../examples/themes/dark.css';

const renders: Record<string, number> = {};
const countRender = (name: string): void => {
  renders[name] = (renders[name] ?? 0) + 1;
};

function Probe({ name, tall }: { name: string; tall?: boolean }): ReactNode {
  const [clicks, setClicks] = useState(0);
  countRender(name);
  return (
    <div style={tall ? { height: 3000, width: 3000 } : undefined}>
      <button type="button" className="probe" onClick={() => setClicks((n) => n + 1)}>
        {name}:{clicks}
      </button>
    </div>
  );
}

const panel = (id: string, extra: object = {}) => ({
  type: 'panel' as const,
  id,
  component: 'probe',
  title: id.toUpperCase(),
  props: { name: id },
  ...extra,
});

const config = {
  root: {
    type: 'row' as const,
    id: 'row',
    children: [
      {
        type: 'stack' as const,
        id: 'left',
        children: [panel('a'), panel('b'), panel('c'), panel('d')],
      },
      { type: 'stack' as const, id: 'right', children: [panel('e')] },
    ],
  },
};

const mount = (props: Partial<GoldenLayoutProps> = {}, layoutConfig: LayoutConfig = config) =>
  mountLayout(layoutConfig, { components: { probe: Probe }, ...props });
const tab = (root: HTMLElement, id: string): HTMLElement =>
  root.querySelector<HTMLElement>(`.gl-tab[data-panel-id="${id}"]`)!;
const item = (root: HTMLElement, id: string): HTMLElement =>
  root.querySelector<HTMLElement>(`[data-item-id="${id}"]`)!;
const titleOf = (root: HTMLElement, id: string): string | null =>
  tab(root, id).querySelector('.gl-title')?.textContent ?? null;
const input = (root: HTMLElement): HTMLInputElement | null =>
  root.querySelector<HTMLInputElement>('.gl-title-input');
const ids = (node: unknown): string[] => (node as StackNode).children.map((child) => child.id);
const menu = (root: HTMLElement): HTMLElement | null => root.querySelector('.gl-context-menu');
const entry = (root: HTMLElement, id: string): HTMLElement =>
  root.querySelector<HTMLElement>(`.gl-context-menu > li[data-item-id="${id}"]`)!;
const rightClick = (element: Element): Promise<void> =>
  userEvent.click(element, { button: 'right' });

describe('panel scrollbars', () => {
  const scrolling = {
    root: {
      type: 'stack' as const,
      children: [panel('tall', { props: { name: 'tall', tall: true } })],
    },
  };

  // Headless Chromium runs with scrollbars hidden, so they take no space to measure.
  // The styles applied to the scrollbar pseudo-elements are read instead.
  const bar = (host: Element, part = ''): CSSStyleDeclaration =>
    getComputedStyle(host, `::-webkit-scrollbar${part}`);

  it('sizes the panel scrollbar from --gl-scrollbar-size and colours its thumb', async () => {
    const { root } = await mount({}, scrolling);
    const host = panelElement(root, 'tall');
    expect(host.scrollHeight).toBeGreaterThan(host.clientHeight);
    expect(bar(host).width).toBe('10px');
    expect(bar(host).height).toBe('10px');
    expect(bar(host, '-thumb').backgroundColor).toBe('rgb(185, 185, 185)');
    expect(bar(host, '-thumb').borderTopLeftRadius).toBe('5px');
    expect(bar(host, '-track').backgroundColor).toBe('rgba(0, 0, 0, 0)');
  });

  it('follows the variables when they are set inline or by a theme', async () => {
    const { root } = await mount({ style: { '--gl-scrollbar-size': '16px' } as never }, scrolling);
    const host = panelElement(root, 'tall');
    expect(bar(host).width).toBe('16px');

    root.classList.add('gl-theme-dark');
    expect(bar(host, '-thumb').backgroundColor).toBe('rgb(68, 68, 68)');
  });

  it("leaves scrollbars inside a panel's own content alone", async () => {
    const { root } = await mount({}, scrolling);
    const inner = document.createElement('div');
    inner.style.cssText = 'width:100px;height:100px;overflow:scroll';
    panelElement(root, 'tall').append(inner);
    expect(bar(inner).width).not.toBe('10px');
    expect(bar(inner, '-thumb').backgroundColor).not.toBe('rgb(185, 185, 185)');
    inner.remove();
  });
});

describe('editing tab titles', () => {
  const mountWithActions = async (props: Partial<GoldenLayoutProps> = {}) => {
    const actions: Action[] = [];
    const mounted = await mount({ onChange: (_state, action) => actions.push(action), ...props });
    return { ...mounted, actions };
  };

  it('turns the title into a selected text field on double-click', async () => {
    const { root } = await mountWithActions();
    await userEvent.dblClick(tab(root, 'a').querySelector('.gl-title')!);

    const field = input(root)!;
    expect(field.value).toBe('A');
    expect(document.activeElement).toBe(field);
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(1);
    expect(tab(root, 'a').classList.contains('gl-editing')).toBe(true);
  });

  it('commits on Enter with exactly one setTitle action, and saves the title', async () => {
    const { root, layout, actions } = await mountWithActions();
    await userEvent.dblClick(tab(root, 'a').querySelector('.gl-title')!);
    actions.length = 0;

    await userEvent.fill(input(root)!, 'Orders');
    await userEvent.keyboard('{Enter}');

    expect(input(root)).toBeNull();
    expect(titleOf(root, 'a')).toBe('Orders');
    expect(actions).toEqual([{ type: 'setTitle', id: 'a', title: 'Orders' }]);
    expect(JSON.parse(JSON.stringify(layout)).root.children[0].children[0].title).toBe('Orders');
    expect(document.activeElement).toBe(tab(root, 'a'));
  });

  it('cancels on Escape without dispatching', async () => {
    const { root, actions } = await mountWithActions();
    await userEvent.dblClick(tab(root, 'a').querySelector('.gl-title')!);
    actions.length = 0;

    await userEvent.fill(input(root)!, 'Nope');
    await userEvent.keyboard('{Escape}');

    expect(input(root)).toBeNull();
    expect(titleOf(root, 'a')).toBe('A');
    expect(actions).toEqual([]);
  });

  it('commits when focus leaves the field', async () => {
    const { root, layout } = await mountWithActions();
    await userEvent.dblClick(tab(root, 'a').querySelector('.gl-title')!);
    await userEvent.fill(input(root)!, 'Blurred');

    await userEvent.click(panelElement(root, 'e').querySelector('.probe')!);

    expect(input(root)).toBeNull();
    expect((layout.getById('a') as PanelNode).title).toBe('Blurred');
  });

  it('keeps the old title when the field is emptied or unchanged', async () => {
    const { root, actions } = await mountWithActions();
    await userEvent.dblClick(tab(root, 'a').querySelector('.gl-title')!);
    actions.length = 0;
    await userEvent.fill(input(root)!, '   ');
    await userEvent.keyboard('{Enter}');
    expect(titleOf(root, 'a')).toBe('A');

    await userEvent.dblClick(tab(root, 'a').querySelector('.gl-title')!);
    await userEvent.keyboard('{Enter}');
    expect(titleOf(root, 'a')).toBe('A');
    expect(actions).toEqual([]);
  });

  it('does not drag, activate or select from inside the field', async () => {
    const { root, layout, actions } = await mountWithActions({
      settings: { selectionEnabled: true },
    });
    await userEvent.dblClick(tab(root, 'b').querySelector('.gl-title')!);
    actions.length = 0;
    const before = layout.getState();
    const start = centerOf(input(root)!);

    await mouseDrag(start, { x: start.x + 300, y: start.y + 300 }, { release: false });
    expect(root.querySelector('.gl-drag-proxy')).toBeNull();
    await mouseUp();

    expect(layout.getState().root).toBe(before.root);
    expect(input(root)).not.toBeNull();
    // Space types a space rather than activating the tab again.
    await userEvent.keyboard('x y');
    expect(input(root)!.value).toContain(' ');
    expect(actions).toEqual([]);
  });

  it('treats markup in a title as text while editing', async () => {
    const { root, layout } = await mountWithActions();
    await userEvent.dblClick(tab(root, 'a').querySelector('.gl-title')!);
    await userEvent.fill(input(root)!, '<b>x</b>');
    await userEvent.keyboard('{Enter}');

    expect((layout.getById('a') as PanelNode).title).toBe('<b>x</b>');
    expect(tab(root, 'a').querySelector('b')).toBeNull();
    expect(titleOf(root, 'a')).toBe('<b>x</b>');
  });

  it('can be switched off for the layout or for one panel', async () => {
    const off = await mount({ settings: { renameEnabled: false } });
    await userEvent.dblClick(tab(off.root, 'a').querySelector('.gl-title')!);
    expect(input(off.root)).toBeNull();
    off.layout.startRename('a');
    expect(input(off.root)).toBeNull();
    await off.unmount();

    const one = await mount();
    one.layout.updateItem('a', { renamable: false });
    await expect.poll(() => (one.layout.getById('a') as PanelNode).renamable).toBe(false);
    await userEvent.dblClick(tab(one.root, 'a').querySelector('.gl-title')!);
    expect(input(one.root)).toBeNull();
    await userEvent.dblClick(tab(one.root, 'b').querySelector('.gl-title')!);
    expect(input(one.root)).not.toBeNull();
  });

  it('starts from F2 on a focused tab and from layout.startRename', async () => {
    const { root, layout } = await mountWithActions();
    tab(root, 'c').focus();
    await userEvent.keyboard('{F2}');
    expect(input(root)?.value).toBe('C');
    await userEvent.keyboard('{Escape}');

    layout.startRename('e');
    await expect.poll(() => input(root)?.value).toBe('E');
    expect(tab(root, 'e').contains(input(root))).toBe(true);
  });

  it('keeps a long title inside the header and leaves the controls visible', async () => {
    const { root } = await mountWithActions();
    await userEvent.dblClick(tab(root, 'e').querySelector('.gl-title')!);
    await userEvent.fill(input(root)!, 'x'.repeat(200));

    const header = item(root, 'right').querySelector('.gl-header')!.getBoundingClientRect();
    const controls = item(root, 'right').querySelector('.gl-controls')!.getBoundingClientRect();
    expect(input(root)!.getBoundingClientRect().width).toBeLessThanOrEqual(250);
    expect(controls.right).toBeLessThanOrEqual(header.right + 1);
    expect(controls.width).toBeGreaterThan(20);
  });

  it('works with the header on the side', async () => {
    const { root, layout } = await mountWithActions();
    layout.updateItem('right', { headerPosition: 'left' });
    await expect.poll(() => item(root, 'right').dataset.header).toBe('left');

    await userEvent.dblClick(tab(root, 'e').querySelector('.gl-title')!);
    await userEvent.fill(input(root)!, 'Side');
    await userEvent.keyboard('{Enter}');

    expect((layout.getById('e') as PanelNode).title).toBe('Side');
  });

  it('does not re-render the panel, which keeps its state', async () => {
    const { root } = await mountWithActions();
    await userEvent.click(panelElement(root, 'a').querySelector('.probe')!);
    const before = { ...renders };

    await userEvent.dblClick(tab(root, 'a').querySelector('.gl-title')!);
    await userEvent.fill(input(root)!, 'Renamed');
    await userEvent.keyboard('{Enter}');

    expect(titleOf(root, 'a')).toBe('Renamed');
    expect(renders).toEqual(before);
    expect(panelElement(root, 'a').textContent).toBe('a:1');
  });
});

describe('tooltips on icon buttons', () => {
  const tip = (element: Element | null): [string | null, string | null] => [
    element?.getAttribute('title') ?? null,
    element?.getAttribute('aria-label') ?? null,
  ];

  it('names the panel on the tab close button', async () => {
    const { root } = await mount();
    expect(tip(tab(root, 'b').querySelector('.gl-tab-close'))).toEqual(['close B', 'close B']);
  });

  it('names the active panel on the maximize button, and follows the active tab', async () => {
    const { root, layout } = await mount();
    const button = (): Element => item(root, 'left').querySelector('.gl-control.gl-maximize')!;
    expect(tip(button())).toEqual(['maximize A', 'maximize A']);

    layout.setActive('c');
    await expect.poll(() => button().getAttribute('title')).toBe('maximize C');

    await userEvent.click(button());
    await expect.poll(() => button().getAttribute('title')).toBe('minimize C');
  });

  it('says what the close-stack button and the overflow chevron do', async () => {
    const { root } = await mount(
      {},
      {
        root: {
          type: 'row',
          children: [
            {
              type: 'stack',
              id: 'crowded',
              size: 1,
              children: Array.from({ length: 12 }, (_, i) =>
                panel(`p${i}`, { title: `A long title ${i}` }),
              ),
            },
            { ...panel('other'), size: 3 },
          ],
        },
      },
    );
    expect(tip(root.querySelector('.gl-control.gl-close'))).toEqual([
      'close all tabs',
      'close all tabs',
    ]);
    await expect.poll(() => root.querySelector('.gl-tab-dropdown')).not.toBeNull();
    expect(tip(root.querySelector('.gl-tab-dropdown'))[0]).toBe('additional tabs');
  });

  it('follows a rename', async () => {
    const { root, layout } = await mount();
    layout.setTitle('a', 'Orders');
    await expect
      .poll(() => tab(root, 'a').querySelector('.gl-tab-close')?.getAttribute('title'))
      .toBe('close Orders');
    expect(item(root, 'left').querySelector('.gl-control.gl-maximize')?.getAttribute('title')).toBe(
      'maximize Orders',
    );
  });

  it('accepts a function or a string for a label', async () => {
    const { root } = await mount({
      labels: { close: ({ title }) => `Close “${title}”`, maximize: 'Grow' },
    });
    expect(tab(root, 'a').querySelector('.gl-tab-close')?.getAttribute('title')).toBe('Close “A”');
    expect(root.querySelector('.gl-control.gl-maximize')?.getAttribute('title')).toBe('Grow A');
  });

  it('gives every icon button a pointer cursor', async () => {
    const { root } = await mount();
    for (const button of root.querySelectorAll('.gl-control, .gl-tab-close')) {
      expect(getComputedStyle(button).cursor).toBe('pointer');
    }
    expect(root.querySelectorAll('.gl-control, .gl-tab-close').length).toBeGreaterThan(6);
  });
});

describe('tab context menu', () => {
  const mountWithActions = async (
    props: Partial<GoldenLayoutProps> = {},
    layoutConfig: LayoutConfig = config,
  ) => {
    const actions: Action[] = [];
    const mounted = await mount(
      { onChange: (_state, action) => actions.push(action), ...props },
      layoutConfig,
    );
    return { ...mounted, actions };
  };
  const labelsOf = (root: HTMLElement): (string | null)[] =>
    [...root.querySelectorAll('.gl-context-menu > li')].map((li) => li.textContent);
  const disabled = (root: HTMLElement, id: string): boolean =>
    entry(root, id).getAttribute('aria-disabled') === 'true';

  it('opens at the pointer with the default entries, without activating the tab', async () => {
    const { root, layout, actions } = await mountWithActions();
    await rightClick(tab(root, 'b'));

    expect(labelsOf(root)).toEqual([
      'Rename panel',
      'Close tabs to the right',
      'Close other tabs',
      'Close all tabs',
    ]);
    const box = menu(root)!.getBoundingClientRect();
    const target = centerOf(tab(root, 'b'));
    expect(box.left).toBeCloseTo(target.x, 0);
    expect(box.top).toBeCloseTo(target.y, 0);
    expect((layout.getById('left') as StackNode).activeId).toBe('a');
    expect(actions).toEqual([]);
    expect(root.querySelector('.gl-drag-proxy')).toBeNull();
  });

  it('does not open on the header background or on a panel', async () => {
    const { root } = await mountWithActions();
    const header = item(root, 'left').querySelector('.gl-header')!;
    await userEvent.click(header, { button: 'right', position: { x: 380, y: 10 } });
    expect(menu(root)).toBeNull();
    await rightClick(panelElement(root, 'a'));
    expect(menu(root)).toBeNull();
  });

  it('renames from the menu', async () => {
    const { root } = await mountWithActions();
    await rightClick(tab(root, 'c'));
    await userEvent.click(entry(root, 'rename'));

    expect(menu(root)).toBeNull();
    await expect.poll(() => input(root)?.value).toBe('C');
    expect(tab(root, 'c').contains(input(root))).toBe(true);
  });

  it('closes tabs to the right as one change', async () => {
    const { root, layout, actions } = await mountWithActions();
    await rightClick(tab(root, 'b'));
    await userEvent.click(entry(root, 'closeTabsToRight'));

    expect(ids(layout.getById('left'))).toEqual(['a', 'b']);
    expect(actions).toEqual([{ type: 'closeItems', ids: ['c', 'd'] }]);
    expect(menu(root)).toBeNull();
  });

  it('closes other tabs and leaves this one active', async () => {
    const { root, layout, actions } = await mountWithActions();
    await rightClick(tab(root, 'b'));
    await userEvent.click(entry(root, 'closeOtherTabs'));

    expect(ids(layout.getById('left'))).toEqual(['b']);
    expect((layout.getById('left') as StackNode).activeId).toBe('b');
    expect(actions).toHaveLength(1);
  });

  it('closes all tabs, removing the stack', async () => {
    const { root, layout, actions } = await mountWithActions();
    await rightClick(tab(root, 'b'));
    await userEvent.click(entry(root, 'closeAllTabs'));

    expect(layout.getById('left')).toBeUndefined();
    expect(layout.getState().root?.id).toBe('right');
    expect(actions).toHaveLength(1);
  });

  it('skips tabs that cannot be closed', async () => {
    const withFixed: LayoutConfig = {
      root: {
        type: 'stack' as const,
        id: 'left',
        children: [panel('a'), panel('b'), panel('c', { closable: false }), panel('d')],
      },
    };
    const first = await mountWithActions({}, withFixed);
    await rightClick(tab(first.root, 'a'));
    await userEvent.click(entry(first.root, 'closeTabsToRight'));
    expect(ids(first.layout.getById('left'))).toEqual(['a', 'c']);
    await first.unmount();

    const second = await mountWithActions({}, withFixed);
    await rightClick(tab(second.root, 'a'));
    await userEvent.click(entry(second.root, 'closeAllTabs'));
    expect(ids(second.layout.getById('left'))).toEqual(['c']);
  });

  it('disables entries that would do nothing, and ignores clicks on them', async () => {
    const { root, layout, actions } = await mountWithActions();
    await rightClick(tab(root, 'd'));
    expect(disabled(root, 'closeTabsToRight')).toBe(true);
    expect(disabled(root, 'closeOtherTabs')).toBe(false);
    // Clicked through the DOM: a pointer click would wait for the entry to become enabled.
    entry(root, 'closeTabsToRight').click();
    expect(menu(root)).not.toBeNull();
    expect(actions).toEqual([]);
    await userEvent.keyboard('{Escape}');

    await rightClick(tab(root, 'e'));
    expect(disabled(root, 'closeOtherTabs')).toBe(true);
    expect(disabled(root, 'closeAllTabs')).toBe(false);
    await userEvent.keyboard('{Escape}');

    layout.updateItem('e', { closable: false });
    await expect.poll(() => tab(root, 'e').querySelector('.gl-tab-close')).toBeNull();
    await rightClick(tab(root, 'e'));
    expect(disabled(root, 'closeAllTabs')).toBe(true);
  });

  it('closes on Escape, on a click elsewhere, and when a drag starts', async () => {
    const { root } = await mountWithActions();
    await rightClick(tab(root, 'b'));
    await userEvent.keyboard('{Escape}');
    expect(menu(root)).toBeNull();
    expect(document.activeElement).toBe(tab(root, 'b'));

    await rightClick(tab(root, 'b'));
    await userEvent.click(panelElement(root, 'e').querySelector('.probe')!);
    expect(menu(root)).toBeNull();

    await rightClick(tab(root, 'b'));
    // Tab "a" is clear of the open menu, which hangs below and to the right of tab "b".
    const start = centerOf(tab(root, 'a').querySelector('.gl-title')!);
    await mouseDrag(start, { x: start.x + 200, y: start.y + 200 }, { release: false });
    expect(root.querySelector('.gl-drag-proxy')).not.toBeNull();
    expect(menu(root)).toBeNull();
    await userEvent.keyboard('{Escape}');
    await mouseUp();
  });

  it('is driven by the keyboard, skipping disabled entries', async () => {
    const { root, layout } = await mountWithActions();
    tab(root, 'd').focus();
    await userEvent.keyboard('{Shift>}{F10}{/Shift}');
    expect(menu(root)).not.toBeNull();
    expect(document.activeElement).toBe(menu(root));

    // Down: rename. Down again skips the disabled "to the right" and lands on "others".
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(root.querySelector('.gl-context-menu > li.gl-active')?.textContent).toBe(
      'Close other tabs',
    );
    await userEvent.keyboard('{ArrowUp}');
    expect(root.querySelector('.gl-context-menu > li.gl-active')?.textContent).toBe('Rename panel');
    await userEvent.keyboard('{ArrowDown}{Enter}');

    expect(ids(layout.getById('left'))).toEqual(['d']);
    expect(menu(root)).toBeNull();
  });

  it('stays inside the layout when opened near its edge', async () => {
    const { root, layout } = await mountWithActions();
    layout.updateItem('right', { headerPosition: 'bottom' });
    await expect.poll(() => item(root, 'right').dataset.header).toBe('bottom');
    layout.resize('row', [6, 1]);
    await expect.poll(() => item(root, 'right').getBoundingClientRect().width).toBeLessThan(130);

    await rightClick(tab(root, 'e'));

    const bounds = root.getBoundingClientRect();
    const box = menu(root)!.getBoundingClientRect();
    expect(box.right).toBeLessThanOrEqual(bounds.right);
    expect(box.bottom).toBeLessThanOrEqual(bounds.bottom);
    expect(box.width).toBeGreaterThan(100);
  });

  it('lets the consumer add, remove and replace entries', async () => {
    const seen: TabMenuContext[] = [];
    const chosen: string[] = [];
    const { root } = await mountWithActions({
      tabContextMenu: (context, defaults) => {
        seen.push(context);
        return [
          ...defaults.filter((entryItem) => entryItem.id !== 'rename'),
          {
            id: 'duplicate',
            label: 'Duplicate',
            separatorBefore: true,
            onSelect: (selected) => chosen.push(`${selected.panel.id}@${selected.index}`),
          },
        ];
      },
    });
    await rightClick(tab(root, 'c'));

    expect(labelsOf(root)).toEqual([
      'Close tabs to the right',
      'Close other tabs',
      'Close all tabs',
      'Duplicate',
    ]);
    const last = seen[seen.length - 1]!;
    expect([last.panel.id, last.stack.id, last.index]).toEqual(['c', 'left', 2]);
    expect(entry(root, 'duplicate').classList.contains('gl-separator')).toBe(true);

    await userEvent.click(entry(root, 'duplicate'));
    expect(chosen).toEqual(['c@2']);
    expect(menu(root)).toBeNull();
  });

  it('shows no menu when the consumer returns no entries', async () => {
    const { root } = await mountWithActions({ tabContextMenu: () => [] });
    await rightClick(tab(root, 'b'));
    expect(menu(root)).toBeNull();
  });

  it('disables renaming in the menu when renaming is off, and uses the labels', async () => {
    const { root } = await mountWithActions({
      settings: { renameEnabled: false },
      labels: { rename: 'Umbenennen', closeAllTabs: 'Alle schließen' },
    });
    await rightClick(tab(root, 'b'));
    expect(disabled(root, 'rename')).toBe(true);
    expect(labelsOf(root)[0]).toBe('Umbenennen');
    expect(labelsOf(root)[3]).toBe('Alle schließen');
  });

  it('re-renders no panel when it opens and closes', async () => {
    const { root } = await mountWithActions();
    const before = { ...renders };
    await rightClick(tab(root, 'b'));
    await userEvent.keyboard('{ArrowDown}{Escape}');
    expect(renders).toEqual(before);
  });
});

describe('stack actions', () => {
  const calls: StackActionsContext[] = [];
  const clicks: string[] = [];
  const renderStackActions = (context: StackActionsContext): ReactNode => {
    calls.push(context);
    return (
      <>
        <button
          type="button"
          className="gl-control add"
          onClick={() => {
            clicks.push(context.stack.id);
            context.layout.addPanel(panel(`n${clicks.length}`), { parent: context.stack.id });
          }}
        >
          +
        </button>
        <span className="active-name">{context.activePanel?.title ?? 'none'}</span>
      </>
    );
  };
  const actionsOf = (root: HTMLElement, stackId: string): HTMLElement | null =>
    item(root, stackId).querySelector('.gl-stack-actions');
  const callsFor = (stackId: string): StackActionsContext[] =>
    calls.filter((call) => call.stack.id === stackId);

  it('renders between the tabs and the built-in buttons', async () => {
    const { root } = await mount({ renderStackActions });
    const area = actionsOf(root, 'left')!.getBoundingClientRect();
    const tabs = item(root, 'left').querySelector('.gl-tabs')!.getBoundingClientRect();
    const controls = item(root, 'left').querySelector('.gl-controls')!.getBoundingClientRect();
    expect(area.left).toBeGreaterThanOrEqual(tabs.right - 1);
    expect(area.right).toBeLessThanOrEqual(controls.left + 1);
    expect(area.width).toBeGreaterThan(10);
    expect(root.querySelectorAll('.gl-stack-actions')).toHaveLength(2);
  });

  it('receives the stack, its active panel, the handle and the maximized flag', async () => {
    calls.length = 0;
    const { root, layout } = await mount({ renderStackActions });
    const first = callsFor('left')[0]!;
    expect(first.layout).toBe(layout);
    expect(first.activePanel?.id).toBe('a');
    expect(first.maximized).toBe(false);
    expect(actionsOf(root, 'left')!.querySelector('.active-name')!.textContent).toBe('A');

    layout.setActive('c');
    await expect
      .poll(() => actionsOf(root, 'left')!.querySelector('.active-name')!.textContent)
      .toBe('C');

    layout.maximize('left');
    await expect.poll(() => callsFor('left').at(-1)!.maximized).toBe(true);
  });

  it('is not called again for a change in a different stack', async () => {
    calls.length = 0;
    const { layout, root } = await mount({ renderStackActions });
    const before = callsFor('right').length;

    layout.setActive('c');
    layout.setTitle('b', 'Bee');
    await expect.poll(() => titleOf(root, 'b')).toBe('Bee');

    expect(callsFor('right')).toHaveLength(before);
    expect(callsFor('left').length).toBeGreaterThan(1);
  });

  it('runs its own handlers without dragging or selecting the stack', async () => {
    clicks.length = 0;
    const { root, layout } = await mount({
      renderStackActions,
      settings: { selectionEnabled: true },
    });
    await userEvent.click(actionsOf(root, 'left')!.querySelector('.add')!);

    expect(clicks).toEqual(['left']);
    expect(ids(layout.getById('left'))).toEqual(['a', 'b', 'c', 'd', 'n1']);
    expect((layout.getById('left') as StackNode).activeId).toBe('n1');
    expect(layout.getState().selectedId).toBeNull();

    const start = centerOf(actionsOf(root, 'left')!.querySelector('.active-name')!);
    const structure = layout.getState().root;
    await mouseDrag(start, { x: start.x + 300, y: start.y + 300 }, { release: false });
    expect(root.querySelector('.gl-drag-proxy')).toBeNull();
    await mouseUp();
    expect(layout.getState().root).toBe(structure);
    expect(layout.getState().selectedId).toBeNull();
  });

  it('takes its space from the tab strip, bringing up the overflow chevron', async () => {
    const wide = (): ReactNode => <div style={{ width: 300, height: 10 }} />;
    const { root } = await mount({ renderStackActions: wide });
    const tabs = item(root, 'left').querySelector('.gl-tabs')!;
    expect(tabs.getBoundingClientRect().width).toBeLessThan(60);
    await expect.poll(() => item(root, 'left').querySelector('.gl-tab-dropdown')).not.toBeNull();
  });

  it('renders nothing when the callback returns null, or when headers are off', async () => {
    const none = await mount({ renderStackActions: () => null });
    expect(none.root.querySelector('.gl-stack-actions')).toBeNull();
    await none.unmount();

    const headless = await mount({ renderStackActions, settings: { hasHeaders: false } });
    expect(headless.root.querySelector('.gl-stack-actions')).toBeNull();
  });

  it('works with the header on each side and stays out of the drag proxy', async () => {
    const { root, layout } = await mount({ renderStackActions });
    for (const side of ['bottom', 'left', 'right', 'top'] as const) {
      layout.updateItem('right', { headerPosition: side });
      await expect.poll(() => item(root, 'right').dataset.header).toBe(side);
      const header = item(root, 'right').querySelector('.gl-header')!.getBoundingClientRect();
      const area = actionsOf(root, 'right')!.getBoundingClientRect();
      expect(area.left).toBeGreaterThanOrEqual(header.left - 1);
      expect(area.right).toBeLessThanOrEqual(header.right + 1);
      expect(area.top).toBeGreaterThanOrEqual(header.top - 1);
      expect(area.bottom).toBeLessThanOrEqual(header.bottom + 1);
    }

    const start = centerOf(tab(root, 'b').querySelector('.gl-title')!);
    await mouseDrag(start, { x: start.x + 200, y: start.y + 200 }, { release: false });
    expect(root.querySelector('.gl-drag-proxy')).not.toBeNull();
    expect(root.querySelector('.gl-drag-proxy .gl-stack-actions')).toBeNull();
    await userEvent.keyboard('{Escape}');
    await mouseUp();
  });

  it('re-renders no panel when the actions area re-renders', async () => {
    const { layout, rerender } = await mount({ renderStackActions });
    const before = { ...renders };

    layout.setActive('b');
    await rerender({ renderStackActions: (context) => renderStackActions(context) });

    expect(renders).toEqual(before);
  });
});

import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { getIndex } from '../model/tree';
import type { LayoutState } from '../model/types';
import type { Labels, Settings } from '../settings';
import type { Layout } from '../store';
import { ChromeContext, useLayoutContext } from './context';
import type { ChromeContextValue, TabMenuContext, TabMenuItem } from './context';
import { useLayoutSelector } from './hooks';
import type { TabMenuState } from './ui';

/** The panel, its stack and its position, or `null` if the panel is gone. */
export function tabMenuContext(
  layout: Layout,
  state: LayoutState,
  panelId: string,
): TabMenuContext | null {
  const entry = getIndex(state.root).get(panelId);
  if (!entry || entry.node.type !== 'panel' || entry.parent?.type !== 'stack') return null;
  return {
    layout,
    panel: entry.node,
    stack: entry.parent,
    index: entry.parent.children.indexOf(entry.node),
  };
}

/** The built-in entries. Each acts on the tab's own stack and skips non-closable panels. */
export function defaultTabMenuItems(
  context: TabMenuContext,
  labels: Labels,
  settings: Settings,
): TabMenuItem[] {
  const { panel, stack, index } = context;
  const closable = (from: number, except?: string): string[] =>
    stack.children
      .slice(from)
      .filter((tab) => tab.closable !== false && tab.id !== except)
      .map((tab) => tab.id);
  const toRight = closable(index + 1);
  const others = closable(0, panel.id);
  const all = closable(0);
  return [
    {
      id: 'rename',
      label: labels.rename,
      disabled: !settings.renameEnabled || panel.renamable === false,
      onSelect: ({ layout }) => layout.startRename(panel.id),
    },
    {
      id: 'closeTabsToRight',
      label: labels.closeTabsToRight,
      separatorBefore: true,
      disabled: toRight.length === 0,
      onSelect: ({ layout }) => layout.closeItems(toRight),
    },
    {
      id: 'closeOtherTabs',
      label: labels.closeOtherTabs,
      disabled: others.length === 0,
      onSelect: ({ layout }) => layout.closeItems(others),
    },
    {
      id: 'closeAllTabs',
      label: labels.closeAllTabs,
      disabled: all.length === 0,
      onSelect: ({ layout }) => layout.closeItems(all),
    },
  ];
}

export function tabMenuItems(
  context: TabMenuContext,
  labels: Labels,
  settings: Settings,
  chrome: ChromeContextValue,
): TabMenuItem[] {
  const defaults = defaultTabMenuItems(context, labels, settings);
  return chrome.tabContextMenu ? chrome.tabContextMenu(context, defaults) : defaults;
}

function OpenMenu({ menu }: { menu: TabMenuState }): ReactNode {
  const { layout, ui, view, drag, labels, settings } = useLayoutContext();
  const chrome = useContext(ChromeContext);
  const context = useLayoutSelector(
    (state) => tabMenuContext(layout, state, menu.panelId),
    (a, b) => a?.panel === b?.panel && a?.stack === b?.stack,
  );
  const items = context ? tabMenuItems(context, labels, settings, chrome) : [];
  const [active, setActive] = useState(-1);
  const element = useRef<HTMLUListElement | null>(null);

  // Keep the menu inside the layout, then take focus so the keyboard works at once.
  useLayoutEffect(() => {
    const list = element.current;
    const root = view.root;
    if (!list || !root) return;
    const bounds = root.getBoundingClientRect();
    const originX = bounds.left + root.clientLeft;
    const originY = bounds.top + root.clientTop;
    const left = Math.max(0, Math.min(menu.x - originX, root.clientWidth - list.offsetWidth));
    const top = Math.max(0, Math.min(menu.y - originY, root.clientHeight - list.offsetHeight));
    list.style.left = `${left}px`;
    list.style.top = `${top}px`;
    list.focus();
  }, [menu, view]);

  useEffect(() => {
    const close = (): void => ui.closeMenu();
    const onPointerDown = (event: PointerEvent): void => {
      if (!element.current?.contains(event.target as Node)) close();
    };
    const doc = view.root?.ownerDocument ?? document;
    doc.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    // A menu describes the layout as it was when it opened: any change makes it stale.
    const offLayout = layout.subscribe(close);
    const offDrag = drag.subscribe(() => {
      if (drag.getSnapshot().active) close();
    });
    return () => {
      doc.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
      offLayout();
      offDrag();
    };
  }, [ui, view, layout, drag]);

  if (!context || items.length === 0) return null;

  const focusTab = (): void => {
    view.root
      ?.querySelector<HTMLElement>(`.gl-tab[data-panel-id="${CSS.escape(menu.panelId)}"]`)
      ?.focus();
  };
  const choose = (item: TabMenuItem): void => {
    if (item.disabled) return;
    ui.closeMenu();
    item.onSelect(context);
  };
  const move = (step: 1 | -1): void => {
    if (items.every((item) => item.disabled)) return;
    let next = active;
    do {
      next = (next + step + items.length) % items.length;
    } while (items[next]?.disabled);
    setActive(next);
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      ui.closeMenu();
      focusTab();
    } else if (event.key === 'ArrowDown') {
      move(1);
    } else if (event.key === 'ArrowUp') {
      move(-1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      const item = items[active];
      if (item) choose(item);
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <ul
      className="gl-context-menu"
      role="menu"
      tabIndex={-1}
      ref={element}
      data-panel-id={menu.panelId}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item, index) => {
        let className = '';
        if (item.separatorBefore && index > 0) className += ' gl-separator';
        if (index === active) className += ' gl-active';
        return (
          <li
            key={item.id}
            role="menuitem"
            className={className.trim() || undefined}
            aria-disabled={item.disabled ? true : undefined}
            data-item-id={item.id}
            onPointerMove={() => {
              if (!item.disabled && active !== index) setActive(index);
            }}
            onClick={() => choose(item)}
          >
            {item.label}
          </li>
        );
      })}
    </ul>
  );
}

/** The open tab menu, if any. Rendered in the overlay, above the panels. */
export function TabContextMenu(): ReactNode {
  const { ui } = useLayoutContext();
  const menu = useSyncExternalStore(ui.subscribe, ui.getMenu, ui.getMenu);
  if (!menu) return null;
  return <OpenMenu key={`${menu.panelId}:${menu.x}:${menu.y}`} menu={menu} />;
}

import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type {
  KeyboardEvent,
  MouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { PanelNode, StackNode } from '../model/types';
import { formatLabel } from '../settings';
import { ChromeContext, useLayoutContext } from './context';
import { useLayoutSelector } from './hooks';
import { CloseIcon, DropdownIcon, MaximizeIcon, MinimizeIcon } from './icons';
import { tabMenuContext, tabMenuItems } from './TabContextMenu';

interface TitleEditorProps {
  panel: PanelNode;
  onDone: (refocus: boolean) => void;
}

/** The text field a tab title turns into while it is being renamed. */
function TitleEditor({ panel, onDone }: TitleEditorProps): ReactNode {
  const { layout } = useLayoutContext();
  const [value, setValue] = useState(panel.title);
  const finished = useRef(false);

  const finish = (commit: boolean, refocus: boolean): void => {
    // Enter is followed by a blur as the field goes away: only the first one counts.
    if (finished.current) return;
    finished.current = true;
    const title = value.trim();
    if (commit && title !== '' && title !== panel.title) layout.setTitle(panel.id, title);
    onDone(refocus);
  };

  return (
    <input
      className="gl-title-input"
      type="text"
      aria-label={panel.title}
      value={value}
      size={Math.max(value.length, 1)}
      autoFocus
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => finish(true, false)}
      onKeyDown={(event) => {
        // Keys typed here belong to the field, not to the tab around it.
        event.stopPropagation();
        if (event.key === 'Enter') finish(true, true);
        else if (event.key === 'Escape') finish(false, true);
      }}
      // A press inside the field must not activate, drag or select anything.
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.stopPropagation()}
    />
  );
}

interface TabProps {
  panel: PanelNode;
  active: boolean;
}

const Tab = memo(function Tab({ panel, active }: TabProps): ReactNode {
  const { layout, labels, settings, drag, ui } = useLayoutContext();
  const chrome = useContext(ChromeContext);
  const editing = useSyncExternalStore(
    ui.subscribe,
    () => ui.getRenaming() === panel.id,
    () => false,
  );
  const element = useRef<HTMLDivElement | null>(null);
  const closable = panel.closable !== false;
  const reorderable = settings.reorderEnabled && panel.reorderable !== false;
  const renamable = settings.renameEnabled && panel.renamable !== false;
  const closeLabel = formatLabel(labels.close, panel.title);

  /** Opens the tab menu, unless the consumer has emptied it. Returns whether it opened. */
  const openMenu = (x: number, y: number): boolean => {
    const context = tabMenuContext(layout, layout.getState(), panel.id);
    if (!context || tabMenuItems(context, labels, settings, chrome).length === 0) return false;
    ui.openMenu({ panelId: panel.id, x, y });
    return true;
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    // Keys pressed on something inside the tab, such as its close button, belong to that.
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      layout.setActive(panel.id);
    } else if (event.key === 'F2' && renamable) {
      event.preventDefault();
      ui.startRename(panel.id);
    } else if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      const rect = event.currentTarget.getBoundingClientRect();
      if (openMenu(rect.left, rect.bottom)) event.preventDefault();
    }
  };
  const onAuxClick = (event: MouseEvent): void => {
    // Middle click closes, as in browsers.
    if (event.button === 1 && closable) layout.closeItem(panel.id);
  };
  const onContextMenu = (event: MouseEvent): void => {
    // A menu opened from the keyboard reports no pointer position: use the tab's corner.
    const rect = event.currentTarget.getBoundingClientRect();
    const fromKeyboard = event.clientX === 0 && event.clientY === 0;
    const opened = fromKeyboard
      ? openMenu(rect.left, rect.bottom)
      : openMenu(event.clientX, event.clientY);
    if (opened) event.preventDefault();
  };

  let className = 'gl-tab';
  if (active) className += ' gl-active';
  if (editing) className += ' gl-editing';

  return (
    <div
      className={className}
      role="tab"
      aria-selected={active}
      tabIndex={0}
      title={editing ? undefined : panel.title}
      ref={element}
      data-panel-id={panel.id}
      data-reorderable={reorderable}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        layout.setActive(panel.id);
        if (reorderable && !editing) drag.begin(event.nativeEvent, { kind: 'item', id: panel.id });
      }}
      onDoubleClick={() => {
        if (renamable) ui.startRename(panel.id);
      }}
      onKeyDown={onKeyDown}
      onAuxClick={onAuxClick}
      onContextMenu={onContextMenu}
    >
      {editing ? (
        <TitleEditor
          panel={panel}
          onDone={(refocus) => {
            ui.stopRename();
            if (refocus) element.current?.focus();
          }}
        />
      ) : (
        <span className="gl-title">{panel.title}</span>
      )}
      {closable && (
        <button
          type="button"
          className="gl-tab-close"
          title={closeLabel}
          aria-label={closeLabel}
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            layout.closeItem(panel.id);
          }}
        >
          <CloseIcon />
        </button>
      )}
    </div>
  );
});

/** The consumer's own controls for a stack, to the left of the built-in buttons. */
function StackActions({ stack, maximized }: { stack: StackNode; maximized: boolean }): ReactNode {
  const { layout } = useLayoutContext();
  const { renderStackActions } = useContext(ChromeContext);
  if (!renderStackActions) return null;
  const activePanel = stack.children.find((panel) => panel.id === stack.activeId) ?? null;
  const content = renderStackActions({ layout, stack, activePanel, maximized });
  if (content === null || content === undefined || content === false) return null;
  return <div className="gl-stack-actions">{content}</div>;
}

interface TabMenuProps {
  stack: StackNode;
  anchor: HTMLElement;
  onClose: () => void;
}

/** The list of all tabs of a stack, shown when they do not fit in the header. */
function TabMenu({ stack, anchor, onClose }: TabMenuProps): ReactNode {
  const { layout, view } = useLayoutContext();
  const menuRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !anchor.contains(target)) onClose();
    };
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [anchor, onClose]);

  const overlay = view.overlay;
  const root = view.root;
  if (!overlay || !root) return null;
  const rootRect = root.getBoundingClientRect();
  const rect = anchor.getBoundingClientRect();
  // Rendered in the overlay, above the panel layer, so panels cannot cover it.
  return createPortal(
    <ul
      className="gl-tab-menu"
      role="menu"
      ref={menuRef}
      style={{
        top: rect.bottom - rootRect.top - root.clientTop,
        right: rootRect.right - rect.right - root.clientLeft,
      }}
    >
      {stack.children.map((panel) => (
        <li
          key={panel.id}
          role="menuitem"
          className={panel.id === stack.activeId ? 'gl-active' : undefined}
          data-panel-id={panel.id}
          onClick={() => {
            layout.setActive(panel.id);
            onClose();
          }}
        >
          {panel.title}
        </li>
      ))}
    </ul>,
    overlay,
  );
}

/** Scrolls the tab strip, and nothing else, so that the tab is fully in view. */
function revealTab(strip: HTMLElement, tab: HTMLElement): void {
  const stripRect = strip.getBoundingClientRect();
  const tabRect = tab.getBoundingClientRect();
  // The leading edge wins when the tab is larger than the strip.
  if (tabRect.right > stripRect.right) strip.scrollLeft += tabRect.right - stripRect.right;
  if (tabRect.left - Math.max(0, tabRect.right - stripRect.right) < stripRect.left) {
    strip.scrollLeft -= stripRect.left - tab.getBoundingClientRect().left;
  }
  if (tabRect.bottom > stripRect.bottom) strip.scrollTop += tabRect.bottom - stripRect.bottom;
  if (tabRect.top - Math.max(0, tabRect.bottom - stripRect.bottom) < stripRect.top) {
    strip.scrollTop -= stripRect.top - tab.getBoundingClientRect().top;
  }
}

export function Header({ stack }: { stack: StackNode }): ReactNode {
  const { layout, settings, labels, drag } = useLayoutContext();
  const maximized = useLayoutSelector((state) => state.maximizedId === stack.id);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const closeMenu = useCallback(() => setMenuAnchor(null), []);

  // Tabs that do not fit are reachable through the dropdown; the active one is kept in view.
  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const measure = (): void => {
      setOverflowing(
        strip.scrollWidth > strip.clientWidth + 1 || strip.scrollHeight > strip.clientHeight + 1,
      );
      const active = strip.querySelector<HTMLElement>('.gl-tab.gl-active');
      if (active) revealTab(strip, active);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [stack.children, stack.activeId]);

  const onClick = (event: MouseEvent): void => {
    if (!settings.selectionEnabled) return;
    // Only the header's own background selects, not its tabs or buttons.
    if (event.target === event.currentTarget || event.target === stripRef.current) {
      layout.select(stack.id);
    }
  };

  // Dragging the header's own background moves the whole stack.
  const onPointerDown = (event: ReactPointerEvent): void => {
    if (event.button !== 0 || !settings.reorderEnabled) return;
    if (event.target !== event.currentTarget && event.target !== stripRef.current) return;
    if (stack.children.length === 0 || layout.getState().root?.id === stack.id) return;
    if (stack.children.some((panel) => panel.reorderable === false)) return;
    drag.begin(event.nativeEvent, { kind: 'item', id: stack.id });
  };

  const activeTitle = stack.children.find((panel) => panel.id === stack.activeId)?.title;
  const maximizeLabel = formatLabel(maximized ? labels.minimize : labels.maximize, activeTitle);

  const stackClosable =
    stack.closable !== false && stack.children.every((panel) => panel.closable !== false);

  return (
    <div
      className={settings.selectionEnabled ? 'gl-header gl-selectable' : 'gl-header'}
      data-stack-id={stack.id}
      onClick={onClick}
      onPointerDown={onPointerDown}
    >
      <div className="gl-tabs" role="tablist" ref={stripRef}>
        {stack.children.map((panel) => (
          <Tab key={panel.id} panel={panel} active={panel.id === stack.activeId} />
        ))}
      </div>
      <StackActions stack={stack} maximized={maximized} />
      <div className="gl-controls">
        {overflowing && (
          <button
            type="button"
            className="gl-control gl-tab-dropdown"
            title={labels.tabDropdown}
            aria-label={labels.tabDropdown}
            aria-haspopup="menu"
            aria-expanded={menuAnchor !== null}
            onClick={(event) => {
              const button = event.currentTarget;
              setMenuAnchor((open) => (open ? null : button));
            }}
          >
            <DropdownIcon />
          </button>
        )}
        {settings.showMaximizeIcon && (
          <button
            type="button"
            className="gl-control gl-maximize"
            title={maximizeLabel}
            aria-label={maximizeLabel}
            onClick={() => layout.toggleMaximize(stack.id)}
          >
            {maximized ? <MinimizeIcon /> : <MaximizeIcon />}
          </button>
        )}
        {settings.showCloseIcon && stackClosable && (
          <button
            type="button"
            className="gl-control gl-close"
            title={labels.closeStack}
            aria-label={labels.closeStack}
            onClick={() => layout.closeItem(stack.id)}
          >
            <CloseIcon />
          </button>
        )}
      </div>
      {overflowing && menuAnchor && (
        <TabMenu stack={stack} anchor={menuAnchor} onClose={closeMenu} />
      )}
    </div>
  );
}

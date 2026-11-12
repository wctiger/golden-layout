import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
  KeyboardEvent,
  MouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { PanelNode, StackNode } from '../model/types';
import { useLayoutContext } from './context';
import { useLayoutSelector } from './hooks';
import { CloseIcon, DropdownIcon, MaximiseIcon, MinimiseIcon } from './icons';

interface TabProps {
  panel: PanelNode;
  active: boolean;
}

const Tab = memo(function Tab({ panel, active }: TabProps): ReactNode {
  const { layout, labels, settings, drag } = useLayoutContext();
  const closable = panel.closable !== false;
  const reorderable = settings.reorderEnabled && panel.reorderable !== false;

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      layout.setActive(panel.id);
    }
  };
  const onAuxClick = (event: MouseEvent): void => {
    // Middle click closes, as in browsers.
    if (event.button === 1 && closable) layout.closeItem(panel.id);
  };

  return (
    <div
      className={active ? 'gl-tab gl-active' : 'gl-tab'}
      role="tab"
      aria-selected={active}
      tabIndex={0}
      title={panel.title}
      data-panel-id={panel.id}
      data-reorderable={reorderable}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        layout.setActive(panel.id);
        if (reorderable) drag.begin(event.nativeEvent, { kind: 'item', id: panel.id });
      }}
      onKeyDown={onKeyDown}
      onAuxClick={onAuxClick}
    >
      <span className="gl-title">{panel.title}</span>
      {closable && (
        <button
          type="button"
          className="gl-tab-close"
          title={labels.close}
          aria-label={`${labels.close} ${panel.title}`}
          onPointerDown={(event) => event.stopPropagation()}
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
  const maximised = useLayoutSelector((state) => state.maximisedId === stack.id);
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
        {settings.showMaximiseIcon && (
          <button
            type="button"
            className="gl-control gl-maximise"
            title={maximised ? labels.minimise : labels.maximise}
            aria-label={maximised ? labels.minimise : labels.maximise}
            onClick={() => layout.toggleMaximise(stack.id)}
          >
            {maximised ? <MinimiseIcon /> : <MaximiseIcon />}
          </button>
        )}
        {settings.showCloseIcon && stackClosable && (
          <button
            type="button"
            className="gl-control gl-close"
            title={labels.close}
            aria-label={labels.close}
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

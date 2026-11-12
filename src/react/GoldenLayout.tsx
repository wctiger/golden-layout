import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { Action, LayoutConfig, LayoutState } from '../model/types';
import { resolveLabels, resolveSettings } from '../settings';
import type { Labels, Settings } from '../settings';
import { createLayout } from '../store';
import type { Layout } from '../store';
import { ChromeContext, LayoutContext, useLayoutContext } from './context';
import type {
  ChromeContextValue,
  ComponentRegistry,
  LayoutContextValue,
  StackActionsContext,
  TabMenuContext,
  TabMenuItem,
} from './context';
import { useLayoutSelector } from './hooks';
import { NodeView } from './NodeView';
import { PanelLayer } from './PanelLayer';
import { TabContextMenu } from './TabContextMenu';
import { UiStore } from './ui';
import { DragController } from './drag/DragController';
import { DragOverlay } from './drag/DragOverlay';
import { registerDragController } from './drag/useDragSource';
import { LayoutView } from './view';

export interface GoldenLayoutProps {
  /** A handle from `createLayout`, for driving the layout from outside React. */
  layout?: Layout;
  /** The starting layout, when no `layout` handle is passed. Read once. */
  initialLayout?: LayoutConfig;
  /** The components panels can render, by the name used in `panel.component`. */
  components: ComponentRegistry;
  /** Called after every change with the new state and the action that caused it. */
  onChange?: (state: LayoutState, action: Action) => void;
  /** Called when a panel throws while rendering. The panel shows the error message. */
  onPanelError?: (error: unknown, panelId: string) => void;
  /**
   * Renders your own controls in each stack header, to the left of the built-in buttons.
   * Called as a function, once per stack: do not use hooks directly inside it.
   */
  renderStackActions?: (context: StackActionsContext) => ReactNode;
  /**
   * Customises the menu opened by right-clicking a tab. Receives the built-in entries and
   * returns the entries to show; an empty array leaves the browser's own menu in place.
   */
  tabContextMenu?: (context: TabMenuContext, defaults: TabMenuItem[]) => TabMenuItem[];
  settings?: Partial<Settings>;
  labels?: Partial<Labels>;
  className?: string;
  style?: CSSProperties;
}

function shallowEqual(a: object, b: object): boolean {
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.is(left[key], right[key]))
  );
}

/** Keeps the previous object while the new one has the same entries, so context stays stable. */
function useShallowStable<T extends object>(value: T): T {
  const [stable, setStable] = useState(value);
  if (stable === value || shallowEqual(stable, value)) return stable;
  setStable(value);
  return value;
}

/** Re-lays the panels over their slots after every commit that follows a layout change. */
function Positioner(): ReactNode {
  const { layout, view } = useLayoutContext();
  useSyncExternalStore(layout.subscribe, layout.getState, layout.getState);
  useLayoutEffect(() => {
    view.reposition();
  });
  return null;
}

function Frame(): ReactNode {
  const rootId = useLayoutSelector((state) => state.root?.id ?? null);
  const maximized = useLayoutSelector((state) => state.maximizedId !== null);
  // The whole frame stays mounted while a stack is maximized: CSS lifts that stack over the
  // rest, so maximizing and restoring is a class change rather than a remount.
  return (
    <div className={maximized ? 'gl-frame gl-has-maximized' : 'gl-frame'}>
      {rootId === null ? <div className="gl-empty" /> : <NodeView id={rootId} />}
    </div>
  );
}

/**
 * Renders a layout: rows, columns and tabbed stacks of panels. Give it a size through
 * CSS (it fills its parent by default) and import `golden-layout/style.css`.
 */
export const GoldenLayout = forwardRef<Layout, GoldenLayoutProps>(
  function GoldenLayout(props, ref): ReactNode {
    const [ownLayout] = useState(() => props.layout ?? createLayout(props.initialLayout));
    const layout = props.layout ?? ownLayout;
    useImperativeHandle(ref, () => layout, [layout]);

    const view = useMemo(() => new LayoutView(layout.getState), [layout]);
    const drag = useMemo(() => new DragController(layout, view), [layout, view]);
    const ui = useMemo(() => new UiStore(), []);
    const components = useShallowStable(props.components);
    const settings = useShallowStable(resolveSettings(props.settings));
    const labels = useShallowStable(resolveLabels(props.labels));

    const callbacks = useRef({ onChange: props.onChange, onPanelError: props.onPanelError });
    useLayoutEffect(() => {
      callbacks.current = { onChange: props.onChange, onPanelError: props.onPanelError };
    });

    useEffect(
      () => layout.subscribe((state, action) => callbacks.current.onChange?.(state, action)),
      [layout],
    );

    const overlayRef = useCallback(
      (element: HTMLDivElement | null) => view.setOverlay(element),
      [view],
    );
    useLayoutEffect(() => {
      drag.setSettings(settings);
    }, [drag, settings]);
    useEffect(() => {
      const unregister = registerDragController(layout, drag);
      return () => {
        drag.cancel();
        unregister();
      };
    }, [layout, drag]);

    // layout.startRename() reaches the mounted view through here.
    useEffect(
      () =>
        layout.onRenameRequest((id) => {
          const node = layout.getById(id);
          if (node?.type === 'panel' && settings.renameEnabled && node.renamable !== false) {
            ui.startRename(id);
          }
        }),
      [layout, ui, settings],
    );

    const { renderStackActions, tabContextMenu } = props;
    const chrome = useMemo<ChromeContextValue>(
      () => ({ renderStackActions, tabContextMenu }),
      [renderStackActions, tabContextMenu],
    );

    const rootRef = useRef<HTMLDivElement | null>(null);
    useLayoutEffect(() => {
      view.setRoot(rootRef.current);
      // Child effects ran before the root element was known, so lay the panels out now.
      view.reposition();
      return () => {
        view.setRoot(null);
        view.dispose();
      };
    }, [view]);

    const context = useMemo<LayoutContextValue>(
      () => ({
        layout,
        view,
        drag,
        ui,
        components,
        settings,
        labels,
        onPanelError: (error, panelId) => callbacks.current.onPanelError?.(error, panelId),
      }),
      [layout, view, drag, ui, components, settings, labels],
    );

    const className = props.className ? `gl-root ${props.className}` : 'gl-root';
    return (
      <LayoutContext.Provider value={context}>
        <ChromeContext.Provider value={chrome}>
          <div className={className} style={props.style} ref={rootRef}>
            <Frame />
            <PanelLayer />
            <div className="gl-overlay" ref={overlayRef}>
              <TabContextMenu />
              <DragOverlay />
            </div>
            <Positioner />
          </div>
        </ChromeContext.Provider>
      </LayoutContext.Provider>
    );
  },
);

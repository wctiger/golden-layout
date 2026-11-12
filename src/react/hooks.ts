import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useSyncExternalStore } from 'react';
import { getIndex } from '../model/tree';
import type { LayoutState, PanelNode } from '../model/types';
import type { Layout } from '../store';
import { PanelContext, useLayoutContext } from './context';

/** The handle of the surrounding layout: dispatch actions, run queries, read state. */
export function useGoldenLayout(): Layout {
  return useLayoutContext().layout;
}

/**
 * Subscribes to a slice of layout state. The component re-renders only when the selected
 * value changes (compared with `isEqual`, `Object.is` by default).
 */
export function useLayoutSelector<T>(
  selector: (state: LayoutState) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const { layout } = useLayoutContext();
  const cache = useRef<{ state: LayoutState; selector: typeof selector; value: T } | null>(null);

  const getSnapshot = (): T => {
    const state = layout.getState();
    const cached = cache.current;
    if (cached && cached.state === state && cached.selector === selector) return cached.value;
    const selected = selector(state);
    const value = cached && isEqual(cached.value, selected) ? cached.value : selected;
    cache.current = { state, selector, value };
    return value;
  };

  return useSyncExternalStore(layout.subscribe, getSnapshot, getSnapshot);
}

/** The id of the panel this component is rendered in. */
export function usePanelId(): string {
  const id = useContext(PanelContext);
  if (id === null) throw new Error('This hook must be used inside a panel of <GoldenLayout>');
  return id;
}

function panelOf(state: LayoutState, id: string): PanelNode | undefined {
  const node = getIndex(state.root).get(id)?.node;
  return node?.type === 'panel' ? node : undefined;
}

/**
 * `useState`, but the value lives in the panel's `state` field in the layout, so it is
 * saved and restored with the layout and survives the panel being moved.
 * The value must be serializable.
 */
export function usePanelState<S>(
  initial: S | (() => S),
): [S, (next: S | ((previous: S) => S)) => void] {
  const id = usePanelId();
  const { layout } = useLayoutContext();
  const [fallback] = useState(initial);
  const stored = useLayoutSelector((state) => panelOf(state, id)?.state);
  const value = stored === undefined ? fallback : (stored as S);

  const setValue = useCallback(
    (next: S | ((previous: S) => S)) => {
      layout.setPanelState<S | undefined>(id, (previous) => {
        const current = previous === undefined ? fallback : previous;
        return typeof next === 'function' ? (next as (previous: S) => S)(current) : next;
      });
    },
    [layout, id, fallback],
  );

  return [value, setValue];
}

/** True while the panel is the active tab of its stack and not hidden behind a maximised stack. */
export function usePanelVisible(): boolean {
  const id = usePanelId();
  return useLayoutSelector((state) => {
    const stack = getIndex(state.root).get(id)?.parent;
    if (stack?.type !== 'stack' || stack.activeId !== id) return false;
    return state.maximisedId === null || state.maximisedId === stack.id;
  });
}

export interface PanelSize {
  width: number;
  height: number;
}

/**
 * The panel's current size in pixels. Re-renders the panel when it changes.
 * It is `0 x 0` for the very first render, before the panel has been laid out.
 */
export function usePanelSize(): PanelSize {
  const id = usePanelId();
  const { view } = useLayoutContext();
  const [size, setSize] = useState<PanelSize>({ width: 0, height: 0 });

  // A passive effect: by then the host element is attached and laid over its slot.
  useEffect(() => {
    const host = view.getHost(id);
    if (!host) return;
    const measure = (): void => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      setSize((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, [view, id]);

  return size;
}

export interface PanelApi {
  id: string;
  setTitle(title: string): void;
  /** Closes the panel unless it is marked `closable: false`. */
  close(): void;
  /** Makes the panel the active tab of its stack. */
  activate(): void;
  toggleMaximise(): void;
}

/** Actions for the panel this component is rendered in. The returned object is stable. */
export function usePanel(): PanelApi {
  const id = usePanelId();
  const { layout } = useLayoutContext();
  return useMemo(
    () => ({
      id,
      setTitle: (title: string) => layout.setTitle(id, title),
      close: () => layout.closeItem(id),
      activate: () => layout.setActive(id),
      toggleMaximise: () => layout.toggleMaximise(id),
    }),
    [layout, id],
  );
}

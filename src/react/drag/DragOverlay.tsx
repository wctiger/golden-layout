import { useCallback, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { useLayoutContext } from '../context';

/**
 * Draws the drop indicator and the drag proxy. This is the only component that renders
 * while the pointer moves during a drag.
 */
export function DragOverlay(): ReactNode {
  const { drag, view } = useLayoutContext();
  const state = useSyncExternalStore(drag.subscribe, drag.getSnapshot, drag.getSnapshot);
  const body = useRef<HTMLDivElement | null>(null);
  const proxyRef = useCallback(
    (element: HTMLDivElement | null) => {
      drag.setProxyElement(element);
    },
    [drag],
  );

  // The dragged panel itself is shown inside the proxy: its host follows the proxy body.
  // Outside a drag there is nothing to do, so an idle layout pays nothing here.
  const wasActive = useRef(false);
  useLayoutEffect(() => {
    if (!state.active && !wasActive.current) return;
    wasActive.current = state.active;
    view.setDragOverride(
      state.active && state.previewPanelId !== null && body.current
        ? { panelId: state.previewPanelId, element: body.current }
        : null,
    );
    view.reposition();
  });

  if (!state.active) return null;
  return (
    <>
      {state.indicator && (
        <div
          className="gl-drop-indicator"
          style={{
            left: state.indicator.left,
            top: state.indicator.top,
            width: state.indicator.width,
            height: state.indicator.height,
          }}
        />
      )}
      <div className="gl-drag-proxy" ref={proxyRef} style={{ left: state.x, top: state.y }}>
        <div className="gl-drag-proxy-header">
          <div className="gl-tab gl-active">
            <span className="gl-title">{state.title}</span>
          </div>
        </div>
        <div className="gl-drag-proxy-content" ref={body} />
      </div>
    </>
  );
}

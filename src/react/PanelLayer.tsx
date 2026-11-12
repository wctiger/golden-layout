import { Component, memo, useCallback } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { getIndex } from '../model/tree';
import type { LayoutState } from '../model/types';
import { LayoutError } from '../model/types';
import { PanelContext, useLayoutContext } from './context';
import { useLayoutSelector } from './hooks';

interface BoundaryProps {
  panelId: string;
  onError: ((error: unknown, panelId: string) => void) | undefined;
  children: ReactNode;
}

/** Contains a crash to the panel it happened in; the rest of the layout keeps working. */
class PanelErrorBoundary extends Component<BoundaryProps, { error: unknown }> {
  override state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown): { error: unknown } {
    return { error };
  }

  override componentDidCatch(error: unknown, _info: ErrorInfo): void {
    this.props.onError?.(error, this.props.panelId);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;
    const message = error instanceof Error ? error.message : 'This panel failed to render';
    return (
      <div className="gl-panel-error" role="alert">
        {message}
      </div>
    );
  }
}

function PanelContent({ id }: { id: string }): ReactNode {
  const { components } = useLayoutContext();
  const panel = useLayoutSelector(
    (state) => {
      const node = getIndex(state.root).get(id)?.node;
      return node?.type === 'panel' ? { component: node.component, props: node.props } : null;
    },
    (a, b) => a?.component === b?.component && a?.props === b?.props,
  );
  if (!panel) return null;
  const Registered = components[panel.component];
  if (!Registered) {
    throw new LayoutError(
      `Panel "${id}" uses component "${panel.component}", which is not in the components ` +
        `registry passed to <GoldenLayout>. Registered: ${Object.keys(components).join(', ') || '(none)'}`,
    );
  }
  return <Registered {...panel.props} />;
}

/**
 * One panel. Hosts are siblings in a flat list keyed by panel id, so a panel keeps its
 * React state, DOM and scroll position wherever it moves in the layout tree.
 */
const PanelHost = memo(function PanelHost({ id }: { id: string }): ReactNode {
  const { view, onPanelError } = useLayoutContext();
  const ref = useCallback(
    (element: HTMLDivElement | null) => {
      view.setHost(id, element);
    },
    [view, id],
  );
  return (
    <div className="gl-panel" data-panel-id={id} ref={ref} style={{ display: 'none' }}>
      <PanelContext.Provider value={id}>
        <PanelErrorBoundary panelId={id} onError={onPanelError}>
          <PanelContent id={id} />
        </PanelErrorBoundary>
      </PanelContext.Provider>
    </div>
  );
});

function panelIds(state: LayoutState): string[] {
  const ids: string[] = [];
  for (const [id, entry] of getIndex(state.root)) if (entry.node.type === 'panel') ids.push(id);
  // Sorted, so moving a panel never reorders the host elements (which would reload iframes).
  return ids.sort();
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

export function PanelLayer(): ReactNode {
  const ids = useLayoutSelector(panelIds, sameIds);
  return (
    <div className="gl-panels">
      {ids.map((id) => (
        <PanelHost key={id} id={id} />
      ))}
    </div>
  );
}

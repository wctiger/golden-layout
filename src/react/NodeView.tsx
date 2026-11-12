import { memo, useCallback } from 'react';
import type { ReactNode } from 'react';
import { getIndex } from '../model/tree';
import type { RowOrColumnNode, StackNode } from '../model/types';
import { useLayoutContext } from './context';
import { useLayoutSelector } from './hooks';

function StackView({ node }: { node: StackNode }): ReactNode {
  const { view } = useLayoutContext();
  const slotRef = useCallback(
    (element: HTMLDivElement | null) => {
      view.setSlot(node.id, element);
    },
    [view, node.id],
  );
  return (
    <div
      className="gl-stack"
      data-item-id={node.id}
      data-header={node.headerPosition ?? 'top'}
      style={{ flexGrow: node.size }}
    >
      <div className="gl-stack-content" ref={slotRef} />
    </div>
  );
}

function RowOrColumnView({ node }: { node: RowOrColumnNode }): ReactNode {
  return (
    <div className={`gl-${node.type}`} data-item-id={node.id} style={{ flexGrow: node.size }}>
      {node.children.map((child) => (
        <NodeView key={child.id} id={child.id} />
      ))}
    </div>
  );
}

/**
 * The frame for one row, column or stack. It renders structure only (headers, splitters
 * and the empty slot a panel is laid over), never panel content.
 */
export const NodeView = memo(function NodeView({ id }: { id: string }): ReactNode {
  const node = useLayoutSelector((state) => getIndex(state.root).get(id)?.node);
  if (!node || node.type === 'panel') return null;
  return node.type === 'stack' ? <StackView node={node} /> : <RowOrColumnView node={node} />;
});

import { Fragment, memo, useCallback } from 'react';
import type { ReactNode } from 'react';
import { getIndex } from '../model/tree';
import type { RowOrColumnNode, StackNode } from '../model/types';
import { useLayoutContext } from './context';
import { Header } from './Header';
import { useLayoutSelector } from './hooks';
import { Splitter } from './Splitter';

function StackView({ node }: { node: StackNode }): ReactNode {
  const { view, settings } = useLayoutContext();
  const selected = useLayoutSelector((state) => state.selectedId === node.id);
  const maximized = useLayoutSelector((state) => state.maximizedId === node.id);
  const slotRef = useCallback(
    (element: HTMLDivElement | null) => {
      view.setSlot(node.id, element);
    },
    [view, node.id],
  );
  let className = 'gl-stack';
  if (selected) className += ' gl-selected';
  if (maximized) className += ' gl-maximized';
  return (
    <div
      className={className}
      data-item-id={node.id}
      data-header={node.headerPosition ?? 'top'}
      style={{ flexGrow: node.size }}
    >
      {settings.hasHeaders && <Header stack={node} />}
      <div className="gl-stack-content" ref={slotRef} />
    </div>
  );
}

function RowOrColumnView({ node }: { node: RowOrColumnNode }): ReactNode {
  return (
    <div className={`gl-${node.type}`} data-item-id={node.id} style={{ flexGrow: node.size }}>
      {node.children.map((child, index) => (
        <Fragment key={child.id}>
          {index > 0 && <Splitter parent={node} index={index - 1} />}
          <NodeView id={child.id} />
        </Fragment>
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

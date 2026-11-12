import { expect } from 'vite-plus/test';
import type { LayoutNode, LayoutState } from '../../src/index';

/**
 * Resolves a path such as `row.0.stack.1.panel` against a layout, asserting the type of
 * every item along the way, and returns the item it ends on.
 */
export function verifyPath(path: string, state: LayoutState): LayoutNode {
  expect(state.root).not.toBeNull();
  let node: LayoutNode = state.root!;
  for (const segment of path.split('.')) {
    if (Number.isNaN(Number(segment))) {
      expect(node.type).toBe(segment);
    } else {
      expect(node.type).not.toBe('panel');
      const child: LayoutNode | undefined =
        node.type === 'panel' ? undefined : node.children[Number(segment)];
      expect(child).toBeDefined();
      node = child!;
    }
  }
  return node;
}

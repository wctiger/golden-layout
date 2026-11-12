import type { ReactNode } from 'react';
import { expect } from 'vite-plus/test';
import { render } from 'vitest-browser-react';
import { GoldenLayout, createLayout, usePanelState } from '../../src/index';
import type { GoldenLayoutProps, Layout, LayoutConfig, LayoutNode } from '../../src/index';
import '../../src/styles/golden-layout.css';

/** The counterpart of the legacy test component: shows its state, or a default text. */
export function TestComponent(): ReactNode {
  const [state] = usePanelState<{ text?: string } | undefined>(undefined);
  return <div className="test-component">{state?.text ?? 'that worked'}</div>;
}

export const testComponents = { testComponent: TestComponent };

export interface Mounted {
  layout: Layout;
  container: HTMLElement;
  root: HTMLElement;
  unmount: () => Promise<void>;
  rerender: (props?: Partial<GoldenLayoutProps>) => Promise<void>;
}

/** Mounts a layout in an 800 x 600 box and waits for it to be on screen. */
export async function mountLayout(
  config: LayoutConfig,
  props: Partial<GoldenLayoutProps> = {},
  wrap: (node: ReactNode) => ReactNode = (node) => node,
): Promise<Mounted> {
  const layout = createLayout(config);
  const ui = (extra: Partial<GoldenLayoutProps> = {}): ReactNode =>
    wrap(
      <div style={{ width: 800, height: 600 }}>
        <GoldenLayout layout={layout} components={testComponents} {...props} {...extra} />
      </div>,
    );
  const screen = await render(ui());
  const root = screen.container.querySelector<HTMLElement>('.gl-root');
  expect(root).not.toBeNull();
  return {
    layout,
    container: screen.container,
    root: root!,
    unmount: async () => {
      await screen.unmount();
    },
    rerender: async (extra) => {
      await screen.rerender(ui(extra));
    },
  };
}

/** Same path syntax as the model tests: `row.0.stack.1.panel`. */
export function verifyPath(path: string, layout: Layout): LayoutNode {
  let node = layout.getState().root as LayoutNode;
  expect(node).not.toBeNull();
  for (const segment of path.split('.')) {
    if (Number.isNaN(Number(segment))) {
      expect(node.type).toBe(segment);
    } else {
      const child: LayoutNode | undefined =
        node.type === 'panel' ? undefined : node.children[Number(segment)];
      expect(child).toBeDefined();
      node = child!;
    }
  }
  return node;
}

export function panelElement(root: ParentNode, id: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(`.gl-panel[data-panel-id="${id}"]`);
  expect(element).not.toBeNull();
  return element!;
}

export function isShown(element: HTMLElement): boolean {
  return getComputedStyle(element).display !== 'none';
}

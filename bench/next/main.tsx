import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { GoldenLayout, createLayout } from '../../src/index';
import type { Layout, LayoutConfig, NodeConfig } from '../../src/index';
import '../../src/styles/golden-layout.css';
import '../../examples/themes/dark.css';
import '../shared/page.css';
import { BenchPanel } from '../shared/BenchPanel';
import { benchTools, container, install } from '../shared/page';
import { SPECS, expand } from '../shared/spec';

const components = { bench: BenchPanel };
let root: Root | null = null;
let layout: Layout | null = null;

const panel = (id: string): NodeConfig => ({
  type: 'panel',
  id,
  component: 'bench',
  title: `Panel ${id}`,
  props: { panelId: id },
});

function toConfig(specName: string): LayoutConfig {
  return {
    root: {
      type: 'row',
      children: expand(SPECS[specName]!).map((column) => ({
        type: 'column' as const,
        children: column.map((stack) => ({
          type: 'stack' as const,
          id: stack.id,
          children: stack.panels.map((id) => panel(id) as Extract<NodeConfig, { type: 'panel' }>),
        })),
      })),
    },
  };
}

const centre = (element: Element): { x: number; y: number } => {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
};

install({
  version: 'next',
  async mount(specName) {
    layout = createLayout(toConfig(specName));
    root = createRoot(container());
    root.render(
      <GoldenLayout
        layout={layout}
        components={components}
        className="gl-theme-dark"
        // Matches the legacy defaults, so both versions lay out the same boxes.
        style={{ '--gl-header-height': '20px', '--gl-splitter-size': '5px' } as never}
      />,
    );
    await benchTools.frames(2);
  },
  destroy() {
    root?.unmount();
    root = null;
    layout = null;
  },
  resize(width, height) {
    container().style.width = `${width}px`;
    container().style.height = `${height}px`;
  },
  openPanel: (stackId, panelId) => void layout!.addItem(panel(panelId), { parent: stackId }),
  closePanel: (panelId) => layout!.removeItem(panelId),
  activate: (panelId) => layout!.setActive(panelId),
  toggleMaximise: (stackId) => layout!.toggleMaximise(stackId),
  serialize: () => JSON.stringify(layout!.getState()).length,
  splitterPoint: () => centre(document.querySelector('.gl-row > .gl-splitter')!),
  tabPoint: (panelId) => centre(document.querySelector(`.gl-tab[data-panel-id="${panelId}"]`)!),
  stackBody(stackId) {
    const rect = document
      .querySelector(`[data-item-id="${stackId}"] > .gl-stack-content`)!
      .getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  },
  stackOf: (panelId) => layout!.getParent(panelId)?.id ?? null,
  panelCount: () => layout!.getByType('panel').length,
});

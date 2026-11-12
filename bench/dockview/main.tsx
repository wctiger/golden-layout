import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { DockviewReact, themeDark } from 'dockview-react';
import type {
  DockviewApi,
  DockviewGroupPanel,
  DockviewReadyEvent,
  IDockviewPanelProps,
} from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';
import '../shared/page.css';
import { BenchPanel } from '../shared/BenchPanel';
import { benchTools, container, install } from '../shared/page';
import { SPECS, expand } from '../shared/spec';

/* The same shared panel component, adapted to dockview's panel props. */
function Panel({ params }: IDockviewPanelProps<{ panelId: string }>) {
  return <BenchPanel panelId={params.panelId} />;
}
const components = { bench: Panel };

let root: Root | null = null;
let api: DockviewApi | null = null;
/** Spec stack ids (s0, s1, ...) to the groups dockview created for them, and back. */
let groups = new Map<string, DockviewGroupPanel>();
let names = new Map<DockviewGroupPanel, string>();

const panelDef = (id: string) => ({
  id,
  component: 'bench',
  title: `Panel ${id}`,
  params: { panelId: id },
});

/** Builds the spec's layout with addPanel: columns left to right, stacks top to bottom. */
function build(dockview: DockviewApi, specName: string): void {
  for (const column of expand(SPECS[specName]!)) {
    let above: string | null = null;
    column.forEach((stack, row) => {
      stack.panels.forEach((id, index) => {
        const position =
          index > 0
            ? { referencePanel: stack.panels[0]!, direction: 'within' as const }
            : row === 0
              ? { direction: 'right' as const }
              : { referencePanel: above!, direction: 'below' as const };
        dockview.addPanel({ ...panelDef(id), position, inactive: index > 0 });
      });
      above = stack.panels[0]!;
      const group = dockview.getPanel(stack.panels[0]!)!.group;
      groups.set(stack.id, group);
      names.set(group, stack.id);
    });
  }
}

const centre = (element: Element): { x: number; y: number } => {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
};

install({
  version: 'dockview',
  async mount(specName) {
    let ready: () => void = () => {};
    const built = new Promise<void>((resolve) => {
      ready = resolve;
    });
    root = createRoot(container());
    root.render(
      <DockviewReact
        components={components}
        theme={themeDark}
        onReady={(event: DockviewReadyEvent) => {
          api = event.api;
          build(event.api, specName);
          ready();
        }}
      />,
    );
    await built;
    await benchTools.frames(2);
  },
  destroy() {
    root?.unmount();
    root = null;
    api = null;
    groups = new Map();
    names = new Map();
  },
  resize(width, height) {
    container().style.width = `${width}px`;
    container().style.height = `${height}px`;
  },
  openPanel(stackId, panelId) {
    api!.addPanel({
      ...panelDef(panelId),
      position: { referenceGroup: groups.get(stackId)!, direction: 'within' },
    });
  },
  closePanel: (panelId) => api!.getPanel(panelId)!.api.close(),
  activate: (panelId) => api!.getPanel(panelId)!.api.setActive(),
  toggleMaximise(stackId) {
    if (api!.hasMaximizedGroup()) api!.exitMaximizedGroup();
    else api!.maximizeGroup(groups.get(stackId)!.activePanel!);
  },
  serialize: () => JSON.stringify(api!.toJSON()).length,
  splitterPoint() {
    // The first sash between the top-level columns: full height, furthest left.
    const height = container().getBoundingClientRect().height;
    const sashes = [...document.querySelectorAll('.dv-sash')].filter(
      (sash) => Math.abs(sash.getBoundingClientRect().height - height) < 2,
    );
    sashes.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
    // An eighth of the way down: clear of the horizontal sashes that cross it at a quarter,
    // half and three quarters in the layouts the benchmark builds.
    const rect = sashes[0]!.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 8 };
  },
  tabPoint(panelId) {
    const tab = [...document.querySelectorAll('.dv-tab')].find(
      (element) => element.textContent?.trim() === `Panel ${panelId}`,
    );
    return centre(tab!);
  },
  stackBody(stackId) {
    const content = groups.get(stackId)!.element.querySelector('.dv-content-container')!;
    const rect = content.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  },
  stackOf(panelId) {
    const group = api!.getPanel(panelId)?.group;
    return group ? (names.get(group) ?? `group-${group.id}`) : null;
  },
  panelCount: () => api!.totalPanels,
});

(window as unknown as { dockviewApi: () => DockviewApi | null }).dockviewApi = () => api;

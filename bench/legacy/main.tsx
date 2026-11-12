import * as React from 'react';
import { createRoot } from 'react-dom/client';
import './vendor/goldenlayout-base.css';
import './vendor/goldenlayout-dark-theme.css';
import '../shared/page.css';
import { BenchPanel } from '../shared/BenchPanel';
import { benchTools, container, install } from '../shared/page';
import { SPECS, expand } from '../shared/spec';
import goldenLayoutUrl from './vendor/goldenlayout.js?url';
import jqueryUrl from './vendor/jquery.js?url';

/* The legacy build is a classic script that expects jQuery, React and ReactDOM as globals. */

interface LegacyItem {
  config: { id?: string };
  parent: LegacyItem;
  element: [HTMLElement];
  tab: { element: [HTMLElement] };
  contentItems: LegacyItem[];
  addChild(config: object): void;
  remove(): void;
  setActiveContentItem(item: LegacyItem): void;
  toggleMaximise(): void;
  getItemsById(id: string): LegacyItem[];
  getItemsByType(type: string): LegacyItem[];
}

interface LegacyLayout {
  root: LegacyItem;
  isInitialised: boolean;
  registerComponent(name: string, component: unknown): void;
  init(): void;
  destroy(): void;
  updateSize(): void;
  toConfig(): object;
}

type LegacyConstructor = new (config: object, container: unknown) => LegacyLayout;

const globals = window as unknown as {
  React: unknown;
  ReactDOM: unknown;
  $: (target: unknown) => unknown;
  GoldenLayout: LegacyConstructor;
};

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.append(script);
  });
}

globals.React = React;
globals.ReactDOM = { createRoot };
await loadScript(jqueryUrl);
await loadScript(goldenLayoutUrl);

let layout: LegacyLayout | null = null;

const panel = (id: string): object => ({
  type: 'react-component',
  component: 'bench',
  id,
  title: `Panel ${id}`,
  props: { panelId: id },
});

function toConfig(specName: string): object {
  return {
    settings: { showPopoutIcon: false },
    content: [
      {
        type: 'row',
        content: expand(SPECS[specName]!).map((column) => ({
          type: 'column',
          content: column.map((stack) => ({
            type: 'stack',
            id: stack.id,
            content: stack.panels.map(panel),
          })),
        })),
      },
    ],
  };
}

const item = (id: string): LegacyItem => layout!.root.getItemsById(id)[0]!;
const centre = (element: Element): { x: number; y: number } => {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
};

install({
  version: 'legacy',
  async mount(specName) {
    layout = new globals.GoldenLayout(toConfig(specName), globals.$(container()));
    layout.registerComponent('bench', BenchPanel);
    layout.init();
    await benchTools.frames(2);
  },
  destroy() {
    layout?.destroy();
    layout = null;
  },
  resize(width, height) {
    container().style.width = `${width}px`;
    container().style.height = `${height}px`;
    // The legacy layout only listens to window resizes, so it has to be told.
    layout!.updateSize();
  },
  openPanel: (stackId, panelId) => item(stackId).addChild(panel(panelId)),
  closePanel: (panelId) => item(panelId).remove(),
  activate: (panelId) => item(panelId).parent.setActiveContentItem(item(panelId)),
  toggleMaximise: (stackId) => item(stackId).toggleMaximise(),
  serialize: () => JSON.stringify(layout!.toConfig()).length,
  splitterPoint: () => centre(document.querySelector('.lm_row > .lm_splitter')!),
  tabPoint: (panelId) => centre(item(panelId).tab.element[0]),
  stackBody(stackId) {
    const rect = item(stackId).element[0].querySelector('.lm_items')!.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  },
  stackOf: (panelId) => layout!.root.getItemsById(panelId)[0]?.parent.config.id ?? null,
  panelCount: () => layout!.root.getItemsByType('component').length,
});

/** A layout described without either schema: columns of stacks, each with a number of tabs. */
export interface BenchSpec {
  name: string;
  columns: number[][];
}

export const SPECS: Record<string, BenchSpec> = {
  // 4 panels in 3 stacks
  small: { name: 'small', columns: [[2], [1, 1]] },
  // 16 panels in 6 stacks
  medium: {
    name: 'medium',
    columns: [
      [3, 3],
      [3, 3],
      [2, 2],
    ],
  },
  // 64 panels in 16 stacks
  large: { name: 'large', columns: Array.from({ length: 4 }, () => [4, 4, 4, 4]) },
};

export interface SpecStack {
  id: string;
  panels: string[];
}

/** The same ids in both versions: stacks s0, s1, ... and panels p0, p1, ... in document order. */
export function expand(spec: BenchSpec): SpecStack[][] {
  let stack = 0;
  let panel = 0;
  return spec.columns.map((column) =>
    column.map((tabs) => ({
      id: `s${stack++}`,
      panels: Array.from({ length: tabs }, () => `p${panel++}`),
    })),
  );
}

/** What both pages expose on `window.bench`, so each scenario is written once. */
export interface BenchDriver {
  version: 'legacy' | 'next' | 'dockview';
  mount(specName: string): Promise<void>;
  destroy(): void;
  resize(width: number, height: number): void;
  openPanel(stackId: string, panelId: string): void;
  closePanel(panelId: string): void;
  activate(panelId: string): void;
  toggleMaximise(stackId: string): void;
  /** Produces the saved layout as a JSON string and returns its length. */
  serialize(): number;
  splitterPoint(): { x: number; y: number };
  tabPoint(panelId: string): { x: number; y: number };
  stackBody(stackId: string): { left: number; top: number; width: number; height: number };
  stackOf(panelId: string): string | null;
  panelCount(): number;
}

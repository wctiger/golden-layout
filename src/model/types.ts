/** A side of an item: used for header position and for docking. */
export type Side = 'left' | 'right' | 'top' | 'bottom';

/** A leaf of the layout: one tab, rendering one registered component. */
export interface PanelNode {
  type: 'panel';
  id: string;
  /** Name of the component in the registry passed to `<GoldenLayout>`. */
  component: string;
  title: string;
  /** `false` hides the close button and makes `closeItem` a no-op. */
  closable?: boolean;
  /** `false` prevents the tab from being dragged. */
  reorderable?: boolean;
  /** Static, serializable props handed to the component. */
  props?: Record<string, unknown>;
  /** Serializable state owned by the panel, see `usePanelState`. */
  state?: unknown;
}

/** A tabbed group of panels. */
export interface StackNode {
  type: 'stack';
  id: string;
  /** Relative weight among siblings. */
  size: number;
  activeId: string | null;
  headerPosition?: Side;
  /** `false` keeps the stack when it becomes empty and hides its close button. */
  closable?: boolean;
  children: PanelNode[];
}

/** A row lays its children out left to right, a column top to bottom. */
export interface RowOrColumnNode {
  type: 'row' | 'column';
  id: string;
  size: number;
  /** `false` keeps the node when it has fewer than two children. */
  closable?: boolean;
  children: ContainerNode[];
}

export type ContainerNode = RowOrColumnNode | StackNode;
export type LayoutNode = ContainerNode | PanelNode;
export type NodeType = LayoutNode['type'];

/** The complete, serializable state of a layout. */
export interface LayoutState {
  root: ContainerNode | null;
  /** Id of the maximised stack, if any. */
  maximisedId: string | null;
  /** Id of the selected item, if any. */
  selectedId: string | null;
}

/* ---- Input shapes: the same tree, with the derivable fields optional ---- */

export interface PanelConfig {
  type: 'panel';
  id?: string;
  component: string;
  title?: string;
  closable?: boolean;
  reorderable?: boolean;
  props?: Record<string, unknown>;
  state?: unknown;
  /** Used when the panel is placed straight into a row or column. */
  size?: number;
}

export interface StackConfig {
  type: 'stack';
  id?: string;
  size?: number;
  activeId?: string | null;
  headerPosition?: Side;
  closable?: boolean;
  children?: PanelConfig[];
}

export interface RowOrColumnConfig {
  type: 'row' | 'column';
  id?: string;
  size?: number;
  closable?: boolean;
  children?: NodeConfig[];
}

export type NodeConfig = RowOrColumnConfig | StackConfig | PanelConfig;

export interface LayoutConfig {
  root?: NodeConfig | null;
  maximisedId?: string | null;
  selectedId?: string | null;
}

/** Where an item goes: into a parent, or docked against a side of a target. */
export type Destination = { parent: string; index?: number } | { target: string; side: Side };

export type ItemPatch = Partial<
  Pick<PanelNode, 'closable' | 'reorderable' | 'props' | 'component'> &
    Pick<StackNode, 'headerPosition'>
>;

export type Action =
  | { type: 'addItem'; item: NodeConfig; to?: Destination }
  | { type: 'removeItem'; id: string }
  | { type: 'closeItem'; id: string }
  | { type: 'replaceItem'; id: string; item: NodeConfig }
  | { type: 'moveItem'; id: string; to: Destination }
  | { type: 'setActive'; id: string }
  | { type: 'resize'; id: string; sizes: number[] }
  | { type: 'maximise'; id: string }
  | { type: 'restore' }
  | { type: 'select'; id: string | null }
  | { type: 'setTitle'; id: string; title: string }
  | { type: 'setPanelState'; id: string; state: unknown }
  | { type: 'updateItem'; id: string; patch: ItemPatch }
  | { type: 'setLayout'; layout: LayoutConfig };

export type ActionType = Action['type'];

/** Thrown for invalid configs and for actions that reference unknown items. */
export class LayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LayoutError';
  }
}

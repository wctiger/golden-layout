/** Behaviour switches for a layout. None of this is part of the serialized layout state. */
export interface Settings {
  /** Show a tab header on every stack. */
  hasHeaders: boolean;
  /** Allow tabs and stacks to be dragged. */
  reorderEnabled: boolean;
  /** Select a stack by clicking its header. */
  selectionEnabled: boolean;
  /** Show the maximise button in stack headers. */
  showMaximiseIcon: boolean;
  /** Show the close-stack button in stack headers. */
  showCloseIcon: boolean;
  /** Keep the drag proxy inside the layout's bounds. */
  constrainDragToContainer: boolean;
  /** Pixels the pointer must travel before a press becomes a drag. */
  dragThreshold: number;
}

/** Text for the header controls, used as tooltips and accessible names. */
export interface Labels {
  close: string;
  maximise: string;
  minimise: string;
  tabDropdown: string;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  hasHeaders: true,
  reorderEnabled: true,
  selectionEnabled: false,
  showMaximiseIcon: true,
  showCloseIcon: true,
  constrainDragToContainer: true,
  dragThreshold: 10,
});

export const DEFAULT_LABELS: Readonly<Labels> = Object.freeze({
  close: 'close',
  maximise: 'maximise',
  minimise: 'minimise',
  tabDropdown: 'additional tabs',
});

/** Fills in defaults. Always returns a new object and never touches the defaults. */
export function resolveSettings(settings?: Partial<Settings>): Settings {
  return { ...DEFAULT_SETTINGS, ...settings };
}

export function resolveLabels(labels?: Partial<Labels>): Labels {
  return { ...DEFAULT_LABELS, ...labels };
}

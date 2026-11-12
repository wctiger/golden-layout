/** Behaviour switches for a layout. None of this is part of the serialized layout state. */
export interface Settings {
  /** Show a tab header on every stack. */
  hasHeaders: boolean;
  /** Allow tabs and stacks to be dragged. */
  reorderEnabled: boolean;
  /** Allow tab titles to be edited by double-click, F2 or the tab menu. */
  renameEnabled: boolean;
  /** Select a stack by clicking its header. */
  selectionEnabled: boolean;
  /** Show the maximize button in stack headers. */
  showMaximizeIcon: boolean;
  /** Show the close-stack button in stack headers. */
  showCloseIcon: boolean;
  /** Keep the drag proxy inside the layout's bounds. */
  constrainDragToContainer: boolean;
  /** Pixels the pointer must travel before a press becomes a drag. */
  dragThreshold: number;
}

/**
 * A label that names the panel it acts on. A string has the panel title appended
 * (`"close"` becomes `"close Orders"`); a function builds the whole text.
 */
export type ContextLabel = string | ((context: { title: string }) => string);

/** Text for tooltips, accessible names and the tab menu. */
export interface Labels {
  /** A tab's close button. */
  close: ContextLabel;
  /** The maximize button, named after the stack's active panel. */
  maximize: ContextLabel;
  /** The same button while the stack is maximized. */
  minimize: ContextLabel;
  /** The header button that closes every tab of the stack. */
  closeStack: string;
  tabDropdown: string;
  /** Tab menu entries. */
  rename: string;
  closeTabsToRight: string;
  closeOtherTabs: string;
  closeAllTabs: string;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  hasHeaders: true,
  reorderEnabled: true,
  renameEnabled: true,
  selectionEnabled: false,
  showMaximizeIcon: true,
  showCloseIcon: true,
  constrainDragToContainer: true,
  dragThreshold: 10,
});

export const DEFAULT_LABELS: Readonly<Labels> = Object.freeze({
  close: 'close',
  maximize: 'maximize',
  minimize: 'minimize',
  closeStack: 'close all tabs',
  tabDropdown: 'additional tabs',
  rename: 'Rename panel',
  closeTabsToRight: 'Close tabs to the right',
  closeOtherTabs: 'Close other tabs',
  closeAllTabs: 'Close all tabs',
});

/** Fills in defaults. Always returns a new object and never touches the defaults. */
export function resolveSettings(settings?: Partial<Settings>): Settings {
  return { ...DEFAULT_SETTINGS, ...settings };
}

export function resolveLabels(labels?: Partial<Labels>): Labels {
  return { ...DEFAULT_LABELS, ...labels };
}

/** The text for a label that names a panel. */
export function formatLabel(label: ContextLabel, title: string | undefined): string {
  if (typeof label === 'function') return label({ title: title ?? '' });
  return title ? `${label} ${title}` : label;
}

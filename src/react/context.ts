import { createContext, useContext } from 'react';
import type { ComponentType, ReactNode } from 'react';
import type { PanelNode, StackNode } from '../model/types';
import type { Labels, Settings } from '../settings';
import type { Layout } from '../store';
import type { DragController } from './drag/DragController';
import type { UiStore } from './ui';
import type { LayoutView } from './view';

/** Maps the `component` name on a panel to the React component that renders it. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ComponentRegistry = Record<string, ComponentType<any>>;

export interface LayoutContextValue {
  layout: Layout;
  view: LayoutView;
  drag: DragController;
  ui: UiStore;
  components: ComponentRegistry;
  settings: Settings;
  labels: Labels;
  onPanelError: ((error: unknown, panelId: string) => void) | undefined;
}

/**
 * Carries stable references only. Layout state is never put in context: components read
 * the slice they need through `useLayoutSelector`, so a change re-renders only the
 * components whose slice changed.
 */
export const LayoutContext = createContext<LayoutContextValue | null>(null);

export const PanelContext = createContext<string | null>(null);

export function useLayoutContext(): LayoutContextValue {
  const value = useContext(LayoutContext);
  if (!value) {
    throw new Error('This hook must be used inside <GoldenLayout>');
  }
  return value;
}

/** What a stack actions render prop receives. */
export interface StackActionsContext {
  layout: Layout;
  stack: StackNode;
  /** The stack's active panel, or `null` for an empty stack. */
  activePanel: PanelNode | null;
  maximized: boolean;
}

/** What tab menu entries and the `tabContextMenu` prop receive. */
export interface TabMenuContext {
  layout: Layout;
  panel: PanelNode;
  stack: StackNode;
  /** Position of the tab in its stack. */
  index: number;
}

export interface TabMenuItem {
  id: string;
  label: string;
  disabled?: boolean;
  /** Draws a divider above this entry. */
  separatorBefore?: boolean;
  onSelect: (context: TabMenuContext) => void;
}

export interface ChromeContextValue {
  renderStackActions?: ((context: StackActionsContext) => ReactNode) | undefined;
  tabContextMenu?:
    | ((context: TabMenuContext, defaults: TabMenuItem[]) => TabMenuItem[])
    | undefined;
}

/**
 * The render props that customise headers. Kept apart from LayoutContext so that passing
 * a new function re-renders the headers and never the panels.
 */
export const ChromeContext = createContext<ChromeContextValue>({});

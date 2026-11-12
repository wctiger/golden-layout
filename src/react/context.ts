import { createContext, useContext } from 'react';
import type { ComponentType } from 'react';
import type { Labels, Settings } from '../settings';
import type { Layout } from '../store';
import type { LayoutView } from './view';

/** Maps the `component` name on a panel to the React component that renders it. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ComponentRegistry = Record<string, ComponentType<any>>;

export interface LayoutContextValue {
  layout: Layout;
  view: LayoutView;
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

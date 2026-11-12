import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

/** The one panel component both versions render, so panel cost is identical. */

const renders: Record<string, number> = {};
const locals = new Map<string, (value: number) => void>();
const listeners = new Set<() => void>();
let shared = 0;

function countRender(id: string): void {
  renders[id] = (renders[id] ?? 0) + 1;
}

export const benchShared = {
  /** A value every panel displays: one change re-renders them all. */
  setShared(value: number): void {
    shared = value;
    for (const listener of [...listeners]) listener();
  },
  /** A value held in one panel's own state. */
  setLocal(id: string, value: number): void {
    locals.get(id)?.(value);
  },
  renders: (): Record<string, number> => ({ ...renders }),
  totalRenders: (): number => Object.values(renders).reduce((sum, n) => sum + n, 0),
  mounted: (): number => locals.size,
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getShared = (): number => shared;
const ROWS = Array.from({ length: 40 }, (_, i) => i);

export function BenchPanel({ panelId }: { panelId: string }): ReactNode {
  const value = useSyncExternalStore(subscribe, getShared);
  const [local, setLocal] = useState(0);
  useEffect(() => {
    locals.set(panelId, setLocal);
    return () => {
      locals.delete(panelId);
    };
  }, [panelId]);
  countRender(panelId);
  return (
    <div className="bench-panel">
      <h4>
        {panelId} · shared {value} · local {local}
      </h4>
      <ul>
        {ROWS.map((row) => (
          <li key={row}>
            Row {row} of {panelId}: {(row * 7919 + value) % 97}
          </li>
        ))}
      </ul>
    </div>
  );
}

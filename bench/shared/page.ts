import { benchShared } from './BenchPanel';
import type { BenchDriver } from './spec';

declare global {
  interface Window {
    bench: BenchDriver;
    benchShared: typeof benchShared;
    benchTools: typeof benchTools;
  }
}

let frameTimes: number[] | null = null;
let longTasks = 0;

if (typeof PerformanceObserver !== 'undefined') {
  try {
    new PerformanceObserver((list) => {
      longTasks += list.getEntries().length;
    }).observe({ entryTypes: ['longtask'] });
  } catch {
    // Long task timing is not available: the count stays at zero.
  }
}

const nextFrame = (): Promise<number> => new Promise((resolve) => requestAnimationFrame(resolve));

export const benchTools = {
  /** Resolves after `count` animation frames, so work scheduled by an action has run. */
  async frames(count: number): Promise<void> {
    for (let i = 0; i < count; i++) await nextFrame();
  },
  startFrames(): void {
    const times: number[] = [];
    frameTimes = times;
    const tick = (now: number): void => {
      if (frameTimes !== times) return;
      times.push(now);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },
  /** The gaps between the frames recorded since `startFrames`, in milliseconds. */
  stopFrames(): number[] {
    const times = frameTimes ?? [];
    frameTimes = null;
    return times.slice(1).map((time, i) => time - times[i]!);
  },
  longTasks: (): number => longTasks,
};

/** Publishes the driver. The runner waits for `window.bench` before starting. */
export function install(driver: BenchDriver): void {
  window.benchShared = benchShared;
  window.benchTools = benchTools;
  window.bench = driver;
}

export const SIZE = { width: 1600, height: 900 };

export function container(): HTMLElement {
  const element = document.getElementById('root')!;
  return element;
}

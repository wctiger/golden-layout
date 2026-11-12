import { getIndex } from '../model/tree';
import type { LayoutState } from '../model/types';

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The DOM side of one mounted layout. Stacks register the element their active panel
 * should cover (a "slot"), panels register their host element, and `reposition` lays each
 * visible host over its slot. Everything here writes styles directly and never causes a
 * React render, so dragging a splitter or resizing the container costs no re-renders.
 */
export class LayoutView {
  root: HTMLElement | null = null;
  /** Layer above the panels, for menus, the drop indicator and the drag proxy. */
  overlay: HTMLElement | null = null;
  /** While a panel is dragged, its host follows this element instead of its stack. */
  dragOverride: { panelId: string; element: HTMLElement } | null = null;

  private readonly slots = new Map<string, HTMLElement>();
  private readonly hosts = new Map<string, HTMLElement>();
  private readonly applied = new WeakMap<HTMLElement, string>();
  private readonly observer: ResizeObserver | null;

  constructor(private readonly getState: () => LayoutState) {
    this.observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.reposition());
  }

  setRoot(element: HTMLElement | null): void {
    if (this.root) this.observer?.unobserve(this.root);
    this.root = element;
    if (element) this.observer?.observe(element);
  }

  setOverlay(element: HTMLElement | null): void {
    this.overlay = element;
  }

  setDragOverride(override: { panelId: string; element: HTMLElement } | null): void {
    this.dragOverride = override;
  }

  setSlot(stackId: string, element: HTMLElement | null): void {
    const previous = this.slots.get(stackId);
    if (previous) this.observer?.unobserve(previous);
    if (element) {
      this.slots.set(stackId, element);
      this.observer?.observe(element);
    } else {
      this.slots.delete(stackId);
    }
  }

  setHost(panelId: string, element: HTMLElement | null): void {
    if (element) this.hosts.set(panelId, element);
    else this.hosts.delete(panelId);
  }

  getHost(panelId: string): HTMLElement | undefined {
    return this.hosts.get(panelId);
  }

  getSlot(stackId: string): HTMLElement | undefined {
    return this.slots.get(stackId);
  }

  dispose(): void {
    this.observer?.disconnect();
  }

  /** Reads every slot rectangle first, then writes every host style, to avoid thrashing. */
  reposition = (): void => {
    const root = this.root;
    if (!root) return;
    const state = this.getState();
    const index = getIndex(state.root);
    const rootRect = root.getBoundingClientRect();
    const originX = rootRect.left + root.clientLeft;
    const originY = rootRect.top + root.clientTop;

    const plan: [HTMLElement, Box | null, boolean][] = [];
    for (const [panelId, host] of this.hosts) {
      const dragged = this.dragOverride?.panelId === panelId;
      let target: HTMLElement | undefined;
      if (dragged) {
        target = this.dragOverride!.element;
      } else {
        const stack = index.get(panelId)?.parent;
        const covered = state.maximisedId !== null && state.maximisedId !== stack?.id;
        if (stack?.type === 'stack' && stack.activeId === panelId && !covered) {
          target = this.slots.get(stack.id);
        }
      }
      if (!target) {
        plan.push([host, null, false]);
        continue;
      }
      const rect = target.getBoundingClientRect();
      plan.push([
        host,
        {
          left: rect.left - (dragged ? 0 : originX),
          top: rect.top - (dragged ? 0 : originY),
          width: rect.width,
          height: rect.height,
        },
        dragged,
      ]);
    }

    for (const [host, box, dragged] of plan) {
      const key = box
        ? `${dragged ? 'f' : 'a'}:${box.left}:${box.top}:${box.width}:${box.height}`
        : 'hidden';
      if (this.applied.get(host) === key) continue;
      this.applied.set(host, key);
      const { style } = host;
      if (!box) {
        style.display = 'none';
        continue;
      }
      style.display = '';
      style.position = dragged ? 'fixed' : '';
      style.zIndex = dragged ? '1001' : '';
      style.pointerEvents = dragged ? 'none' : '';
      style.left = `${box.left}px`;
      style.top = `${box.top}px`;
      style.width = `${box.width}px`;
      style.height = `${box.height}px`;
    }
  };
}

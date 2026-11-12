import { getIndex, isWithin } from '../../model/tree';
import type { Destination, NodeConfig } from '../../model/types';
import type { Settings } from '../../settings';
import { DEFAULT_SETTINGS } from '../../settings';
import type { Layout } from '../../store';
import type { LayoutView } from '../view';
import { findDropTarget } from './geometry';
import type { DropPlace, LayoutGeometry, Point, Rect } from './geometry';

/** What is being dragged: an item already in the layout, or a new one to create on drop. */
export type DragSource =
  | { kind: 'item'; id: string }
  | { kind: 'new'; item: NodeConfig | (() => NodeConfig); title?: string };

/** Everything the drag overlay needs to draw. Idle when `active` is false. */
export interface DragOverlayState {
  active: boolean;
  title: string;
  /** Top-left of the drag proxy, in viewport coordinates. */
  x: number;
  y: number;
  /** Highlight for the current drop target, relative to the layout element. */
  indicator: Rect | null;
  /** The panel shown inside the proxy while it is dragged. */
  previewPanelId: string | null;
}

const IDLE: DragOverlayState = Object.freeze({
  active: false,
  title: '',
  x: 0,
  y: 0,
  indicator: null,
  previewPanelId: null,
});

/** Offset of the proxy from the pointer, so the pointer sits on the proxy's tab. */
const PROXY_OFFSET = 12;

interface Session {
  source: DragSource;
  pointerId: number;
  document: Document;
  start: Point;
  started: boolean;
  title: string;
  previewPanelId: string | null;
  geometry: LayoutGeometry | null;
  drop: Destination | 'empty' | null;
  previousUserSelect: string;
}

function toRect(rect: DOMRect): Rect {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, Math.max(min, max)));
}

/** Measures the frame as it stands. The tree is not changed during a drag, so once is enough. */
export function readGeometry(root: HTMLElement): LayoutGeometry {
  const stacks = Array.from(root.querySelectorAll<HTMLElement>('.gl-stack')).map((element) => {
    const header = element.querySelector<HTMLElement>(':scope > .gl-header');
    const body = element.querySelector<HTMLElement>(':scope > .gl-stack-content');
    const position = element.dataset.header;
    return {
      id: element.dataset.itemId ?? '',
      header: header ? toRect(header.getBoundingClientRect()) : null,
      headerAxis: position === 'left' || position === 'right' ? ('y' as const) : ('x' as const),
      tabs: header
        ? Array.from(header.querySelectorAll('.gl-tab')).map((tab) =>
            toRect(tab.getBoundingClientRect()),
          )
        : [],
      body: toRect((body ?? element).getBoundingClientRect()),
    };
  });
  const rootItem = root.querySelector<HTMLElement>(':scope > .gl-frame > [data-item-id]');
  return {
    bounds: toRect(root.getBoundingClientRect()),
    root: rootItem
      ? {
          id: rootItem.dataset.itemId ?? '',
          rect: toRect(rootItem.getBoundingClientRect()),
          isStack: rootItem.classList.contains('gl-stack'),
        }
      : null,
    stacks,
  };
}

/**
 * Runs drags for one mounted layout. It tracks the pointer on the document, works out the
 * drop target from measured geometry, and publishes a small state object that only the
 * drag overlay subscribes to. The layout itself changes once, on drop.
 */
export class DragController {
  settings: Settings = DEFAULT_SETTINGS;
  /** Set by the overlay, used to keep the proxy inside the layout. */
  proxyElement: HTMLElement | null = null;

  private session: Session | null = null;
  private state: DragOverlayState = IDLE;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly layout: Layout,
    private readonly view: LayoutView,
  ) {}

  setSettings(settings: Settings): void {
    this.settings = settings;
  }

  setProxyElement(element: HTMLElement | null): void {
    this.proxyElement = element;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): DragOverlayState => this.state;

  get dragging(): boolean {
    return this.session?.started === true;
  }

  /** Call from a `pointerdown` handler. The drag starts once the pointer has moved far enough. */
  begin(event: PointerEvent, source: DragSource): void {
    if (this.session || event.button !== 0 || event.pointerType === 'touch') return;
    if (!this.view.root) return;
    const doc = this.view.root.ownerDocument;
    this.session = {
      source,
      pointerId: event.pointerId,
      document: doc,
      start: { x: event.clientX, y: event.clientY },
      started: false,
      title: '',
      previewPanelId: null,
      geometry: null,
      drop: null,
      previousUserSelect: '',
    };
    doc.addEventListener('pointermove', this.onPointerMove);
    doc.addEventListener('pointerup', this.onPointerUp);
    doc.addEventListener('pointercancel', this.onCancel);
    doc.addEventListener('keydown', this.onKeyDown, true);
  }

  /** Abandons the drag in progress, if any, leaving the layout untouched. */
  cancel(): void {
    this.finish(false);
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    const session = this.session;
    if (!session || event.pointerId !== session.pointerId) return;
    if (!session.started) {
      const distance = Math.hypot(event.clientX - session.start.x, event.clientY - session.start.y);
      if (distance < this.settings.dragThreshold) return;
      if (!this.start(session)) {
        this.finish(false);
        return;
      }
    }
    this.update(session, { x: event.clientX, y: event.clientY });
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (this.session && event.pointerId === this.session.pointerId) this.finish(true);
  };

  private readonly onCancel = (event: PointerEvent): void => {
    if (this.session && event.pointerId === this.session.pointerId) this.finish(false);
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.session?.started) {
      event.preventDefault();
      this.finish(false);
    }
  };

  private start(session: Session): boolean {
    const root = this.view.root;
    if (!root) return false;
    const { source } = session;
    if (source.kind === 'item') {
      const node = this.layout.getById(source.id);
      if (!node || (node.type !== 'panel' && node.type !== 'stack')) return false;
      const panel =
        node.type === 'panel'
          ? node
          : (node.children.find((child) => child.id === node.activeId) ?? node.children[0]);
      session.title = panel?.title ?? '';
      session.previewPanelId = panel?.id ?? null;
    } else {
      const item = typeof source.item === 'function' ? null : source.item;
      session.title =
        source.title ?? (item?.type === 'panel' ? (item.title ?? item.component) : '');
    }
    session.started = true;
    session.geometry = readGeometry(root);
    session.previousUserSelect = session.document.body.style.userSelect;
    session.document.body.style.userSelect = 'none';
    root.classList.add('gl-dragging');
    return true;
  }

  private update(session: Session, pointer: Point): void {
    const geometry = session.geometry;
    if (!geometry) return;
    const { bounds } = geometry;
    const point = this.settings.constrainDragToContainer
      ? {
          x: clamp(pointer.x, bounds.left, bounds.left + bounds.width),
          y: clamp(pointer.y, bounds.top, bounds.top + bounds.height),
        }
      : pointer;

    const target = findDropTarget(geometry, point);
    const drop = target ? this.resolve(session.source, target.place) : null;
    session.drop = drop;

    let x = point.x - PROXY_OFFSET;
    let y = point.y - PROXY_OFFSET;
    if (this.settings.constrainDragToContainer) {
      const width = this.proxyElement?.offsetWidth ?? 0;
      const height = this.proxyElement?.offsetHeight ?? 0;
      x = clamp(x, bounds.left, bounds.left + bounds.width - width);
      y = clamp(y, bounds.top, bounds.top + bounds.height - height);
    }

    const root = this.view.root;
    const originX = bounds.left + (root?.clientLeft ?? 0);
    const originY = bounds.top + (root?.clientTop ?? 0);
    this.publish({
      active: true,
      title: session.title,
      x,
      y,
      indicator:
        drop && target
          ? {
              left: target.highlight.left - originX,
              top: target.highlight.top - originY,
              width: target.highlight.width,
              height: target.highlight.height,
            }
          : null,
      previewPanelId: session.previewPanelId,
    });
  }

  /** Turns a place on screen into a destination in the tree, or `null` if it makes no sense. */
  private resolve(source: DragSource, place: DropPlace): Destination | 'empty' | null {
    if (place.kind === 'empty') return source.kind === 'new' ? 'empty' : null;
    const state = this.layout.getState();
    const index = getIndex(state.root);

    if (source.kind === 'new') {
      if (place.kind === 'side') {
        return state.maximisedId === null ? { target: place.targetId, side: place.side } : null;
      }
      return { parent: place.stackId, index: place.index };
    }

    const entry = index.get(source.id);
    if (!entry || !entry.parent) return null;
    const ownStackId = entry.node.type === 'panel' ? entry.parent.id : entry.node.id;

    if (place.kind === 'side') {
      // A maximised stack hides the rest of the layout, so there is nothing to dock against.
      if (state.maximisedId !== null) return null;
      if (isWithin(state.root, place.targetId, source.id)) return null;
      const alone = entry.node.type !== 'panel' || entry.parent.children.length === 1;
      if (place.targetId === ownStackId && alone) return null;
      return { target: place.targetId, side: place.side };
    }

    if (entry.node.type === 'stack') {
      return place.stackId === source.id ? null : { parent: place.stackId, index: place.index };
    }
    if (place.stackId !== ownStackId) return { parent: place.stackId, index: place.index };
    // Within its own stack the tab is still in the strip: count positions without it.
    const current = entry.parent.children.findIndex((child) => child.id === source.id);
    return { parent: ownStackId, index: place.index > current ? place.index - 1 : place.index };
  }

  private finish(commit: boolean): void {
    const session = this.session;
    if (!session) return;
    this.session = null;
    const doc = session.document;
    doc.removeEventListener('pointermove', this.onPointerMove);
    doc.removeEventListener('pointerup', this.onPointerUp);
    doc.removeEventListener('pointercancel', this.onCancel);
    doc.removeEventListener('keydown', this.onKeyDown, true);
    if (!session.started) return;

    doc.body.style.userSelect = session.previousUserSelect;
    this.view.root?.classList.remove('gl-dragging');
    this.publish(IDLE);

    // The release would otherwise also count as a click on whatever is under the pointer.
    const swallow = (event: MouseEvent): void => event.stopPropagation();
    doc.addEventListener('click', swallow, true);
    setTimeout(() => doc.removeEventListener('click', swallow, true), 0);

    const { drop, source } = session;
    if (!commit || drop === null) return;
    if (source.kind === 'item') {
      if (drop !== 'empty') this.layout.moveItem(source.id, drop);
      return;
    }
    const item = typeof source.item === 'function' ? source.item() : source.item;
    this.layout.addItem(item, drop === 'empty' ? undefined : drop);
  }

  private publish(state: DragOverlayState): void {
    this.state = state;
    for (const listener of [...this.listeners]) listener();
  }
}

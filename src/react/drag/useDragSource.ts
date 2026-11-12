import { useCallback, useContext, useLayoutEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { NodeConfig } from '../../model/types';
import type { Layout } from '../../store';
import { LayoutContext } from '../context';
import type { DragController } from './DragController';

const controllers = new WeakMap<Layout, DragController>();

/** Lets drag sources outside the `<GoldenLayout>` tree find the mounted layout's controller. */
export function registerDragController(layout: Layout, controller: DragController): () => void {
  controllers.set(layout, controller);
  return () => {
    if (controllers.get(layout) === controller) controllers.delete(layout);
  };
}

export interface DragSourceOptions {
  /** The layout to drop into. Needed only when the element is outside `<GoldenLayout>`. */
  layout?: Layout;
  /** Text shown on the drag proxy. Defaults to the panel's title or component name. */
  title?: string;
}

export interface DragSourceProps {
  onPointerDown: (event: ReactPointerEvent) => void;
}

/**
 * Makes any element a source of new items: spread the returned props on it, and dragging
 * it into the layout creates `item` where it is dropped. `item` may be a function, called
 * on drop, to build the config at the last moment.
 */
export function useDragSource(
  item: NodeConfig | (() => NodeConfig),
  options: DragSourceOptions = {},
): DragSourceProps {
  const context = useContext(LayoutContext);
  const latest = useRef({ item, options, context });
  useLayoutEffect(() => {
    latest.current = { item, options, context };
  });

  const onPointerDown = useCallback((event: ReactPointerEvent) => {
    const current = latest.current;
    const controller = current.options.layout
      ? controllers.get(current.options.layout)
      : current.context?.drag;
    if (!controller) {
      throw new Error(
        'useDragSource: no mounted <GoldenLayout> found. Use it inside the layout, or pass ' +
          'the `layout` option with the handle given to <GoldenLayout layout={...}>.',
      );
    }
    // Stops the browser starting a native drag of an image or selected text.
    event.preventDefault();
    controller.begin(event.nativeEvent, {
      kind: 'new',
      item: current.item,
      title: current.options.title,
    });
  }, []);

  return { onPointerDown };
}

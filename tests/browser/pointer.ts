import { userEvent } from 'vite-plus/test/browser/context';

export interface Point {
  x: number;
  y: number;
}

export function centerOf(element: Element): Point {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** Presses the left button at `from`, moves through `via` and `to`, and optionally releases. */
export async function mouseDrag(
  from: Point,
  to: Point,
  options: { via?: Point[]; release?: boolean; steps?: number } = {},
): Promise<void> {
  const { via = [], release = true, steps = 4 } = options;
  const path: Point[] = [];
  let previous = from;
  for (const stop of [...via, to]) {
    for (let i = 1; i <= steps; i++) {
      path.push({
        x: previous.x + ((stop.x - previous.x) * i) / steps,
        y: previous.y + ((stop.y - previous.y) * i) / steps,
      });
    }
    previous = stop;
  }
  await userEvent.pointer([
    { coords: from },
    '[MouseLeft>]',
    ...path.map((coords) => ({ coords })),
    ...(release ? ['[/MouseLeft]'] : []),
  ]);
}

export async function mouseUp(): Promise<void> {
  await userEvent.pointer('[/MouseLeft]');
}

export async function mouseMove(to: Point): Promise<void> {
  await userEvent.pointer({ coords: to });
}

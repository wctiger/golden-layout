import { describe, expect, it } from 'vite-plus/test';
import { userEvent } from 'vite-plus/test/browser/context';
import type { Action } from '../../src/index';
import { mountLayout, verifyPath } from './helpers';

const config = {
  root: {
    type: 'row' as const,
    children: [
      {
        type: 'column' as const,
        children: [
          {
            type: 'stack' as const,
            id: 'stackA',
            children: [{ type: 'panel' as const, id: 'a', component: 'testComponent' }],
          },
          {
            type: 'stack' as const,
            id: 'stackB',
            children: [{ type: 'panel' as const, id: 'b', component: 'testComponent' }],
          },
        ],
      },
      { type: 'row' as const },
    ],
  },
};

const header = (root: HTMLElement, stackId: string): HTMLElement =>
  root.querySelector<HTMLElement>(`.gl-stack[data-item-id="${stackId}"] > .gl-header`)!;
const stack = (root: HTMLElement, stackId: string): HTMLElement =>
  root.querySelector<HTMLElement>(`.gl-stack[data-item-id="${stackId}"]`)!;
/** Clicks the header's empty background, to the right of its tabs. */
const clickHeader = (element: HTMLElement): Promise<void> =>
  userEvent.click(element, { position: { x: element.clientWidth / 2, y: 5 } });

// Ported from test/enabled-selection-tests.js
describe('selection, when enabled', () => {
  const mount = async () => {
    const selections: Action[] = [];
    const mounted = await mountLayout(config, {
      settings: { selectionEnabled: true },
      onChange: (_state, action) => {
        if (action.type === 'select') selections.push(action);
      },
    });
    return { ...mounted, selections };
  };

  it('creates a layout', async () => {
    const { layout } = await mount();
    verifyPath('row.0.column.0.stack.0.panel', layout);
    verifyPath('row.1.row', layout);
  });

  it('finds both stacks, with nothing selected', async () => {
    const { layout, root } = await mount();
    expect(layout.getParent('a')?.id).toBe('stackA');
    expect(layout.getParent('b')?.id).toBe('stackB');
    expect(layout.getState().selectedId).toBeNull();
    expect(root.querySelectorAll('.gl-selected')).toHaveLength(0);
  });

  it('clicks a header and it selects a stack', async () => {
    const { layout, root, selections } = await mount();
    expect(header(root, 'stackA').classList.contains('gl-selectable')).toBe(true);
    expect(stack(root, 'stackA').classList.contains('gl-selected')).toBe(false);

    await clickHeader(header(root, 'stackA'));

    expect(selections).toHaveLength(1);
    expect(layout.getState().selectedId).toBe('stackA');
    await expect.poll(() => stack(root, 'stackA').classList.contains('gl-selected')).toBe(true);
  });

  it('clicking another header changes the selection', async () => {
    const { layout, root, selections } = await mount();
    await clickHeader(header(root, 'stackA'));
    await clickHeader(header(root, 'stackB'));

    expect(selections).toHaveLength(2);
    expect(layout.getState().selectedId).toBe('stackB');
    await expect.poll(() => stack(root, 'stackB').classList.contains('gl-selected')).toBe(true);
    expect(stack(root, 'stackA').classList.contains('gl-selected')).toBe(false);
  });

  it('changes selection programmatically', async () => {
    const { layout, root, selections } = await mount();
    layout.select('stackB');
    layout.select('stackA');

    // One action per change. The legacy layout emitted two events here, a deselect then a select.
    expect(selections).toEqual([
      { type: 'select', id: 'stackB' },
      { type: 'select', id: 'stackA' },
    ]);
    await expect.poll(() => stack(root, 'stackA').classList.contains('gl-selected')).toBe(true);
    expect(stack(root, 'stackB').classList.contains('gl-selected')).toBe(false);
  });

  it('clicking a tab activates it without selecting the stack', async () => {
    const { layout, root } = await mount();
    await userEvent.click(root.querySelector('.gl-tab')!);
    expect(layout.getState().selectedId).toBeNull();
  });
});

// Ported from test/disabled-selection-tests.js
describe('selection, when disabled', () => {
  it('creates a layout', async () => {
    const { layout } = await mountLayout(config);
    verifyPath('row.0.column.0.stack.0.panel', layout);
  });

  it('finds both stacks', async () => {
    const { layout } = await mountLayout(config);
    expect(layout.getParent('a')?.type).toBe('stack');
    expect(layout.getParent('b')?.type).toBe('stack');
  });

  it('clicks a header, but nothing happens since selection is not enabled', async () => {
    const actions: Action[] = [];
    const { layout, root } = await mountLayout(config, {
      onChange: (_state, action) => actions.push(action),
    });
    expect(header(root, 'stackA').classList.contains('gl-selectable')).toBe(false);

    await clickHeader(header(root, 'stackA'));

    expect(actions).toHaveLength(0);
    expect(layout.getState().selectedId).toBeNull();
    expect(root.querySelector('.gl-selected')).toBeNull();
  });
});

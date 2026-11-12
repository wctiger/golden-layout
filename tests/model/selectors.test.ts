import { describe, expect, it } from 'vite-plus/test';
import { createLayout } from '../../src/index';
import { verifyPath } from './helpers';

// Ported from test/selector-tests.js. The legacy config tagged several items with a shared
// id ("groupB"); with one id per item, grouping is done with a filter instead.
describe('it is possible to select items from the tree', () => {
  const layout = createLayout({
    root: {
      type: 'column',
      children: [
        { type: 'panel', id: 'simpleStringId', component: 'testComponent' },
        {
          type: 'column',
          id: 'outerColumn',
          children: [{ type: 'column', id: 'groupB-inner' }],
        },
      ],
    },
  });

  it('creates a layout with items that have ids', () => {
    verifyPath('column.0.stack.0.panel', layout.getState());
    verifyPath('column.1.column.0.column', layout.getState());
  });

  it('finds an item by string id', () => {
    expect(layout.getById('simpleStringId')?.type).toBe('panel');
  });

  it('returns nothing if no item was found for an id', () => {
    expect(layout.getById('doesNotExist')).toBeUndefined();
    expect(layout.filter((node) => node.id === 'doesNotExist')).toEqual([]);
  });

  it('finds a group of items with a filter', () => {
    expect(
      layout.filter((node) => node.id.startsWith('groupB') || node.id === 'outerColumn'),
    ).toHaveLength(2);
    expect(layout.filter((node) => node.id === 'outerColumn')).toHaveLength(1);
  });

  it('finds items by type', () => {
    const items = layout.getByType('column');
    expect(items).toHaveLength(3);
    expect(items[0]?.type).toBe('column');
    expect(items[1]?.type).toBe('column');
  });

  it('returns an empty array if no item was found for a type', () => {
    expect(layout.getByType('row')).toEqual([]);
  });

  it('finds panels by component name', () => {
    const panels = layout.getByComponent('testComponent');
    expect(panels).toHaveLength(1);
    expect(panels[0]?.id).toBe('simpleStringId');
  });

  it('allows searching beneath an item', () => {
    const innerColumns = layout.getByType('column', layout.getById('outerColumn'));
    expect(innerColumns).toHaveLength(1);
    expect(innerColumns[0]?.type).toBe('column');
  });
});

import { describe, expect, it } from 'vite-plus/test';
import { LayoutError, createLayout } from '../../src/index';
import { verifyPath } from './helpers';

// Ported from test/id-tests.js. Items used to carry any number of ids, added and removed
// at runtime. Every item now has exactly one id, fixed when it is created, so the
// add/remove cases become assertions about that single id.
describe('ids work properly', () => {
  const layout = createLayout({ root: { type: 'panel', component: 'testComponent' } });

  it('finds the item', () => {
    expect(verifyPath('stack.0.panel', layout.getState()).type).toBe('panel');
  });

  it('gives an item without an id a generated one', () => {
    const item = verifyPath('stack.0.panel', layout.getState());
    expect(item.id).toBe('panel-1');
    expect(layout.getById('id_1')).toBeUndefined();
    expect(layout.getById('id_2')).toBeUndefined();
  });

  it('uses the id given as a string', () => {
    const id = layout.addPanel({ id: 'id_1', component: 'testComponent' });
    expect(id).toBe('id_1');
    expect(layout.getById('id_1')).toBe(verifyPath('stack.1.panel', layout.getState()));
    expect(layout.getById('id_2')).toBeUndefined();
  });

  it('keeps ids apart when a second item is added', () => {
    layout.addPanel({ id: 'id_2', component: 'testComponent' });
    expect(layout.getById('id_1')?.id).toBe('id_1');
    expect(layout.getById('id_2')?.id).toBe('id_2');
    expect(layout.getById('id_1')).not.toBe(layout.getById('id_2'));
  });

  it("doesn't add duplicated ids", () => {
    const before = layout.getState();
    expect(() => layout.addPanel({ id: 'id_2', component: 'testComponent' })).toThrow(LayoutError);
    expect(layout.getState()).toBe(before);
  });

  it('removes ids with their item', () => {
    layout.removeItem('id_2');
    expect(layout.getById('id_1')).toBeDefined();
    expect(layout.getById('id_2')).toBeUndefined();
  });

  it('throws when trying to remove a non-existent id', () => {
    expect(() => layout.removeItem('id_2')).toThrow(LayoutError);
  });

  it('never reuses a live id when generating', () => {
    const id = layout.addPanel({ component: 'testComponent' });
    expect(id).not.toBe('panel-1');
    expect(layout.getById(id)?.type).toBe('panel');
  });

  // Review finding on PR #11: the id handed back was chosen before looking inside the item.
  it('does not generate an id that the new item uses further down', () => {
    const fresh = createLayout();
    const id = fresh.addItem({ type: 'row', children: [{ type: 'row', id: 'row-1' }] });
    expect(id).toBe('row-2');
    expect(fresh.getById('row-1')?.type).toBe('row');
    expect(fresh.getParent('row-1')?.id).toBe('row-2');

    const replaced = fresh.replaceItem('row-2', {
      type: 'column',
      children: [{ type: 'column', id: 'column-1' }],
    });
    expect(replaced).toBe('column-2');
    expect(fresh.getParent('column-1')?.id).toBe('column-2');
  });
});

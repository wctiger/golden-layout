import { describe, expect, it } from 'vite-plus/test';
import { DEFAULT_SETTINGS, resolveLabels, resolveSettings } from '../../src/index';

// Ported from test/create-config.tests.js
describe('it creates and extends settings correctly', () => {
  it("doesn't change the defaults when overriding them", () => {
    expect(resolveSettings().dragThreshold).toBe(10);

    const mine = resolveSettings({ dragThreshold: 25 });

    expect(mine).not.toEqual(resolveSettings());
    expect(resolveSettings().dragThreshold).toBe(10);
    expect(DEFAULT_SETTINGS.dragThreshold).toBe(10);
    expect(mine.dragThreshold).toBe(25);
    expect(mine.hasHeaders).toBe(true);
  });

  it('does the same for labels', () => {
    expect(resolveLabels({ close: 'shut' })).toMatchObject({ close: 'shut', maximize: 'maximize' });
    expect(resolveLabels().close).toBe('close');
  });
});

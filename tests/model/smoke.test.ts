import { expect, it } from 'vite-plus/test';
import { VERSION } from '../../src/index';

it('exposes a version', () => {
  expect(VERSION).toMatch(/^2\./);
});

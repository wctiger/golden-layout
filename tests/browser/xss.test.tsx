import { describe, expect, it } from 'vite-plus/test';
import { mountLayout } from './helpers';

declare global {
  interface Window {
    __glXss?: number;
  }
}

// Ported from test/xss_tests.js. The legacy suite tested a string filter that titles were
// passed through before being inserted as HTML. There is no filter any more, because
// titles are rendered as text; these cases check that each of the old payloads is inert.
describe('titles cannot inject markup or script', () => {
  const inert = async (title: string): Promise<HTMLElement> => {
    window.__glXss = 0;
    const { root } = await mountLayout({
      root: { type: 'panel', component: 'testComponent', title },
    });
    const tab = root.querySelector<HTMLElement>('.gl-tab')!;
    expect(tab.querySelector('.gl-title')!.textContent).toBe(title);
    expect(tab.getAttribute('title')).toBe(title);
    expect(tab.querySelector('.gl-title')!.children).toHaveLength(0);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(window.__glXss).toBe(0);
    return tab;
  };

  it('escapes tags', async () => {
    const tab = await inert('>\'>"><img src=x onerror=window.__glXss=1>');
    expect(tab.querySelector('img')).toBeNull();
  });

  it('does not run javascript urls', async () => {
    const tab = await inert('javascript:window.__glXss=1');
    expect(tab.querySelector('a')).toBeNull();
  });

  it('does not evaluate expression statements', async () => {
    const tab = await inert('expression:window.__glXss=1');
    expect(tab.getAttribute('style')).toBeNull();
  });

  it('does not attach onload handlers', async () => {
    const tab = await inert('<body onload=window.__glXss=1> onLoad=window.__glXss=1');
    expect(tab.onload).toBeNull();
  });

  it('does not attach onerror handlers', async () => {
    const tab = await inert('<svg onerror=window.__glXss=1> onError=window.__glXss=1');
    expect(tab.querySelector('svg[onerror]')).toBeNull();
    expect(tab.onerror).toBeNull();
  });
});

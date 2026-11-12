import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';

const root = join(import.meta.dirname, '..', '..');
const themesDir = join(root, 'examples', 'themes');
const base = readFileSync(join(root, 'src', 'styles', 'golden-layout.css'), 'utf8');
const strip = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Every custom property the base stylesheet declares, with its default. */
const declared = new Map(
  [...strip(base).matchAll(/(--gl-[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]),
);

describe('styling', () => {
  it('ships exactly one stylesheet', () => {
    expect(readdirSync(join(root, 'src', 'styles'))).toEqual(['golden-layout.css']);
  });

  it('uses no colour or themed dimension outside the variable block', () => {
    const rules = strip(base).slice(strip(base).indexOf('.gl-root {'));
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(rules).not.toMatch(/\brgba?\(/);
  });

  it('declares every variable it uses', () => {
    const used = new Set([...strip(base).matchAll(/var\((--gl-[\w-]+)/g)].map((m) => m[1]!));
    expect([...used].filter((name) => !declared.has(name))).toEqual([]);
    expect([...declared.keys()].filter((name) => !used.has(name))).toEqual([]);
  });

  it.each(readdirSync(themesDir))(
    '%s is a single rule of known variable overrides',
    (file: string) => {
      const css = strip(readFileSync(join(themesDir, file), 'utf8'));
      const name = file.replace('.css', '');
      const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
      expect(rules).toHaveLength(1);
      const [, selector, body] = rules[0]!;
      expect(selector!.trim().split(/\s*,\s*/)).toEqual([
        `.gl-theme-${name}.gl-root`,
        `.gl-theme-${name} .gl-root`,
      ]);
      const properties = body!
        .split(';')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.slice(0, line.indexOf(':')).trim());
      expect(properties.length).toBeGreaterThan(5);
      expect(properties.filter((property) => !declared.has(property))).toEqual([]);
    },
  );

  it('has the four example themes', () => {
    expect(readdirSync(themesDir).sort()).toEqual([
      'dark.css',
      'light.css',
      'soda.css',
      'translucent.css',
    ]);
  });
});

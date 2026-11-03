import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BRAND_MARK_SVG, LOGO, MARK } from '../src/core/brand.js';

const generatedFiles = ['public/favicon.svg', 'build/icon.svg'];

describe('brand assets', () => {
  it.each(generatedFiles)('%s matches the canonical mark', file => {
    const content = readFileSync(resolve(file), 'utf8').replace(/^<!--.*-->\n/, '');
    expect(content.trim()).toBe(BRAND_MARK_SVG);
  });

  it('uses identical artwork for inline marks and standalone app icons', () => {
    const svgBody = (svg: string) => svg.replace(/^<svg\b[^>]*>/, '').replace(/<\/svg>$/, '');
    expect(svgBody(MARK(24))).toBe(svgBody(BRAND_MARK_SVG));
  });

  it('renders an accessible wordmark without relying on installed fonts', () => {
    expect(LOGO(24)).toContain('aria-label="Moss"');
    expect(LOGO(24)).toContain('fill="currentColor"');
    expect(LOGO(24)).toContain('<path');
    expect(LOGO(24)).not.toContain('<text');
  });
});

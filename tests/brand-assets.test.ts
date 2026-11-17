import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BRAND_MARK_SVG, LOGO, MARK } from '../src/core/brand.js';

const generatedFiles = ['public/favicon.svg', 'build/icon.svg'];
const trayFiles: Array<[string, number]> = [
  ['public/trayTemplate.png', 18],
  ['public/trayTemplate@2x.png', 36],
  ['public/trayTemplate@3x.png', 54],
];

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

  it.each(trayFiles)('%s is a %i×%i template PNG', (file, size) => {
    const content = readFileSync(resolve(file));
    expect(content.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect(content.readUInt32BE(16)).toBe(size);
    expect(content.readUInt32BE(20)).toBe(size);
    expect(content[25]).toBe(6);
  });
});

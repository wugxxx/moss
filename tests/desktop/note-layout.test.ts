import { describe, expect, it } from 'vitest';
import { nextNoteBounds } from '../../apps/desktop/src/note-layout.js';

const area = { x: 0, y: 24, width: 1440, height: 876 };

describe('nextNoteBounds', () => {
  it('places the first note at the top-right', () => {
    expect(nextNoteBounds(area, [], 360, 440)).toEqual({ x: 1056, y: 96, width: 360, height: 440 });
  });

  it('places the next note to the left without overlapping', () => {
    const first = nextNoteBounds(area, [], 360, 440);
    expect(nextNoteBounds(area, [first], 360, 440)).toEqual({ x: 684, y: 96, width: 360, height: 440 });
  });

  it('starts a new row when the horizontal space is full', () => {
    const tallArea = { ...area, height: 1000 };
    const open = [
      { x: 1056, y: 96, width: 360, height: 440 },
      { x: 684, y: 96, width: 360, height: 440 },
      { x: 312, y: 96, width: 360, height: 440 },
    ];
    expect(nextNoteBounds(tallArea, open, 360, 440)).toEqual({ x: 1056, y: 548, width: 360, height: 440 });
  });

  it('cascades when every grid position is occupied', () => {
    const open = [
      { x: 1056, y: 96, width: 360, height: 440 },
      { x: 684, y: 96, width: 360, height: 440 },
      { x: 312, y: 96, width: 360, height: 440 },
      { x: 1056, y: 548, width: 360, height: 440 },
      { x: 684, y: 548, width: 360, height: 440 },
      { x: 312, y: 548, width: 360, height: 440 },
    ];
    expect(nextNoteBounds(area, open, 360, 440)).toEqual({ x: 912, y: 240, width: 360, height: 440 });
  });
});

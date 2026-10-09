import { describe, expect, it } from 'vitest';
import { tailHeading } from '../../src/lib/client/toc-tail';

// Viewport 800px, Starlight's strip at 100px. Headings are given at their positions for the
// current scroll; `remaining` is how far the page can still scroll.
const base = { band: 100, viewport: 800, maxScroll: 2000 };

describe('tailHeading', () => {
  it('defers to Starlight when the last heading can reach the strip', () => {
    // Last heading at 500 with 600px left to scroll ends at -100, above the strip.
    expect(tailHeading({ ...base, tops: [50, 300, 500], remaining: 600 })).toBeNull();
  });

  it('defers to Starlight before the final screen of scrolling', () => {
    expect(tailHeading({ ...base, tops: [-900, 1200, 1500], remaining: 900 })).toBeNull();
  });

  it('marks the last heading current at the bottom of the page', () => {
    expect(tailHeading({ ...base, tops: [-1200, 300, 650], remaining: 0 })).toBe(2);
  });

  it('gives each unreachable heading a turn on the way down', () => {
    // Headings at 1000/1200/1400 in document space, page scrolls 1200px, so none past the first
    // can reach the strip. Walk the last screen and record which heading is current.
    const doc = [0, 1000, 1200, 1400];
    const seen = new Set<number | null>();
    for (let y = 0; y <= 1200; y += 10) {
      seen.add(
        tailHeading({ ...base, maxScroll: 1200, tops: doc.map((t) => t - y), remaining: 1200 - y }),
      );
    }
    expect([...seen].filter((i) => i !== null).sort()).toEqual([0, 1, 2, 3]);
  });

  it('starts at the strip when the page scrolls less than a screen', () => {
    // Only 200px of scroll: at the top the line sits on the strip, not mid-screen.
    expect(tailHeading({ ...base, maxScroll: 200, tops: [80, 400, 700], remaining: 200 })).toBeNull();
    expect(tailHeading({ ...base, maxScroll: 200, tops: [-120, 200, 500], remaining: 0 })).toBe(2);
  });

  it('leaves pages that do not scroll to Starlight', () => {
    expect(tailHeading({ ...base, maxScroll: 0, tops: [80, 400], remaining: 0 })).toBeNull();
  });
});

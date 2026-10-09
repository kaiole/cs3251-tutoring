/**
 * Lets the last "On this page" headings become current. Starlight only marks a heading current
 * once it scrolls into a strip just under the header, so headings in the final screen of a page
 * (a short last section) can never reach it. Over the last screen of scrolling, the activation
 * line slides from that strip to the bottom of the viewport, so every heading gets a turn and the
 * last one is current at the bottom of the page. Elsewhere Starlight's own choice stands.
 */

export interface TailInput {
  /** Heading tops in viewport coordinates, in document order. */
  tops: number[];
  /** Top of Starlight's activation strip (header + mobile summary + 2rem). */
  band: number;
  /** Viewport height. */
  viewport: number;
  /** Maximum scroll offset of the page. */
  maxScroll: number;
  /** Distance left to scroll before the end of the page. */
  remaining: number;
}

/** Index of the heading to mark current, or null to keep Starlight's choice. */
export function tailHeading({ tops, band, viewport, maxScroll, remaining }: TailInput): number | null {
  const last = tops.at(-1);
  if (last === undefined || maxScroll <= 0) return null;
  // At the bottom of the page the last heading sits at `last - remaining`; if that still reaches
  // the strip, Starlight's own logic covers every heading.
  if (last - remaining <= band) return null;
  const sweep = Math.min(viewport - band, maxScroll);
  if (sweep <= 0) return null;
  const progress = Math.min(1, Math.max(0, 1 - remaining / sweep));
  if (progress === 0) return null;
  const line = band + progress * (viewport - band);
  let index = -1;
  tops.forEach((top, i) => {
    if (top <= line) index = i;
  });
  return index === -1 ? null : index;
}

type Toc = HTMLElement & { _current?: HTMLAnchorElement | null };

function findSetter(el: object): ((this: unknown, link: HTMLAnchorElement) => void) | undefined {
  for (let proto = Object.getPrototypeOf(el); proto; proto = Object.getPrototypeOf(proto)) {
    const set = Object.getOwnPropertyDescriptor(proto, 'current')?.set;
    if (set) return set;
  }
  return undefined;
}

function patch(toc: Toc) {
  const setCurrent = findSetter(toc);
  if (!setCurrent) return;
  const pairs = [...toc.querySelectorAll('a')].flatMap((link) => {
    const heading = document.getElementById(decodeURIComponent(link.hash.slice(1)));
    return heading ? [{ link, heading }] : [];
  });
  if (!pairs.length) return;

  // Starlight's latest choice, applied whenever the tail rule does not apply.
  let requested = toc._current ?? undefined;
  const apply = () => {
    const root = document.documentElement;
    const maxScroll = root.scrollHeight - root.clientHeight;
    const band =
      (document.querySelector('header')?.getBoundingClientRect().height ?? 0) +
      (toc.querySelector('summary')?.getBoundingClientRect().height ?? 0) +
      32;
    const index = tailHeading({
      tops: pairs.map((p) => p.heading.getBoundingClientRect().top),
      band,
      viewport: root.clientHeight,
      maxScroll,
      remaining: maxScroll - window.scrollY,
    });
    const link = index === null ? requested : pairs[index]!.link;
    if (link) setCurrent.call(toc, link);
  };

  Object.defineProperty(toc, 'current', {
    configurable: true,
    set(link: HTMLAnchorElement) {
      requested = link;
      apply();
    },
  });

  let frame = 0;
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(() => ((frame = 0), apply()));
  };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  apply();
}

export function installTocTail() {
  for (const tag of ['starlight-toc', 'mobile-starlight-toc']) {
    void customElements.whenDefined(tag).then(() => {
      document.querySelectorAll<Toc>(tag).forEach(patch);
    });
  }
}

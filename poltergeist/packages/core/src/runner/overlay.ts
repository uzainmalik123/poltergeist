import type { BrowserContext, Page } from 'playwright-core';

/** `--ecto`: ghosts only (D-24, THEME.md). */
export const OVERLAY_COLOR = '#7dffb0';

const CURSOR_KEY = 'poltergeist.cursor';

/**
 * Runs in the page. A ghost-cursor blob in a closed shadow root: `aria-hidden`, no text and
 * `pointer-events: none`, so it never changes what assertions, aria snapshots or clicks see (Req 6.6).
 */
function overlayScript({ color, key }: { color: string; key: string }): void {
  // core has no DOM lib, so the page globals are typed by hand here.
  type El = { style: { cssText: string }; setAttribute(n: string, v: string): void; attachShadow(o: { mode: string }): { appendChild(c: El): void }; appendChild(c: El): void };
  const g = globalThis as unknown as {
    document: { createElement(t: string): El; documentElement: El | null; addEventListener(e: string, f: () => void): void };
  } & Record<symbol, unknown>;
  const doc = g.document;
  const host = doc.createElement('poltergeist-ghost');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'all: initial; position: fixed; inset: 0 auto auto 0; width: 0; height: 0; z-index: 2147483647; pointer-events: none;';
  const blob = doc.createElement('div');
  blob.style.cssText = `position: fixed; left: -100px; top: -100px; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50% 50% 40% 40%; background: ${color}; box-shadow: 0 0 10px ${color}; opacity: 0.85; pointer-events: none; transition: left 80ms linear, top 80ms linear;`;
  host.attachShadow({ mode: 'closed' }).appendChild(blob);
  g[Symbol.for(key)] = (x: number, y: number) => {
    blob.style.cssText = blob.style.cssText.replace(/left: [^;]+;/, `left: ${x}px;`).replace(/top: [^;]+;/, `top: ${y}px;`);
  };
  const attach = () => doc.documentElement?.appendChild(host);
  if (doc.documentElement) attach();
  else doc.addEventListener('DOMContentLoaded', attach);
}

export async function installOverlay(context: BrowserContext): Promise<void> {
  await context.addInitScript(overlayScript, { color: OVERLAY_COLOR, key: CURSOR_KEY });
}

/** Moves the ghost cursor; a page without the overlay (or a closing one) is ignored. */
export async function moveCursor(page: Page, x: number, y: number): Promise<void> {
  await page
    .evaluate(
      ({ x, y, key }) => {
        const move = (globalThis as unknown as Record<symbol, unknown>)[Symbol.for(key)];
        if (typeof move === 'function') (move as (x: number, y: number) => void)(x, y);
      },
      { x, y, key: CURSOR_KEY },
    )
    .catch(() => undefined);
}

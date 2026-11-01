import type { Page } from 'playwright-core';

/**
 * Streams JPEG frames of a page through a CDP screencast, dropped to at most `fps` per second (≤ 4,
 * design §8). Returns a stop function that never throws, even on a closed page.
 */
export async function startFrames(page: Page, fps: number, onFrame: (jpeg: Buffer) => void): Promise<() => Promise<void>> {
  const cdp = await page.context().newCDPSession(page);
  const gap = 1000 / fps;
  let last = -Infinity;
  let stopped = false;

  cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => undefined);
    if (stopped) return;
    const now = performance.now();
    if (now - last < gap) return;
    last = now;
    onFrame(Buffer.from(data, 'base64'));
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 50, maxWidth: 640, maxHeight: 640 });

  return async () => {
    if (stopped) return;
    stopped = true;
    await cdp.send('Page.stopScreencast').catch(() => undefined);
    await cdp.detach().catch(() => undefined);
  };
}

import { LIVE_PROTOCOL, UsageError, type LiveHello, type SummonEvent } from '@poltergeist/core';
import { WebSocket, WebSocketServer } from 'ws';

/** The runner WebSocket port (design §8, STACK). */
export const SEANCE_EVENT_PORT = 6660;

/** A client with more than this queued (bytes) is sent no frames until it drains (KI-43, D-40). */
export const MAX_BUFFERED = 1_048_576;

/**
 * Loopback binding doesn't stop a web page in the user's browser from connecting, so browser clients
 * must come from a loopback origin (the Séance on :6661, a dev server). Non-browser clients send none.
 */
function allowedOrigin(origin: string | undefined): boolean {
  if (origin === undefined) return true;
  try {
    const { hostname, protocol } = new URL(origin);
    return (protocol === 'http:' || protocol === 'https:') && ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
  } catch {
    return false;
  }
}

export type EventServer = { url: string; publish(e: SummonEvent): void; close(): Promise<void> };

/**
 * `--seance` only (PRD F09/F12, D-36, D-40): broadcasts every event on `ws://127.0.0.1:<port>/runs/<runId>`.
 * Each client gets `live.hello` first, then (late joiners) the events so far with each ghost's latest frame kept
 * in place, so `foldLive` reaches the same board and evidence. A finished rep's frames are dropped, except those
 * of ghosts that failed an assertion (the haunted evidence). A slow client loses frames, never other events.
 * Loopback only; other paths are refused.
 */
export async function startEventServer(
  runId: string,
  opts: { port?: number; host?: string; maxBuffered?: number } = {},
): Promise<EventServer> {
  const host = opts.host ?? '127.0.0.1';
  const port = opts.port ?? SEANCE_EVENT_PORT;
  const path = `/runs/${encodeURIComponent(runId)}`;
  const wss = new WebSocketServer({ host, port, path, maxPayload: 1024, verifyClient: ({ origin }: { origin?: string }) => allowedOrigin(origin) });
  await new Promise<void>((resolve, reject) => {
    wss.once('listening', resolve);
    wss.once('error', (err: NodeJS.ErrnoException) => {
      wss.close();
      reject(err.code === 'EADDRINUSE' ? new UsageError(`port ${port} is in use; is another summon --seance running?`) : err);
    });
  });
  const maxBuffered = opts.maxBuffered ?? MAX_BUFFERED;
  /** Every event so far; a ghost's superseded frames become holes, so the latest stays where it arrived. */
  const backlog: (string | undefined)[] = [];
  const ghosts = new Map<string, { criterion: string; persona: string; rep: number; failed: boolean }>();
  const frameAt = new Map<string, number>();
  const dropFrame = (ghostId: string) => {
    const i = frameAt.get(ghostId);
    if (i !== undefined) backlog[i] = undefined;
    frameAt.delete(ghostId);
  };
  wss.on('connection', (ws) => {
    ws.on('error', () => ws.terminate()); // a malformed frame from one client must not crash the run
    ws.send(JSON.stringify({ type: 'live.hello', protocol: LIVE_PROTOCOL, runId, t: Date.now() } satisfies LiveHello));
    for (const line of backlog) if (line !== undefined) ws.send(line);
  });
  const address = wss.address();
  const actual = typeof address === 'object' && address ? address.port : port;
  return {
    url: `ws://${host}:${actual}${path}`,
    publish(e) {
      const line = JSON.stringify(e);
      const isFrame = e.type === 'ghost.frame';
      if (isFrame) {
        if (ghosts.has(e.ghostId)) {
          dropFrame(e.ghostId);
          frameAt.set(e.ghostId, backlog.push(line) - 1);
        }
      } else {
        backlog.push(line);
        if (e.type === 'ghost.spawned') ghosts.set(e.ghostId, { criterion: e.criterion, persona: e.persona, rep: e.rep, failed: false });
        if (e.type === 'assert.result' && !e.ok) {
          for (const g of ghosts.values()) if (g.criterion === e.criterion && g.persona === e.persona && g.rep === e.rep) g.failed = true;
        }
        if (e.type === 'rep.finished') {
          for (const [id, g] of ghosts) {
            if (g.rep !== e.rep) continue;
            ghosts.delete(id);
            if (g.failed) frameAt.delete(id); // keep its last frame for good: it may be the evidence
            else dropFrame(id);
          }
        }
      }
      for (const client of wss.clients) {
        if (client.readyState !== WebSocket.OPEN) continue;
        if (isFrame && client.bufferedAmount > maxBuffered) continue;
        client.send(line);
      }
    },
    close() {
      // A graceful close flushes queued events (run.finished) before the socket goes.
      for (const client of wss.clients) client.close(1001, 'run finished');
      return new Promise((resolve) => wss.close(() => resolve()));
    },
  };
}

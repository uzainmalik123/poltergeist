import { UsageError, type SummonEvent } from '@poltergeist/core';
import { WebSocket, WebSocketServer } from 'ws';

/** The runner WebSocket port (design §8, STACK). */
export const SEANCE_EVENT_PORT = 6660;

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
 * `--seance` only (PRD F09, D-36): broadcasts every event on `ws://127.0.0.1:<port>/runs/<runId>`, and replays
 * the non-frame events so far to a client that joins late. Loopback only; other paths are refused.
 */
export async function startEventServer(runId: string, opts: { port?: number; host?: string } = {}): Promise<EventServer> {
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
  const backlog: string[] = [];
  wss.on('connection', (ws) => {
    ws.on('error', () => ws.terminate()); // a malformed frame from one client must not crash the run
    for (const line of backlog) ws.send(line);
  });
  const address = wss.address();
  const actual = typeof address === 'object' && address ? address.port : port;
  return {
    url: `ws://${host}:${actual}${path}`,
    publish(e) {
      const line = JSON.stringify(e);
      if (e.type !== 'ghost.frame') backlog.push(line);
      for (const client of wss.clients) if (client.readyState === WebSocket.OPEN) client.send(line);
    },
    close() {
      // A graceful close flushes queued events (run.finished) before the socket goes.
      for (const client of wss.clients) client.close(1001, 'run finished');
      return new Promise((resolve) => wss.close(() => resolve()));
    },
  };
}

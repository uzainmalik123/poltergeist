import { UsageError, type SummonEvent } from '@poltergeist/core';
import { WebSocket, WebSocketServer } from 'ws';

/** The runner WebSocket port (design §8, STACK). */
export const SEANCE_EVENT_PORT = 6660;

export type EventServer = { url: string; publish(e: SummonEvent): void; close(): Promise<void> };

/**
 * `--seance` only (PRD F09, D-36): broadcasts every event on `ws://127.0.0.1:<port>/runs/<runId>`, and replays
 * the non-frame events so far to a client that joins late. Loopback only; other paths are refused.
 */
export async function startEventServer(runId: string, opts: { port?: number; host?: string } = {}): Promise<EventServer> {
  const host = opts.host ?? '127.0.0.1';
  const port = opts.port ?? SEANCE_EVENT_PORT;
  const path = `/runs/${encodeURIComponent(runId)}`;
  const wss = new WebSocketServer({ host, port, path });
  await new Promise<void>((resolve, reject) => {
    wss.once('listening', resolve);
    wss.once('error', (err: NodeJS.ErrnoException) => {
      wss.close();
      reject(err.code === 'EADDRINUSE' ? new UsageError(`port ${port} is in use; is another summon --seance running?`) : err);
    });
  });
  const backlog: string[] = [];
  wss.on('connection', (ws) => {
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
      for (const client of wss.clients) client.terminate();
      return new Promise((resolve) => wss.close(() => resolve()));
    },
  };
}

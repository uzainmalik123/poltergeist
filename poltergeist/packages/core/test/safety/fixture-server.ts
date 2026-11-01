import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer } from 'ws';

export type Fixture = { origin: string; port: number; close(): Promise<void> };

/** A local app for guard tests: dual-stack loopback, redirects on demand, and an echo WebSocket at /ws. */
export async function startFixture(): Promise<Fixture> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://fixture');
    if (url.pathname === '/redirect') {
      res.writeHead(302, { location: url.searchParams.get('to') ?? '/ok', 'access-control-allow-origin': '*' });
      res.end();
      return;
    }
    if (url.pathname === '/ok' || url.pathname.startsWith('/api/')) {
      res.writeHead(200, { 'content-type': 'text/plain', 'access-control-allow-origin': '*' });
      res.end('ok');
      return;
    }
    if (url.pathname === '/sw.js') {
      res.writeHead(200, { 'content-type': 'text/javascript' });
      res.end("self.addEventListener('fetch', () => {});");
      return;
    }
    if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<!doctype html><title>fixture</title><p>haunt me</p>');
      return;
    }
    res.writeHead(404);
    res.end();
  });
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (socket) => socket.on('message', (data) => socket.send(data.toString())));
  await new Promise<void>((resolve) => server.listen({ host: '::', ipv6Only: false, port: 0 }, resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    port,
    close: async () => {
      for (const client of wss.clients) client.terminate();
      wss.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

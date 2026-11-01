import { UsageError, type SummonEvent } from '@poltergeist/core';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { startEventServer, type EventServer } from '../src/seance-server.js';

const servers: EventServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
});

async function start(runId = 'r1', port = 0) {
  const s = await startEventServer(runId, { port });
  servers.push(s);
  return s;
}

/** Connects and collects messages until `count` arrive. */
function collect(url: string, count: number): Promise<{ ws: WebSocket; messages: Promise<SummonEvent[]> }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const got: SummonEvent[] = [];
    let done!: (v: SummonEvent[]) => void;
    const messages = new Promise<SummonEvent[]>((r) => (done = r));
    ws.on('message', (data) => {
      got.push(JSON.parse(String(data)));
      if (got.length === count) done(got);
    });
    ws.on('open', () => resolve({ ws, messages }));
    ws.on('error', reject);
  });
}

const rep = { type: 'rep.started', rep: 1, t: 1 } as SummonEvent;
const frame = { type: 'ghost.frame', ghostId: 'g', seq: 0, jpegBase64: 'AA==', t: 2 } as SummonEvent;

describe('startEventServer', () => {
  it('binds to loopback on the run path', async () => {
    const s = await start('abc');
    expect(s.url).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/runs\/abc$/);
  });

  it('broadcasts events to connected clients', async () => {
    const s = await start();
    const c = await collect(s.url, 2);
    s.publish(rep);
    s.publish(frame);
    expect((await c.messages).map((e) => e.type)).toEqual(['rep.started', 'ghost.frame']);
    c.ws.close();
  });

  it('replays non-frame events to late joiners', async () => {
    const s = await start();
    s.publish(frame);
    s.publish(rep);
    const c = await collect(s.url, 1);
    expect((await c.messages).map((e) => e.type)).toEqual(['rep.started']);
    c.ws.close();
  });

  it('refuses other paths', async () => {
    const s = await start('r1');
    await expect(collect(s.url.replace('/runs/r1', '/runs/other'), 1)).rejects.toThrow();
  });

  it('says the port is in use', async () => {
    const s = await start();
    const port = Number(new URL(s.url).port);
    await expect(startEventServer('r2', { port })).rejects.toThrow(UsageError);
    await expect(startEventServer('r2', { port })).rejects.toThrow(new RegExp(`port ${port} is in use`));
  });

  it('closes connected clients', async () => {
    const s = await start();
    const c = await collect(s.url, 1);
    const closed = new Promise((r) => c.ws.on('close', r));
    await s.close();
    servers.length = 0;
    await expect(closed).resolves.toBeDefined();
  });
});

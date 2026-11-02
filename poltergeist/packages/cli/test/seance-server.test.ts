import { foldLive, UsageError, type LiveMessage, type SummonEvent } from '@poltergeist/core';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { startEventServer, type EventServer } from '../src/seance-server.js';

const servers: EventServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
});

async function start(runId = 'r1', port = 0, maxBuffered?: number) {
  const s = await startEventServer(runId, { port, maxBuffered });
  servers.push(s);
  return s;
}

/** Connects and collects messages until `count` arrive. */
function collect(url: string, count: number, origin?: string): Promise<{ ws: WebSocket; messages: Promise<SummonEvent[]> }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, origin ? { origin } : {});
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
const spawned = { type: 'ghost.spawned', ghostId: 'g', criterion: '3.2', persona: 'wraith', rep: 1, actor: 'a', t: 2 } as SummonEvent;
const repDone = { type: 'rep.finished', rep: 1, outcomes: { completed: 1, timeout: 0, planError: 0, systemError: 0 }, t: 3 } as SummonEvent;
const finished = { type: 'run.finished', runId: 'r1', counts: {}, haunted: [], durationMs: 1, t: 4 } as unknown as SummonEvent;
const hello = { type: 'live.hello', protocol: 1, runId: 'r1' };

/** Connects, then publishes `marker` and collects every message up to it. */
async function lateJoin(s: EventServer, marker = finished): Promise<LiveMessage[]> {
  const ws = new WebSocket(s.url);
  const got: LiveMessage[] = [];
  const done = new Promise<LiveMessage[]>((resolve) => {
    ws.on('message', (data) => {
      const m = JSON.parse(String(data)) as LiveMessage;
      got.push(m);
      if (m.type === marker.type) resolve(got);
    });
  });
  await new Promise((r) => ws.on('open', r));
  await until(() => got.length > 0);
  s.publish(marker);
  const out = await done;
  ws.close();
  return out;
}

async function until(fn: () => boolean) {
  for (let i = 0; i < 200 && !fn(); i++) await new Promise((r) => setTimeout(r, 5));
}

describe('startEventServer', () => {
  it('binds to loopback on the run path', async () => {
    const s = await start('abc');
    expect(s.url).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/runs\/abc$/);
  });

  it('broadcasts events to connected clients', async () => {
    const s = await start();
    const c = await collect(s.url, 3);
    s.publish(rep);
    s.publish(frame);
    expect((await c.messages).map((e) => e.type)).toEqual(['live.hello', 'rep.started', 'ghost.frame']);
    c.ws.close();
  });

  it('replays non-frame events to late joiners', async () => {
    const s = await start();
    s.publish(frame);
    s.publish(rep);
    const c = await collect(s.url, 2);
    expect((await c.messages).map((e) => e.type)).toEqual(['live.hello', 'rep.started']);
    c.ws.close();
  });

  it('greets every client with the protocol version first', async () => {
    const s = await start('r1');
    const c = await collect(s.url, 1);
    expect((await c.messages)[0]).toMatchObject(hello);
    c.ws.close();
  });

  it('sends a late joiner only the latest frame of each active ghost, in place', async () => {
    const s = await start();
    s.publish(rep);
    s.publish(spawned);
    s.publish(frame);
    s.publish({ ...frame, seq: 1 } as SummonEvent);
    const got = await lateJoin(s);
    expect(got.map((m) => [m.type, m.type === 'ghost.frame' ? m.seq : null])).toEqual([
      ['live.hello', null], ['rep.started', null], ['ghost.spawned', null], ['ghost.frame', 1], ['run.finished', null],
    ]);
  });

  it('keeps a failing ghost\'s latest frame in place, so a late joiner folds the same evidence (review)', async () => {
    const s = await start();
    const events = [
      spawned, frame, { ...frame, seq: 1 },
      { type: 'assert.result', criterion: '3.2', persona: 'wraith', rep: 1, index: 0, ok: false, detail: 'twice', t: 3 },
      repDone,
      { type: 'verdict.criterion', criterion: '3.2', verdict: 'haunted', t: 4 },
    ] as SummonEvent[];
    for (const e of events) s.publish(e);
    const got = await lateJoin(s);
    expect(got.filter((m) => m.type === 'ghost.frame').map((m) => m.type === 'ghost.frame' && m.seq)).toEqual([1]);
    const evidence = foldLive(got).lines.find((l) => l.id === '3.2')?.evidence;
    expect(evidence).toEqual({ ghostId: 'g', frame: 'frames/g/00001.jpg' });
    expect(evidence).toEqual(foldLive(events).lines.find((l) => l.id === '3.2')?.evidence);
  });

  it('sends no frames of a finished rep to a late joiner', async () => {
    const s = await start();
    s.publish(spawned);
    s.publish(frame);
    s.publish(repDone);
    const got = await lateJoin(s);
    expect(got.map((m) => m.type)).toEqual(['live.hello', 'ghost.spawned', 'rep.finished', 'run.finished']);
  });

  it('drops frames, never other events, for a client over the buffer limit', async () => {
    const s = await start('r1', 0, -1);
    const ws = new WebSocket(s.url);
    const got: LiveMessage[] = [];
    const done = new Promise<void>((resolve) => ws.on('message', (d) => {
      const m = JSON.parse(String(d)) as LiveMessage;
      got.push(m);
      if (m.type === 'run.finished') resolve();
    }));
    await new Promise((r) => ws.on('open', r));
    await until(() => got.length > 0);
    s.publish(spawned);
    s.publish(frame);
    s.publish(finished);
    await done;
    ws.close();
    expect(got.map((m) => m.type)).toEqual(['live.hello', 'ghost.spawned', 'run.finished']);
  });

  it('refuses other paths', async () => {
    const s = await start('r1');
    await expect(collect(s.url.replace('/runs/r1', '/runs/other'), 1)).rejects.toThrow();
  });

  it('refuses browser pages from other origins (F09 review)', async () => {
    const s = await start();
    await expect(collect(s.url, 1, 'https://evil.example')).rejects.toThrow(/Unexpected server response: 40[13]/);
  });

  it.each(['http://localhost:6661', 'http://127.0.0.1:6661', 'http://[::1]:5173'])('accepts the loopback origin %s', async (origin) => {
    const s = await start();
    const c = await collect(s.url, 1, origin);
    c.ws.close();
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

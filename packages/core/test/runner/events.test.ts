import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Redactor } from '../../src/config/redact.js';
import { createEventSink } from '../../src/runner/events.js';
import type { RunEvent } from '../../src/runner/types.js';

const lines = async (dir: string) =>
  (await readFile(join(dir, 'events.ndjson'), 'utf8')).trim().split('\n').map((l) => JSON.parse(l) as RunEvent);

describe('createEventSink', () => {
  it('stamps t and forwards to onEvent', () => {
    const got: RunEvent[] = [];
    const sink = createEventSink({ redactor: new Redactor([]), onEvent: (e) => got.push(e), now: () => 42 });
    sink.emit({ type: 'rep.started', rep: 1 });
    expect(got).toEqual([{ type: 'rep.started', rep: 1, t: 42 }]);
  });

  it('appends one ndjson line per event in order', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'events-'));
    const sink = createEventSink({ outDir, redactor: new Redactor([]) });
    sink.emit({ type: 'rep.started', rep: 1 });
    sink.emit({ type: 'rep.started', rep: 2 });
    await sink.flush();
    expect((await lines(outDir)).map((e) => e.type === 'rep.started' && e.rep)).toEqual([1, 2]);
  });

  it('numbers frames per ghost, writes jpgs, and keeps them out of ndjson', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'events-'));
    const got: RunEvent[] = [];
    const sink = createEventSink({ outDir, redactor: new Redactor([]), onEvent: (e) => got.push(e) });
    const jpeg = Buffer.from([0xff, 0xd8, 0xff]);
    sink.frame('g1', jpeg);
    sink.frame('g1', jpeg);
    sink.frame('g2', jpeg);
    sink.emit({ type: 'rep.started', rep: 1 });
    await sink.flush();
    expect(got.filter((e) => e.type === 'ghost.frame').map((e) => e.type === 'ghost.frame' && `${e.ghostId}:${e.seq}`)).toEqual([
      'g1:0',
      'g1:1',
      'g2:0',
    ]);
    expect(await readdir(join(outDir, 'frames', 'g1'))).toEqual(['00000.jpg', '00001.jpg']);
    expect(await readFile(join(outDir, 'frames', 'g2', '00000.jpg'))).toEqual(jpeg);
    expect((await lines(outDir)).map((e) => e.type)).toEqual(['rep.started']);
  });

  it('redacts secrets in onEvent and on disk', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'events-'));
    const got: RunEvent[] = [];
    const sink = createEventSink({ outDir, redactor: new Redactor(['s3cret']), onEvent: (e) => got.push(e) });
    sink.emit({ type: 'guard.blocked', ghostId: 'g', reason: 'host', url: 'http://x.test/?p=s3cret' });
    await sink.flush();
    expect(JSON.stringify(got)).not.toContain('s3cret');
    expect(JSON.stringify(got)).toContain('[REDACTED]');
    expect(await readFile(join(outDir, 'events.ndjson'), 'utf8')).not.toContain('s3cret');
  });

  it('swallows a throwing onEvent and still writes', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'events-'));
    const sink = createEventSink({ outDir, redactor: new Redactor([]), onEvent: () => { throw new Error('bad listener'); } });
    expect(() => sink.emit({ type: 'rep.started', rep: 1 })).not.toThrow();
    await sink.flush();
    expect(await lines(outDir)).toHaveLength(1);
  });

  it('writes nothing without outDir', async () => {
    const sink = createEventSink({ redactor: new Redactor([]) });
    sink.emit({ type: 'rep.started', rep: 1 });
    sink.frame('g', Buffer.from([1]));
    await expect(sink.flush()).resolves.toBeUndefined();
  });
});

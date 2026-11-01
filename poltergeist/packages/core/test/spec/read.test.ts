import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSpec, SpecNotFoundError } from '../../src/spec/index.js';

describe('parseSpec', () => {
  it('throws SpecNotFoundError for a missing folder', async () => {
    const dir = join(tmpdir(), 'poltergeist-missing-spec-xyz');
    const error = await parseSpec(dir).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SpecNotFoundError);
    expect((error as SpecNotFoundError).path).toBe(join(dir, 'requirements.md'));
  });

  it('throws SpecNotFoundError when requirements.md is a directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'poltergeist-spec-'));
    await mkdir(join(dir, 'requirements.md'));
    await expect(parseSpec(dir)).rejects.toBeInstanceOf(SpecNotFoundError);
  });
});

import { describe, expect, it } from 'vitest';

describe('scaffold', () => {
  it('runs tests', () => {
    expect(1 + 1).toBe(2);
  });

  it('loads @poltergeist/core', async () => {
    await expect(import('../src/index.js')).resolves.toBeDefined();
  });
});

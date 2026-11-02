import { readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { describe, expect, it } from 'vitest';

// The Kiro template F13 will install (D-38): never resolve the server from public npm, never
// depend on Kiro's undocumented spawn cwd.
const path = process.env.MCP_TEMPLATE ?? new URL('../../../integrations/kiro/mcp.json', import.meta.url);
const entry = JSON.parse(readFileSync(path, 'utf8')).mcpServers.poltergeist as { command: string; args: string[]; autoApprove: string[] };

describe('integrations/kiro/mcp.json', () => {
  it('runs the bin with node, not npx', () => {
    expect(entry.command).toBe('node');
    expect(isAbsolute(entry.args[0]!)).toBe(true);
    expect(entry.args[0]).toMatch(/poltergeist-mcp\.js$/);
  });
  it('passes an absolute --root', () => {
    const root = entry.args[entry.args.indexOf('--root') + 1]!;
    expect(isAbsolute(root)).toBe(true);
  });
  it('auto-approves only the read-only tools', () => {
    expect(entry.autoApprove.sort()).toEqual(['get_haunting_report', 'get_run_status', 'list_criteria']);
  });
});

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LlmResponse } from '../../src/compiler/llm.js';
import { fakeLlm, output, type FakeLlm } from '../compiler/fake-llm.js';
import { PASSWORD, startClaimsFixture, type ClaimsFixture } from '../runner/claims-fixture.js';
import { resetCommand } from '../runner/run-helpers.js';

export const REQUIREMENTS = `# Requirements Document

## Requirements

### Requirement 3: Claiming candy

**User Story:** As a trader, I want each candy claimed once, so that trades are fair.

#### Acceptance Criteria

1. THE Claims page SHALL load without uncaught exceptions.
2. WHEN two sessions claim the same candy at once, THE System SHALL record only one claim.
`;

const race = [{ goto: '/claims' }, { barrier: 'fire' }, { click: { role: 'button', name: 'Claim Sour Skulls' } }, { wait: 500 }];

/** Plans by criterion and persona; everything else is `notApplicable`. */
export function claimsResponder(req: { meta: { criterion: string; persona: string } }): LlmResponse {
  const { criterion, persona } = req.meta;
  if (criterion === '3.2' && persona === 'doppelganger') {
    return output({
      result: {
        kind: 'plan',
        intent: 'Two sessions claim Sour Skulls at the same moment; only one claim should be recorded.',
        actors: { a: race, b: race },
        assert: [{ api: { method: 'GET', path: '/api/candies/sour-skulls', jsonPath: '$.claims.length', equals: 1 } }],
      },
    });
  }
  if (criterion === '3.1' && persona === 'wraith') {
    return output({ result: { kind: 'plan', intent: 'Open the claims page.', actors: { a: [{ goto: '/claims' }] }, assert: [{ noUncaughtExceptions: true }] } });
  }
  return output({ result: { kind: 'notApplicable', reason: 'This persona has nothing to test here.' } });
}

export type ClaimsProject = {
  root: string;
  specDir: string;
  configPath: string;
  env: NodeJS.ProcessEnv;
  fixture: ClaimsFixture;
  /** A fresh fake LLM per call, answering with `claimsResponder`. */
  llm(): FakeLlm;
  close(): Promise<void>;
};

/** A temp project: `poltergeist.config.json` aimed at the claims fixture plus `.kiro/specs/claims/requirements.md`. */
export async function makeClaimsProject(config: Record<string, unknown> = {}): Promise<ClaimsProject> {
  const fixture = await startClaimsFixture();
  const root = await mkdtemp(join(tmpdir(), 'summon-'));
  const specDir = join(root, '.kiro', 'specs', 'claims');
  await mkdir(specDir, { recursive: true });
  await writeFile(join(specDir, 'requirements.md'), REQUIREMENTS);
  const configPath = join(root, 'poltergeist.config.json');
  await writeFile(
    configPath,
    JSON.stringify({
      target: fixture.origin,
      routes: [{ path: '/claims', auth: true }],
      accounts: { default: { loginRoute: '/login', username: 'ghost1', password: 'env:GHOST_PASS' } },
      resetCommand: resetCommand(fixture.origin),
      reps: 3,
      ...config,
    }),
  );
  return {
    root,
    specDir,
    configPath,
    env: { ...process.env, GHOST_PASS: PASSWORD },
    fixture,
    llm: () => fakeLlm(claimsResponder),
    async close() {
      await fixture.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Assertion, HauntingPlan, PlanRoute, Step } from '../../src/compiler/dsl.js';
import { parseConfig, type LoadedConfig } from '../../src/config/load.js';
import type { PersonaId } from '../../src/personas/registry.js';
import { PASSWORD, USER } from './claims-fixture.js';

export const resetCommand = (origin: string) =>
  `node -e "fetch('${origin}/__reset',{method:'POST'}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"`;

export function loadFor(origin: string, over: Record<string, unknown> = {}): LoadedConfig {
  return parseConfig(
    {
      target: origin,
      routes: [{ path: '/claims', auth: true }, { path: '/form', auth: false }],
      accounts: { default: { loginRoute: '/login', username: USER, password: 'env:GHOST_PASS' } },
      resetCommand: resetCommand(origin),
      forbidden: [{ method: 'DELETE', path: '/api/admin/*' }],
      ...over,
    },
    { configPath: join(tmpdir(), 'poltergeist.config.json'), env: { ...process.env, GHOST_PASS: PASSWORD } },
  );
}

export function plan(
  criterion: string,
  persona: PersonaId,
  actors: { a: Step[]; b?: Step[] },
  assert: Assertion[],
  routes: PlanRoute[] = [{ path: '/claims', identity: 'default' }],
): HauntingPlan {
  return { criterion, persona, intent: 'test', routes, actors, assert };
}

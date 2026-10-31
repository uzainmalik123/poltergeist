import type { Persona } from '../personas/registry.js';
import type { RouteScout } from '../scout/types.js';
import { REQUEST_PATTERN, stepType, type PlanBody, type PlanTarget, type Step } from './dsl.js';

export type ValidationContext = { persona: Persona; routes: readonly RouteScout[] };

const MAX_TEXT = 300;
const MAX_STEPS = 30;
const MAX_ASSERTS = 10;
const MAX_WAIT_MS = 2000;

type Lookups = { paths: Set<string>; roleName: Set<string>; labels: Set<string>; testIds: Set<string>; texts: Set<string>; accounts: Set<string> };

function lookups(routes: readonly RouteScout[]): Lookups {
  const l: Lookups = { paths: new Set(), roleName: new Set(), labels: new Set(), testIds: new Set(), texts: new Set(), accounts: new Set() };
  for (const r of routes) {
    l.paths.add(r.path);
    if (r.identity !== 'anonymous') l.accounts.add(r.identity);
    for (const e of r.interactive) {
      l.roleName.add(JSON.stringify([e.role, e.name]));
      l.texts.add(e.name);
      if (e.label !== undefined) l.labels.add(e.label);
      if (e.testId !== undefined) l.testIds.add(e.testId);
    }
    for (const t of r.testIds) {
      l.testIds.add(t.testId);
      if (t.name !== undefined) l.texts.add(t.name);
    }
  }
  return l;
}

function targetFound(t: PlanTarget, l: Lookups): boolean {
  if ('role' in t) return l.roleName.has(JSON.stringify([t.role, t.name]));
  if ('label' in t) return l.labels.has(t.label);
  if ('testId' in t) return l.testIds.has(t.testId);
  return l.texts.has(t.text);
}

const blank = (s: string) => s.trim() === '';

/**
 * Semantic checks of a plan body against its persona and the picked routes' Scout output (D-32).
 * Returns readable errors, each prefixed with a path; empty means valid.
 */
export function validatePlan(body: PlanBody, ctx: ValidationContext): string[] {
  const errors: string[] = [];
  const err = (path: string, msg: string) => errors.push(`${path}: ${msg}`);
  const l = lookups(ctx.routes);
  const { persona } = ctx;
  const allowedSteps = new Set<string>(persona.allowedSteps);
  const allowedGenerators = new Set<string>(persona.generators);

  if (blank(body.intent)) err('intent', 'must not be empty');
  else if (body.intent.length > MAX_TEXT) err('intent', `must be at most ${MAX_TEXT} characters`);

  const actors = Object.entries(body.actors).filter((e): e is [string, Step[]] => e[1] !== undefined);
  if (actors.length !== persona.actors) {
    err('actors', persona.actors === 2 ? 'this behaviour needs 2 actors (a and b)' : 'this behaviour needs 1 actor (a only)');
  }

  const target = (path: string, t: PlanTarget) => {
    if (Object.values(t).some((v) => blank(v))) err(path, 'target values must not be empty');
    else if (!targetFound(t, l)) err(path, `target ${JSON.stringify(t)} was not found on the picked routes`);
  };

  const barriersByActor = new Map<string, string[]>();
  for (const [name, steps] of actors) {
    const base = `actors.${name}`;
    if (steps.length === 0) err(base, 'needs at least one step');
    if (steps.length > MAX_STEPS) err(base, `has more than ${MAX_STEPS} steps`);
    const held = new Map<string, number>();
    const barriers: string[] = [];
    steps.forEach((step, i) => {
      const type = stepType(step);
      const path = `${base}[${i}].${type}`;
      if (!allowedSteps.has(type)) {
        err(path, `step "${type}" is not allowed for this persona (allowed: ${persona.allowedSteps.join(', ')})`);
        return;
      }
      if ('goto' in step) {
        if (!l.paths.has(step.goto)) err(path, `"${step.goto}" is not a picked route (${[...l.paths].join(', ')})`);
      } else if ('click' in step) target(path, step.click);
      else if ('dblclick' in step) target(path, step.dblclick);
      else if ('fill' in step) {
        target(path, step.fill.target);
        const g = step.fill.input.generator;
        if (!allowedGenerators.has(g)) err(path, `generator "${g}" not allowed for this persona (allowed: ${persona.generators.join(', ')})`);
      } else if ('wait' in step) {
        if (!Number.isInteger(step.wait) || step.wait < 0 || step.wait > MAX_WAIT_MS) err(path, `wait must be an integer 0…${MAX_WAIT_MS} ms`);
      } else if ('barrier' in step) {
        if (blank(step.barrier)) err(path, 'barrier name must not be empty');
        else barriers.push(step.barrier);
      } else if ('holdRequests' in step) {
        if (!REQUEST_PATTERN.test(step.holdRequests)) err(path, 'must look like "METHOD /path", e.g. "POST /api/claims"');
        else held.set(step.holdRequests, i);
      } else if ('releaseRequests' in step) {
        if (!REQUEST_PATTERN.test(step.releaseRequests)) err(path, 'must look like "METHOD /path", e.g. "POST /api/claims"');
        else if (!held.delete(step.releaseRequests)) err(path, `"${step.releaseRequests}" is released before it was held`);
      } else if ('login' in step) {
        if (!l.accounts.has(step.login.account)) err(path, `account "${step.login.account}" is not a known account`);
      }
    });
    for (const [pattern, i] of held) err(`${base}[${i}].holdRequests`, `"${pattern}" is never released`);
    barriersByActor.set(name, barriers);
  }

  const allBarriers = new Set([...barriersByActor.values()].flat());
  for (const b of allBarriers) {
    for (const [name, list] of barriersByActor) {
      const n = list.filter((x) => x === b).length;
      if (n === 0) err(`actors.${name}`, `barrier "${b}" is not reached by actor ${name}`);
      else if (n > 1) err(`actors.${name}`, `barrier "${b}" is reached more than once by actor ${name}`);
    }
  }

  if (body.assert.length === 0) err('assert', 'needs at least one assertion');
  if (body.assert.length > MAX_ASSERTS) err('assert', `has more than ${MAX_ASSERTS} assertions`);
  const relPath = (path: string, value: string) => {
    if (!value.startsWith('/') || value.startsWith('//')) err(path, 'must start with / (a path on the app, no host)');
  };
  body.assert.forEach((a, i) => {
    const path = `assert[${i}].${Object.keys(a)[0]}`;
    if ('textVisible' in a && blank(a.textVisible)) err(path, 'must not be empty');
    else if ('textNotVisible' in a && blank(a.textNotVisible)) err(path, 'must not be empty');
    else if ('urlMatches' in a) relPath(path, a.urlMatches);
    else if ('elementCount' in a) {
      target(path, a.elementCount.target);
      if (!Number.isInteger(a.elementCount.equals) || a.elementCount.equals < 0) err(path, 'equals must be an integer ≥ 0');
    } else if ('api' in a) {
      relPath(`${path}.path`, a.api.path);
      const s = a.api.status;
      if (s !== undefined && (!Number.isInteger(s) || s < 100 || s > 599)) err(`${path}.status`, 'must be an HTTP status 100…599');
    }
  });

  return errors;
}

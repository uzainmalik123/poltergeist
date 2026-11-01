import type { Assertion, PlanTarget, Step } from '../compiler/dsl.js';

const MAX = 200;

/** Untrusted text on one line: whitespace runs (incl. newlines, \u2028, \u2029) become one space, capped with `…`. */
export function oneLine(s: string, max = MAX): string {
  const flat = s.replace(/[\s\u2028\u2029]+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

/** A markdown code span that survives backticks inside it (CommonMark: the fence outlasts any run). */
export function codeSpan(s: string): string {
  const text = oneLine(s) || ' ';
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((r) => r.length));
  const fence = '`'.repeat(longest + 1);
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

const quote = (s: string) => JSON.stringify(oneLine(s, 80));

export function describeTarget(t: PlanTarget): string {
  if ('role' in t) return `${t.role} ${quote(t.name)}`;
  if ('label' in t) return `field labelled ${quote(t.label)}`;
  if ('text' in t) return `text ${quote(t.text)}`;
  return `test id ${quote(t.testId)}`;
}

/** A plan step in plain words. A `fill` names its generator, never a value (D-04, D-35). */
export function describeStep(s: Step): string {
  if ('goto' in s) return `go to ${oneLine(s.goto, 80)}`;
  if ('click' in s) return `click ${describeTarget(s.click)}`;
  if ('dblclick' in s) return `double-click ${describeTarget(s.dblclick)}`;
  if ('fill' in s) return `fill ${describeTarget(s.fill.target)} with generator: ${s.fill.input.generator}`;
  if ('press' in s) return `press ${s.press}`;
  if ('back' in s) return 'go back';
  if ('reload' in s) return 'reload the page';
  if ('wait' in s) return `wait ${s.wait} ms`;
  if ('throttle' in s) return `throttle the network to ${s.throttle.profile}`;
  if ('barrier' in s) return `wait at barrier ${quote(s.barrier)} until every actor reaches it`;
  if ('holdRequests' in s) return `hold ${oneLine(s.holdRequests, 80)} requests`;
  if ('releaseRequests' in s) return `release held ${oneLine(s.releaseRequests, 80)} requests`;
  if ('login' in s) return `log in as account ${quote(s.login.account)}`;
  return 'log out';
}

/** What an assertion expects, in plain words. */
export function describeAssertion(a: Assertion): string {
  if ('textVisible' in a) return `text ${quote(a.textVisible)} is visible`;
  if ('textNotVisible' in a) return `text ${quote(a.textNotVisible)} is not visible`;
  if ('urlMatches' in a) return `URL path matches ${oneLine(a.urlMatches, 80)}`;
  if ('elementCount' in a) return `count of ${describeTarget(a.elementCount.target)} equals ${a.elementCount.equals}`;
  if ('api' in a) {
    const { method, path, status, jsonPath, equals } = a.api;
    const head = `${method} ${oneLine(path, 80)}`;
    const subject = jsonPath ? oneLine(jsonPath, 80) : 'body';
    const value = equals === undefined ? (jsonPath ? subject : '') : `${subject} equals ${JSON.stringify(equals)}`;
    if (status === undefined) return value ? `${head} ${value}` : head;
    return value ? `${head} returns status ${status}, ${value}` : `${head} returns status ${status}`;
  }
  if ('noConsoleErrors' in a) return 'no console errors';
  return 'no uncaught exceptions';
}

import type { InteractiveElement } from './types.js';

/** Roles Scout lists as interactive (D-30). */
export const INTERACTIVE_ROLES: ReadonlySet<string> = new Set([
  'button', 'link', 'textbox', 'searchbox', 'checkbox', 'radio', 'combobox', 'listbox', 'option',
  'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'switch', 'slider', 'spinbutton',
]);

/** Roles worth an exact `getByLabel` lookup. */
export const LABELABLE_ROLES: ReadonlySet<string> = new Set([
  'textbox', 'searchbox', 'checkbox', 'radio', 'combobox', 'listbox', 'slider', 'spinbutton', 'switch',
]);

// `- role "json-escaped name" [attr] [attr]: trailing text`
const LINE = /^\s*- ([a-z]+)(?: ("(?:[^"\\]|\\.)*"))?(?: \[[^\]]*\])*(?::(?: .*)?)?$/;

/** Role and name of one snapshot line, or null for text, properties and regex names. */
export function parseAriaLine(line: string): { role: string; name: string } | null {
  const m = LINE.exec(line);
  if (!m) return null;
  const role = m[1] as string;
  if (role === 'text') return null;
  if (m[2] === undefined) return { role, name: '' };
  try {
    return { role, name: JSON.parse(m[2]) as string };
  } catch {
    return null;
  }
}

/** Interactive elements in document order; the same role and name are merged into `count`. */
export function interactiveFromSnapshot(yaml: string): InteractiveElement[] {
  const byKey = new Map<string, InteractiveElement>();
  for (const line of yaml.split('\n')) {
    const el = parseAriaLine(line);
    if (!el || !INTERACTIVE_ROLES.has(el.role)) continue;
    const key = JSON.stringify([el.role, el.name]);
    const seen = byKey.get(key);
    if (seen) seen.count++;
    else byKey.set(key, { ...el, count: 1 });
  }
  return [...byKey.values()];
}

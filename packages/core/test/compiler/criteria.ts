import { criterionHash } from '../../src/spec/hash.js';
import type { Criterion } from '../../src/spec/types.js';

export function criterion(id: string, text: string): Criterion {
  return {
    id,
    requirement: 'Test',
    requirementId: id.split('.')[0]!,
    text,
    raw: text,
    line: 1,
    kind: 'freeform',
    ears: null,
    hash: criterionHash(text),
  };
}

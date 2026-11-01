import type { SummonResult } from '@poltergeist/core';

/**
 * Req 9.2 and D-36: 0 nothing haunted, 1 anything haunted, 2 a usage, config or system error
 * (every reset failing included), 130 Ctrl-C.
 */
export function exitCodeFor(outcome: { result: SummonResult } | { error: unknown; aborted?: boolean }): 0 | 1 | 2 | 130 {
  if ('result' in outcome) {
    if (outcome.result.allResetsFailed) return 2;
    return outcome.result.haunted.length > 0 ? 1 : 0;
  }
  return outcome.aborted ? 130 : 2;
}

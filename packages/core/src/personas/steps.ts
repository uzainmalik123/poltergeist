/** The Haunting Plan DSL step vocabulary (design §6). F05 builds its zod enum from this list. */
export const STEP_TYPES = Object.freeze([
  'goto', 'click', 'dblclick', 'fill', 'press', 'back', 'reload', 'wait', 'throttle',
  'barrier', 'holdRequests', 'releaseRequests', 'login', 'logout',
] as const);

export type StepType = (typeof STEP_TYPES)[number];

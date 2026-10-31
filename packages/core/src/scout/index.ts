export { INTERACTIVE_ROLES, LABELABLE_ROLES, interactiveFromSnapshot, parseAriaLine } from './aria.js';
export { isUnderLoginRoute, locateTarget, login } from './login.js';
export type { LoginResult } from './login.js';
export { captureRoute } from './capture.js';
export type { Capture } from './capture.js';
export { TRIM_CHARS, collapseLine, trimForPrompt } from './trim.js';
export { slugsFor } from './slug.js';
export { routeHash, scoutHash } from './hash.js';
export type {
  InteractiveElement,
  RouteScout,
  RouteStatus,
  ScoutOptions,
  ScoutResult,
  StorageState,
  TestIdElement,
} from './types.js';

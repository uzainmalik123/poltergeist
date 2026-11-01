import type { InteractiveElement, RouteScout, TestIdElement } from '../../src/scout/types.js';

/** Hand-built Scout output shaped like `test/scout/candy-fixture.ts`. */
export function route(
  path: string,
  identity: string,
  interactive: InteractiveElement[],
  testIds: TestIdElement[] = [],
  extra: Partial<RouteScout> = {},
): RouteScout {
  return {
    path,
    slug: path === '/' ? 'index' : path.slice(1).replaceAll('/', '__'),
    identity,
    status: 'ok',
    title: path === '/' ? 'Candy Swap' : path.slice(1),
    settled: true,
    interactive,
    testIds,
    snapshot: interactive.map((e) => `- ${e.role} "${e.name}"`).join('\n'),
    snapshotFull: '',
    trimmed: false,
    routeHash: `hash-${path}-${identity}`,
    blocked: [],
    ...extra,
  };
}

export const MARKET = route(
  '/market',
  'default',
  [
    { role: 'button', name: 'Claim Sour Skulls', count: 1, testId: 'claim-sour-skulls' },
    { role: 'button', name: 'Claim Candy Corn', count: 2 },
  ],
  [{ testId: 'market-status', name: '3 candies left' }, { testId: 'candy-card' }],
  { title: 'Market' },
);

export const TRADE = route(
  '/trade/new',
  'default',
  [
    { role: 'textbox', name: 'Offer', count: 1, label: 'Offer' },
    { role: 'combobox', name: 'Want', count: 1, label: 'Want' },
    { role: 'textbox', name: 'Note', count: 1, label: 'Note' },
    { role: 'button', name: 'Propose trade', count: 1 },
  ],
  [{ testId: 'trade-status' }],
  { title: 'Propose a trade' },
);

export const HOME_DOWN = route('/', 'anonymous', [{ role: 'link', name: 'Market', count: 1 }], [], {
  status: 'unreachable',
  reason: 'HTTP 500',
});

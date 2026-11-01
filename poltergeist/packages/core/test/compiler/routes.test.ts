import { describe, expect, it } from 'vitest';
import { pickRoutes, tokenize } from '../../src/compiler/routes.js';
import { criterion } from './criteria.js';
import { HOME_DOWN, MARKET, TRADE, route } from './scout-fixtures.js';

const ROUTES = [HOME_DOWN, MARKET, TRADE];
const paths = (rs: { path: string }[]) => rs.map((r) => r.path);

describe('pickRoutes', () => {
  it('claim criterion picks /market only', () => {
    const c = criterion('3.2', 'WHEN two sessions claim Sour Skulls at once, THE Market SHALL accept only one claim.');
    expect(paths(pickRoutes(c, ROUTES))).toEqual(['/market']);
  });

  it('trade criterion picks /trade/new first', () => {
    const c = criterion('4.1', 'WHEN a user proposes a trade with an empty offer, THE Trade_Form SHALL show an error in the trade status.');
    expect(paths(pickRoutes(c, ROUTES))[0]).toBe('/trade/new');
  });

  it('no overlap → []', () => {
    expect(pickRoutes(criterion('9.1', 'THE Billing SHALL invoice monthly.'), ROUTES)).toEqual([]);
  });

  it('unreachable route never picked, even if it matches', () => {
    const authFailed = { ...MARKET, status: 'authFailed' as const };
    expect(pickRoutes(criterion('1.1', 'THE Market link SHALL open the market.'), [HOME_DOWN, authFailed])).toEqual([]);
  });

  it('at most two, ties in config order', () => {
    const mk = (p: string) => route(p, 'default', [{ role: 'button', name: 'Refresh', count: 1 }]);
    const rs = [mk('/a1'), mk('/b2'), mk('/c3')];
    expect(paths(pickRoutes(criterion('2.1', 'THE Refresh button SHALL reload data.'), rs))).toEqual(['/a1', '/b2']);
  });

  it('higher score beats config order', () => {
    const weak = route('/weak', 'default', [{ role: 'button', name: 'Refresh', count: 1 }]);
    const strong = route('/strong', 'default', [{ role: 'button', name: 'Refresh data', count: 1 }]);
    expect(paths(pickRoutes(criterion('2.1', 'THE Refresh button SHALL reload data.'), [weak, strong]))).toEqual(['/strong', '/weak']);
  });
});

describe('tokenize', () => {
  it('splits snake, kebab and paths, drops stop words, singularises', () => {
    expect(tokenize('THE Swap_Offer claims /trade/new')).toEqual(new Set(['swap', 'offer', 'claim', 'trade', 'new']));
  });

  it('drops tokens shorter than 3 characters', () => {
    expect(tokenize('a to go ok yes')).toEqual(new Set(['yes']));
  });
});

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { StorageState } from '../../src/scout/types.js';
import { PASSWORD, SESSION, USER } from '../scout/candy-fixture.js';

export { PASSWORD, SESSION, USER };

export type ClaimsFixture = {
  origin: string;
  close(): Promise<void>;
  /** `performance.now()` at each `POST /api/claims` arrival since the last reset. */
  arrivals(): number[];
  resets(): number;
  /** Paths of every request seen, for "never sent" checks. */
  seen(): string[];
};

const page = (title: string, body: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;

const CANDIES = [...Array.from({ length: 12 }, (_, i) => [`candy-${i + 1}`, `Candy ${i + 1}`]), ['sour-skulls', 'Sour Skulls']];

const CLAIMS = page(
  'Claims',
  `<h1>Claims</h1>
${CANDIES.map(([slug, name]) => `<button data-candy="${slug}">Claim ${name}</button>`).join('\n')}
<div id="out"></div>
<script>
  for (const b of document.querySelectorAll('button[data-candy]')) {
    b.addEventListener('click', async () => {
      const res = await fetch('/api/claims', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ candy: b.dataset.candy }) });
      document.getElementById('out').insertAdjacentHTML('beforeend', res.ok ? '<p>Claimed!</p>' : '<p role="alert">Already claimed</p>');
    });
  }
</script>`,
);

const FORM = page(
  'Form',
  `<h1>Notes</h1>
<label for="n">Note</label><input id="n">
<button id="save">Save</button>
<button>Clear</button><button>Clear</button>
<p data-testid="saved"></p>
<p id="late"></p>
<p>No errors here, 11 claimed</p>
<script>
  document.getElementById('save').addEventListener('click', () => {
    document.querySelector('[data-testid=saved]').textContent = document.getElementById('n').value;
  });
  setTimeout(() => { document.getElementById('late').textContent = 'Late text'; }, 500);
</script>`,
);

/** The session cookie for the fixture, as scout would hand it over. */
export function sessionState(origin: string): StorageState {
  const { hostname } = new URL(origin);
  return {
    cookies: [{ name: 'sid', value: SESSION, domain: hostname, path: '/', expires: -1, httpOnly: true, secure: false, sameSite: 'Lax' }],
    origins: [],
  };
}

const cookies = (req: IncomingMessage) =>
  Object.fromEntries((req.headers.cookie ?? '').split(/;\s*/).filter(Boolean).map((c) => c.split('=') as [string, string]));

async function readBody(req: IncomingMessage): Promise<string> {
  let body = '';
  for await (const chunk of req) body += String(chunk);
  return body;
}

const send = (res: ServerResponse, status: number, body: string, type = 'text/html; charset=utf-8', headers: Record<string, string> = {}) => {
  res.writeHead(status, { 'content-type': type, ...headers });
  res.end(body);
};
const json = (res: ServerResponse, status: number, body: unknown) => send(res, status, JSON.stringify(body), 'application/json');

/**
 * A tests-only app with a naive check-then-insert claim endpoint, the kind of race a Doppelgänger should
 * find (KI-07). Never reaches the internet.
 */
export async function startClaimsFixture(): Promise<ClaimsFixture> {
  let claims = new Map<string, string[]>();
  let arrivals: number[] = [];
  let resets = 0;
  const seen: string[] = [];

  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://fixture');
      seen.push(`${req.method} ${url.pathname}`);
      const authed = cookies(req).sid === SESSION;
      const path = url.pathname;
      if (path === '/') return send(res, 200, page('Home', '<h1>Home</h1><a href="/claims">Claims</a>'));
      if (path === '/login') {
        if (req.method === 'POST') {
          const form = new URLSearchParams(await readBody(req));
          const ok = form.get('username') === USER && form.get('password') === PASSWORD;
          res.writeHead(303, ok ? { location: '/claims', 'set-cookie': `sid=${SESSION}; Path=/; HttpOnly` } : { location: '/login' });
          return res.end();
        }
        return send(
          res,
          200,
          page(
            'Log in',
            `<h1>Log in</h1><form method="post" action="/login"><label for="u">Username</label><input id="u" name="username">
<label for="p">Password</label><input id="p" name="password" type="password"><button type="submit">Log in</button></form>`,
          ),
        );
      }
      if (path === '/claims') {
        if (!authed) {
          res.writeHead(302, { location: '/login' });
          return res.end();
        }
        return send(res, 200, CLAIMS);
      }
      if (path === '/api/claims' && req.method === 'POST') {
        arrivals.push(performance.now());
        const { candy } = JSON.parse(await readBody(req)) as { candy: string };
        if ((claims.get(candy) ?? []).length > 0) return json(res, 409, { error: 'already claimed' });
        await new Promise((r) => setTimeout(r, 30)); // a slow write between the check and the insert
        claims.set(candy, [...(claims.get(candy) ?? []), cookies(req).sid ?? 'anonymous']); // INSERT appends a row
        return json(res, 201, { ok: true });
      }
      if (path.startsWith('/api/candies/')) return json(res, 200, { claims: claims.get(path.slice('/api/candies/'.length)) ?? [] });
      if (path === '/__reset' && req.method === 'POST') {
        claims = new Map();
        arrivals = [];
        resets++;
        return json(res, 200, { ok: true });
      }
      if (path === '/form') return send(res, 200, FORM);
      if (path === '/console') return send(res, 200, page('Console', `<p>console</p><script>console.error('boom')</script>`));
      if (path === '/ext') return send(res, 200, page('External', `<p>ext</p><img src="http://evil.test/pixel.png" alt="">`));
      if (path === '/throws') return send(res, 200, page('Throws', `<p>throws</p><script>setTimeout(() => { throw new Error('kaboom'); })</script>`));
      if (path === '/admin') {
        return send(
          res,
          200,
          page('Admin', `<button id="d">Delete all</button><script>document.getElementById('d').onclick = () => fetch('/api/admin/all', { method: 'DELETE' }).catch(() => {});</script>`),
        );
      }
      if (path.startsWith('/api/admin/')) return json(res, 200, { deleted: true });
      if (path === '/api/boom') return json(res, 500, { error: 'boom' });
      if (path === '/api/redir') {
        res.writeHead(307, { location: '/api/admin/all' });
        return res.end();
      }
      if (path === '/mixed') {
        return send(res, 200, page('Mixed', `<p>mixed</p><img src="http://evil.test/pixel.png" alt=""><script>fetch('/api/boom')</script>`));
      }
      if (path === '/hang') {
        return send(res, 200, page('Hang', `<button id="s">Save</button><script>document.getElementById('s').onclick = () => fetch('/api/hang', { method: 'POST' });</script>`));
      }
      if (path === '/api/hang') return; // never answers; closed by close()
      if (path === '/anim') {
        return send(
          res,
          200,
          page('Anim', `<div id="box" style="width:300px;height:300px"></div><script>let i = 0; (function f() { document.getElementById('box').style.background = 'hsl(' + (i++ % 360) + ',80%,50%)'; requestAnimationFrame(f); })();</script>`),
        );
      }
      return send(res, 404, page('Not found', '<p>not found</p>'));
    })();
  });
  await new Promise<void>((resolve) => server.listen({ host: '127.0.0.1', port: 0 }, resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    arrivals: () => [...arrivals],
    resets: () => resets,
    seen: () => [...seen],
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

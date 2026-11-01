import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export const USER = 'ghost1';
export const PASSWORD = 'phantom-pass-77';
export const SESSION = 'sid-s3cr3t-cookie';

export type CandyFixture = { origin: string; close(): Promise<void> };

const page = (title: string, body: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;

const loginForm = (action: string, extra = '') => `<h1>Log in</h1>${extra}
<form method="post" action="${action}">
  <label for="u">Username</label><input id="u" name="username">
  <label for="p">Password</label><input id="p" name="password" type="password">
  <button type="submit">Log in</button>
</form>`;

const SPA_LOGIN = page(
  'Log in',
  `<main id="app">${loginForm('#')}</main>
<script>
  document.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = new URLSearchParams(new FormData(e.target));
    const res = await fetch('/login?spa=1', { method: 'POST', body });
    if (res.ok) document.getElementById('app').innerHTML = '<p>Welcome</p>';
    else document.getElementById('app').insertAdjacentHTML('afterbegin', '<p role="alert">Wrong password</p>');
  });
</script>`,
);

/** The form appears 300 ms after load, as in a client-rendered app. */
const CSR_LOGIN = page(
  'Log in',
  `<main id="app"></main>
<script>
  setTimeout(() => {
    document.getElementById('app').innerHTML = ${JSON.stringify(loginForm('#'))};
    document.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const res = await fetch('/login?spa=1', { method: 'POST', body: new URLSearchParams(new FormData(e.target)) });
      document.getElementById('app').innerHTML = res.ok ? '<p>Welcome</p>' : '<p role="alert">Wrong password</p>';
    });
  }, 300);
</script>`,
);

/** Submit swaps the form for a spinner while a slow request runs, then shows the result in place. */
const SPIN_LOGIN = page(
  'Log in',
  `<main id="app">${loginForm('#')}</main>
<script>
  document.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = new URLSearchParams(new FormData(e.target));
    const app = document.getElementById('app');
    const form = app.innerHTML;
    app.innerHTML = '<p>Loading…</p>';
    const res = await fetch('/login?spa=1&slow=1', { method: 'POST', body });
    app.innerHTML = res.ok ? '<p>Welcome</p>' : '<p role="alert">Wrong password</p>' + form;
  });
</script>`,
);

const MARKET = page(
  'Market',
  `<h1>Market</h1>
<button data-testid="claim-sour-skulls">Claim Sour Skulls</button>
<button>Claim Candy Corn</button><button>Claim Candy Corn</button>
<div data-testid="candy-card">Sour Skulls</div><div data-testid="candy-card">Candy Corn</div><div data-testid="candy-card">Toffee</div>
<p data-testid="market-status">3 candies left</p>
<button data-testid="secret-btn">${PASSWORD}</button><h2 data-testid="greeting">Hi ${PASSWORD}</h2><span data-testid="tid-${PASSWORD}">secret</span>`,
);

const TRADE = page(
  'Propose a trade',
  `<h1>Propose a trade</h1>
<form>
  <label for="offer">Offer</label><input id="offer" name="offer">
  <label for="want">Want</label><select id="want" name="want"><option>Toffee</option><option>Candy Corn</option></select>
  <label for="note">Note</label><textarea id="note" name="note"></textarea>
  <button type="submit">Propose trade</button>
</form>
<p data-testid="trade-status"></p>`,
);

const HUGE = page(
  'Huge',
  Array.from({ length: 2000 }, (_, i) => `<button>Item ${i}</button>`).join('') +
    Array.from({ length: 200 }, (_, i) => `<p>${`para ${i} `.repeat(30)}</p>`).join(''),
);

const cookies = (req: IncomingMessage) =>
  Object.fromEntries((req.headers.cookie ?? '').split(/;\s*/).filter(Boolean).map((c) => c.split('=') as [string, string]));

async function readBody(req: IncomingMessage): Promise<URLSearchParams> {
  let body = '';
  for await (const chunk of req) body += String(chunk);
  return new URLSearchParams(body);
}

function send(res: ServerResponse, status: number, html: string, headers: Record<string, string> = {}) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', ...headers });
  res.end(html);
}

const redirect = (res: ServerResponse, status: number, location: string, headers: Record<string, string> = {}) => {
  res.writeHead(status, { location, ...headers });
  res.end();
};

/** A tests-only app shaped like Candy Swap (D-30). Never reaches the internet. */
export async function startCandyFixture(): Promise<CandyFixture> {
  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://fixture');
      const authed = cookies(req).sid === SESSION;
      switch (url.pathname) {
        case '/':
          return send(res, 200, page('Candy Swap', '<h1>Candy Swap</h1><a href="/market">Market</a>'));
        case '/login':
          if (req.method === 'POST') {
            const form = await readBody(req);
            const ok = form.get('username') === USER && form.get('password') === PASSWORD;
            const cookie = { 'set-cookie': `sid=${SESSION}; Path=/; HttpOnly` };
            if (url.searchParams.has('slow')) await new Promise((r) => setTimeout(r, 1500));
            if (url.searchParams.has('spa')) {
              res.writeHead(ok ? 200 : 401, ok ? cookie : {});
              return res.end();
            }
            return ok ? redirect(res, 303, '/market', cookie) : redirect(res, 303, '/login/failed');
          }
          return send(res, 200, page('Log in', loginForm('/login')));
        case '/login/failed':
          return send(res, 200, page('Log in', loginForm('/login', '<p role="alert">Wrong password</p>')));
        case '/spa-login':
          return send(res, 200, SPA_LOGIN);
        case '/csr-login':
          return send(res, 200, CSR_LOGIN);
        case '/spin-login':
          return send(res, 200, SPIN_LOGIN);
        case '/market':
          return authed ? send(res, 200, MARKET) : redirect(res, 302, '/login');
        case '/trade/new':
          return authed ? send(res, 200, TRADE) : redirect(res, 302, '/login');
        case '/vault':
          return cookies(req).vault === '1' ? send(res, 200, page('Vault', '<p>vault</p>')) : redirect(res, 302, '/login');
        case '/old':
          return redirect(res, 301, '/');
        case '/boom':
          return send(res, 500, page('Error', '<p>boom</p>'));
        case '/slow':
          return; // never answers; closed by close()
        case '/busy':
          return send(res, 200, page('Busy', `<p>busy</p><button>Refresh</button>
<script>setInterval(() => fetch('/api/ping'), 150);</script>`));
        case '/huge':
          return send(res, 200, HUGE);
        case '/ext':
          return send(res, 200, page('External', `<p>ext</p><script>fetch('http://evil.test/x').catch(() => {});</script>`));
        case '/api/ping':
          res.writeHead(200, { 'content-type': 'text/plain' });
          return res.end('pong');
        default:
          return send(res, 404, page('Not found', '<p>not found</p>'));
      }
    })();
  });
  await new Promise<void>((resolve) => server.listen({ host: '127.0.0.1', port: 0 }, resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

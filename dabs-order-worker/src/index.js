import { placeOrderWithBrowser } from './browser.js';
import { placeOrder } from './session.js';

export const SCHEMA = {
  name: 'dabs-order-worker',
  method: 'POST',
  contentType: 'application/json',
  description: 'Log into Utah DABS special orders, create an order, and optionally submit it. The default mode creates the order and does not submit it.',
  body: {
    username: 'DABS retail email',
    password: 'DABS password',
    login: 'browser (log in through Cloudflare Browser Run) or direct (post the login with captcha). Defaults to browser when no captcha is sent and the BROWSER binding exists.',
    captcha: 'reCAPTCHA Enterprise token from the DABS login page; only used for direct login.',
    submit: false,
    mode: 'create (default) or submit',
    nickname: 'order nickname',
    storeCity: 'optional; defaults to the account city',
    storeCode: 'optional; defaults to the account store, for example "0015"',
    items: [{ code: '042306', quantity: 1, comment: '' }],
  },
  captcha: {
    siteKey: '6Lc7lWIlAAAAAI1aeyvfMaCDM9mEmtsbqVliMOCx',
    action: 'dabs_SpecialOrderClient_ViewModels_RetailLoginViewModel_login',
  },
  response: {
    ok: true,
    login: 'browser',
    mode: 'create',
    submitted: false,
    customer: { id: '107750', name: 'Account Name' },
    order: {
      orderNumber: '320245',
      id: '320245',
      nickname: 'RUM',
      status: 'Not Submitted',
      orderedDate: null,
      estimatedDelivery: null,
      storeCode: '0015',
      storeCity: 'COTTONWOOD HEIGHTS',
      storeLocation: 'COTTONWOOD HEIGHTS - 1863 E 7000 S',
      items: [{
        lineId: '389345',
        name: 'Example Rum 750ml',
        code: '042306',
        quantity: 1,
        casePack: 12,
        totalPrice: '$311.88',
        status: null,
      }],
      total: '$311.88',
    },
    errors: [],
    steps: ['login', 'create-header', 'add-item:042306'],
  },
};

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...CORS,
    },
  });
}

function useBrowser(body, env) {
  if (!body || typeof body !== 'object') return false;
  if (body.login === 'browser') return true;
  if (body.login === 'direct') return false;
  return !body.captcha && Boolean(env?.BROWSER);
}

export function createHandler(fetchImpl = fetch, env = {}) {
  return async (request) => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method === 'GET') return json(SCHEMA, 200);
    if (request.method !== 'POST') {
      return json({
        ok: false,
        mode: null,
        submitted: false,
        customer: null,
        order: null,
        errors: [{ step: 'request', message: 'Use POST.' }],
        steps: [],
      }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch (error) {
      return json({
        ok: false,
        mode: null,
        submitted: false,
        customer: null,
        order: null,
        errors: [{ step: 'request', message: 'Body must be JSON.' }],
        steps: [],
      }, 400);
    }

    let result;
    if (useBrowser(body, env)) {
      if (!env?.BROWSER) {
        result = {
          ok: false,
          mode: null,
          submitted: false,
          customer: null,
          order: null,
          errors: [{ step: 'browser', message: 'Browser Run is not configured. Add the BROWSER binding in wrangler.toml.' }],
          steps: [],
          httpStatus: 501,
        };
      } else {
        result = await placeOrderWithBrowser(body, env.BROWSER);
      }
      result.login = 'browser';
    } else {
      result = await placeOrder(body, fetchImpl);
      result.login = 'direct';
    }
    const status = result.httpStatus || (result.ok ? 200 : 422);
    delete result.httpStatus;
    return json(result, status);
  };
}

export default {
  fetch(request, env) {
    return createHandler(fetch, env)(request);
  },
};

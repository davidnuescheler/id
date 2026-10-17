import assert from 'node:assert/strict';
import test from 'node:test';
import worker, { createHandler } from '../src/index.js';
import { CookieJar } from '../src/session.js';
import { placeOrder } from '../src/session.js';

const LOGIN_PAGE = '<h2>Special Orders Retail Login</h2>';
const LOGGED_IN = `
  <h3 class="h3 centered">Ada Lovelace</h3>
  <a href="/ProdApps/SpecialOrdersCore/Orders/CreateOrder?CustId=42">Create</a>
  <h3>Open Orders</h3>
`;
const CREATE_FORM = `
  <form method="post" action="/ProdApps/SpecialOrdersCore/createnewheader">
    <select name="StoreCity">
      <option value="">Select your city</option>
      <option selected="selected" value="COTTONWOOD HEIGHTS">COTTONWOOD HEIGHTS</option>
    </select>
    <select name="StoreCode">
      <option selected="selected" value="0015">STATE STORE #15</option>
    </select>
    <input type="hidden" name="CustomerId" value="42" />
    <input type="hidden" name="__RequestVerificationToken" value="token-create" />
  </form>
`;

function detailPage({ status, delivery = '', item = true }) {
  const row = item ? `
    <tr class="NormalGridView">
      <td>EXAMPLE RUM 750ml - 042306</td>
      <td>$10.00</td>
      <td>1 (12)</td>
      <td><a href="/Orders/EditOrderCatalog?Cid=99&amp;headerId=555">edit</a></td>
    </tr>` : '';
  return `
    <input name="OrderNickName" value="RUM" />
    <input name="Status" value="${status}" />
    <select name="StoreCity"><option selected="selected" value="COTTONWOOD HEIGHTS">COTTONWOOD HEIGHTS</option></select>
    <select name="StoreCode"><option selected="selected" value="0015">STATE STORE #15</option></select>
    <span id="stId">555</span>
    ${delivery ? `<span id="stdate">${delivery}</span>` : ''}
    <form action="/ProdApps/SpecialOrdersCore/specialordercatalog">
      <input name="__RequestVerificationToken" value="token-add" />
    </form>
    <table>
      <thead><tr><th>Product Name - Code</th></tr></thead>
      <tbody>${row}</tbody>
      <tfoot><tr><td></td><td>$10.00</td></tr></tfoot>
    </table>
  `;
}

function listPage({ status, orderedDate }) {
  return `
    <h3 class="h3 centered">Ada Lovelace</h3>
    <a href="/ProdApps/SpecialOrdersCore/Orders/CreateOrder?CustId=42">Create</a>
    <div class="card">
      <div class="card-header Normal12 text-uppercase"><b>RUM - 555</b></div>
      <table>
        <tr><th scope="row">Ordered Date</th><td>${orderedDate}</td></tr>
        <tr><th scope="row">Status</th><td>${status}</td></tr>
        <tr><th scope="row">Store Location</th><td>COTTONWOOD HEIGHTS - 1863 E 7000 S</td></tr>
      </table>
      <table>
        <thead><tr><th>Product Name (Code)</th></tr></thead>
        <tbody>
          <tr class="NormalGridView"><td>EXAMPLE RUM 750ml (042306)</td><td>1 (12)</td><td>$10.00</td></tr>
        </tbody>
        <tfoot><tr><td></td><td></td><td>$10.00</td></tr></tfoot>
      </table>
    </div>
  `;
}

function response({ status = 200, body = '', location, cookies = [] } = {}) {
  const headers = new Headers();
  if (location) headers.set('location', location);
  cookies.forEach((cookie) => headers.append('set-cookie', cookie));
  return new Response(body, { status, headers });
}

function script(steps) {
  let index = 0;
  const seen = [];
  const impl = async (url, init = {}) => {
    const step = steps[index];
    index += 1;
    const method = init.method || 'GET';
    seen.push({ method, url: String(url), body: init.body ? String(init.body) : '', cookie: init.headers?.cookie || '' });
    if (!step) throw new Error(`unexpected ${method} ${url}`);
    if (step.method !== method) throw new Error(`expected ${step.method} got ${method} ${url}`);
    if (!String(url).includes(step.url)) throw new Error(`expected ${step.url} got ${url}`);
    if (step.cookie && !seen.at(-1).cookie.includes(step.cookie)) {
      throw new Error(`missing cookie ${step.cookie} on ${method} ${url}: ${seen.at(-1).cookie}`);
    }
    (step.body || []).forEach((part) => {
      if (!seen.at(-1).body.includes(part)) throw new Error(`body missing ${part}: ${seen.at(-1).body}`);
    });
    (step.absent || []).forEach((part) => {
      if (seen.at(-1).body.includes(part)) throw new Error(`body should not include ${part}`);
    });
    return step.respond();
  };
  impl.calls = seen;
  impl.done = () => index === steps.length;
  return impl;
}

function orderBody(extra = {}) {
  return {
    username: 'ada@example.com',
    password: 's3cret-value',
    nickname: 'RUM',
    items: [{ code: '42306', quantity: '1' }],
    ...extra,
  };
}

function loginSteps(captcha = '') {
  return [
    {
      method: 'GET',
      url: '/loginretail',
      respond: () => response({ body: LOGIN_PAGE, cookies: ['pre=1; Path=/; HttpOnly'] }),
    },
    {
      method: 'POST',
      url: '/loginretail',
      cookie: 'pre=1',
      body: ['EmailAddress=ada%40example.com', 'Password=s3cret-value', `Captcha=${captcha}`],
      respond: () => response({
        status: 302,
        location: '/ProdApps/SpecialOrdersCore/Orders?CustId=42',
        cookies: ['auth=yes; Path=/; HttpOnly'],
      }),
    },
    {
      method: 'GET',
      url: '/Orders?CustId=42',
      cookie: 'auth=yes',
      respond: () => response({ body: LOGGED_IN }),
    },
  ];
}

function createSteps() {
  return [
    ...loginSteps(),
    { method: 'GET', url: '/Orders/CreateOrder?CustId=42', respond: () => response({ body: CREATE_FORM }) },
    {
      method: 'POST',
      url: '/createnewheader',
      body: ['OrderNickName=RUM', 'StoreCity=COTTONWOOD+HEIGHTS', 'StoreCode=0015', 'CustomerId=42', '__RequestVerificationToken=token-create'],
      respond: () => response({
        status: 302,
        location: '/ProdApps/SpecialOrdersCore/Orders/CreateCartDetail?Custid=42&name=RUM&store=0015',
      }),
    },
    {
      method: 'GET',
      url: '/Orders/CreateCartDetail',
      respond: () => response({ body: detailPage({ status: 'Not Submitted', item: false }) }),
    },
    {
      method: 'POST',
      url: '/specialordercatalog',
      body: ['ItemDescriptionForCatalog=042306', 'CatalogItemCode=042306', 'QuantityForCatalog=1', 'Id=555', 'CommentsForCatalog='],
      respond: () => response({
        status: 302,
        location: '/ProdApps/SpecialOrdersCore/Orders/CreateOrdersPage?header=555',
      }),
    },
    {
      method: 'GET',
      url: '/Orders/CreateOrdersPage?header=555',
      respond: () => response({ body: detailPage({ status: 'Not Submitted' }) }),
    },
  ];
}

test('keeps every set-cookie from a response', () => {
  const headers = new Headers();
  headers.append('set-cookie', 'pre=1; Path=/; HttpOnly');
  headers.append('set-cookie', 'auth=yes; Path=/; Secure');
  const jar = new CookieJar();
  jar.absorb(headers);
  assert.equal(jar.header(), 'pre=1; auth=yes');
});

test('creates an order without submitting it', async () => {
  const fetchImpl = script([
    ...createSteps(),
    {
      method: 'GET',
      url: '/Orders?CustId=42',
      respond: () => response({ body: listPage({ status: 'Not Submitted', orderedDate: '' }) }),
    },
  ]);

  const result = await placeOrder(orderBody(), fetchImpl);

  assert.equal(fetchImpl.done(), true);
  assert.equal(fetchImpl.calls.some((call) => call.url.includes('SubmitOrder')), false);
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'create');
  assert.equal(result.submitted, false);
  assert.equal(result.httpStatus, 200);
  assert.deepEqual(result.customer, { id: '42', name: 'Ada Lovelace' });
  assert.equal(result.order.orderNumber, '555');
  assert.equal(result.order.status, 'Not Submitted');
  assert.equal(result.order.orderedDate, null);
  assert.equal(result.order.storeCode, '0015');
  assert.equal(result.order.storeCity, 'COTTONWOOD HEIGHTS');
  assert.equal(result.order.storeLocation, 'COTTONWOOD HEIGHTS - 1863 E 7000 S');
  assert.equal(result.order.items[0].code, '042306');
  assert.equal(result.order.items[0].quantity, 1);
  assert.equal(result.order.items[0].casePack, 12);
  assert.equal(result.order.total, '$10.00');
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.steps, ['login', 'create-header', 'add-item:042306']);
  assert.equal(JSON.stringify(result).includes('s3cret-value'), false);
});

test('submits only when submit mode is requested', async () => {
  const fetchImpl = script([
    ...createSteps(),
    {
      method: 'POST',
      url: '/Orders/SubmitOrder',
      body: ['Id=555', 'OrderNickName=RUM', 'StoreCode=0015', 'StoreCity=COTTONWOOD+HEIGHTS', 'CustomerId=42'],
      absent: ['__RequestVerificationToken', 's3cret-value'],
      respond: () => response({
        status: 302,
        location: '/ProdApps/SpecialOrdersCore/Orders/CreateOrdersPage?header=555',
      }),
    },
    {
      method: 'GET',
      url: '/Orders/CreateOrdersPage?header=555',
      respond: () => response({ body: detailPage({ status: 'Pending', delivery: '12/11/2026' }) }),
    },
    {
      method: 'GET',
      url: '/Orders?CustId=42',
      respond: () => response({ body: listPage({ status: 'Pending', orderedDate: '10/16/2026' }) }),
    },
  ]);

  const result = await placeOrder(orderBody({ submit: true, captcha: 'token-from-browser' }), fetchImpl);
  assert.equal(fetchImpl.done(), true);
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'submit');
  assert.equal(result.submitted, true);
  assert.equal(result.order.status, 'Pending');
  assert.equal(result.order.orderedDate, '10/16/2026');
  assert.equal(result.order.estimatedDelivery, '12/11/2026');
  assert.equal(result.steps.at(-1), 'submit');
});

test('returns login errors without placing an order', async () => {
  const fetchImpl = script([
    { method: 'GET', url: '/loginretail', respond: () => response({ body: LOGIN_PAGE }) },
    {
      method: 'POST',
      url: '/loginretail',
      respond: () => response({
        status: 200,
        body: `${LOGIN_PAGE}<span class="field-validation-error">Invalid login</span>`,
      }),
    },
  ]);
  const result = await placeOrder(orderBody(), fetchImpl);
  assert.equal(result.ok, false);
  assert.equal(result.httpStatus, 401);
  assert.equal(result.order, null);
  assert.equal(result.errors[0].message, 'Invalid login');
  assert.equal(JSON.stringify(result).includes('s3cret-value'), false);
  assert.equal(fetchImpl.done(), true);
});

test('asks for a store code when a city has several stores', async () => {
  const cityOnly = `
    <form action="/ProdApps/SpecialOrdersCore/createnewheader">
      <select name="StoreCity"><option selected="selected" value="Salt Lake City">Salt Lake City</option></select>
      <select name="StoreCode"><option value="">Select your preferred Store</option></select>
      <input name="__RequestVerificationToken" value="token-create" />
    </form>
  `;
  const fetchImpl = script([
    ...loginSteps(),
    { method: 'GET', url: '/Orders/CreateOrder?CustId=42', respond: () => response({ body: cityOnly }) },
    {
      method: 'GET',
      url: '/Orders/GetStoresLists?city=Salt+Lake+City',
      respond: () => response({
        body: JSON.stringify([
          { value: '0003', text: 'Store 3' },
          { value: '0004', text: 'Store 4' },
        ]),
      }),
    },
  ]);
  const result = await placeOrder(orderBody({ storeCity: 'Salt Lake City', storeCode: undefined }), fetchImpl);
  assert.equal(result.ok, false);
  assert.match(result.errors[0].message, /storeCode/);
  assert.match(result.errors[0].message, /0003 Store 3/);
  assert.equal(fetchImpl.done(), true);
});

test('rejects a payload before calling DABS', async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    throw new Error('should not be called');
  };
  const result = await placeOrder({ username: 'ada@example.com' }, fetchImpl);
  assert.equal(called, false);
  assert.equal(result.httpStatus, 400);
  assert.match(result.errors[0].message, /password/);
});

test('worker GET describes the request and POST returns the order', async () => {
  const described = await worker.fetch(new Request('https://order.example/'));
  assert.equal(described.status, 200);
  const schema = await described.json();
  assert.equal(schema.body.submit, false);
  assert.equal(schema.captcha.action, 'dabs_SpecialOrderClient_ViewModels_RetailLoginViewModel_login');

  const handler = createHandler(script([
    ...createSteps(),
    {
      method: 'GET',
      url: '/Orders?CustId=42',
      respond: () => response({ body: listPage({ status: 'Not Submitted', orderedDate: '' }) }),
    },
  ]));
  const responseOrder = await handler(new Request('https://order.example/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(orderBody()),
  }));
  assert.equal(responseOrder.status, 200);
  const order = await responseOrder.json();
  assert.equal(order.order.orderNumber, '555');
  assert.equal(order.submitted, false);
  assert.equal(order.httpStatus, undefined);

  const bad = await worker.fetch(new Request('https://order.example/', { method: 'POST', body: '{' }));
  assert.equal(bad.status, 400);
});

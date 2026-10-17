import {
  customerIdFrom,
  inputValue,
  isLoginPage,
  mergeOrder,
  normalizeStores,
  parseOrderDetail,
  parseOrdersList,
  parsePageErrors,
  selectedOption,
  verificationToken,
} from './parse.js';

export const ORIGIN = 'https://webapps2.abc.utah.gov';
export const BASE = `${ORIGIN}/ProdApps/SpecialOrdersCore`;

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';

const CREATE_HEADER = '/ProdApps/SpecialOrdersCore/createnewheader';
const ADD_CATALOG = '/ProdApps/SpecialOrdersCore/specialordercatalog';

export class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  absorb(headers) {
    const fromGetter = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
    const lines = fromGetter.length ? fromGetter : compact(headers.get('set-cookie'));
    lines.forEach((line) => {
      const pair = String(line).split(';')[0];
      const eq = pair.indexOf('=');
      if (eq < 1) return;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (!value) this.cookies.delete(name);
      else this.cookies.set(name, value);
    });
  }

  header() {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }
}

function compact(value) {
  return value ? [value] : [];
}

function resolveUrl(location, current) {
  const next = new URL(location, current);
  if (next.origin !== ORIGIN) {
    throw new Error(`Unexpected redirect to ${next.origin}`);
  }
  return next.toString();
}

function nonZero(value) {
  if (!value || value === '0') return null;
  return value;
}

export class DabsClient {
  constructor(fetchImpl = fetch) {
    this.fetch = fetchImpl;
    this.jar = new CookieJar();
    this.customerId = null;
    this.customerName = null;
    this.storeCode = null;
    this.storeCity = null;
    this.orderNumber = null;
    this.detailHtml = null;
  }

  customer() {
    if (!this.customerId) return null;
    return { id: this.customerId, name: this.customerName || null };
  }

  async request(method, url, { form, referer } = {}) {
    let current = url;
    let currentMethod = method;
    let body = form ? new URLSearchParams(form).toString() : undefined;

    for (let hop = 0; hop < 6; hop += 1) {
      const headers = {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
        'user-agent': USER_AGENT,
      };
      const cookie = this.jar.header();
      if (cookie) headers.cookie = cookie;
      if (referer && hop === 0) headers.referer = referer;
      if (body && currentMethod !== 'GET') {
        headers['content-type'] = 'application/x-www-form-urlencoded';
        headers.origin = ORIGIN;
      }

      // Each hop depends on the Set-Cookie and Location from the previous response.
      // eslint-disable-next-line no-await-in-loop
      const response = await this.fetch(current, {
        method: currentMethod,
        headers,
        body: currentMethod === 'GET' ? undefined : body,
        redirect: 'manual',
        credentials: 'omit',
      });
      this.jar.absorb(response.headers);

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) return { url: current, status: response.status, html: '' };
        current = resolveUrl(location, current);
        currentMethod = 'GET';
        body = undefined;
      } else {
        const html = await response.text();
        return { url: response.url || current, status: response.status, html };
      }
    }

    throw new Error('Too many redirects from DABS');
  }

  get(url, referer) {
    return this.request('GET', url, { referer });
  }

  post(url, form, referer) {
    return this.request('POST', url, { form, referer });
  }

  adoptSession(html, url) {
    this.customerId = customerIdFrom(html, url);
    this.customerName = parseOrdersList(html).customerName;
    if (!this.customerId) {
      return { ok: false, errors: [{ step: 'login', message: 'Login did not return a customer id.' }] };
    }
    return { ok: true };
  }

  async login(username, password, captcha) {
    const loginUrl = `${BASE}/loginretail`;
    await this.get(loginUrl);
    const posted = await this.post(loginUrl, {
      Captcha: captcha || '',
      EmailAddress: username,
      Password: password,
    }, loginUrl);

    if (posted.status >= 400 || isLoginPage(posted.html, posted.url)) {
      const messages = parsePageErrors(posted.html);
      const fallback = captcha
        ? 'DABS rejected the login.'
        : 'DABS rejected the login. The retail login form requires a reCAPTCHA Enterprise token in captcha.';
      const errors = (messages.length ? messages : [fallback]).map((message) => ({ step: 'login', message }));
      if (posted.status >= 400) {
        errors.unshift({ step: 'login', message: `DABS returned HTTP ${posted.status}` });
      }
      return { ok: false, errors };
    }

    this.customerId = customerIdFrom(posted.html, posted.url);
    this.customerName = parseOrdersList(posted.html).customerName;
    if (!this.customerId) {
      return {
        ok: false,
        errors: [{ step: 'login', message: 'Login did not return a customer id.' }],
      };
    }
    return { ok: true };
  }

  async stores(city) {
    const page = await this.get(`${BASE}/Orders/GetStoresLists?${new URLSearchParams({ city })}`);
    if (page.status >= 400) {
      throw new Error(`DABS returned HTTP ${page.status} for the store list`);
    }
    let data;
    try {
      data = JSON.parse(page.html);
    } catch (error) {
      throw new Error('DABS did not return a store list');
    }
    return normalizeStores(data);
  }

  async createHeader({ nickname, storeCity, storeCode }) {
    const createUrl = `${BASE}/Orders/CreateOrder?CustId=${this.customerId}`;
    const page = await this.get(createUrl);
    if (page.status >= 400 || isLoginPage(page.html, page.url)) {
      return { ok: false, errors: [{ step: 'create-header', message: 'The create-order page did not load.' }] };
    }

    const resolved = await this.resolveStore(page.html, storeCity, storeCode);
    if (!resolved.ok) return resolved;

    const token = verificationToken(page.html, CREATE_HEADER);
    if (!token) {
      return { ok: false, errors: [{ step: 'create-header', message: 'The create-order form had no verification token.' }] };
    }

    const posted = await this.post(`${BASE}/createnewheader`, {
      OrderNickName: nickname,
      StoreCity: resolved.storeCity,
      StoreCode: resolved.storeCode,
      CustomerId: this.customerId,
      __RequestVerificationToken: token,
    }, createUrl);

    if (posted.status >= 400 || isLoginPage(posted.html, posted.url)) {
      return {
        ok: false,
        errors: stepErrors('create-header', posted, 'DABS did not create the order.'),
      };
    }

    const orderNumber = orderNumberFrom(posted);
    if (!orderNumber) {
      return {
        ok: false,
        errors: stepErrors('create-header', posted, 'DABS did not return an order number.'),
      };
    }

    this.storeCity = resolved.storeCity;
    this.storeCode = resolved.storeCode;
    this.orderNumber = orderNumber;
    this.detailHtml = posted.html;
    return { ok: true, orderNumber, page: posted };
  }

  async resolveStore(html, storeCity, storeCode) {
    const pageCity = selectedOption(html, 'StoreCity');
    const pageCode = selectedOption(html, 'StoreCode') || nonZero(inputValue(html, 'StoreCode'));
    let city = storeCity || pageCity;
    let code = storeCode || (!storeCity ? pageCode : null);

    if (city && !code) {
      let stores;
      try {
        stores = await this.stores(city);
      } catch (error) {
        return { ok: false, errors: [{ step: 'create-header', message: error.message }] };
      }
      if (stores.length === 1) {
        code = stores[0].code;
      } else if (!stores.length) {
        return { ok: false, errors: [{ step: 'create-header', message: `No DABS stores were returned for ${city}.` }] };
      } else {
        const choices = stores.map((store) => `${store.code} ${store.name}`).join('; ');
        return {
          ok: false,
          errors: [{ step: 'create-header', message: `Pass storeCode for ${city}. Stores: ${choices}` }],
        };
      }
    }

    if (!city || !code) {
      return {
        ok: false,
        errors: [{ step: 'create-header', message: 'storeCity and storeCode are required when the account has no default store.' }],
      };
    }
    return { ok: true, storeCity: city, storeCode: code };
  }

  async addCatalogItem(page, item) {
    const token = verificationToken(page.html, ADD_CATALOG);
    const orderNumber = orderNumberFrom(page) || this.orderNumber;
    if (!token || !orderNumber) {
      return {
        ok: false,
        page,
        errors: [{ step: 'add-item', message: `Could not add ${item.code}; the catalog form was missing.` }],
      };
    }

    const posted = await this.post(`${BASE}/specialordercatalog`, {
      ItemDescriptionForCatalog: item.code,
      CatalogItemCode: item.code,
      QuantityForCatalog: String(item.quantity),
      Id: orderNumber,
      OrderNickName: inputValue(page.html, 'OrderNickName') || '',
      StoreCode: this.storeCode,
      StoreCity: this.storeCity,
      CustomerId: this.customerId,
      CommentsForCatalog: item.comment || '',
      __RequestVerificationToken: token,
    }, page.url);

    this.detailHtml = posted.html;
    if (posted.status >= 400 || isLoginPage(posted.html, posted.url)) {
      return { ok: false, page: posted, errors: stepErrors('add-item', posted, `DABS did not add item ${item.code}.`) };
    }

    const detail = parseOrderDetail(posted.html);
    const found = (detail?.items || []).some((line) => line.code === item.code);
    if (!found) {
      return {
        ok: false,
        page: posted,
        errors: stepErrors('add-item', posted, `Item ${item.code} was not on the order after it was added.`),
      };
    }
    return { ok: true, page: posted };
  }

  async submit(page) {
    const orderNumber = orderNumberFrom(page) || this.orderNumber;
    const posted = await this.post(`${BASE}/Orders/SubmitOrder`, {
      Id: orderNumber,
      OrderNickName: inputValue(page.html, 'OrderNickName') || '',
      StoreCode: this.storeCode || selectedOption(page.html, 'StoreCode') || '',
      StoreCity: this.storeCity || selectedOption(page.html, 'StoreCity') || '',
      CustomerId: this.customerId,
    }, page.url);

    this.detailHtml = posted.html;
    if (posted.status >= 400 || isLoginPage(posted.html, posted.url)) {
      return { ok: false, page: posted, errors: stepErrors('submit', posted, 'DABS did not submit the order.') };
    }

    const status = (parseOrderDetail(posted.html)?.status || '').trim().toLowerCase();
    if (!status || status === 'not submitted') {
      return {
        ok: false,
        page: posted,
        errors: stepErrors('submit', posted, 'The order is still not submitted.'),
      };
    }
    return { ok: true, page: posted };
  }

  async collect(orderNumber, detailHtml) {
    let listHtml = '';
    try {
      const list = await this.get(`${BASE}/Orders?CustId=${this.customerId}`);
      listHtml = list.html;
      if (!this.customerName) this.customerName = parseOrdersList(listHtml).customerName;
    } catch (error) {
      listHtml = '';
    }

    let detail = detailHtml || this.detailHtml;
    if (!parseOrderDetail(detail || '')?.orderNumber) {
      const page = await this.get(`${BASE}/Orders/CreateOrdersPage?header=${orderNumber}`);
      detail = page.html;
      this.detailHtml = detail;
    }

    const card = parseOrdersList(listHtml).orders.find((order) => order.orderNumber === String(orderNumber));
    return mergeOrder(parseOrderDetail(detail), card || null);
  }
}

function orderNumberFrom(page) {
  if (!page) return null;
  const fromDetail = parseOrderDetail(page.html)?.orderNumber;
  if (fromDetail) return fromDetail;
  const fromInput = nonZero(inputValue(page.html || '', 'Id'));
  if (fromInput) return fromInput;
  const fromUrl = String(page.url || '').match(/[?&]header=(\d+)/i);
  return fromUrl ? fromUrl[1] : null;
}

function stepErrors(step, page, fallback) {
  const messages = parsePageErrors(page.html || '');
  const errors = (messages.length ? messages : [fallback]).map((message) => ({ step, message }));
  if (page.status >= 400) errors.unshift({ step, message: `DABS returned HTTP ${page.status}` });
  return errors;
}

function failure(partial) {
  return {
    ok: false,
    mode: partial.mode ?? null,
    submitted: false,
    customer: partial.customer ?? null,
    order: partial.order ?? null,
    errors: partial.errors,
    steps: partial.steps || [],
    httpStatus: partial.httpStatus || 422,
  };
}

function pickField(body, keys) {
  const sources = [body, body.order && typeof body.order === 'object' ? body.order : {}];
  let value;
  sources.some((source) => keys.some((key) => {
    if (source[key] === undefined || source[key] === null || source[key] === '') return false;
    value = source[key];
    return true;
  }));
  return value;
}

function padDigits(value, width) {
  const raw = String(value).trim();
  if (/^\d+$/.test(raw) && raw.length < width) return raw.padStart(width, '0');
  return raw;
}

export function parseRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: failure({ httpStatus: 400, errors: [{ step: 'request', message: 'POST a JSON object.' }] }) };
  }

  const username = String(pickField(body, ['username', 'email', 'EmailAddress']) || '').trim();
  const password = pickField(body, ['password', 'Password']);
  if (!username || typeof password !== 'string' || !password) {
    return { error: failure({ httpStatus: 400, errors: [{ step: 'request', message: 'username and password are required.' }] }) };
  }

  const nickname = String(pickField(body, ['nickname', 'name', 'orderName', 'OrderNickName']) || '').trim();
  if (!nickname || nickname.length > 100) {
    return { error: failure({ httpStatus: 400, errors: [{ step: 'request', message: 'nickname is required (100 characters or fewer).' }] }) };
  }

  const rawItems = pickField(body, ['items']) ?? [];
  if (!Array.isArray(rawItems) || !rawItems.length) {
    return { error: failure({ httpStatus: 400, errors: [{ step: 'request', message: 'items must include at least one catalog item.' }] }) };
  }

  const items = [];
  let itemError = null;
  rawItems.some((item, index) => {
    if (!item || typeof item !== 'object') {
      itemError = `items[${index}] must be an object.`;
      return true;
    }
    const code = padDigits(item.code ?? item.sku ?? item.CatalogItemCode ?? '', 6);
    const quantity = Number(item.quantity ?? item.qty);
    if (!code) {
      itemError = `items[${index}].code is required.`;
      return true;
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
      itemError = `items[${index}].quantity must be a whole number of cases from 1 to 999.`;
      return true;
    }
    const comment = String(item.comment ?? item.comments ?? '');
    if (comment.length > 2000) {
      itemError = `items[${index}].comment is too long.`;
      return true;
    }
    items.push({ code, quantity, comment });
    return false;
  });
  if (itemError) {
    return { error: failure({ httpStatus: 400, errors: [{ step: 'request', message: itemError }] }) };
  }

  let submit = false;
  if (typeof body.submit === 'boolean') submit = body.submit;
  else if (body.mode === 'submit') submit = true;
  else if (body.mode && body.mode !== 'create') {
    return { error: failure({ httpStatus: 400, errors: [{ step: 'request', message: 'mode must be "create" or "submit".' }] }) };
  }

  const storeCity = pickField(body, ['storeCity', 'StoreCity']);
  const storeCode = pickField(body, ['storeCode', 'StoreCode']);
  const captcha = pickField(body, ['captcha', 'Captcha']);
  if (body.login !== undefined && body.login !== 'browser' && body.login !== 'direct') {
    return { error: failure({ httpStatus: 400, errors: [{ step: 'request', message: 'login must be "browser" or "direct".' }] }) };
  }

  return {
    value: {
      username,
      password,
      captcha: captcha ? String(captcha) : '',
      login: body.login || null,
      nickname,
      storeCity: storeCity ? String(storeCity) : undefined,
      storeCode: storeCode ? padDigits(storeCode, 4) : undefined,
      items,
      submit,
      mode: submit ? 'submit' : 'create',
    },
  };
}

export async function placeOrder(body, fetchImpl = fetch) {
  const parsed = parseRequest(body);
  if (parsed.error) return parsed.error;
  const request = parsed.value;
  const client = new DabsClient(fetchImpl);
  return runOrder(client, request, () => client.login(request.username, request.password, request.captcha));
}

export async function runOrder(client, request, login) {
  const steps = [];

  try {
    const session = await login();
    if (!session.ok) {
      return failure({ mode: request.mode, customer: client.customer(), errors: session.errors, steps, httpStatus: 401 });
    }
    steps.push('login');

    const created = await client.createHeader(request);
    if (!created.ok) {
      return failure({ mode: request.mode, customer: client.customer(), errors: created.errors, steps });
    }
    steps.push('create-header');

    let page = created.page;
    let index = 0;
    while (index < request.items.length) {
      const item = request.items[index];
      // Each catalog post needs the verification token from the previous page.
      // eslint-disable-next-line no-await-in-loop
      const added = await client.addCatalogItem(page, item);
      if (!added.ok) {
        const order = await client.collect(created.orderNumber, added.page?.html);
        return failure({
          mode: request.mode,
          customer: client.customer(),
          order,
          errors: added.errors,
          steps,
        });
      }
      page = added.page;
      steps.push(`add-item:${item.code}`);
      index += 1;
    }

    let submitted = false;
    if (request.submit) {
      const result = await client.submit(page);
      if (!result.ok) {
        const order = await client.collect(created.orderNumber, result.page?.html);
        return failure({
          mode: request.mode,
          customer: client.customer(),
          order,
          errors: result.errors,
          steps,
        });
      }
      page = result.page;
      submitted = true;
      steps.push('submit');
    }

    const order = await client.collect(created.orderNumber, page.html);
    return {
      ok: true,
      mode: request.mode,
      submitted,
      customer: client.customer(),
      order,
      errors: [],
      steps,
      httpStatus: 200,
    };
  } catch (error) {
    let order = null;
    if (client.detailHtml) order = mergeOrder(parseOrderDetail(client.detailHtml), null);
    return failure({
      mode: request.mode,
      customer: client.customer(),
      order,
      errors: [{ step: 'dabs', message: error.message || 'The request to DABS failed.' }],
      steps,
      httpStatus: 502,
    });
  }
}

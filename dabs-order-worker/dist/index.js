var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/parse.js
function decodeHtml(value) {
  return String(value).replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16))).replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec))).replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ");
}
__name(decodeHtml, "decodeHtml");
function textContent(value) {
  return decodeHtml(String(value).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}
__name(textContent, "textContent");
function attr(tag, name) {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"));
  if (!match) return null;
  return decodeHtml(match[1] ?? match[2]);
}
__name(attr, "attr");
function inputValue(html, name) {
  const tags = html.match(/<input\b[^>]*>/gi) || [];
  let found = null;
  tags.some((tag) => {
    if (attr(tag, "name") !== name) return false;
    found = attr(tag, "value") ?? "";
    return true;
  });
  return found;
}
__name(inputValue, "inputValue");
function selectedOption(html, name) {
  const match = html.match(new RegExp(`<select\\b[^>]*name=["']${name}["'][^>]*>([\\s\\S]*?)</select>`, "i"));
  if (!match) return null;
  const options = [...match[1].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)];
  const chosen = options.find((option) => /\bselected\b/i.test(option[1]));
  if (!chosen) return null;
  const value = attr(chosen[1], "value");
  return value || null;
}
__name(selectedOption, "selectedOption");
function formByAction(html, actionPath) {
  const idx = html.indexOf(`action="${actionPath}"`);
  const startAt = idx >= 0 ? idx : html.indexOf(`action='${actionPath}'`);
  if (startAt < 0) return "";
  const start = html.lastIndexOf("<form", startAt);
  const end = html.indexOf("</form>", startAt);
  if (start < 0 || end < 0) return "";
  return html.slice(start, end);
}
__name(formByAction, "formByAction");
function verificationToken(html, actionPath) {
  const form = formByAction(html, actionPath);
  if (!form) return null;
  const nameAt = form.indexOf("__RequestVerificationToken");
  if (nameAt < 0) return null;
  const tagStart = form.lastIndexOf("<input", nameAt);
  const tagEnd = form.indexOf(">", nameAt);
  if (tagStart < 0 || tagEnd < 0) return null;
  return attr(form.slice(tagStart, tagEnd + 1), "value");
}
__name(verificationToken, "verificationToken");
function parsePageErrors(html) {
  const messages = [];
  const summary = html.match(/validation-summary-errors[\s\S]*?<ul>([\s\S]*?)<\/ul>/i);
  if (summary) {
    [...summary[1].matchAll(/<li>([\s\S]*?)<\/li>/gi)].forEach((item) => {
      const message = textContent(item[1]);
      if (message) messages.push(message);
    });
  }
  [...html.matchAll(/field-validation-error[^>]*>([\s\S]*?)<\/span>/gi)].forEach((item) => {
    const message = textContent(item[1]);
    if (message) messages.push(message);
  });
  [...html.matchAll(/class="[^"]*alert-danger[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)].forEach((item) => {
    const message = textContent(item[1]);
    if (message) messages.push(message);
  });
  return [...new Set(messages)];
}
__name(parsePageErrors, "parsePageErrors");
function isLoginPage(html, url) {
  if (/loginretail/i.test(String(url || ""))) return true;
  return /Special Orders Retail Login/i.test(html) && !/Open Orders/i.test(html);
}
__name(isLoginPage, "isLoginPage");
function customerIdFrom(html, url) {
  const fromUrl = String(url || "").match(/[?&]CustId=(\d+)/i);
  if (fromUrl) return fromUrl[1];
  const fromLink = html.match(/CreateOrder\?CustId=(\d+)/i);
  if (fromLink) return fromLink[1];
  const hidden = inputValue(html, "CustomerId");
  return hidden || null;
}
__name(customerIdFrom, "customerIdFrom");
function parseProduct(cell) {
  const plain = textContent(cell.replace(/<span class="badge[\s\S]*?<\/span>/gi, ""));
  const dashed = plain.match(/^(.*)\s-\s([A-Za-z0-9]+)$/);
  if (dashed) return { name: dashed[1].trim(), code: dashed[2] };
  const paren = plain.match(/^(.*)\s\(([A-Za-z0-9]+)\)\s*$/);
  if (paren) return { name: paren[1].trim(), code: paren[2] };
  return { name: plain, code: null };
}
__name(parseProduct, "parseProduct");
function parseQty(cell) {
  const plain = textContent(cell);
  const packed = plain.match(/^(\d+)\s*\((\d+)\)$/);
  if (packed) return { quantity: Number(packed[1]), casePack: Number(packed[2]) };
  const single = plain.match(/^(\d+)$/);
  if (single) return { quantity: Number(single[1]), casePack: null };
  return { quantity: null, casePack: null };
}
__name(parseQty, "parseQty");
function parseLineRow(row) {
  const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cell[1]);
  if (!cells.length) return null;
  const product = parseProduct(cells[0]);
  const priceIndex = cells.findIndex((cell, index) => index > 0 && /\$[\d,.]/.test(cell));
  const qtyIndex = cells.findIndex((cell, index) => index > 0 && /^\s*\d/.test(textContent(cell)));
  const qty = parseQty(qtyIndex >= 0 ? cells[qtyIndex] : "");
  const badge = row.match(/<span class="badge[^"]*"[^>]*>([^<]+)<\/span>/i);
  const line = row.match(/[?&]Cid=(\d+)/i);
  return {
    lineId: line ? line[1] : null,
    name: product.name,
    code: product.code,
    quantity: qty.quantity,
    casePack: qty.casePack,
    totalPrice: priceIndex >= 0 ? textContent(cells[priceIndex]) : null,
    status: badge ? textContent(badge[1]) : null
  };
}
__name(parseLineRow, "parseLineRow");
function tableTotal(table) {
  const foot = table.match(/<tfoot>([\s\S]*?)<\/tfoot>/i);
  if (!foot) return null;
  const amounts = [...foot[1].matchAll(/\$[\d,.]+/g)];
  return amounts.length ? amounts[amounts.length - 1][0] : null;
}
__name(tableTotal, "tableTotal");
function parseOrderDetail(html) {
  if (!html) return null;
  const orderNumber = (html.match(/id="stId">\s*([^<]+)/i) || [])[1];
  const delivery = (html.match(/id="stdate">\s*([^<]+)/i) || [])[1];
  const table = html.match(/Product Name - Code[\s\S]*?<\/table>/i);
  const rows = table ? [...table[0].matchAll(/<tr class="NormalGridView">([\s\S]*?)<\/tr>/gi)] : [];
  return {
    orderNumber: orderNumber ? textContent(orderNumber) : null,
    nickname: inputValue(html, "OrderNickName"),
    status: inputValue(html, "Status"),
    estimatedDelivery: delivery ? textContent(delivery) : null,
    storeCode: selectedOption(html, "StoreCode") || inputValue(html, "StoreCode"),
    storeCity: selectedOption(html, "StoreCity"),
    customerId: inputValue(html, "CustomerId"),
    items: rows.map((row) => parseLineRow(row[1])).filter((item) => item && item.name),
    total: table ? tableTotal(table[0]) : null
  };
}
__name(parseOrderDetail, "parseOrderDetail");
function labeledValue(html, label) {
  const match = html.match(new RegExp(`<th\\b[^>]*>\\s*${label}\\s*</th>\\s*<td>([\\s\\S]*?)</td>`, "i"));
  if (!match) return null;
  const value = textContent(match[1]);
  return value || null;
}
__name(labeledValue, "labeledValue");
function parseOrderCard(chunk) {
  const header = chunk.match(/<div class="card-header[^>]*>\s*<b>([\s\S]*?)<\/b>/i);
  if (!header) return null;
  const title = textContent(header[1]);
  const splitAt = title.lastIndexOf(" - ");
  const rows = [...chunk.matchAll(/<tr class="NormalGridView">([\s\S]*?)<\/tr>/gi)];
  const productTable = chunk.match(/Product Name \(Code\)[\s\S]*?<\/table>/i);
  return {
    orderNumber: splitAt >= 0 ? title.slice(splitAt + 3).trim() : null,
    nickname: splitAt >= 0 ? title.slice(0, splitAt).trim() : title,
    orderedDate: labeledValue(chunk, "Ordered Date"),
    status: labeledValue(chunk, "Status"),
    storeLocation: labeledValue(chunk, "Store Location"),
    items: rows.map((row) => parseLineRow(row[1])).filter((item) => item && item.name),
    total: productTable ? tableTotal(productTable[0]) : null
  };
}
__name(parseOrderCard, "parseOrderCard");
function parseOrdersList(html) {
  if (!html) return { customerName: null, customerId: null, orders: [] };
  const name = html.match(/<h3 class="h3 centered">([^<]*)<\/h3>/i);
  const chunks = html.split('<div class="card">').slice(1);
  return {
    customerName: name ? textContent(name[1]) : null,
    customerId: customerIdFrom(html, ""),
    orders: chunks.map((chunk) => parseOrderCard(chunk)).filter(Boolean)
  };
}
__name(parseOrdersList, "parseOrdersList");
function mergeOrder(detail, card) {
  const items = detail?.items?.length ? detail.items : card?.items || [];
  const orderNumber = detail?.orderNumber || card?.orderNumber || null;
  if (!orderNumber && !detail && !card) return null;
  return {
    orderNumber,
    id: orderNumber,
    nickname: detail?.nickname || card?.nickname || null,
    status: detail?.status || card?.status || null,
    orderedDate: card?.orderedDate || null,
    estimatedDelivery: detail?.estimatedDelivery || null,
    storeCode: detail?.storeCode || null,
    storeCity: detail?.storeCity || null,
    storeLocation: card?.storeLocation || null,
    items,
    total: detail?.total || card?.total || null
  };
}
__name(mergeOrder, "mergeOrder");
function normalizeStores(data) {
  const list = Array.isArray(data) ? data : Object.values(data || {});
  return list.map((item) => {
    if (!item || typeof item !== "object") return null;
    const code = item.value ?? item.Value ?? item.code ?? item.StoreCode;
    const name = item.text ?? item.Text ?? item.name ?? item.Name;
    if (code === void 0 || code === null || code === "") return null;
    return { code: String(code), name: name ? String(name) : String(code) };
  }).filter(Boolean);
}
__name(normalizeStores, "normalizeStores");

// src/session.js
var ORIGIN = "https://webapps2.abc.utah.gov";
var BASE = `${ORIGIN}/ProdApps/SpecialOrdersCore`;
var USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36";
var CREATE_HEADER = "/ProdApps/SpecialOrdersCore/createnewheader";
var ADD_CATALOG = "/ProdApps/SpecialOrdersCore/specialordercatalog";
var CookieJar = class {
  static {
    __name(this, "CookieJar");
  }
  constructor() {
    this.cookies = /* @__PURE__ */ new Map();
  }
  absorb(headers) {
    const fromGetter = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
    const lines = fromGetter.length ? fromGetter : compact(headers.get("set-cookie"));
    lines.forEach((line) => {
      const pair = String(line).split(";")[0];
      const eq = pair.indexOf("=");
      if (eq < 1) return;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (!value) this.cookies.delete(name);
      else this.cookies.set(name, value);
    });
  }
  header() {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  }
};
function compact(value) {
  return value ? [value] : [];
}
__name(compact, "compact");
function resolveUrl(location, current) {
  const next = new URL(location, current);
  if (next.origin !== ORIGIN) {
    throw new Error(`Unexpected redirect to ${next.origin}`);
  }
  return next.toString();
}
__name(resolveUrl, "resolveUrl");
function nonZero(value) {
  if (!value || value === "0") return null;
  return value;
}
__name(nonZero, "nonZero");
var DabsClient = class {
  static {
    __name(this, "DabsClient");
  }
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
    let body = form ? new URLSearchParams(form).toString() : void 0;
    for (let hop = 0; hop < 6; hop += 1) {
      const headers = {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        "user-agent": USER_AGENT
      };
      const cookie = this.jar.header();
      if (cookie) headers.cookie = cookie;
      if (referer && hop === 0) headers.referer = referer;
      if (body && currentMethod !== "GET") {
        headers["content-type"] = "application/x-www-form-urlencoded";
        headers.origin = ORIGIN;
      }
      const response = await this.fetch(current, {
        method: currentMethod,
        headers,
        body: currentMethod === "GET" ? void 0 : body,
        redirect: "manual",
        credentials: "omit"
      });
      this.jar.absorb(response.headers);
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) return { url: current, status: response.status, html: "" };
        current = resolveUrl(location, current);
        currentMethod = "GET";
        body = void 0;
      } else {
        const html = await response.text();
        return { url: current, status: response.status, html };
      }
    }
    throw new Error("Too many redirects from DABS");
  }
  get(url, referer) {
    return this.request("GET", url, { referer });
  }
  post(url, form, referer) {
    return this.request("POST", url, { form, referer });
  }
  async login(username, password, captcha) {
    const loginUrl = `${BASE}/loginretail`;
    await this.get(loginUrl);
    const posted = await this.post(loginUrl, {
      Captcha: captcha || "",
      EmailAddress: username,
      Password: password
    }, loginUrl);
    if (posted.status >= 400 || isLoginPage(posted.html, posted.url)) {
      const messages = parsePageErrors(posted.html);
      const fallback = captcha ? "DABS rejected the login." : "DABS rejected the login. The retail login form requires a reCAPTCHA Enterprise token in captcha.";
      const errors = (messages.length ? messages : [fallback]).map((message) => ({ step: "login", message }));
      if (posted.status >= 400) {
        errors.unshift({ step: "login", message: `DABS returned HTTP ${posted.status}` });
      }
      return { ok: false, errors };
    }
    this.customerId = customerIdFrom(posted.html, posted.url);
    this.customerName = parseOrdersList(posted.html).customerName;
    if (!this.customerId) {
      return {
        ok: false,
        errors: [{ step: "login", message: "Login did not return a customer id." }]
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
      throw new Error("DABS did not return a store list");
    }
    return normalizeStores(data);
  }
  async createHeader({ nickname, storeCity, storeCode }) {
    const createUrl = `${BASE}/Orders/CreateOrder?CustId=${this.customerId}`;
    const page = await this.get(createUrl);
    if (page.status >= 400 || isLoginPage(page.html, page.url)) {
      return { ok: false, errors: [{ step: "create-header", message: "The create-order page did not load." }] };
    }
    const resolved = await this.resolveStore(page.html, storeCity, storeCode);
    if (!resolved.ok) return resolved;
    const token = verificationToken(page.html, CREATE_HEADER);
    if (!token) {
      return { ok: false, errors: [{ step: "create-header", message: "The create-order form had no verification token." }] };
    }
    const posted = await this.post(`${BASE}/createnewheader`, {
      OrderNickName: nickname,
      StoreCity: resolved.storeCity,
      StoreCode: resolved.storeCode,
      CustomerId: this.customerId,
      __RequestVerificationToken: token
    }, createUrl);
    if (posted.status >= 400 || isLoginPage(posted.html, posted.url)) {
      return {
        ok: false,
        errors: stepErrors("create-header", posted, "DABS did not create the order.")
      };
    }
    const orderNumber = orderNumberFrom(posted);
    if (!orderNumber) {
      return {
        ok: false,
        errors: stepErrors("create-header", posted, "DABS did not return an order number.")
      };
    }
    this.storeCity = resolved.storeCity;
    this.storeCode = resolved.storeCode;
    this.orderNumber = orderNumber;
    this.detailHtml = posted.html;
    return { ok: true, orderNumber, page: posted };
  }
  async resolveStore(html, storeCity, storeCode) {
    const pageCity = selectedOption(html, "StoreCity");
    const pageCode = selectedOption(html, "StoreCode") || nonZero(inputValue(html, "StoreCode"));
    let city = storeCity || pageCity;
    let code = storeCode || (!storeCity ? pageCode : null);
    if (city && !code) {
      let stores;
      try {
        stores = await this.stores(city);
      } catch (error) {
        return { ok: false, errors: [{ step: "create-header", message: error.message }] };
      }
      if (stores.length === 1) {
        code = stores[0].code;
      } else if (!stores.length) {
        return { ok: false, errors: [{ step: "create-header", message: `No DABS stores were returned for ${city}.` }] };
      } else {
        const choices = stores.map((store) => `${store.code} ${store.name}`).join("; ");
        return {
          ok: false,
          errors: [{ step: "create-header", message: `Pass storeCode for ${city}. Stores: ${choices}` }]
        };
      }
    }
    if (!city || !code) {
      return {
        ok: false,
        errors: [{ step: "create-header", message: "storeCity and storeCode are required when the account has no default store." }]
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
        errors: [{ step: "add-item", message: `Could not add ${item.code}; the catalog form was missing.` }]
      };
    }
    const posted = await this.post(`${BASE}/specialordercatalog`, {
      ItemDescriptionForCatalog: item.code,
      CatalogItemCode: item.code,
      QuantityForCatalog: String(item.quantity),
      Id: orderNumber,
      OrderNickName: inputValue(page.html, "OrderNickName") || "",
      StoreCode: this.storeCode,
      StoreCity: this.storeCity,
      CustomerId: this.customerId,
      CommentsForCatalog: item.comment || "",
      __RequestVerificationToken: token
    }, page.url);
    this.detailHtml = posted.html;
    if (posted.status >= 400 || isLoginPage(posted.html, posted.url)) {
      return { ok: false, page: posted, errors: stepErrors("add-item", posted, `DABS did not add item ${item.code}.`) };
    }
    const detail = parseOrderDetail(posted.html);
    const found = (detail?.items || []).some((line) => line.code === item.code);
    if (!found) {
      return {
        ok: false,
        page: posted,
        errors: stepErrors("add-item", posted, `Item ${item.code} was not on the order after it was added.`)
      };
    }
    return { ok: true, page: posted };
  }
  async submit(page) {
    const orderNumber = orderNumberFrom(page) || this.orderNumber;
    const posted = await this.post(`${BASE}/Orders/SubmitOrder`, {
      Id: orderNumber,
      OrderNickName: inputValue(page.html, "OrderNickName") || "",
      StoreCode: this.storeCode || selectedOption(page.html, "StoreCode") || "",
      StoreCity: this.storeCity || selectedOption(page.html, "StoreCity") || "",
      CustomerId: this.customerId
    }, page.url);
    this.detailHtml = posted.html;
    if (posted.status >= 400 || isLoginPage(posted.html, posted.url)) {
      return { ok: false, page: posted, errors: stepErrors("submit", posted, "DABS did not submit the order.") };
    }
    const status = (parseOrderDetail(posted.html)?.status || "").trim().toLowerCase();
    if (!status || status === "not submitted") {
      return {
        ok: false,
        page: posted,
        errors: stepErrors("submit", posted, "The order is still not submitted.")
      };
    }
    return { ok: true, page: posted };
  }
  async collect(orderNumber, detailHtml) {
    let listHtml = "";
    try {
      const list = await this.get(`${BASE}/Orders?CustId=${this.customerId}`);
      listHtml = list.html;
      if (!this.customerName) this.customerName = parseOrdersList(listHtml).customerName;
    } catch (error) {
      listHtml = "";
    }
    let detail = detailHtml || this.detailHtml;
    if (!parseOrderDetail(detail || "")?.orderNumber) {
      const page = await this.get(`${BASE}/Orders/CreateOrdersPage?header=${orderNumber}`);
      detail = page.html;
      this.detailHtml = detail;
    }
    const card = parseOrdersList(listHtml).orders.find((order) => order.orderNumber === String(orderNumber));
    return mergeOrder(parseOrderDetail(detail), card || null);
  }
};
function orderNumberFrom(page) {
  if (!page) return null;
  const fromDetail = parseOrderDetail(page.html)?.orderNumber;
  if (fromDetail) return fromDetail;
  const fromInput = nonZero(inputValue(page.html || "", "Id"));
  if (fromInput) return fromInput;
  const fromUrl = String(page.url || "").match(/[?&]header=(\d+)/i);
  return fromUrl ? fromUrl[1] : null;
}
__name(orderNumberFrom, "orderNumberFrom");
function stepErrors(step, page, fallback) {
  const messages = parsePageErrors(page.html || "");
  const errors = (messages.length ? messages : [fallback]).map((message) => ({ step, message }));
  if (page.status >= 400) errors.unshift({ step, message: `DABS returned HTTP ${page.status}` });
  return errors;
}
__name(stepErrors, "stepErrors");
function failure(partial) {
  return {
    ok: false,
    mode: partial.mode ?? null,
    submitted: false,
    customer: partial.customer ?? null,
    order: partial.order ?? null,
    errors: partial.errors,
    steps: partial.steps || [],
    httpStatus: partial.httpStatus || 422
  };
}
__name(failure, "failure");
function pickField(body, keys) {
  const sources = [body, body.order && typeof body.order === "object" ? body.order : {}];
  let value;
  sources.some((source) => keys.some((key) => {
    if (source[key] === void 0 || source[key] === null || source[key] === "") return false;
    value = source[key];
    return true;
  }));
  return value;
}
__name(pickField, "pickField");
function padDigits(value, width) {
  const raw = String(value).trim();
  if (/^\d+$/.test(raw) && raw.length < width) return raw.padStart(width, "0");
  return raw;
}
__name(padDigits, "padDigits");
function parseRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: failure({ httpStatus: 400, errors: [{ step: "request", message: "POST a JSON object." }] }) };
  }
  const username = String(pickField(body, ["username", "email", "EmailAddress"]) || "").trim();
  const password = pickField(body, ["password", "Password"]);
  if (!username || typeof password !== "string" || !password) {
    return { error: failure({ httpStatus: 400, errors: [{ step: "request", message: "username and password are required." }] }) };
  }
  const nickname = String(pickField(body, ["nickname", "name", "orderName", "OrderNickName"]) || "").trim();
  if (!nickname || nickname.length > 100) {
    return { error: failure({ httpStatus: 400, errors: [{ step: "request", message: "nickname is required (100 characters or fewer)." }] }) };
  }
  const rawItems = pickField(body, ["items"]) ?? [];
  if (!Array.isArray(rawItems) || !rawItems.length) {
    return { error: failure({ httpStatus: 400, errors: [{ step: "request", message: "items must include at least one catalog item." }] }) };
  }
  const items = [];
  let itemError = null;
  rawItems.some((item, index) => {
    if (!item || typeof item !== "object") {
      itemError = `items[${index}] must be an object.`;
      return true;
    }
    const code = padDigits(item.code ?? item.sku ?? item.CatalogItemCode ?? "", 6);
    const quantity = Number(item.quantity ?? item.qty);
    if (!code) {
      itemError = `items[${index}].code is required.`;
      return true;
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
      itemError = `items[${index}].quantity must be a whole number of cases from 1 to 999.`;
      return true;
    }
    const comment = String(item.comment ?? item.comments ?? "");
    if (comment.length > 2e3) {
      itemError = `items[${index}].comment is too long.`;
      return true;
    }
    items.push({ code, quantity, comment });
    return false;
  });
  if (itemError) {
    return { error: failure({ httpStatus: 400, errors: [{ step: "request", message: itemError }] }) };
  }
  let submit = false;
  if (typeof body.submit === "boolean") submit = body.submit;
  else if (body.mode === "submit") submit = true;
  else if (body.mode && body.mode !== "create") {
    return { error: failure({ httpStatus: 400, errors: [{ step: "request", message: 'mode must be "create" or "submit".' }] }) };
  }
  const storeCity = pickField(body, ["storeCity", "StoreCity"]);
  const storeCode = pickField(body, ["storeCode", "StoreCode"]);
  const captcha = pickField(body, ["captcha", "Captcha"]);
  return {
    value: {
      username,
      password,
      captcha: captcha ? String(captcha) : "",
      nickname,
      storeCity: storeCity ? String(storeCity) : void 0,
      storeCode: storeCode ? padDigits(storeCode, 4) : void 0,
      items,
      submit,
      mode: submit ? "submit" : "create"
    }
  };
}
__name(parseRequest, "parseRequest");
async function placeOrder(body, fetchImpl = fetch) {
  const parsed = parseRequest(body);
  if (parsed.error) return parsed.error;
  const request = parsed.value;
  const client = new DabsClient(fetchImpl);
  const steps = [];
  try {
    const session = await client.login(request.username, request.password, request.captcha);
    if (!session.ok) {
      return failure({ mode: request.mode, customer: client.customer(), errors: session.errors, steps, httpStatus: 401 });
    }
    steps.push("login");
    const created = await client.createHeader(request);
    if (!created.ok) {
      return failure({ mode: request.mode, customer: client.customer(), errors: created.errors, steps });
    }
    steps.push("create-header");
    let page = created.page;
    let index = 0;
    while (index < request.items.length) {
      const item = request.items[index];
      const added = await client.addCatalogItem(page, item);
      if (!added.ok) {
        const order2 = await client.collect(created.orderNumber, added.page?.html);
        return failure({
          mode: request.mode,
          customer: client.customer(),
          order: order2,
          errors: added.errors,
          steps
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
        const order2 = await client.collect(created.orderNumber, result.page?.html);
        return failure({
          mode: request.mode,
          customer: client.customer(),
          order: order2,
          errors: result.errors,
          steps
        });
      }
      page = result.page;
      submitted = true;
      steps.push("submit");
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
      httpStatus: 200
    };
  } catch (error) {
    let order = null;
    if (client.detailHtml) order = mergeOrder(parseOrderDetail(client.detailHtml), null);
    return failure({
      mode: request.mode,
      customer: client.customer(),
      order,
      errors: [{ step: "dabs", message: error.message || "The request to DABS failed." }],
      steps,
      httpStatus: 502
    });
  }
}
__name(placeOrder, "placeOrder");

// src/index.js
var SCHEMA = {
  name: "dabs-order-worker",
  method: "POST",
  contentType: "application/json",
  description: "Log into Utah DABS special orders, create an order, and optionally submit it. The default mode creates the order and does not submit it.",
  body: {
    username: "DABS retail email",
    password: "DABS password",
    captcha: "reCAPTCHA Enterprise token from the login page. DABS rejects login without it.",
    submit: false,
    mode: "create (default) or submit",
    nickname: "order nickname",
    storeCity: "optional; defaults to the account city",
    storeCode: 'optional; defaults to the account store, for example "0015"',
    items: [{ code: "042306", quantity: 1, comment: "" }]
  },
  captcha: {
    siteKey: "6Lc7lWIlAAAAAI1aeyvfMaCDM9mEmtsbqVliMOCx",
    action: "dabs_SpecialOrderClient_ViewModels_RetailLoginViewModel_login"
  },
  response: {
    ok: true,
    mode: "create",
    submitted: false,
    customer: { id: "107750", name: "Account Name" },
    order: {
      orderNumber: "320245",
      id: "320245",
      nickname: "RUM",
      status: "Not Submitted",
      orderedDate: null,
      estimatedDelivery: null,
      storeCode: "0015",
      storeCity: "COTTONWOOD HEIGHTS",
      storeLocation: "COTTONWOOD HEIGHTS - 1863 E 7000 S",
      items: [{
        lineId: "389345",
        name: "Example Rum 750ml",
        code: "042306",
        quantity: 1,
        casePack: 12,
        totalPrice: "$311.88",
        status: null
      }],
      total: "$311.88"
    },
    errors: [],
    steps: ["login", "create-header", "add-item:042306"]
  }
};
var CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type"
};
function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...CORS
    }
  });
}
__name(json, "json");
function createHandler(fetchImpl = fetch) {
  return async (request) => {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method === "GET") return json(SCHEMA, 200);
    if (request.method !== "POST") {
      return json({
        ok: false,
        mode: null,
        submitted: false,
        customer: null,
        order: null,
        errors: [{ step: "request", message: "Use POST." }],
        steps: []
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
        errors: [{ step: "request", message: "Body must be JSON." }],
        steps: []
      }, 400);
    }
    const result = await placeOrder(body, fetchImpl);
    const status = result.httpStatus || (result.ok ? 200 : 422);
    delete result.httpStatus;
    return json(result, status);
  };
}
__name(createHandler, "createHandler");
var index_default = {
  fetch(request) {
    return createHandler(fetch)(request);
  }
};
export {
  SCHEMA,
  createHandler,
  index_default as default
};
//# sourceMappingURL=index.js.map

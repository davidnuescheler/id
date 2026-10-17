export function decodeHtml(value) {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ');
}

export function textContent(value) {
  return decodeHtml(String(value).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export function attr(tag, name) {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  if (!match) return null;
  return decodeHtml(match[1] ?? match[2]);
}

export function inputValue(html, name) {
  const tags = html.match(/<input\b[^>]*>/gi) || [];
  let found = null;
  tags.some((tag) => {
    if (attr(tag, 'name') !== name) return false;
    found = attr(tag, 'value') ?? '';
    return true;
  });
  return found;
}

export function selectedOption(html, name) {
  const match = html.match(new RegExp(`<select\\b[^>]*name=["']${name}["'][^>]*>([\\s\\S]*?)</select>`, 'i'));
  if (!match) return null;
  const options = [...match[1].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)];
  const chosen = options.find((option) => /\bselected\b/i.test(option[1]));
  if (!chosen) return null;
  const value = attr(chosen[1], 'value');
  return value || null;
}

export function formByAction(html, actionPath) {
  const idx = html.indexOf(`action="${actionPath}"`);
  const startAt = idx >= 0 ? idx : html.indexOf(`action='${actionPath}'`);
  if (startAt < 0) return '';
  const start = html.lastIndexOf('<form', startAt);
  const end = html.indexOf('</form>', startAt);
  if (start < 0 || end < 0) return '';
  return html.slice(start, end);
}

export function verificationToken(html, actionPath) {
  const form = formByAction(html, actionPath);
  if (!form) return null;
  const nameAt = form.indexOf('__RequestVerificationToken');
  if (nameAt < 0) return null;
  const tagStart = form.lastIndexOf('<input', nameAt);
  const tagEnd = form.indexOf('>', nameAt);
  if (tagStart < 0 || tagEnd < 0) return null;
  return attr(form.slice(tagStart, tagEnd + 1), 'value');
}

export function parsePageErrors(html) {
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

export function isLoginPage(html, url) {
  if (/loginretail/i.test(String(url || ''))) return true;
  return /Special Orders Retail Login/i.test(html) && !/Open Orders/i.test(html);
}

export function customerIdFrom(html, url) {
  const fromUrl = String(url || '').match(/[?&]CustId=(\d+)/i);
  if (fromUrl) return fromUrl[1];
  const fromLink = html.match(/CreateOrder\?CustId=(\d+)/i);
  if (fromLink) return fromLink[1];
  const hidden = inputValue(html, 'CustomerId');
  return hidden || null;
}

function parseProduct(cell) {
  const plain = textContent(cell.replace(/<span class="badge[\s\S]*?<\/span>/gi, ''));
  const dashed = plain.match(/^(.*)\s-\s([A-Za-z0-9]+)$/);
  if (dashed) return { name: dashed[1].trim(), code: dashed[2] };
  const paren = plain.match(/^(.*)\s\(([A-Za-z0-9]+)\)\s*$/);
  if (paren) return { name: paren[1].trim(), code: paren[2] };
  return { name: plain, code: null };
}

function parseQty(cell) {
  const plain = textContent(cell);
  const packed = plain.match(/^(\d+)\s*\((\d+)\)$/);
  if (packed) return { quantity: Number(packed[1]), casePack: Number(packed[2]) };
  const single = plain.match(/^(\d+)$/);
  if (single) return { quantity: Number(single[1]), casePack: null };
  return { quantity: null, casePack: null };
}

function parseLineRow(row) {
  const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cell[1]);
  if (!cells.length) return null;
  const product = parseProduct(cells[0]);
  const priceIndex = cells.findIndex((cell, index) => index > 0 && /\$[\d,.]/.test(cell));
  const qtyIndex = cells.findIndex((cell, index) => index > 0 && /^\s*\d/.test(textContent(cell)));
  const qty = parseQty(qtyIndex >= 0 ? cells[qtyIndex] : '');
  const badge = row.match(/<span class="badge[^"]*"[^>]*>([^<]+)<\/span>/i);
  const line = row.match(/[?&]Cid=(\d+)/i);
  return {
    lineId: line ? line[1] : null,
    name: product.name,
    code: product.code,
    quantity: qty.quantity,
    casePack: qty.casePack,
    totalPrice: priceIndex >= 0 ? textContent(cells[priceIndex]) : null,
    status: badge ? textContent(badge[1]) : null,
  };
}

function tableTotal(table) {
  const foot = table.match(/<tfoot>([\s\S]*?)<\/tfoot>/i);
  if (!foot) return null;
  const amounts = [...foot[1].matchAll(/\$[\d,.]+/g)];
  return amounts.length ? amounts[amounts.length - 1][0] : null;
}

export function parseOrderDetail(html) {
  if (!html) return null;
  const orderNumber = (html.match(/id="stId">\s*([^<]+)/i) || [])[1];
  const delivery = (html.match(/id="stdate">\s*([^<]+)/i) || [])[1];
  const table = html.match(/Product Name - Code[\s\S]*?<\/table>/i);
  const rows = table ? [...table[0].matchAll(/<tr class="NormalGridView">([\s\S]*?)<\/tr>/gi)] : [];
  return {
    orderNumber: orderNumber ? textContent(orderNumber) : null,
    nickname: inputValue(html, 'OrderNickName'),
    status: inputValue(html, 'Status'),
    estimatedDelivery: delivery ? textContent(delivery) : null,
    storeCode: selectedOption(html, 'StoreCode') || inputValue(html, 'StoreCode'),
    storeCity: selectedOption(html, 'StoreCity'),
    customerId: inputValue(html, 'CustomerId'),
    items: rows.map((row) => parseLineRow(row[1])).filter((item) => item && item.name),
    total: table ? tableTotal(table[0]) : null,
  };
}

function labeledValue(html, label) {
  const match = html.match(new RegExp(`<th\\b[^>]*>\\s*${label}\\s*</th>\\s*<td>([\\s\\S]*?)</td>`, 'i'));
  if (!match) return null;
  const value = textContent(match[1]);
  return value || null;
}

function parseOrderCard(chunk) {
  const header = chunk.match(/<div class="card-header[^>]*>\s*<b>([\s\S]*?)<\/b>/i);
  if (!header) return null;
  const title = textContent(header[1]);
  const splitAt = title.lastIndexOf(' - ');
  const rows = [...chunk.matchAll(/<tr class="NormalGridView">([\s\S]*?)<\/tr>/gi)];
  const productTable = chunk.match(/Product Name \(Code\)[\s\S]*?<\/table>/i);
  return {
    orderNumber: splitAt >= 0 ? title.slice(splitAt + 3).trim() : null,
    nickname: splitAt >= 0 ? title.slice(0, splitAt).trim() : title,
    orderedDate: labeledValue(chunk, 'Ordered Date'),
    status: labeledValue(chunk, 'Status'),
    storeLocation: labeledValue(chunk, 'Store Location'),
    items: rows.map((row) => parseLineRow(row[1])).filter((item) => item && item.name),
    total: productTable ? tableTotal(productTable[0]) : null,
  };
}

export function parseOrdersList(html) {
  if (!html) return { customerName: null, customerId: null, orders: [] };
  const name = html.match(/<h3 class="h3 centered">([^<]*)<\/h3>/i);
  const chunks = html.split('<div class="card">').slice(1);
  return {
    customerName: name ? textContent(name[1]) : null,
    customerId: customerIdFrom(html, ''),
    orders: chunks.map((chunk) => parseOrderCard(chunk)).filter(Boolean),
  };
}

export function mergeOrder(detail, card) {
  const items = detail?.items?.length ? detail.items : (card?.items || []);
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
    total: detail?.total || card?.total || null,
  };
}

export function normalizeStores(data) {
  const list = Array.isArray(data) ? data : Object.values(data || {});
  return list.map((item) => {
    if (!item || typeof item !== 'object') return null;
    const code = item.value ?? item.Value ?? item.code ?? item.StoreCode;
    const name = item.text ?? item.Text ?? item.name ?? item.Name;
    if (code === undefined || code === null || code === '') return null;
    return { code: String(code), name: name ? String(name) : String(code) };
  }).filter(Boolean);
}

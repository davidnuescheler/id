import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mergeOrder,
  normalizeStores,
  parseOrderDetail,
  parseOrdersList,
  parsePageErrors,
  verificationToken,
} from '../src/parse.js';

const DETAIL = `
  <input name="OrderNickName" value="RUM" />
  <input name="Status" value="Pending" />
  <input name="CustomerId" value="42" />
  <select name="StoreCity"><option selected="selected" value="COTTONWOOD HEIGHTS">COTTONWOOD HEIGHTS</option></select>
  <select name="StoreCode"><option value="0015" selected="selected">STATE STORE #15</option></select>
  <span class="badge badge-blue" id="stId">555</span>
  <span class="badge badge-blue" id="stdate">12/11/2026</span>
  <table class="table">
    <thead><tr><th>Product Name - Code</th><th>Total Price</th><th>Qty (Cases)</th></tr></thead>
    <tbody>
      <tr class="NormalGridView">
        <td>WRAY &amp; NEPHEW WHITE OVERPROOF RUM  750ml - 042306 <span class="badge badge-green">Order sent to Vendor</span></td>
        <td>$311.88</td>
        <td>1 (12)</td>
        <td><a href="/Orders/DisplayOrderCatalog?Cid=389345&amp;headerId=555">view</a></td>
      </tr>
    </tbody>
    <tfoot><tr><td></td><td>$311.88</td><td></td><td></td></tr></tfoot>
  </table>
`;

const LIST = `
  <h3 class="h3 centered">Ada Lovelace</h3>
  <a href="/ProdApps/SpecialOrdersCore/Orders/CreateOrder?CustId=42">Create</a>
  <div class="card">
    <div class="card-header Normal12 text-uppercase"><b>RUM - 555</b></div>
    <table>
      <tr><th scope="row">Ordered Date</th><td>10/16/2026</td></tr>
      <tr><th scope="row">Status</th><td>Pending</td></tr>
      <tr><th scope="row">Store Location</th><td>COTTONWOOD HEIGHTS - 1863 E 7000 S </td></tr>
    </table>
    <table>
      <thead><tr><th>Product Name (Code)</th></tr></thead>
      <tbody>
        <tr class="NormalGridView">
          <td>WRAY &amp; NEPHEW WHITE OVERPROOF RUM 750ml (042306)</td>
          <td>1 (12)</td>
          <td>$311.88</td>
        </tr>
      </tbody>
      <tfoot><tr><td></td><td></td><td>$311.88</td></tr></tfoot>
    </table>
  </div>
  <div class="card">
    <div class="card-header Normal12 text-uppercase"><b>rum, tequila - 317460</b></div>
    <table>
      <tr><th scope="row">Ordered Date</th><td></td></tr>
      <tr><th scope="row">Status</th><td>Not Submitted</td></tr>
      <tr><th scope="row">Store Location</th><td>COTTONWOOD HEIGHTS - 1863 E 7000 S</td></tr>
    </table>
    <table>
      <thead><tr><th>Product Name (Code)</th></tr></thead>
      <tbody></tbody>
      <tfoot><tr><td></td><td></td><td>$0</td></tr></tfoot>
    </table>
  </div>
`;

test('parses the order detail page', () => {
  const order = parseOrderDetail(DETAIL);
  assert.equal(order.orderNumber, '555');
  assert.equal(order.nickname, 'RUM');
  assert.equal(order.status, 'Pending');
  assert.equal(order.estimatedDelivery, '12/11/2026');
  assert.equal(order.storeCity, 'COTTONWOOD HEIGHTS');
  assert.equal(order.storeCode, '0015');
  assert.equal(order.total, '$311.88');
  assert.deepEqual(order.items, [{
    lineId: '389345',
    name: 'WRAY & NEPHEW WHITE OVERPROOF RUM 750ml',
    code: '042306',
    quantity: 1,
    casePack: 12,
    totalPrice: '$311.88',
    status: 'Order sent to Vendor',
  }]);
});

test('parses the open-orders list', () => {
  const list = parseOrdersList(LIST);
  assert.equal(list.customerName, 'Ada Lovelace');
  assert.equal(list.customerId, '42');
  assert.equal(list.orders.length, 2);
  assert.equal(list.orders[0].orderNumber, '555');
  assert.equal(list.orders[0].orderedDate, '10/16/2026');
  assert.equal(list.orders[0].storeLocation, 'COTTONWOOD HEIGHTS - 1863 E 7000 S');
  assert.equal(list.orders[0].items[0].code, '042306');
  assert.equal(list.orders[1].nickname, 'rum, tequila');
  assert.equal(list.orders[1].orderNumber, '317460');
  assert.equal(list.orders[1].orderedDate, null);
  assert.equal(list.orders[1].total, '$0');
});

test('merges detail lines with the list card', () => {
  const detail = parseOrderDetail(DETAIL);
  const card = parseOrdersList(LIST).orders[0];
  const order = mergeOrder(detail, card);
  assert.equal(order.orderNumber, '555');
  assert.equal(order.orderedDate, '10/16/2026');
  assert.equal(order.estimatedDelivery, '12/11/2026');
  assert.equal(order.items[0].lineId, '389345');
  assert.equal(order.storeLocation, 'COTTONWOOD HEIGHTS - 1863 E 7000 S');
});

test('reads the verification token from the matching form', () => {
  const html = `
    <form action="/ProdApps/SpecialOrdersCore/createnewheader">
      <input type="hidden" name="__RequestVerificationToken" value="token-create" />
    </form>
    <form action="/ProdApps/SpecialOrdersCore/specialordercatalog">
      <select name="ItemDescriptionForCatalog"><option value="1">x</option></select>
      <input name="__RequestVerificationToken" value="token-add" />
    </form>
  `;
  assert.equal(verificationToken(html, '/ProdApps/SpecialOrdersCore/createnewheader'), 'token-create');
  assert.equal(verificationToken(html, '/ProdApps/SpecialOrdersCore/specialordercatalog'), 'token-add');
});

test('ignores valid field markers and keeps login errors', () => {
  const html = `
    <span class="field-validation-valid" data-valmsg-for="EmailAddress"></span>
    <span class="text-danger field-validation-error" data-valmsg-for="Password">Invalid login</span>
    <div class="validation-summary-errors"><ul><li>The captcha was rejected.</li></ul></div>
  `;
  assert.deepEqual(parsePageErrors(html), ['The captcha was rejected.', 'Invalid login']);
});

test('normalizes store list payloads', () => {
  assert.deepEqual(normalizeStores([{ value: '0015', text: 'STATE STORE #15' }]), [
    { code: '0015', name: 'STATE STORE #15' },
  ]);
});

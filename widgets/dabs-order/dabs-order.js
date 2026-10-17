const ENDPOINT = 'https://dabs-order-worker.david8603.workers.dev';
const STORAGE_KEY = 'dabs-order-draft';
const MAX_CASES = 999;
const MAX_MATCHES = 8;

const CASE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5"/><path d="M12 12v9"/></svg>';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function money(value) {
  return typeof value === 'number' && Number.isFinite(value) ? currency.format(value) : '';
}

function casesLabel(count) {
  return `${count} ${count === 1 ? 'case' : 'cases'}`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function clampCases(value) {
  const count = Math.round(Number(value));
  if (!Number.isFinite(count) || count < 1) return 1;
  return Math.min(MAX_CASES, count);
}

async function loadCatalog() {
  const base = (window.hlx && window.hlx.codeBasePath) || '';
  const resp = await fetch(`${base}/widgets/dabs-order/catalog.json`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  return data.items.map(([code, name, price]) => ({
    code,
    name,
    price,
    haystack: `${name} ${code}`.toLowerCase(),
  }));
}

function searchCatalog(catalog, query) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const found = [];
  catalog.some((entry) => {
    if (terms.every((term) => entry.haystack.includes(term))) found.push(entry);
    return found.length >= MAX_MATCHES;
  });
  return found;
}

function readDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return draft && typeof draft === 'object' ? draft : {};
  } catch (error) {
    return {};
  }
}

function renderResult(container, data, ok) {
  container.hidden = false;
  container.className = `dabs-order-result ${ok ? 'dabs-order-result-ok' : 'dabs-order-result-bad'}`;
  container.replaceChildren();

  container.append(el('h3', '', ok ? 'Order created' : 'Order was not created'));

  const order = data && data.order;
  if (order && order.orderNumber) {
    const head = el('div', 'dabs-order-result-head');
    head.append(
      el('p', 'dabs-order-number', order.orderNumber),
      el('span', 'dabs-order-status', order.status || 'Unknown status'),
    );
    container.append(head);

    const meta = [
      data.customer && data.customer.name,
      order.nickname,
      order.storeLocation || [order.storeCity, order.storeCode].filter(Boolean).join(' · '),
    ].filter(Boolean).join(' · ');
    if (meta) container.append(el('p', 'dabs-order-result-meta', meta));

    if (Array.isArray(order.items) && order.items.length) {
      const lines = el('ul', 'dabs-order-result-items');
      order.items.forEach((item) => {
        const line = el('li');
        const name = el('span', 'dabs-order-result-name', item.name || item.code);
        const cases = el('span', 'dabs-order-result-cases');
        cases.innerHTML = CASE_ICON;
        cases.append(casesLabel(item.quantity || 0));
        line.append(name, cases, el('span', 'dabs-order-result-price', item.totalPrice || ''));
        lines.append(line);
      });
      container.append(lines);
    }

    if (order.total) {
      const total = el('p', 'dabs-order-result-total', 'Total ');
      total.append(el('strong', '', order.total));
      container.append(total);
    }
  }

  const messages = ((data && data.errors) || [])
    .map((error) => (error && error.message) || String(error))
    .filter(Boolean);
  if (messages.length) {
    const list = el('ul', 'dabs-order-errors');
    messages.forEach((message) => list.append(el('li', '', message)));
    container.append(list);
  }

  if (data && (data.order || data.steps)) {
    const details = el('details', 'dabs-order-raw');
    details.append(el('summary', '', 'Response details'), el('pre', '', JSON.stringify(data, null, 2)));
    container.append(details);
  }

  container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export default async function decorate(widget) {
  const form = widget.querySelector('.dabs-order-form');
  const list = widget.querySelector('.dabs-order-items');
  const search = widget.querySelector('.dabs-order-search');
  const matchesEl = widget.querySelector('.dabs-order-matches');
  const addStatus = widget.querySelector('.dabs-order-add-status');
  const totalCases = widget.querySelector('.dabs-order-total-cases');
  const totalPrice = widget.querySelector('.dabs-order-total-price');
  const resultEl = widget.querySelector('.dabs-order-result');
  const dialog = widget.querySelector('.dabs-order-dialog');
  const signin = widget.querySelector('.dabs-order-signin');
  const signinSummary = widget.querySelector('.dabs-order-dialog-summary');
  const signinErrors = widget.querySelector('.dabs-order-dialog-errors');
  const signinProgress = widget.querySelector('.dabs-order-dialog-progress');
  const signinButton = widget.querySelector('.dabs-order-signin-submit');
  let busy = false;

  const state = {
    items: [],
    catalog: [],
    byCode: new Map(),
    matches: [],
    active: -1,
  };

  const saveDraft = () => {
    const draft = {
      username: signin.elements.username.value.trim(),
      nickname: form.elements.nickname.value.trim(),
      items: state.items,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  };

  const renderTotals = () => {
    const cases = state.items.reduce((sum, item) => sum + item.quantity, 0);
    const price = state.items.reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0);
    const unpriced = state.items.some((item) => typeof item.price !== 'number');
    totalCases.innerHTML = CASE_ICON;
    totalCases.append(casesLabel(cases));
    totalPrice.textContent = `${money(price)}${unpriced ? '+' : ''}`;
  };

  const renderItems = () => {
    if (!state.items.length) {
      list.replaceChildren(el('li', 'dabs-order-empty', 'No products yet. Search below to add one.'));
      renderTotals();
      return;
    }

    list.replaceChildren(...state.items.map((item, index) => {
      const row = el('li', 'dabs-order-item');
      row.dataset.index = String(index);
      const label = item.name || `Item ${item.code}`;

      const info = el('div', 'dabs-order-item-info');
      const metaBits = [item.code, item.price !== null && item.price !== undefined ? `${money(item.price)} / case` : 'Price unknown'];
      info.append(
        el('span', 'dabs-order-item-name', label),
        el('span', 'dabs-order-item-meta', metaBits.join(' · ')),
      );

      const qty = el('div', 'dabs-order-qty');
      const icon = el('span', 'dabs-order-qty-icon');
      icon.innerHTML = CASE_ICON;
      const minus = el('button', 'dabs-order-step', '−');
      minus.type = 'button';
      minus.dataset.action = 'decrease';
      minus.disabled = item.quantity <= 1;
      minus.setAttribute('aria-label', `One fewer case of ${label}`);
      const input = el('input', 'dabs-order-qty-input');
      input.type = 'number';
      input.min = '1';
      input.max = String(MAX_CASES);
      input.step = '1';
      input.inputMode = 'numeric';
      input.value = String(item.quantity);
      input.setAttribute('aria-label', `Cases of ${label}`);
      const plus = el('button', 'dabs-order-step', '+');
      plus.type = 'button';
      plus.dataset.action = 'increase';
      plus.disabled = item.quantity >= MAX_CASES;
      plus.setAttribute('aria-label', `One more case of ${label}`);
      qty.append(icon, minus, input, plus);

      const lineTotal = el('span', 'dabs-order-line-total', typeof item.price === 'number' ? money(item.price * item.quantity) : '—');

      const remove = el('button', 'dabs-order-remove', '×');
      remove.type = 'button';
      remove.dataset.action = 'remove';
      remove.setAttribute('aria-label', `Remove ${label}`);

      row.append(info, qty, lineTotal, remove);
      return row;
    }));
    renderTotals();
  };

  const update = () => {
    renderItems();
    saveDraft();
  };

  const setActive = (index) => {
    state.active = index;
    [...matchesEl.children].forEach((option, i) => {
      option.setAttribute('aria-selected', String(i === index));
      if (i === index) {
        option.scrollIntoView({ block: 'nearest' });
        search.setAttribute('aria-activedescendant', option.id);
      }
    });
    if (index < 0) search.removeAttribute('aria-activedescendant');
  };

  const renderMatches = (matches) => {
    state.matches = matches;
    matchesEl.replaceChildren(...matches.map((entry, index) => {
      const option = el('li', 'dabs-order-match');
      option.id = `dabs-order-match-${index}`;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      option.dataset.index = String(index);
      option.append(
        el('span', 'dabs-order-match-name', entry.name),
        el('span', 'dabs-order-match-meta', [entry.code, money(entry.price)].filter(Boolean).join(' · ')),
      );
      return option;
    }));
    search.setAttribute('aria-expanded', String(matches.length > 0));
    setActive(matches.length ? 0 : -1);
  };

  const addItem = (entry) => {
    const existing = state.items.find((item) => item.code === entry.code);
    if (existing) {
      existing.quantity = clampCases(existing.quantity + 1);
    } else {
      state.items.push({
        code: entry.code,
        name: entry.name || null,
        price: typeof entry.price === 'number' ? entry.price : null,
        quantity: 1,
      });
    }
    search.value = '';
    addStatus.textContent = '';
    renderMatches([]);
    update();
    search.focus();
  };

  list.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const row = button.closest('.dabs-order-item');
    const index = Number(row.dataset.index);
    const item = state.items[index];
    if (!item) return;
    const { action } = button.dataset;
    if (action === 'remove') state.items.splice(index, 1);
    if (action === 'increase') item.quantity = clampCases(item.quantity + 1);
    if (action === 'decrease') item.quantity = clampCases(item.quantity - 1);
    update();
    if (action !== 'remove') {
      const again = list.querySelector(`.dabs-order-item[data-index="${index}"] button[data-action="${action}"]`);
      if (again && !again.disabled) again.focus();
    } else {
      search.focus();
    }
  });

  list.addEventListener('change', (event) => {
    if (!event.target.matches('.dabs-order-qty-input')) return;
    const row = event.target.closest('.dabs-order-item');
    const item = state.items[Number(row.dataset.index)];
    if (!item) return;
    item.quantity = clampCases(event.target.value);
    update();
  });

  search.addEventListener('input', () => {
    const query = search.value.trim();
    const matches = query.length >= 2 ? searchCatalog(state.catalog, query) : [];
    renderMatches(matches);
    if (query.length >= 2 && !matches.length) {
      addStatus.textContent = /^\d{4,6}$/.test(query)
        ? `Not in the catalog. Press Enter to add code ${query.padStart(6, '0')} anyway.`
        : 'No products match.';
    } else {
      addStatus.textContent = '';
    }
  });

  search.addEventListener('keydown', (event) => {
    const count = state.matches.length;
    if (event.key === 'ArrowDown' && count) {
      event.preventDefault();
      setActive((state.active + 1) % count);
    } else if (event.key === 'ArrowUp' && count) {
      event.preventDefault();
      setActive((state.active - 1 + count) % count);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const query = search.value.trim();
      if (state.matches[state.active]) {
        addItem(state.matches[state.active]);
      } else if (/^\d{4,6}$/.test(query)) {
        const code = query.padStart(6, '0');
        addItem(state.byCode.get(code) || { code });
      }
    } else if (event.key === 'Escape') {
      renderMatches([]);
    }
  });

  search.addEventListener('blur', () => renderMatches([]));

  matchesEl.addEventListener('mousedown', (event) => {
    const option = event.target.closest('.dabs-order-match');
    if (!option) return;
    event.preventDefault();
    addItem(state.matches[Number(option.dataset.index)]);
  });

  signin.elements.username.addEventListener('change', saveDraft);
  form.elements.nickname.addEventListener('change', saveDraft);

  const setBusy = (value) => {
    busy = value;
    signinButton.disabled = value;
    signinButton.textContent = value ? 'Creating order…' : 'Sign in and create order';
    signinProgress.hidden = !value;
    [...signin.querySelectorAll('input, .dabs-order-cancel, .dabs-order-dialog-close')].forEach((control) => {
      control.disabled = value;
    });
  };

  const showSigninErrors = (messages) => {
    signinErrors.replaceChildren(...messages.map((message) => el('li', '', message)));
  };

  const closeSignin = () => {
    if (busy) return;
    dialog.close();
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    saveDraft();
    if (!state.items.length) {
      addStatus.textContent = 'Add at least one product to the order.';
      search.focus();
      return;
    }
    const cases = state.items.reduce((sum, item) => sum + item.quantity, 0);
    signinSummary.textContent = `${form.elements.nickname.value.trim()} · ${casesLabel(cases)} · ${totalPrice.textContent}`;
    showSigninErrors([]);
    signin.elements.password.value = '';
    dialog.showModal();
    (signin.elements.username.value ? signin.elements.password : signin.elements.username).focus();
  });

  widget.querySelector('.dabs-order-cancel').addEventListener('click', closeSignin);
  widget.querySelector('.dabs-order-dialog-close').addEventListener('click', closeSignin);
  dialog.addEventListener('cancel', (event) => {
    if (busy) event.preventDefault();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeSignin();
  });

  signin.addEventListener('submit', async (event) => {
    event.preventDefault();
    saveDraft();
    const payload = {
      username: signin.elements.username.value.trim(),
      password: signin.elements.password.value,
      nickname: form.elements.nickname.value.trim(),
      items: state.items.map(({ code, quantity }) => ({ code, quantity })),
      login: 'browser',
      submit: false,
      mode: 'create',
    };

    showSigninErrors([]);
    resultEl.hidden = true;
    setBusy(true);
    let data;
    try {
      const resp = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const text = await resp.text();
      try {
        data = JSON.parse(text);
      } catch (error) {
        data = { errors: [{ message: text || `The order service returned HTTP ${resp.status}.` }] };
      }
    } catch (error) {
      data = { errors: [{ message: `Could not reach the order service. ${error.message}` }] };
    }
    setBusy(false);

    const errors = Array.isArray(data.errors) ? data.errors : [];
    const loginFailed = !data.ok && errors.some((error) => error && (error.step === 'login' || error.step === 'request'));
    if (loginFailed) {
      showSigninErrors(errors.map((error) => error.message).filter(Boolean));
      signin.elements.password.value = '';
      signin.elements.password.focus();
      return;
    }

    signin.elements.password.value = '';
    dialog.close();
    const orderNumber = data.order && data.order.orderNumber;
    renderResult(resultEl, data, Boolean(data.ok && orderNumber && data.submitted === false));
  });

  const draft = readDraft();
  if (draft.username) signin.elements.username.value = draft.username;
  if (draft.nickname) form.elements.nickname.value = draft.nickname;
  if (Array.isArray(draft.items)) {
    state.items = draft.items
      .filter((item) => item && item.code)
      .map((item) => ({
        code: String(item.code),
        name: item.name || null,
        price: typeof item.price === 'number' ? item.price : null,
        quantity: clampCases(item.quantity),
      }));
  }
  renderItems();

  try {
    state.catalog = await loadCatalog();
    state.catalog.forEach((entry) => state.byCode.set(entry.code, entry));
    state.items.forEach((item) => {
      const entry = state.byCode.get(item.code);
      if (!entry) return;
      item.name = entry.name;
      item.price = entry.price;
    });
    renderItems();
    search.disabled = false;
    search.placeholder = 'Add a product by name or code';
  } catch (error) {
    search.disabled = false;
    search.placeholder = 'Add a product by its 6-digit code';
    addStatus.textContent = 'The product catalog could not be loaded. You can still add items by code.';
  }
}

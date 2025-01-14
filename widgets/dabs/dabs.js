async function loadData() {
  const resp = await fetch('https://dabs.david8603.workers.dev/?limit=30000');
  const json = await resp.json();
  const { data } = json;
  const sorted = data.sort((a, b) => b.storeQty - a.storeQty);
  return sorted;
}

function displayResults(search, filterStatus) {
  const result = document.querySelector('.dabs-results');
  const filtered = search || filterStatus ? window.dabs.filter(
    (item) => {
      if (!filterStatus || filterStatus === item.status.split(' ')[0]) return item.name.toLowerCase().includes(search.toLowerCase());
      return false;
    },
  ) : window.dabs;
  result.textContent = '';
  filtered.forEach((item, i) => {
    if (i > 100) return;
    const div = document.createElement('div');
    const highlighted = search ? item.name.replace(
      new RegExp(`(${search})`, 'gi'),
      '<mark>$1</mark>',
    ) : item.name;

    const status = item.status.split(' ')[0];

    div.innerHTML = `<span class="dabs-name"><span class="dabs-badge dabs-badge-${status.toLowerCase()}">${status}</span>${highlighted} <strong>$${item.currentPrice}</strong></span>`;
    const badge = div.querySelector('.dabs-badge');
    badge.addEventListener('click', (event) => {
      event.stopPropagation();
      badge.textContent = item.status;
      badge.role = 'button';
    }, { once: true });
    const quantity = document.createElement('span');
    quantity.className = 'dabs-quantity';
    const hasMore = (item.warehouseQty || item.onOrderQty) ? ' \u25BE' : '';
    quantity.textContent = `${item.storeQty}${hasMore}`;
    if (item.storeQty < 50 && item.storeQty > 0) {
      div.classList.add('dabs-low');
    }
    if (item.storeQty === 0) {
      div.classList.add('dabs-out');
    }
    div.append(quantity);
    if (hasMore) {
      quantity.role = 'button';
      quantity.addEventListener('click', (event) => {
        event.stopPropagation();
        if (item.warehouseQty) quantity.innerHTML += `<br><img src="/widgets/dabs/warehouse.svg">${item.warehouseQty}`;
        if (item.onOrderQty) quantity.innerHTML += `<br><img src="/widgets/dabs/onorder.svg">${item.onOrderQty}`;
      }, { once: true });
    }

    result.append(div);

    if (item.storeQty && item.storeQty < 1000) {
      div.role = 'button';
      div.addEventListener('click', () => {
        window.location.href = `https://independentdrinker.com/utah-dabs/products/${item.sku}`;
      });
    }
  });
}

function updateSearchResults(widget) {
  const { value } = widget.querySelector('input[name="search"]');
  const status = widget.querySelector('input[name="status"]').value;
  document.querySelector('.dabs-results').textContent = '';
  displayResults(value, status);
  const params = new URLSearchParams();
  if (value) params.set('search', value);
  if (status) params.set('status', status);
  if (status || value) {
    window.history.replaceState(null, '', `?${params.toString()}`);
  } else {
    window.history.replaceState(null, '', window.location.pathname);
  }
}

async function initialLoad(widget) {
  const data = await loadData();
  window.dabs = data;
  updateSearchResults(widget);
}

export default async function decorate(widget) {
  widget.querySelector('input[name="search"]').addEventListener('input', () => {
    updateSearchResults(widget);
  });
  widget.querySelector('input[name="status"]').addEventListener('input', () => {
    updateSearchResults(widget);
  });
  widget.querySelector('input[name="allocated"]').addEventListener('change', (event) => {
    if (event.target.checked) widget.querySelector('input[name="status"]').value = 'A';
    else widget.querySelector('input[name="status"]').value = '';
    updateSearchResults(widget);
  });

  const params = new URLSearchParams(window.location.search);
  const search = params.get('search');
  if (search) {
    widget.querySelector('input[name="search"]').value = search;
  }
  const status = params.get('status');
  if (status) {
    widget.querySelector('input[name="status"]').value = status;
    if (status === 'A') {
      widget.querySelector('input[name="allocated"]').checked = true;
    }
  }
  initialLoad(widget);
}

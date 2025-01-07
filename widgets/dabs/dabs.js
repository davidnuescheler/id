async function loadData() {
  const resp = await fetch('https://dabs.david8603.workers.dev/?limit=30000');
  const json = await resp.json();
  const { data } = json;
  const sorted = data.sort((a, b) => b.storeQty - a.storeQty);
  return sorted;
}

function displayResults(search) {
  const result = document.querySelector('.dabs-results');
  const filtered = search ? window.dabs.filter(
    (item) => item.name.toLowerCase().includes(search.toLowerCase()),
  ) : window.dabs;
  result.textContent = '';
  filtered.forEach((item, i) => {
    if (i > 100) return;
    const div = document.createElement('div');
    const highlighted = search ? item.name.replace(
      new RegExp(`(${search})`, 'gi'),
      '<mark>$1</mark>',
    ) : item.name;

    div.innerHTML = `<span class="dabs-name">${highlighted}</span>`;
    const quantity = document.createElement('span');
    quantity.className = 'dabs-quantity';
    const hasMore = (item.warehouseQty || item.onOrderQty) ? ' >' : '';
    quantity.textContent = `${item.storeQty}${hasMore}`;
    if (item.storeQty < 50 && item.storeQty > 0) {
      div.classList.add('dabs-low');
    }
    if (item.storeQty === 0) {
      div.classList.add('dabs-out');
    }
    div.append(quantity);
    quantity.addEventListener('click', () => {
      if (item.warehouseQty) quantity.innerHTML += `<img src="/widgets/dabs/warehouse.svg"> ${item.warehouseQty}`;
      if (item.onOrderQty) quantity.innerHTML += `<img src="/widgets/dabs/onorder.svg"> ${item.onOrderQty}`;
    });
    result.append(div);
  });
}

async function initialLoad(search) {
  const data = await loadData();
  window.dabs = data;
  displayResults(search);
}

export default async function decorate(widget) {
  widget.querySelector('input[name="search"]').addEventListener('input', (event) => {
    const { value } = event.target;
    document.querySelector('.dabs-results').textContent = '';
    displayResults(value);
    if (value) {
      window.history.replaceState(null, '', `?search=${value}`);
    } else {
      window.history.replaceState(null, '', window.location.pathname);
    }
  });
  const params = new URLSearchParams(window.location.search);
  const search = params.get('search');
  if (search) {
    widget.querySelector('input[name="search"]').value = search;
  }
  initialLoad(search);
}

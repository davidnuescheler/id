import { fetchPlaceholders, loadCSS, loadScript } from '../../scripts/aem.js';

const MAPBOX_JS = 'https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.js';
const MAPBOX_CSS = 'https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.css';
const LONG_PRESS_MS = 600;

/* ---------- helpers ---------- */

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** only allow http(s) urls in links and images */
function safeUrl(value, base = window.location.href) {
  if (!value) return '';
  try {
    const url = new URL(String(value).trim(), base);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch (e) {
    return '';
  }
}

/** case-insensitive lookup of the first matching field */
function pick(row, ...names) {
  const keys = Object.keys(row);
  const found = names
    .map((name) => keys.find((key) => key.toLowerCase() === name.toLowerCase()))
    .find((key) => key && row[key] !== '' && row[key] != null);
  return found ? row[found] : '';
}

function isTruthy(value) {
  return ['true', 'yes', 'y', '1', 'x'].includes(String(value).trim().toLowerCase());
}

function haversineMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function formatMiles(d) {
  if (d < 0.1) return `${Math.round(d * 5280)} ft`;
  if (d < 1) return `${d.toFixed(2)} mi`;
  return `${d.toFixed(1)} mi`;
}

function gmapsUrl(venue) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${venue.name}, ${venue.address}`)}`;
}

const isMobile = () => window.matchMedia('(max-width: 899px)').matches;

/* ---------- configuration ---------- */

/**
 * Reads a setting from the widget url (widget.dataset) first,
 * then from the page url, so both `/widgets/venues/?src=…` and `page?src=…` work.
 */
function getSetting(widget, name) {
  if (widget.dataset[name]) return widget.dataset[name];
  return new URLSearchParams(window.location.search).get(name) || '';
}

/* ---------- data ---------- */

function normalize(rows) {
  return rows
    .map((row, index) => {
      const lat = parseFloat(pick(row, 'Latitude', 'Lat'));
      const lng = parseFloat(pick(row, 'Longitude', 'Lng', 'Lon', 'Long'));
      const rank = pick(row, 'Rank', '#');
      return {
        id: String(index),
        rank: rank === '' ? String(index + 1) : String(rank),
        name: String(pick(row, 'Bar', 'Name', 'Venue', 'Title')),
        address: String(pick(row, 'Address')),
        note: String(pick(row, 'Description', 'Note', 'Notes')),
        website: safeUrl(pick(row, 'Website', 'Url', 'Link')),
        instagram: safeUrl(pick(row, 'Instagram')),
        img: safeUrl(pick(row, 'Image', 'Img', 'Photo')),
        top: isTruthy(pick(row, 'Top', 'Featured')),
        lat,
        lng,
      };
    })
    .filter((v) => v.name && Number.isFinite(v.lat) && Number.isFinite(v.lng));
}

async function loadVenues(src) {
  const url = new URL(src, window.location.href);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  let json = await resp.json();
  // sheet json is paginated: fetch everything when the first page is short
  if (json && Array.isArray(json.data) && json.total > json.data.length) {
    url.searchParams.set('limit', json.total);
    url.searchParams.set('offset', 0);
    const all = await fetch(url);
    if (all.ok) json = await all.json();
  }
  const rows = Array.isArray(json) ? json : json.data;
  if (!Array.isArray(rows)) throw new Error('no data array in json');
  return normalize(rows);
}

/* ---------- rendering ---------- */

function linksHtml(venue) {
  const links = [];
  if (venue.website) links.push(`<a class="venues-link" href="${escapeHTML(venue.website)}" target="_blank" rel="noopener">Website</a>`);
  if (venue.instagram) links.push(`<a class="venues-link" href="${escapeHTML(venue.instagram)}" target="_blank" rel="noopener">Instagram</a>`);
  return links.length ? `<div class="venues-links">${links.join('')}</div>` : '';
}

function popupContent(venue) {
  const title = `#${escapeHTML(venue.rank)} ${escapeHTML(venue.name)}`;
  if (isMobile()) return `<div class="venues-popup-mini">${title}</div>`;
  const img = venue.img ? `<img class="venues-popup-img" src="${escapeHTML(venue.img)}" alt="${escapeHTML(venue.name)}" loading="lazy">` : '';
  const note = venue.note ? `<br><br>${escapeHTML(venue.note)}` : '';
  return `${img}<div class="venues-popup-body"><strong>${title}</strong>${escapeHTML(venue.address)}${note}${linksHtml(venue)}</div>`;
}

function cardHtml(venue) {
  const address = venue.address
    ? `<p class="venues-address"><a class="venues-address-link" href="${gmapsUrl(venue)}" target="_blank" rel="noopener">${escapeHTML(venue.address)}</a></p>`
    : '';
  const note = venue.note ? `<p class="venues-note">${escapeHTML(venue.note)}</p>` : '';
  const thumb = venue.img
    ? `<img class="venues-thumb" src="${escapeHTML(venue.img)}" alt="${escapeHTML(venue.name)}" loading="lazy">`
    : '';
  return `
    <div class="venues-item-text">
      <div class="venues-item-head">
        <span class="venues-rank${venue.top ? ' top' : ''}">#${escapeHTML(venue.rank)}</span>
        <span class="venues-name">${escapeHTML(venue.name)}</span>
        <span class="venues-distance" hidden></span>
      </div>
      ${address}
      ${note}
      ${linksHtml(venue)}
    </div>
    ${thumb}`;
}

/* ---------- pin in url ---------- */

function readPinFromUrl() {
  const v = new URLSearchParams(window.location.search).get('pin');
  if (!v) return null;
  const [lat, lng] = v.split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function writePinUrl(lat, lng, push) {
  const sp = new URLSearchParams(window.location.search);
  if (lat == null) sp.delete('pin');
  else sp.set('pin', `${lat.toFixed(5)},${lng.toFixed(5)}`);
  const qs = sp.toString();
  const url = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
  if (push) window.history.pushState({}, '', url);
  else window.history.replaceState({}, '', url);
}

/* ---------- long press (touch + mouse) ---------- */

function onLongPress(target, handler) {
  let timer = null;
  let start = null;
  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    start = null;
  };
  const begin = (x, y) => {
    start = { x, y };
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (start) handler(start);
      timer = null;
    }, LONG_PRESS_MS);
  };
  const move = (x, y) => {
    if (start && timer && Math.hypot(x - start.x, y - start.y) > 8) cancel();
  };

  target.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { cancel(); return; }
    begin(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  target.addEventListener('touchmove', (e) => move(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
  target.addEventListener('touchend', cancel, { passive: true });
  target.addEventListener('touchcancel', cancel, { passive: true });

  target.addEventListener('mousedown', (e) => {
    if (e.button === 0) begin(e.clientX, e.clientY);
  });
  target.addEventListener('mousemove', (e) => move(e.clientX, e.clientY));
  target.addEventListener('mouseup', cancel);
  target.addEventListener('mouseleave', cancel);
}

/* ---------- explorer ---------- */

function initExplorer(widget, venues, token) {
  const { mapboxgl } = window;
  mapboxgl.accessToken = token;

  const mapEl = widget.querySelector('.venues-map');
  const list = widget.querySelector('.venues-items');
  const statusEl = widget.querySelector('.venues-pin-status');
  const header = widget.querySelector('.venues-list-header');

  const bounds = new mapboxgl.LngLatBounds();
  venues.forEach((v) => bounds.extend([v.lng, v.lat]));

  const map = new mapboxgl.Map({
    container: mapEl,
    style: 'mapbox://styles/mapbox/light-v11',
    bounds,
    fitBoundsOptions: { padding: 60, maxZoom: 15 },
  });
  map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

  const markers = {};
  const popups = {};
  const cards = {};
  let activePopup = null;

  function selectVenue(id) {
    Object.values(cards).forEach((c) => c.classList.remove('active'));
    const card = cards[id];
    if (card) {
      card.classList.add('active');
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  venues.forEach((venue) => {
    const el = document.createElement('div');
    el.className = `venues-pin${venue.top ? ' top' : ''}`;
    el.innerHTML = `<span>${escapeHTML(venue.rank)}</span>`;

    const popup = new mapboxgl.Popup({ offset: venue.top ? 24 : 20, closeButton: false })
      .setHTML(popupContent(venue));
    const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([venue.lng, venue.lat])
      .setPopup(popup)
      .addTo(map);

    popup.on('open', () => {
      popup.setHTML(popupContent(venue));
      el.classList.add('active');
      activePopup = popup;
    });
    popup.on('close', () => el.classList.remove('active'));
    el.addEventListener('click', () => selectVenue(venue.id));

    markers[venue.id] = marker;
    popups[venue.id] = popup;

    const card = document.createElement('div');
    card.className = `venues-item${venue.img ? ' has-thumb' : ''}`;
    card.dataset.id = venue.id;
    card.innerHTML = cardHtml(venue);
    card.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      selectVenue(venue.id);
      if (activePopup && activePopup !== popup) activePopup.remove();
      map.flyTo({ center: [venue.lng, venue.lat], zoom: 16, speed: 1.4 });
      if (!popup.isOpen()) marker.togglePopup();
      if (isMobile()) mapEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    list.appendChild(card);
    cards[venue.id] = card;
  });

  /* distance sorting from a dropped pin */
  let userPin = null;
  let userMarker = null;

  function sortAndRender() {
    const dist = (v) => haversineMiles(userPin.lat, userPin.lng, v.lat, v.lng);
    const order = userPin ? [...venues].sort((a, b) => dist(a) - dist(b)) : venues;
    venues.forEach((venue) => {
      const distEl = cards[venue.id].querySelector('.venues-distance');
      distEl.hidden = !userPin;
      if (userPin) distEl.textContent = formatMiles(dist(venue));
    });
    order.forEach((venue) => list.appendChild(cards[venue.id]));
    statusEl.hidden = !userPin;
  }

  function setUserPin(lat, lng, { push = true } = {}) {
    userPin = { lat, lng };
    if (!userMarker) {
      const el = document.createElement('div');
      el.className = 'venues-user-pin';
      userMarker = new mapboxgl.Marker({ element: el, draggable: true })
        .setLngLat([lng, lat])
        .addTo(map);
      userMarker.on('dragend', () => {
        const ll = userMarker.getLngLat();
        userPin = { lat: ll.lat, lng: ll.lng };
        writePinUrl(ll.lat, ll.lng, false);
        sortAndRender();
      });
    } else {
      userMarker.setLngLat([lng, lat]);
    }
    writePinUrl(lat, lng, push);
    sortAndRender();
  }

  function clearUserPin({ push = true } = {}) {
    userPin = null;
    if (userMarker) {
      userMarker.remove();
      userMarker = null;
    }
    writePinUrl(null, null, push);
    sortAndRender();
  }

  widget.querySelector('.venues-pin-clear').addEventListener('click', () => clearUserPin());
  map.on('contextmenu', (e) => setUserPin(e.lngLat.lat, e.lngLat.lng));

  const canvas = map.getCanvasContainer();
  onLongPress(canvas, ({ x, y }) => {
    const rect = canvas.getBoundingClientRect();
    const ll = map.unproject([x - rect.left, y - rect.top]);
    setUserPin(ll.lat, ll.lng);
  });

  window.addEventListener('popstate', () => {
    const p = readPinFromUrl();
    if (p) setUserPin(p.lat, p.lng, { push: false });
    else if (userPin) clearUserPin({ push: false });
  });

  const initialPin = readPinFromUrl();
  if (initialPin) setUserPin(initialPin.lat, initialPin.lng, { push: false });

  /* keep the sticky pin bar below the sticky list header */
  const syncHeaderHeight = () => {
    widget.style.setProperty('--venues-header-height', `${header.offsetHeight}px`);
  };
  syncHeaderHeight();

  window.addEventListener('resize', () => {
    syncHeaderHeight();
    Object.entries(popups).forEach(([id, p]) => {
      if (p.isOpen()) p.setHTML(popupContent(venues[Number(id)]));
    });
  });
  new ResizeObserver(() => map.resize()).observe(mapEl);
  map.once('load', () => map.resize());
}

function showError(widget, message) {
  widget.querySelector('.venues-subtitle').textContent = '';
  const err = document.createElement('p');
  err.className = 'venues-error';
  err.textContent = message;
  widget.querySelector('.venues-items').replaceChildren(err);
}

/**
 * Venue explorer: map + list of venues loaded from a json url.
 * Configure with query params on the widget url (or the page url):
 *   src      – url of the json (required), e.g. /bars/slc.json
 *   title    – heading above the list (optional)
 *   subtitle – line under the heading (optional, defaults to the venue count)
 * @param {Element} widget
 */
export default async function decorate(widget) {
  const src = getSetting(widget, 'src') || getSetting(widget, 'data') || getSetting(widget, 'json');
  const title = getSetting(widget, 'title');
  const subtitle = getSetting(widget, 'subtitle');

  if (title) widget.querySelector('.venues-title').textContent = title;
  else widget.querySelector('.venues-title').hidden = true;

  if (!src) {
    showError(widget, 'No venue data: add ?src=<url of a .json file> to the widget link.');
    return;
  }

  loadCSS(MAPBOX_CSS);
  const [venuesResult, placeholders] = await Promise.all([
    loadVenues(src).catch((e) => e),
    fetchPlaceholders(),
    loadScript(MAPBOX_JS),
  ]);

  if (venuesResult instanceof Error) {
    showError(widget, `Could not load venues from ${src} (${venuesResult.message}).`);
    return;
  }
  if (!venuesResult.length) {
    showError(widget, 'No venues with a name, latitude and longitude were found in the data.');
    return;
  }

  const count = venuesResult.length;
  widget.querySelector('.venues-subtitle').textContent = subtitle || `${count} ${count === 1 ? 'venue' : 'venues'}`;

  // let the widget lay out before mapbox measures its container
  requestAnimationFrame(() => requestAnimationFrame(() => {
    initExplorer(widget, venuesResult, placeholders.mapboxToken);
  }));
}

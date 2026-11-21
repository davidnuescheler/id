async function getData(path) {
  const resp = await fetch(path);
  const json = await resp.json();
  return json.data;
}

/** Apple Activity-style palettes: bright tip, body, dark track */
const RING_PALETTES = [
  { tip: '#ff6b8a', body: '#ff2d55', track: '#3a0a16' },
  { tip: '#c8ff4a', body: '#92fc00', track: '#1e3308' },
  { tip: '#7dfff8', body: '#00f5ea', track: '#0a2a33' },
  { tip: '#ffe66d', body: '#ffd60a', track: '#33280a' },
  { tip: '#a8e4ff', body: '#64d2ff', track: '#0a2433' },
];

const CATEGORY_RING_ORDER = [
  'unforgettables',
  'contemporary classics',
  'new era drinks',
  'pre dinner',
  'after dinner',
  'long drinks',
  'the most popular',
  'special cocktails',
];

function createCollectionId(collection) {
  const slug = `${collection.Year}-${collection.Category}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `iba-${slug}`;
}

function parseCocktails(collection) {
  return collection.Cocktails.split(',').map((cocktail) => cocktail.trim()).filter(Boolean);
}

function collectionCoverage(collection, drinks) {
  const cocktails = parseCocktails(collection);
  const available = cocktails.filter(
    (cocktail) => drinks.find((page) => page.title === cocktail),
  ).length;
  return {
    cocktails,
    available,
    total: cocktails.length,
    missing: cocktails.length - available,
    percentage: cocktails.length ? (available / cocktails.length) * 100 : 0,
  };
}

function sortCollectionsForRings(collections) {
  return [...collections].sort((a, b) => {
    const aIdx = CATEGORY_RING_ORDER.indexOf((a.Category || '').toLowerCase());
    const bIdx = CATEGORY_RING_ORDER.indexOf((b.Category || '').toLowerCase());
    const aOrder = aIdx === -1 ? CATEGORY_RING_ORDER.length : aIdx;
    const bOrder = bIdx === -1 ? CATEGORY_RING_ORDER.length : bIdx;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return (a.Category || '').localeCompare(b.Category || '');
  });
}

function groupCollectionsByYear(collections) {
  const years = new Map();
  collections.forEach((collection) => {
    const year = String(collection.Year);
    if (!years.has(year)) years.set(year, []);
    years.get(year).push(collection);
  });
  return [...years.entries()]
    .sort((a, b) => parseInt(b[0], 10) - parseInt(a[0], 10))
    .map(([year, yearCollections]) => ({
      year,
      collections: sortCollectionsForRings(yearCollections),
    }));
}

function scrollToCollection(collectionId) {
  const targetSection = document.getElementById(collectionId);
  if (!targetSection) return;
  window.history.pushState(null, '', `${window.location.pathname}${window.location.search}#${collectionId}`);
  targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function easeOutCubic(t) {
  return 1 - ((1 - t) ** 3);
}

/**
 * Staggered clockwise close: outer ring fills first, then each inner ring.
 * Tips travel with the leading edge.
 */
function animateRingsClosing(animatedRings) {
  if (!animatedRings.length) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const duration = 900;
  const stagger = 220;

  const applyProgress = (ring, amount) => {
    const { arc, tip, shadow, circumference, radius, center, target } = ring;
    const progress = target * amount;
    arc.setAttribute('stroke-dashoffset', String(circumference * (1 - progress)));

    if (!tip) return;
    const tipAngle = (-Math.PI / 2) + (progress * 2 * Math.PI);
    const x = center + radius * Math.cos(tipAngle);
    const y = center + radius * Math.sin(tipAngle);
    tip.setAttribute('cx', String(x));
    tip.setAttribute('cy', String(y));
    tip.setAttribute('opacity', progress > 0.01 ? '1' : '0');
    if (shadow) {
      shadow.setAttribute('cx', String(x));
      shadow.setAttribute('cy', String(y));
      shadow.setAttribute('opacity', progress > 0.01 ? '0.45' : '0');
    }
  };

  if (reduceMotion) {
    animatedRings.forEach((ring) => applyProgress(ring, 1));
    return;
  }

  const start = performance.now();
  const total = duration + stagger * (animatedRings.length - 1);

  const frame = (now) => {
    const elapsed = now - start;
    animatedRings.forEach((ring, index) => {
      const local = Math.min(1, Math.max(0, (elapsed - index * stagger) / duration));
      applyProgress(ring, easeOutCubic(local));
    });
    if (elapsed < total) requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}

function playRingsWhenVisible(ringsEl, animatedRings) {
  let played = false;
  const play = () => {
    if (played) return;
    played = true;
    animateRingsClosing(animatedRings);
  };

  if (!('IntersectionObserver' in window)) {
    play();
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      observer.disconnect();
      play();
    }
  }, { threshold: 0.35 });

  observer.observe(ringsEl);
}

function createYearRings(yearGroup, drinks) {
  const { year, collections } = yearGroup;
  const coverages = collections.map((collection) => ({
    collection,
    id: createCollectionId(collection),
    ...collectionCoverage(collection, drinks),
  }));

  const yearAvailable = coverages.reduce((sum, item) => sum + item.available, 0);
  const yearTotal = coverages.reduce((sum, item) => sum + item.total, 0);
  const yearMissing = yearTotal - yearAvailable;
  const yearPercentage = yearTotal ? Math.round((yearAvailable / yearTotal) * 100) : 0;

  const group = document.createElement('article');
  group.className = 'iba-year-group';
  group.setAttribute('data-year', year);
  group.setAttribute('data-missing', yearMissing);

  const size = 300;
  const ringCount = Math.max(coverages.length, 1);
  const centerHole = 68;
  const available = (size / 2) - centerHole;
  // Apple-like thick rings with tight gutters
  const stroke = Math.min(28, Math.max(16, (available * 0.82) / ringCount));
  const gap = Math.min(6, Math.max(3, (available * 0.18) / Math.max(ringCount, 1)));
  const center = size / 2;
  const rings = document.createElement('button');
  rings.type = 'button';
  rings.className = 'iba-rings';
  rings.setAttribute('aria-label', `${year} collections, ${yearPercentage}% coverage`);

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');

  const defs = document.createElementNS(svgNS, 'defs');

  // Dark drop shadow on the leading tip — the Activity "closing over itself" cue
  const tipShadow = document.createElementNS(svgNS, 'filter');
  tipShadow.setAttribute('id', `iba-tip-shadow-${year}`);
  tipShadow.setAttribute('x', '-150%');
  tipShadow.setAttribute('y', '-150%');
  tipShadow.setAttribute('width', '400%');
  tipShadow.setAttribute('height', '400%');
  const dropShadow = document.createElementNS(svgNS, 'feDropShadow');
  dropShadow.setAttribute('dx', '0');
  dropShadow.setAttribute('dy', '0');
  dropShadow.setAttribute('stdDeviation', '2.8');
  dropShadow.setAttribute('flood-color', '#000');
  dropShadow.setAttribute('flood-opacity', '0.75');
  tipShadow.appendChild(dropShadow);
  defs.appendChild(tipShadow);

  RING_PALETTES.forEach((palette, colorIndex) => {
    const gradient = document.createElementNS(svgNS, 'linearGradient');
    gradient.setAttribute('id', `iba-ring-grad-${year}-${colorIndex}`);
    gradient.setAttribute('gradientUnits', 'userSpaceOnUse');
    // Approximate clockwise brightening toward the tip (top → right)
    gradient.setAttribute('x1', String(center));
    gradient.setAttribute('y1', '0');
    gradient.setAttribute('x2', String(size));
    gradient.setAttribute('y2', String(center));

    const stopBody = document.createElementNS(svgNS, 'stop');
    stopBody.setAttribute('offset', '0%');
    stopBody.setAttribute('stop-color', palette.body);

    const stopTip = document.createElementNS(svgNS, 'stop');
    stopTip.setAttribute('offset', '100%');
    stopTip.setAttribute('stop-color', palette.tip);

    gradient.append(stopBody, stopTip);
    defs.appendChild(gradient);
  });
  svg.appendChild(defs);

  // Draw tracks first, then progress arcs, then tips on top (so shadow falls on the start)
  const tipLayer = document.createElementNS(svgNS, 'g');
  tipLayer.setAttribute('class', 'iba-ring-tips');
  const animatedRings = [];

  coverages.forEach((item, index) => {
    const radius = center - stroke / 2 - index * (stroke + gap);
    if (radius <= stroke / 2) return;

    const circumference = 2 * Math.PI * radius;
    const progress = Math.max(0, Math.min(100, item.percentage)) / 100;
    const palette = RING_PALETTES[index % RING_PALETTES.length];
    const colorIndex = index % RING_PALETTES.length;

    const track = document.createElementNS(svgNS, 'circle');
    track.setAttribute('class', 'iba-ring-track');
    track.setAttribute('cx', String(center));
    track.setAttribute('cy', String(center));
    track.setAttribute('r', String(radius));
    track.setAttribute('fill', 'none');
    track.setAttribute('stroke', palette.track);
    track.setAttribute('stroke-width', String(stroke));
    svg.appendChild(track);

    const arc = document.createElementNS(svgNS, 'circle');
    arc.setAttribute('class', 'iba-ring-progress');
    arc.setAttribute('cx', String(center));
    arc.setAttribute('cy', String(center));
    arc.setAttribute('r', String(radius));
    arc.setAttribute('fill', 'none');
    arc.setAttribute('stroke', `url(#iba-ring-grad-${year}-${colorIndex})`);
    arc.setAttribute('stroke-width', String(stroke));
    arc.setAttribute('stroke-linecap', 'round');
    arc.setAttribute('stroke-dasharray', String(circumference));
    // Start empty at 12 o'clock; JS animates clockwise close
    arc.setAttribute('stroke-dashoffset', String(circumference));
    arc.setAttribute('transform', `rotate(-90 ${center} ${center})`);
    svg.appendChild(arc);

    let tip = null;
    let shadow = null;
    if (progress > 0.01) {
      // Tip starts at 12 o'clock and travels with the closing edge
      shadow = document.createElementNS(svgNS, 'circle');
      shadow.setAttribute('class', 'iba-ring-tip-shadow');
      shadow.setAttribute('cx', String(center));
      shadow.setAttribute('cy', String(center - radius));
      shadow.setAttribute('r', String(stroke / 2 + 0.5));
      shadow.setAttribute('fill', '#000');
      shadow.setAttribute('opacity', '0');
      shadow.setAttribute('filter', `url(#iba-tip-shadow-${year})`);
      tipLayer.appendChild(shadow);

      tip = document.createElementNS(svgNS, 'circle');
      tip.setAttribute('class', 'iba-ring-tip');
      tip.setAttribute('cx', String(center));
      tip.setAttribute('cy', String(center - radius));
      tip.setAttribute('r', String(stroke / 2));
      tip.setAttribute('fill', palette.tip);
      tip.setAttribute('opacity', '0');
      tipLayer.appendChild(tip);
    }

    animatedRings.push({
      arc,
      tip,
      shadow,
      circumference,
      radius,
      center,
      target: progress,
    });
  });
  svg.appendChild(tipLayer);

  const centerLabel = document.createElement('div');
  centerLabel.className = 'iba-rings-center';
  centerLabel.innerHTML = `
    <span class="iba-rings-year">${year}</span>
    <span class="iba-rings-coverage iba-count-all">${yearPercentage}%</span>
    <span class="iba-rings-coverage iba-count-missing">${yearMissing} missing</span>
  `;

  rings.append(svg, centerLabel);
  playRingsWhenVisible(rings, animatedRings);
  rings.addEventListener('click', () => {
    scrollToCollection(coverages[0].id);
  });

  const legend = document.createElement('ul');
  legend.className = 'iba-year-legend';

  coverages.forEach((item, index) => {
    const legendItem = document.createElement('li');
    legendItem.className = 'iba-toc-item';
    legendItem.setAttribute('data-target', item.id);
    legendItem.setAttribute('data-missing', item.missing);

    const swatch = document.createElement('span');
    swatch.className = 'iba-legend-swatch';
    swatch.style.setProperty('--ring-color', RING_PALETTES[index % RING_PALETTES.length].body);

    const label = document.createElement('span');
    label.className = 'iba-toc-item-title';
    label.textContent = (item.collection.Category || '').trim() || 'Collection';

    const counts = document.createElement('span');
    counts.className = 'iba-toc-item-counts';

    const count = document.createElement('span');
    count.className = 'iba-toc-item-count iba-count-all';
    count.textContent = `${item.available}/${item.total}`;

    const missing = document.createElement('span');
    missing.className = 'iba-toc-item-count iba-count-missing';
    missing.textContent = `${item.missing} missing`;

    counts.append(count, missing);
    legendItem.append(swatch, label, counts);
    legendItem.addEventListener('click', () => scrollToCollection(item.id));
    legend.appendChild(legendItem);
  });

  group.append(rings, legend);
  return group;
}

function createTableOfContents(collections, drinks) {
  const tocContainer = document.createElement('div');
  tocContainer.className = 'iba-toc';

  const yearsGrid = document.createElement('div');
  yearsGrid.className = 'iba-toc-years';

  groupCollectionsByYear(collections).forEach((yearGroup) => {
    yearsGrid.appendChild(createYearRings(yearGroup, drinks));
  });

  tocContainer.appendChild(yearsGrid);
  return tocContainer;
}

function createCollectionSection(collection, drinks) {
  const section = document.createElement('section');
  section.className = 'iba-collection';
  section.id = createCollectionId(collection);

  const header = document.createElement('div');
  header.className = 'iba-collection-header';
  header.setAttribute('aria-expanded', 'true');

  const headerTitle = document.createElement('h2');
  const cocktails = collection.Cocktails.split(',').map((cocktail) => cocktail.trim());
  const missingCount = cocktails.filter(
    (cocktail) => !drinks.find((page) => page.title === cocktail),
  ).length;
  section.setAttribute('data-missing', missingCount);

  const titleContainer = document.createElement('div');
  titleContainer.className = 'iba-collection-title';

  const titleText = document.createElement('span');
  titleText.textContent = `${collection.Year} ${collection.Category}`;

  titleContainer.appendChild(titleText);

  const toggleIcon = document.createElement('span');
  toggleIcon.className = 'iba-collection-toggle';
  toggleIcon.textContent = '▼';

  headerTitle.appendChild(titleContainer);
  headerTitle.appendChild(toggleIcon);

  header.appendChild(headerTitle);

  const content = document.createElement('div');
  content.className = 'iba-collection-content';

  const cocktailList = document.createElement('ul');
  cocktailList.className = 'iba-cocktail-grid';

  cocktails.forEach((cocktail) => {
    const listItem = document.createElement('li');
    listItem.className = 'iba-cocktail-item';
    listItem.setAttribute('data-cocktail-name', cocktail.toLowerCase());

    const drink = drinks.find((page) => page.title === cocktail);
    listItem.setAttribute('data-has-recipe', drink ? 'true' : 'false');
    if (drink) {
      const link = document.createElement('a');
      link.href = drink.path;

      // Create content container
      const contentContainer = document.createElement('div');
      contentContainer.className = 'iba-cocktail-content';

      // Add image if available
      if (drink.image) {
        const image = document.createElement('img');
        image.src = drink.image;
        image.alt = cocktail;
        image.className = 'iba-cocktail-image';
        image.loading = 'lazy';
        contentContainer.appendChild(image);
      }

      // Add cocktail name
      const nameElement = document.createElement('span');
      nameElement.className = 'iba-cocktail-name';
      nameElement.textContent = cocktail;
      contentContainer.appendChild(nameElement);

      link.appendChild(contentContainer);
      listItem.appendChild(link);
    } else {
      const contentContainer = document.createElement('div');
      contentContainer.className = 'iba-cocktail-content';

      const cocktailName = document.createElement('span');
      cocktailName.className = 'iba-cocktail-name';
      cocktailName.textContent = cocktail;
      contentContainer.appendChild(cocktailName);

      const externalLink = document.createElement('a');
      externalLink.href = `https://www.google.com/search?q=${encodeURIComponent(cocktail)}+cocktail`;
      externalLink.textContent = '→';
      externalLink.className = 'iba-external-link';
      externalLink.target = '_blank';
      externalLink.setAttribute('aria-label', `Search for ${cocktail} recipe`);

      listItem.appendChild(contentContainer);
      listItem.appendChild(externalLink);
    }

    cocktailList.appendChild(listItem);
  });

  content.appendChild(cocktailList);
  section.appendChild(header);
  section.appendChild(content);

  // Add toggle functionality for collection
  header.addEventListener('click', () => {
    section.classList.toggle('collapsed');
    const isCollapsed = section.classList.contains('collapsed');
    header.setAttribute('aria-expanded', !isCollapsed);
  });

  return section;
}

function createStats(collections, totalCocktails, availableCocktails) {
  const statsContainer = document.createElement('div');
  statsContainer.className = 'iba-stats';

  const statsTitle = document.createElement('h2');
  statsTitle.textContent = 'IBA Collection Statistics';
  statsContainer.appendChild(statsTitle);

  const statsGrid = document.createElement('div');
  statsGrid.className = 'iba-stats-grid';

  const stats = [
    { number: collections.length, label: 'Collections' },
    { number: totalCocktails, label: 'Total Cocktails' },
    { number: availableCocktails, label: 'Available Recipes' },
    { number: Math.round((availableCocktails / totalCocktails) * 100), label: '% Coverage' },
  ];

  stats.forEach((stat) => {
    const statElement = document.createElement('div');
    statElement.className = 'iba-stat';
    statElement.innerHTML = `
      <span class="iba-stat-number">${stat.number}${stat.label === '% Coverage' ? '%' : ''}</span>
      <span class="iba-stat-label">${stat.label}</span>
    `;
    statsGrid.appendChild(statElement);
  });

  statsContainer.appendChild(statsGrid);
  return statsContainer;
}

function createModeSwitch(initialMode) {
  const modes = document.createElement('div');
  modes.className = 'iba-modes';
  modes.setAttribute('role', 'group');
  modes.setAttribute('aria-label', 'Cocktail list');

  [
    { mode: 'all', label: 'All cocktails' },
    { mode: 'missing', label: 'Missing recipes' },
  ].forEach(({ mode, label }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'iba-mode';
    button.dataset.mode = mode;
    button.textContent = label;
    button.setAttribute('aria-pressed', mode === initialMode ? 'true' : 'false');
    modes.appendChild(button);
  });

  return modes;
}

function readMode() {
  const mode = new URLSearchParams(window.location.search).get('mode');
  return mode === 'missing' ? 'missing' : 'all';
}

function applyMode(widget, mode) {
  widget.dataset.mode = mode;
  widget.querySelectorAll('.iba-mode').forEach((button) => {
    button.setAttribute('aria-pressed', button.dataset.mode === mode ? 'true' : 'false');
  });

  const url = new URL(window.location.href);
  if (mode === 'missing') url.searchParams.set('mode', 'missing');
  else url.searchParams.delete('mode');
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

export default async function decorate(widget) {
  widget.classList.add('iba-widget');

  // Load data
  const iba = await getData('/drinks/iba.json');
  const pages = await getData('/pages.json');
  const drinks = pages.filter((page) => page.path.startsWith('/drinks/'));

  // Sort collections by year descending (newest first)
  iba.sort((a, b) => parseInt(b.Year, 10) - parseInt(a.Year, 10));

  // Calculate statistics
  let totalCocktails = 0;
  let availableCocktails = 0;

  iba.forEach((collection) => {
    const { total, available } = collectionCoverage(collection, drinks);
    totalCocktails += total;
    availableCocktails += available;
  });

  // Create table of contents
  const toc = createTableOfContents(iba, drinks);

  // Create collections
  const collectionsContainer = document.createElement('div');
  collectionsContainer.className = 'iba-collections';

  iba.forEach((collection) => {
    const section = createCollectionSection(collection, drinks);
    collectionsContainer.appendChild(section);
  });

  // Create statistics
  const stats = createStats(iba, totalCocktails, availableCocktails);

  const initialMode = readMode();
  const modeSwitch = createModeSwitch(initialMode);
  modeSwitch.addEventListener('click', (event) => {
    const button = event.target.closest('.iba-mode');
    if (!button) return;
    applyMode(widget, button.dataset.mode);
  });

  const empty = document.createElement('p');
  empty.className = 'iba-empty';
  empty.textContent = 'Every IBA cocktail in these collections has a recipe.';

  // Assemble widget
  widget.dataset.mode = initialMode;
  widget.appendChild(modeSwitch);
  widget.appendChild(toc);
  widget.appendChild(empty);
  widget.appendChild(collectionsContainer);
  widget.appendChild(stats);

  // Handle initial hash navigation
  if (window.location.hash) {
    const targetId = window.location.hash.slice(1);
    const targetSection = document.getElementById(targetId);
    if (targetSection) {
      setTimeout(() => {
        targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }
}

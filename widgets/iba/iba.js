async function getData(path) {
  const resp = await fetch(path);
  const json = await resp.json();
  return json.data;
}

function createProgressCircle(percentage) {
  const circle = document.createElement('div');
  circle.className = 'iba-progress-circle';
  const angle = (percentage / 100) * 360;
  circle.style.setProperty('--progress-angle', `${angle}deg`);
  circle.setAttribute('title', `${Math.round(percentage)}% coverage`);
  return circle;
}

function createTableOfContents(collections, drinks) {
  const tocContainer = document.createElement('div');
  tocContainer.className = 'iba-toc';

  const tocList = document.createElement('ul');
  tocList.className = 'iba-toc-list';

  collections.forEach((collection, index) => {
    const cocktails = collection.Cocktails.split(',').map((cocktail) => cocktail.trim());

    // Calculate coverage for this collection
    const availableInCollection = cocktails.filter(
      (cocktail) => drinks.find((page) => page.title === cocktail),
    ).length;
    const coveragePercentage = (availableInCollection / cocktails.length) * 100;

    const tocItem = document.createElement('li');
    tocItem.className = 'iba-toc-item';
    tocItem.setAttribute('data-target', `collection-${index}`);

    const tocItemTitle = document.createElement('div');
    tocItemTitle.className = 'iba-toc-item-title';
    tocItemTitle.textContent = `${collection.Year} ${collection.Category}`;

    const tocItemCount = document.createElement('div');
    tocItemCount.className = 'iba-toc-item-count';
    tocItemCount.textContent = `${cocktails.length} cocktails`;

    const progressCircle = createProgressCircle(coveragePercentage);

    tocItem.appendChild(tocItemTitle);
    tocItem.appendChild(tocItemCount);
    tocItem.appendChild(progressCircle);
    tocList.appendChild(tocItem);

    // Add click handler for smooth scrolling
    tocItem.addEventListener('click', () => {
      const targetSection = document.getElementById(`collection-${index}`);
      if (targetSection) {
        targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  tocContainer.appendChild(tocList);

  return tocContainer;
}

function createCollectionSection(collection, index, drinks) {
  const section = document.createElement('section');
  section.className = 'iba-collection';
  section.id = `collection-${index}`;

  const header = document.createElement('div');
  header.className = 'iba-collection-header';
  header.setAttribute('aria-expanded', 'true');

  const headerTitle = document.createElement('h2');
  const cocktails = collection.Cocktails.split(',').map((cocktail) => cocktail.trim());

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
    if (drink) {
      const link = document.createElement('a');
      link.href = drink.path;
      link.textContent = cocktail;
      listItem.appendChild(link);
    } else {
      const cocktailName = document.createElement('span');
      cocktailName.textContent = cocktail;
      const externalLink = document.createElement('a');
      externalLink.href = `https://www.google.com/search?q=${encodeURIComponent(cocktail)}+cocktail`;
      externalLink.textContent = '→';
      externalLink.className = 'iba-external-link';
      externalLink.target = '_blank';
      externalLink.setAttribute('aria-label', `Search for ${cocktail} recipe`);

      listItem.appendChild(cocktailName);
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

export default async function decorate(widget) {
  // Add CSS class to widget
  widget.className = 'iba-widget';

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
    const cocktails = collection.Cocktails.split(',').map((cocktail) => cocktail.trim());
    totalCocktails += cocktails.length;
    cocktails.forEach((cocktail) => {
      if (drinks.find((page) => page.title === cocktail)) {
        availableCocktails += 1;
      }
    });
  });

  // Create table of contents
  const toc = createTableOfContents(iba, drinks);

  // Create collections
  const collectionsContainer = document.createElement('div');
  collectionsContainer.className = 'iba-collections';

  iba.forEach((collection, index) => {
    const section = createCollectionSection(collection, index, drinks);
    collectionsContainer.appendChild(section);
  });

  // Create statistics
  const stats = createStats(iba, totalCocktails, availableCocktails);

  // Assemble widget
  widget.appendChild(toc);
  widget.appendChild(collectionsContainer);
  widget.appendChild(stats);
}

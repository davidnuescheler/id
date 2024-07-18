import { createOptimizedPicture } from '../../scripts/aem.js';

/**
 * Builds cards block for drinks index.
 */
async function createDrinksCards() {
  const createCard = async (path) => {
    const resp = await fetch(path);
    const text = await resp.text();
    const dp = new DOMParser();
    const dom = dp.parseFromString(text, 'text/html');
    const drink = dom.querySelector('h1').textContent;
    const picture = dom.querySelector('picture');
    const card = document.createElement('div');
    const cell1 = document.createElement('div');
    const a1 = document.createElement('a');
    a1.href = path;
    a1.append(picture);
    cell1.append(a1);
    const cell2 = document.createElement('div');
    const a2 = document.createElement('a');
    a2.href = path;
    a2.textContent = drink;
    cell2.append(a2);
    card.append(cell1, cell2);
    return card;
  };

  const resp = await fetch('/sitemap.json');
  const json = await resp.json();
  const drinks = json.data
    .filter((e) => e.path.startsWith('/drinks/'))
    .sort((a, b) => b.lastModified - a.lastModified);

  const cards = [];

  for (let i = 0; i < drinks.length; i += 1) {
    const drink = drinks[i];
    // eslint-disable-next-line no-await-in-loop
    cards.push(await createCard(drink.path));
  }

  return cards;
}

export default async function decorate(block) {
  if (block.querySelector('a[href="/drinks/"')) {
    block.textContent = '';
    const cards = await createDrinksCards();
    block.append(...cards);
  }

  /* change to ul, li */
  const ul = document.createElement('ul');
  [...block.children].forEach((row) => {
    const li = document.createElement('li');
    while (row.firstElementChild) li.append(row.firstElementChild);
    [...li.children].forEach((div) => {
      if (div.children.length === 1 && div.querySelector('picture')) div.className = 'cards-card-image';
      else div.className = 'cards-card-body';
    });
    ul.append(li);
  });
  ul.querySelectorAll('img').forEach((img) => img.closest('picture').replaceWith(createOptimizedPicture(img.src, img.alt, false, [{ width: '750' }])));
  block.textContent = '';
  block.append(ul);
}

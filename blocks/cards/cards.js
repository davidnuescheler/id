import { createOptimizedPicture } from '../../scripts/aem.js';
import { checkIBA } from '../../scripts/scripts.js';

/**
 * Builds cards block for drinks index.
 */
async function createDrinksCards() {
  const createCard = async (drink) => {
    const { title, image, path } = drink;
    const picture = createOptimizedPicture(image, `${title} Cocktail`, false, [{ width: 750 }]);
    const card = document.createElement('div');
    const cell1 = document.createElement('div');
    const a1 = document.createElement('a');
    a1.href = path;
    a1.append(picture);
    cell1.append(a1);
    const ibaStatus = await checkIBA(title);
    if (ibaStatus.current) {
      const img = document.createElement('img');
      img.src = '/icons/logo-iba.svg';
      img.className = 'icon';
      img.alt = 'IBA logo';
      cell1.append(img);
    }
    const cell2 = document.createElement('div');
    const a2 = document.createElement('a');
    a2.href = path;
    a2.textContent = title;
    cell2.append(a2);

    card.append(cell1, cell2);
    return card;
  };

  const resp = await fetch('/pages.json');
  const json = await resp.json();
  const drinks = json.data
    .filter((e) => /^\/drinks\/./.test(e.path))
    .sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

  const cards = [];

  for (let i = 0; i < drinks.length; i += 1) {
    const drink = drinks[i];
    // eslint-disable-next-line no-await-in-loop
    cards.push(await createCard(drink));
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
      if (div.children.length <= 2 && div.querySelector('picture')) div.className = 'cards-card-image';
      else div.className = 'cards-card-body';
    });
    ul.append(li);
  });
  ul.querySelectorAll('picture img').forEach((img) => img.closest('picture').replaceWith(createOptimizedPicture(img.src, img.alt, false, [{ width: '750' }])));
  block.textContent = '';
  block.append(ul);
}

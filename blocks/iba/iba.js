import { checkIBA } from '../../scripts/scripts.js';

export default async function decorate(block) {
  block.innerText = '';
  const cocktail = document.querySelector('h1').textContent;
  const status = await checkIBA(cocktail);
  if (status.collections.length > 0) {
    const ibaLogo = document.createElement('img');
    ibaLogo.src = '/icons/logo-iba.svg';
    ibaLogo.alt = 'IBA Logo';
    block.append(ibaLogo);
    status.collections.forEach((c) => {
      const span = document.createElement('span');
      span.innerText = `${c.year} ${c.category}`;
      block.append(span);
    });
  } else {
    block.closest('.section').remove();
  }
}

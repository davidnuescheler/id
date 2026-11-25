/*
 * Fragment Block
 * Include content on a page as a fragment.
 * https://www.aem.live/developer/block-collection/fragment
 */

import {
  decorateMain,
} from '../../scripts/scripts.js';

import {
  loadBlocks,
} from '../../scripts/aem.js';

/**
 * Loads a fragment.
 * @param {string} path The path to the fragment
 * @returns {HTMLElement} The root element of the fragment
 */
async function decorateFragment(main) {
  await decorateMain(main, true);
  await loadBlocks(main);
  return main;
}

export async function loadFragment(path) {
  if (path && path.startsWith('/')) {
    const resp = await fetch(`${path}.plain.html`);
    if (resp.ok) {
      const main = document.createElement('main');
      main.innerHTML = await resp.text();

      // reset base path for media to fragment base
      const resetAttributeBase = (tag, attr) => {
        main.querySelectorAll(`${tag}[${attr}^="./media_"]`).forEach((elem) => {
          elem[attr] = new URL(elem.getAttribute(attr), new URL(path, window.location)).href;
        });
      };
      resetAttributeBase('img', 'src');
      resetAttributeBase('source', 'srcset');

      return decorateFragment(main);
    }
  }
  return null;
}

/**
 * Loads inline sections preceding a header or footer block, or its fragment.
 * @param {Element} block The header or footer block
 * @param {string} path The fallback fragment path
 * @returns {Promise<HTMLElement|null>} The decorated content
 */
export async function loadInlineOrFragment(block, path) {
  if (!block.previousElementSibling) return loadFragment(path);
  const main = document.createElement('main');
  while (block.previousElementSibling) main.prepend(block.previousElementSibling);
  return decorateFragment(main);
}

export default async function decorate(block) {
  const link = block.querySelector('a');
  const path = link ? link.getAttribute('href') : block.textContent.trim();
  const fragment = await loadFragment(path);
  if (fragment) {
    const fragmentSection = fragment.querySelector(':scope .section');
    if (fragmentSection) {
      block.closest('.section').classList.add(...fragmentSection.classList);
      block.closest('.fragment').replaceWith(...fragment.childNodes);
    }
  }
}

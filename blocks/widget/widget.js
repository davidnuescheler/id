import { loadCSS } from '../../scripts/aem.js';

/**
 * Loads JS and CSS for a block.
 * @param {Element} widgetPath
 */
export default async function decorate(widget) {
  const widgetEl = widget.querySelector('a');
  const widgetUrl = widgetEl.href;
  const parsedWidgetUrl = new URL(widgetUrl);
  // derive the name from the path only, query params may contain slashes
  const pathSplit = parsedWidgetUrl.pathname.split('/');
  const widgetName = pathSplit[pathSplit.length - 2];

  // expose the widget url and its query params before the widget decorates,
  // so widgets can read their configuration from widget.dataset
  widget.dataset.widgetUrl = widgetUrl;
  const params = new URLSearchParams(parsedWidgetUrl.searchParams);
  // eslint-disable-next-line no-restricted-syntax
  for (const [key, value] of params.entries()) {
    widget.dataset[key] = value;
  }

  try {
    const resp = await fetch(`${window.hlx.codeBasePath}/widgets/${widgetName}/${widgetName}.html`);
    const html = await resp.text();
    widget.innerHTML = html;
    const cssLoaded = loadCSS(`${window.hlx.codeBasePath}/widgets/${widgetName}/${widgetName}.css`);
    const decorationComplete = new Promise((resolve) => {
      (async () => {
        try {
          const mod = await import(
            `${window.hlx.codeBasePath}/widgets/${widgetName}/${widgetName}.js`
          );
          if (mod.default) {
            await mod.default(widget);
          }
        } catch (error) {
          // eslint-disable-next-line no-console
          console.log(`failed to load module for ${widgetName}`, error);
        }
        resolve();
      })();
    });
    await Promise.all([cssLoaded, decorationComplete]);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log(`failed to load block ${widgetName}`, error);
  }
  widget.className = `widget ${widgetName}`;
}

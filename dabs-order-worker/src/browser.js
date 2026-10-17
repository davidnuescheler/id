import { isLoginPage, parsePageErrors } from './parse.js';
import {
  BASE,
  DabsClient,
  parseRequest,
  runOrder,
} from './session.js';

const LOGIN_URL = `${BASE}/loginretail`;
const TOKEN_TIMEOUT_MS = 20000;
const NAVIGATION_TIMEOUT_MS = 45000;

export function pageFetch(page) {
  return async (url, init = {}) => {
    const method = init.method || 'GET';
    const body = method === 'GET' || init.body === undefined ? null : String(init.body);
    const contentType = init.headers?.['content-type'] || null;
    // Cookie, Origin, Referer and User-Agent are owned by the browser; only the body type is passed.
    const raw = await page.evaluate(async (target, verb, payload, type) => {
      const headers = type ? { 'content-type': type } : {};
      const res = await fetch(target, {
        method: verb,
        body: payload,
        headers,
        credentials: 'include',
        redirect: 'follow',
      });
      return JSON.stringify({ status: res.status, url: res.url, text: await res.text() });
    }, String(url), method, body, contentType);

    const result = JSON.parse(raw);
    const empty = [204, 205, 304].includes(result.status);
    const response = new Response(empty ? null : result.text, { status: result.status });
    Object.defineProperty(response, 'url', { value: result.url });
    return response;
  };
}

async function browserLogin(page, client, request) {
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });

  try {
    await page.waitForFunction(
      () => (document.getElementById('CaptchaToken')?.value || '').length > 100,
      { timeout: TOKEN_TIMEOUT_MS },
    );
  } catch (error) {
    return {
      ok: false,
      errors: [{ step: 'login', message: 'reCAPTCHA did not issue a token in Browser Run.' }],
    };
  }

  await page.type('#EmailAddress', request.username);
  await page.type('#Password', request.password);
  const button = await page.$('form[action*="loginretail"] button[type="submit"]');
  if (!button) {
    return { ok: false, errors: [{ step: 'login', message: 'The DABS login button was not found.' }] };
  }
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS }),
    button.click(),
  ]);

  const url = page.url();
  const html = await page.content();
  if (isLoginPage(html, url)) {
    const messages = parsePageErrors(html);
    const fallback = 'DABS rejected the Browser Run login. The reCAPTCHA score was probably too low.';
    return {
      ok: false,
      errors: (messages.length ? messages : [fallback]).map((message) => ({ step: 'login', message })),
    };
  }
  return client.adoptSession(html, url);
}

export async function placeOrderWithBrowser(body, binding) {
  const parsed = parseRequest(body);
  if (parsed.error) return parsed.error;
  const request = parsed.value;

  const { default: puppeteer } = await import('@cloudflare/puppeteer');
  let browser;
  try {
    browser = await puppeteer.launch(binding);
  } catch (error) {
    return {
      ok: false,
      mode: request.mode,
      submitted: false,
      customer: null,
      order: null,
      errors: [{ step: 'browser', message: `Browser Run could not start: ${error.message}` }],
      steps: [],
      httpStatus: 503,
    };
  }

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(NAVIGATION_TIMEOUT_MS);
    const client = new DabsClient(pageFetch(page));
    return await runOrder(client, request, () => browserLogin(page, client, request));
  } finally {
    await browser.close();
  }
}

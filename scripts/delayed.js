// eslint-disable-next-line import/no-cycle
import { sampleRUM } from './aem.js';

// Core Web Vitals RUM collection
sampleRUM('cwv');

// add more delayed functionality here

async function redecorateDabsLocations() {
  const phones = document.querySelectorAll('.table a[href^="tel:"]');
  if (phones.length === 0) return;
  const resp = await fetch('/utah-dabs.json');
  const { data } = await resp.json();
  phones.forEach((phone) => {
    const mapLink = phone.parentElement.querySelector('a[href^="https://maps.google.com"]');
    if (mapLink) {
      const location = data.find((item) => item.Phone === phone.href.replace('tel:+1', ''));
      if (location) {
        mapLink.href = location.Location;
      }
    }
  });
}

redecorateDabsLocations();

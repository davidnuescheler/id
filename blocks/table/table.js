/*
 * Table Block
 * Recreate a table
 * https://www.hlx.live/developer/block-collection/table
 */

function buildCell(rowIndex) {
  const cell = rowIndex ? document.createElement('td') : document.createElement('th');
  if (!rowIndex) cell.setAttribute('scope', 'col');
  return cell;
}

export default async function decorate(block) {
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');

  if (block.classList.contains('dabs-inventory')) {
    const firstCell = block.children[0].children[0];
    const locate = document.createElement('span');
    locate.role = 'button';
    locate.innerText = ' \u25BD';
    firstCell.append(locate);
    const myLocation = window.localStorage.getItem('my-location');
    if (myLocation) {
      const haversineDistance = (lat1, lon1, lat2, lon2) => {
        const toRadians = (deg) => (deg * Math.PI) / 180;
        const R = 6371;
        const dLat = toRadians(lat2 - lat1);
        const dLon = toRadians(lon2 - lon1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
          + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2)
          * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distanceInKm = R * c;
        // Convert kilometers to miles
        const distanceInMiles = distanceInKm * 0.621371;
        return distanceInMiles;
      };

      const { latitude, longitude } = JSON.parse(myLocation);
      const myPosition = { latitude, longitude };
      const distances = [];
      [...block.children].forEach((row, i) => {
        if (i > 0) {
          const [lat, long] = row.querySelector('a').href.split('?q=')[1].split(',');
          const distance = Math.sqrt(
            (lat - myPosition.latitude) ** 2
            + (long - myPosition.longitude) ** 2,
          );
          distances.push({ distance, row });
          const distanceEl = document.createElement('strong');
          distanceEl.innerText = ` ${Math.round(haversineDistance(myPosition.latitude, myPosition.longitude, lat, long))} mi`;
          row.children[0].children[0].after(distanceEl);
        }
      });
      distances.sort((a, b) => a.distance - b.distance);
      distances.forEach((d) => block.append(d.row));
    }
  }

  const header = !block.classList.contains('no-header');
  if (header) {
    table.append(thead);
  }
  table.append(tbody);

  [...block.children].forEach((child, i) => {
    const row = document.createElement('tr');
    if (header && i === 0) thead.append(row);
    else tbody.append(row);
    [...child.children].forEach((col) => {
      const cell = buildCell(header ? i : i + 1);
      cell.innerHTML = col.innerHTML;
      row.append(cell);
    });
  });
  block.innerHTML = '';
  block.append(table);

  const locate = block.querySelector('span[role="button"]');
  if (locate) {
    locate.addEventListener('click', () => {
      navigator.geolocation.getCurrentPosition((position) => {
        const { latitude, longitude } = position.coords;
        window.localStorage.setItem('my-location', JSON.stringify({ latitude, longitude }));
        window.location.reload();
      });
    });
  }
}

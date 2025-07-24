async function getData(path) {
  const resp = await fetch(path);
  const json = await resp.json();
  return json.data;
}

export default async function decorate(widget) {
  const iba = await getData('/drinks/iba.json');
  const pages = await getData('/pages.json');
  console.log(pages);
  const drinks = pages.filter((page) => page.path.startsWith('/drinks/'));

  iba.forEach((collection) => {
    const h2 = document.createElement('h2');
    h2.textContent = `${collection.Year} ${collection.Category}`;
    widget.appendChild(h2);
    const cocktails = collection.Cocktails.split(',').map((cocktail) => cocktail.trim());
    const ul = document.createElement('ul');
    cocktails.forEach((cocktail) => {
      const li = document.createElement('li');
      const drink = drinks.find((page) => page.title === cocktail);
      if (drink) {
        const a = document.createElement('a');
        a.href = `${drink.path}`;
        a.textContent = cocktail;
        li.appendChild(a);
      } else {
        li.innerHTML = `${cocktail} <a href="https://www.google.com/search?q=${encodeURIComponent(cocktail)}+cocktail">&gt;&gt;</a>`;
      }
      ul.appendChild(li);
    });
    widget.appendChild(ul);
  });
}

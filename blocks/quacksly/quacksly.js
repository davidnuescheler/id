function createQuestion(row) {
  const question = document.createElement('div');
  question.className = 'quacksly-question';
  question.innerHTML = `
    <h2>${row.Question}</h2>
    <div class="answers">
      <button>${row['Answer 1']}</button>
      <button>${row['Answer 2']}</button>
      <button>${row['Answer 3']}</button>
      <button>${row['Answer 4']}</button>
    </div>
  `;
  return question;
}

function stringToHash(string) {
  let hash = 0;

  if (string.length === 0) return hash;

  for (let i = 0; i < string.length; i += 1) {
    const char = string.charCodeAt(i);
    // eslint-disable-next-line no-bitwise
    hash = ((hash << 5) - hash) + char;
    // eslint-disable-next-line no-bitwise, operator-assignment
    hash = hash & hash;
  }

  return hash;
}

async function displayResult(res) {
  const resp = await fetch('/pages.json');
  const { data } = await resp.json();
  const drinks = data.filter((row) => row.path.startsWith('/drinks/') && row.path !== '/drinks/');
  const hash = stringToHash(res);
  const drinkIndex = hash % drinks.length;
  const drink = drinks[drinkIndex];
  const result = document.createElement('div');
  result.className = 'quacksly-result';
  result.innerHTML = `
    <p>${drink.title}</p>
    <a href="${drink.path}"><img src="${drink.image}" alt="${drink.title}"></a>
  `;
  document.querySelector('.quacksly-question').replaceWith(result);
}

export default async function decorate(block) {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('q');
  const resp = await fetch('/quacksly.json');
  const { data } = await resp.json();
  let index = data.findIndex((row) => row.ID === id);
  if (index === -1) {
    index = Math.floor(Math.random() * (data.length - 3));
    // window.history.replaceState(null, '', `${window.location.pathname}?q=${data[index].ID}`);
  }
  let result = `${data[index].ID}-`;
  const appendQuestion = (questionIndex) => {
    const question = createQuestion(data[questionIndex]);
    block.append(question);
    question.querySelectorAll('button').forEach((button, i) => {
      button.addEventListener('click', () => {
        result = `${result}${i + 1}`;
        if (questionIndex > index + 1) {
          displayResult(result);
        } else {
          document.querySelector('.quacksly-question').remove();
          appendQuestion(questionIndex + 1);
        }
      });
    });
  };

  appendQuestion(index);
}

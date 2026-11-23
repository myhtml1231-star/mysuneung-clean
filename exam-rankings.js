const filters = document.querySelector('.ranking-filters');

if (filters) {
  const buttons = [...filters.querySelectorAll('button[data-ranking-target]')];
  const groups = document.querySelectorAll('.ranking-group');

  filters.addEventListener('click', event => {
    const choice = event.target.closest('button[data-ranking-target]');
    if (!choice) return;

    for (const button of buttons) {
      button.setAttribute('aria-pressed', String(button === choice));
    }
    for (const group of groups) {
      group.hidden = choice.dataset.rankingTarget !== 'all' && group.id !== choice.dataset.rankingTarget;
    }
  });

  filters.hidden = false;
}

const yearList = document.querySelector('.police-year-list');
const yearLinks = [...yearList.querySelectorAll('a[data-year]')];

function showYear(activeLink) {
  for (const link of yearLinks) {
    const selected = link === activeLink;
    document.getElementById(`police-${link.dataset.year}`).hidden = !selected;
    if (selected) link.setAttribute('aria-current', 'true');
    else link.removeAttribute('aria-current');
  }
}

const requestedYear = new URL(location.href).searchParams.get('year');
const initialLink = yearLinks.find(link => link.dataset.year === requestedYear);
showYear(initialLink ?? yearLinks[0]);

yearList.addEventListener('click', event => {
  const link = event.target.closest('a[data-year]');
  if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

  event.preventDefault();
  showYear(link);
  const url = new URL(location.href);
  url.searchParams.set('year', link.dataset.year);
  url.hash = '';
  history.replaceState(null, '', url);
});

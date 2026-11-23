const picker = document.getElementById('police-exam-year');
const sections = [...document.querySelectorAll('.police-exam-year')];

function showYear() {
  for (const section of sections) {
    section.hidden = section.dataset.year !== picker.value;
  }
}

const url = new URL(location.href);
const requestedYear = url.searchParams.get('year');
if (sections.some(section => section.dataset.year === requestedYear)) {
  picker.value = requestedYear;
}

showYear();
picker.closest('.police-year-picker').hidden = false;
picker.addEventListener('change', () => {
  showYear();
  url.searchParams.set('year', picker.value);
  history.replaceState(null, '', url);
});

const onKeydownCB = (e) => {
  if (e.key == 'Enter') {
    e.preventDefault();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('a:not([href^="#"])').forEach(x => x.setAttribute('href', 'javascript:void(0);'));
  // for keyboard tabbing
  document.querySelectorAll('a, button, [role="button"], input').forEach(x => x.setAttribute("tabindex", -1));

  document.querySelectorAll('input').forEach(x => {
    x.readOnly = true;
    // for amazon search input keypress enter
    x.onkeydown = onKeydownCB;
  });

  // for wikipedia <select> language keypress enter
  document.querySelectorAll('select').forEach(x => x.onkeydown = onKeydownCB);
});

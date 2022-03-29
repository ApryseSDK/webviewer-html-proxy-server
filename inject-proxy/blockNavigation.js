const onKeydownCallback = (e) => {
  if (e.key == 'Enter') {
    e.preventDefault();
  }
}

const blockNavigation = () => {
  // block navigation for all a tags that don't start with #  
  document.querySelectorAll('a:not([href^="#"])').forEach(elem => {
    // in subsequent debouncing, make sure to only run this for new <a>
    if (!!elem.href && elem.getAttribute('target') != '_blank') {
      elem.setAttribute('target', '_blank');
      elem.setAttribute('data-href', elem.getAttribute('href')); // to be removed
      // If the url is absolute then new URL won't mess it up.
      // It will only append urlToProxy if it is relative.
      const { urlToProxy } = window.PDFTron;
      elem.setAttribute('href', new URL(elem.getAttribute('href'), urlToProxy).href);

      elem.addEventListener('click', (event) => {
        event.stopImmediatePropagation();
        event.stopPropagation();
      });
    }
  });

  // for all a tags that start with #, copy to data-href for WV link annotation
  document.querySelectorAll('a[href^="#"]').forEach(elem => {
    elem.setAttribute('data-href', elem.getAttribute('href'));
  });
  // for keyboard tabbing
  document.querySelectorAll('a, button, [role="button"], input').forEach(elem => elem.setAttribute("tabindex", -1));

  document.querySelectorAll('input').forEach(elem => {
    if (!elem.readOnly) {
      elem.readOnly = true;
      // for amazon search input keypress enter
      elem.onkeydown = onKeydownCallback;
    }
  });

  // for wikipedia <select> language keypress enter
  document.querySelectorAll('select').forEach(elem => elem.onkeydown = onKeydownCallback);
}

const debounceBlockNavigation = debounceJS(blockNavigation, 1000, false);

document.addEventListener('DOMContentLoaded', () => {
  blockNavigation();

  // nytimes has a delayed-appended pre-footer section
  const observer = new MutationObserver((m, o) => {
    debounceBlockNavigation();
  });
  observer.observe(document.body, {
    attributes: false,
    childList: true,
    subtree: true,
    characterData: false,
  });
});

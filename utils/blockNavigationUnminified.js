const onKeydownCB = (e) => {
  if (e.key == 'Enter') {
    e.preventDefault();
  }
}

const debounceJS = (func, wait, leading) => {
  let timeout = null;
  return (...args) => {
    let callNow = leading && !timeout;
    clearTimeout(timeout);

    timeout = setTimeout(() => {
      timeout = null;
      if (!leading) {
        func.apply(null, args);
      }
    }, wait);
    if (callNow)
      func.apply(null, args);
  }
}

const blockNavigation = () => {
  console.log('----- block nav')
  // block navigation for all a tags that don't start with #  
  document.querySelectorAll('a:not([href^="#"])').forEach(x => {
    if (x.href != 'javascript:void(0);') {
      x.setAttribute('data-href', x.href);
      x.setAttribute('href', 'javascript:void(0);');
    }
  });
  
  // for all a tags that start with #, copy to data-href for WV link annotation
  document.querySelectorAll('a[href^="#"]').forEach(x => {
    x.setAttribute('data-href', x.href);
  });
  // for keyboard tabbing
  document.querySelectorAll('a, button, [role="button"], input').forEach(x => x.setAttribute("tabindex", -1));

  document.querySelectorAll('input').forEach(x => {
    if (!x.readOnly) {
      x.readOnly = true;
      // for amazon search input keypress enter
      x.onkeydown = onKeydownCB;
    }
  });

  // for wikipedia <select> language keypress enter
  document.querySelectorAll('select').forEach(x => x.onkeydown = onKeydownCB);
}

const debounceBlockNavigation = debounceJS(blockNavigation, 1000, false);

document.addEventListener('DOMContentLoaded', () => {
  blockNavigation();

  // nytimes has a delayed-appended pre-footer section
  const observer = new MutationObserver((m, o) => {
    console.log('MutationObserver block nav')
    debounceBlockNavigation();
  });
  observer.observe(document.body, {
    attributes: false,
    childList: true,
    subtree: true,
    characterData: false,
  });
});

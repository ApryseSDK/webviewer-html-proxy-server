const onKeydownCallback = (e) => {
  if (e.key == 'Enter') {
    e.preventDefault();
  }
}

const blockNavigation = () => {
  const { urlToProxy } = window.PDFTron;
  const pageHeight = getPageHeight();
  const pageWidth = 1440;
  const { origin } = new URL(window.location);

  // block navigation for suspicious <a> that don't have href or empty href: stubbing onclick
  // block navigation for all a tags that don't start with #  
  document.querySelectorAll('a:not([href]), a[href=""], a[href]:not([href^="#"]):not([href="javascript: void(0)"])').forEach(elem => {
    // in subsequent debouncing, make sure to only run this for new <a>
    if (elem.dataset.pdftron != 'pdftron') {
      // set this attibute to identify if <a> href has been modified
      elem.setAttribute('data-pdftron', 'pdftron');

      if (!!elem.href) {
        elem.setAttribute('target', '_blank');
        elem.setAttribute('data-href', elem.getAttribute('href'));
        // If the url is absolute then new URL won't mess it up.
        // It will only append urlToProxy if it is relative.
        elem.setAttribute('href', new URL(elem.getAttribute('href'), urlToProxy).href);
        elem.addEventListener('click', (event) => {
          event.stopImmediatePropagation();
          event.stopPropagation();
        });
      } else if (elem.onclick) {
        elem.onclick = null;
      }
    }

    if (elem.hasChildNodes()) {
      const elChildNodes = Array.from(elem.childNodes);
      // check if childNodes has some that is an element and doesn't have data-pdftron
      if (!elChildNodes.some(childEL => childEL.nodeType == Node.ELEMENT_NODE && childEL.dataset.pdftron == 'pdftron-link-popup')) {
        elem.style.position = 'relative';

        let div = document.createElement('div');
        div.setAttribute('data-pdftron', 'pdftron-link-popup');
        div.innerText = elem.getAttribute('href');

        const elStyle = window.getComputedStyle(elem);
        const {
          x: elBoundingRectX,
          y: elBoundingRectY,
          width: elBoundingRectWidth,
          height: elBoundingRectHeight
        } = elem.getBoundingClientRect();
        if ((elBoundingRectY + elBoundingRectHeight + 200) > pageHeight) {
          // if the popup is not visible in the viewport then append on the top of the <a> tag
          div.style.bottom = `${elBoundingRectHeight}px`;
        } else {
          div.style.top = `${elBoundingRectHeight}px`;
        }
        if ((elBoundingRectX + 450) > pageWidth) {
          div.style.right = elStyle.paddingRight;
        } else {
          div.style.left = elStyle.paddingLeft;
        }

        elem.appendChild(div);
        elem.addEventListener('mouseenter', () => {
          div.style.display = 'block';
          fetch(`${origin}/pdftron-test?url=${elem.getAttribute('href')}`)
            .then(res => res.json())
            .then(json => {
              div.innerHTML = `
                ${elem.getAttribute('href')};
                <img src="${json.faviconUrl}">${json.pageTitle}
              `;
            })
            .catch(e => console.error(e))
        }, false);

        // fetch(elem.getAttribute('href'), { mode: 'no-cors' })
        //   .then(response => {
        //     return response.text();
        //   }).then(text => {
        //     console.log(text)
        //     const domparser = new DOMParser();
        //     const newDocument = domparser.parseFromString(text, 'text/html');
        //     // console.log(newDocument.querySelector('meta[property="og:title"]').getAttribute('content'));
        //   })
        //   .catch(err => console.error(err));

        elem.addEventListener('mouseleave', () => {
          div.style.display = 'none';
        }, false);
      }
    }

  });

  // for all a tags that start with #, copy to data-href for WV link annotation
  document.querySelectorAll('a[href^="#"]').forEach(elem => {
    if (elem.dataset.pdftron != 'pdftron') {
      elem.setAttribute('data-pdftron', 'pdftron');
      elem.setAttribute('data-href', elem.getAttribute('href'));
    }
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

const debounceBlockNavigationOnMutation = debounceJS(blockNavigation, 500, false);
const debounceBlockNavigationOnTransition = debounceJS(blockNavigation, 50, false);

document.addEventListener('DOMContentLoaded', () => {
  blockNavigation();

  // nytimes has a delayed-appended pre-footer section
  const observer = new MutationObserver((m, o) => {
    debounceBlockNavigationOnMutation();
  });
  observer.observe(document.body, {
    attributes: false,
    childList: true,
    subtree: true,
    characterData: false,
  });
});

document.addEventListener('transitionend', () => {
  debounceBlockNavigationOnTransition();
})
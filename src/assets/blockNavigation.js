const onKeydownCallback = (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
  }
};

const blockNavigation = () => {
  const { urlToProxy } = window.PDFTron;
  const pageHeight = getPageHeight();
  const pageWidth = 1440;
  const { origin } = new URL(window.location);

  // if (!document.querySelector('[data-pdftron="pdftron-main-popup"]')) {
  //   let mainPopup = document.createElement('div');
  //   mainPopup.setAttribute('data-pdftron', 'pdftron-main-popup');
  //   document.body.appendChild(mainPopup);
  // }

  // block navigation for suspicious <a> that don't have href or empty href: stubbing onclick
  // block navigation for all a tags that don't start with #
  document.querySelectorAll('a:not([href]), a[href=""], a[href]:not([href^="#"]):not([href="javascript: void(0)"])').forEach((elem) => {
    // in subsequent debouncing, make sure to only run this for new <a>
    if (elem.dataset.pdftron !== 'pdftron') {
      // set this attibute to identify if <a> href has been modified
      elem.setAttribute('data-pdftron', 'pdftron');

      if (elem.href) {
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
      if (!elChildNodes.some((childEL) => childEL.nodeType === Node.ELEMENT_NODE && childEL.dataset.pdftron === 'pdftron-link-popup')) {
        elem.style.position = 'relative';

        const div = document.createElement('div');
        div.setAttribute('data-pdftron', 'pdftron-link-popup');
        div.innerHTML = `<span style="color:black">URL: </span>${elem.getAttribute('href')}`;

        const {
          x: elBoundingRectX,
          y: elBoundingRectY,
          height: elBoundingRectHeight
        } = elem.getBoundingClientRect();
        if ((elBoundingRectY + elBoundingRectHeight + 200) > pageHeight) {
          // if the popup is not visible in the viewport then append on the top of the <a> tag
          div.style.bottom = `${elBoundingRectHeight}px`;
        } else {
          div.style.top = `${elBoundingRectHeight}px`;
        }
        if ((elBoundingRectX + 450) > pageWidth) {
          div.style.right = 0;
        } else {
          div.style.left = 0;
        }

        // let mainPopup = document.querySelector('[data-pdftron="pdftron-main-popup"]');

        elem.appendChild(div);
        elem.onmouseenter = async () => {
          // mainPopup.innerHTML = div.innerHTML;
          div.style.display = 'block';
          // const { top, left, bottom, right } = div.getBoundingClientRect();
          // mainPopup.style.top = `${top}px`;
          // mainPopup.style.left = `${left}px`;
          // mainPopup.style.display = 'block';
          // mainPopup.style.bottom = `${bottom}px`;
          // mainPopup.style.right = `${right}px`;
          if (div.dataset.pdftronpreview !== 'pdftron-link-fullpreview') {
            try {
              const linkPreviewRes = await fetch(`${origin}/pdftron-link-preview?url=${elem.getAttribute('href')}`);
              if (linkPreviewRes.status !== 400) {
                const linkPreviewResJson = await linkPreviewRes.json();
                const { faviconUrl, pageTitle, metaDescription } = linkPreviewResJson;
                div.setAttribute('data-pdftronpreview', 'pdftron-link-fullpreview');
                const faviconDiv = faviconUrl ? `<img class="link-preview-favicon" style="margin-right: 5px; margin-bottom: 2px;" width="20" src="${faviconUrl}">` : '';
                const metaDiv = metaDescription ? `<div style="color: black; margin-top: 5px;">${metaDescription}</div>` : '';
                div.innerHTML = `
                  <span style="color: black">URL: </span>${elem.getAttribute('href')}
                  <div style="display: flex; align-items: center; margin-top: 5px; color: black;">${faviconDiv}${pageTitle}</div>
                  ${metaDiv}
                `;
                // mainPopup.innerHTML = div.innerHTML;
              }
            } catch (e) {
              console.error(e);
            }
          }
          div.scrollIntoViewIfNeeded();
        };

        elem.onmouseleave = () => {
          div.style.display = 'none';
          // mainPopup.style.display = 'none';
        };
      }
    }
  });

  // for all a tags that start with #, copy to data-href for WV link annotation
  document.querySelectorAll('a[href^="#"]').forEach((elem) => {
    if (elem.dataset.pdftron !== 'pdftron') {
      elem.setAttribute('data-pdftron', 'pdftron');
      elem.setAttribute('data-href', elem.getAttribute('href'));
    }
  });

  // for keyboard tabbing
  document.querySelectorAll('a, button, [role="button"], input').forEach((elem) => elem.setAttribute('tabindex', -1));

  document.querySelectorAll('input').forEach((elem) => {
    if (!elem.readOnly) {
      elem.readOnly = true;
      // for amazon search input keypress enter
      elem.onkeydown = onKeydownCallback;
    }
  });

  // for wikipedia <select> language keypress enter
  document.querySelectorAll('select').forEach((elem) => {
    elem.onkeydown = onKeydownCallback;
  });
};

const debounceBlockNavigationOnMutation = debounceJS(blockNavigation, 500, false);
const debounceBlockNavigationOnTransition = debounceJS(blockNavigation, 50, false);

document.addEventListener('DOMContentLoaded', () => {
  blockNavigation();

  // nytimes has a delayed-appended pre-footer section
  const observer = new MutationObserver(() => {
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
});
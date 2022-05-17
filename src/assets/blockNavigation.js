const onKeydownCallback = (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
  }
};

const isURLAbsolute = (url) => {
  return url.indexOf('://') > 0 || url.indexOf('//') === 0;
};

const blockNavigation = () => {
  const { urlToProxy } = window.PDFTron;
  const pageHeight = getPageHeight();
  const pageWidth = 1440;
  const { origin } = new URL(window.location);

  // block navigation for suspicious <a> that don't have href or empty href: stubbing onclick
  // block navigation for all a tags that don't start with #
  document.querySelectorAll(`
      a:not([href]), 
      a[href=""], 
      a[href]:not([href^="#"]):not([href^="tel:"]):not([href^="sms:"]):not([href^="mailto:"]):not([href^="javascript:"])
    `).forEach((elem) => {
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

    if (isURLAbsolute(elem.href) && elem.hasChildNodes()) {
      const elChildNodes = Array.from(elem.childNodes);
      // check if childNodes has some that is an element and doesn't have data-pdftron
      if (!elChildNodes.some((childEL) => childEL.nodeType === Node.ELEMENT_NODE && childEL.dataset.pdftron === 'pdftron-link-popup')) {
        elem.style.position = 'relative';

        const div = document.createElement('div');
        div.setAttribute('data-pdftron', 'pdftron-link-popup');
        div.innerHTML = `<div dir="ltr">URL: <span style="color: #00a5e4">${elem.getAttribute('href')}</span></div>`;

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
        if ((elBoundingRectX + 500) > pageWidth) {
          div.style.right = 0;
        } else {
          div.style.left = 0;
        }

        elem.appendChild(div);
        let undoOverflow;

        elem.onmouseenter = async () => {
          const undoFunctions = [];
          const traverseToParentWithOverflowHidden = (targetElement) => {
            const parentElement = targetElement.parentElement;
            if (parentElement && parentElement.nodeType === Node.ELEMENT_NODE) {
              const parentStyle = window.getComputedStyle(parentElement);

              if (!parentElement || parentElement === document.body) {
                return;
              }

              if (parentStyle.overflow === 'hidden') {
                if (!parentElement.style.getPropertyValue('overflow')) {
                  // if getPropertyValue is empty then the value comes from a stylesheet, just need to remove the newly set property
                  undoFunctions.push(() => parentElement.style.removeProperty('overflow'));
                } else {
                  // if there's important in the value then reset it as is
                  if (!parentElement.style.getPropertyPriority('overflow')) {
                    undoFunctions.push(() => parentElement.style.setProperty('overflow', 'hidden'));
                  } else {
                    undoFunctions.push(() => parentElement.style.setProperty('overflow', 'hidden', 'important'));
                  }
                }
                parentElement.style.setProperty('overflow', 'visible', 'important');
              }

              traverseToParentWithOverflowHidden(parentElement);
            }

            return () => {
              undoFunctions.forEach((func) => func());
            };
          };

          undoOverflow = traverseToParentWithOverflowHidden(div);

          div.style.display = 'block';
          if (div.dataset.pdftronpreview !== 'pdftron-link-fullpreview') {
            try {
              const linkPreviewRes = await fetch(`${origin}/pdftron-link-preview?url=${elem.getAttribute('href')}`);
              if (linkPreviewRes.status !== 400) {
                const linkPreviewResJson = await linkPreviewRes.json();
                const { faviconUrl, pageTitle, metaDescription } = linkPreviewResJson;
                div.setAttribute('data-pdftronpreview', 'pdftron-link-fullpreview');
                const faviconDiv = faviconUrl ? `<img class="link-preview-favicon" style="margin-inline-end: 5px; margin-bottom: 2px;" width="20" src="${faviconUrl}">` : '';
                const metaDiv = metaDescription ? `<div style="margin-top: 5px;">${metaDescription}</div>` : '';
                const noInformationDiv = !faviconUrl && !pageTitle && !metaDiv ? '<div style="font-style: italic;">No information was retrieved from this URL</div' : '';
                div.innerHTML = `
                  <div dir="ltr">URL: <span style="color: #00a5e4 !important">${elem.getAttribute('href')}</span></div>
                  <div style="display: flex; flex-flow: row nowrap; align-items: center; margin-top: 5px;">${faviconDiv}${pageTitle}</div>
                  ${metaDiv}
                  ${noInformationDiv}
                `;
              }
            } catch (err) {
              console.error('Link preview', elem.getAttribute('href'), err);
            }
          }
        };

        elem.onmouseleave = () => {
          div.style.display = 'none';
          if (typeof undoOverflow === 'function') {
            undoOverflow();
          }
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
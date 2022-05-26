const onKeydownCallback = (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
  }
};

const isURLAbsolute = (url) => {
  return url.indexOf('://') > 0 || url.indexOf('//') === 0;
};

/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-unused-vars */
const copyOnClick = async (button, url) => {
  try {
    await navigator.clipboard.writeText(url);
    button.dataset.title = 'Link Copied';
  } catch (err) {
    button.dataset.title = 'Error Copying';
  }
};

const faviconEmptySpan = () => {
  const emptySpan = document.createElement('span');
  emptySpan.className = 'pdftron-link-favicon-empty';
  return emptySpan;
};

const faviconEmptyString = '<span class="pdftron-link-favicon-empty"></span>';

const successLoadingImage = (img) => {
  img.previousSibling.remove();
  img.style.display = 'block';
};

const getHostName = (hostname) => {
  if (!hostname) {
    return '';
  }
  if (hostname.startsWith('www.')) {
    return hostname.split('www.')[1];
  }
  return hostname;
};

const popupDefaultInnerHTML = (faviconString, pageTitle, href) => {
  return `
    <div dir="ltr" title="" style="display: flex; flex-flow: row nowrap; align-items: center;">
      ${faviconString}
      <a class="pdftron-link-title" data-pdftron="pdftron" onclick="window.open('${href}');">${pageTitle}</a>
      <button data-title="&nbsp;Copy Link&nbsp;" class="pdftron-link-button-copy" onclick="copyOnClick(this, '${href}');" onmouseleave="this.dataset.title='&nbsp;Copy Link&nbsp;'">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path d="M12.6 0H5.6C4.8279 0 4.2 0.6279 4.2 1.4V4.2H1.4C0.6279 4.2 0 4.8279 0 5.6V12.6C0 13.3721 0.6279 14 1.4 14H8.4C9.1721 14 9.8 13.3721 9.8 12.6V9.8H12.6C13.3721 9.8 14 9.1721 14 8.4V1.4C14 0.6279 13.3721 0 12.6 0ZM1.4 12.6V5.6H8.4L8.4014 12.6H1.4ZM12.6 8.4H9.8V5.6C9.8 4.8279 9.1721 4.2 8.4 4.2H5.6V1.4H12.6V8.4Z" />
        </svg>
      </button>
    </div>`;
};

const setPopupPosition = (linkElem, popupElem) => {
  const {
    x: elBoundingRectX,
    y: elBoundingRectY,
    height: elBoundingRectHeight
  } = linkElem.getBoundingClientRect();
  // popup maximum height is ~110px (depends on the font-family)
  if ((elBoundingRectY + elBoundingRectHeight + 120) > getPageHeight()) {
    // if the popup is not visible in the viewport then append on the top of the <a> tag
    popupElem.style.bottom = `${elBoundingRectHeight - 2}px`;
  } else {
    popupElem.style.top = `${elBoundingRectHeight - 2}px`;
  }
  if ((elBoundingRectX + 260) > window.innerWidth) {
    popupElem.style.right = 0;
  } else {
    popupElem.style.left = 0;
  }
};

const resetElemStyle = (el, key, value) => {
  if (value) {
    el.style.setProperty(key, value);
  } else {
    el.style.removeProperty(key);
  }
};

const blockNavigation = () => {
  const { urlToProxy } = window.PDFTron;
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

      // if href doesn't exist, use elem.href will not throw errors
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

    // after href has already been modified
    const elementHref = elem.getAttribute('href');

    if (isURLAbsolute(elem.href) && elem.hasChildNodes()) {
      const elChildNodes = Array.from(elem.childNodes);
      // check if childNodes has some that is an element and doesn't have data-pdftron
      if (!elChildNodes.some((childEL) => childEL.nodeType === Node.ELEMENT_NODE && childEL.dataset.pdftron === 'pdftron-link-popup')) {
        const popupContainer = document.createElement('div');
        popupContainer.setAttribute('data-pdftron', 'pdftron-link-popup');
        popupContainer.className = 'pdftron-link-popup-outer';
        popupContainer.innerHTML = `
          <div class="pdftron-link-popup-inner">
            ${popupDefaultInnerHTML(faviconEmptyString, elementHref, elementHref)}
          </div>
        `;

        elem.appendChild(popupContainer);
        let undoOverflow;
        let intersectionobserver;
        let elemOriginalStyles = [];
        let undoFunctions = [];

        const traverseToParentWithOverflowHidden = (targetElement) => {
          const parentElement = targetElement?.parentElement;
          if (parentElement && parentElement.nodeType === Node.ELEMENT_NODE) {
            const parentStyle = window.getComputedStyle(parentElement);

            if (!parentElement || parentElement === document.body) {
              return;
            }

            if (parentStyle.overflowY === 'hidden') {
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

        const callbackIO = (entries) => {
          entries.forEach((entry) => {
            if (entry.target === popupContainer) {
              // on mouseenter, if the popup is displayed block and hidden, this intersectionRatio < 1 will happen and makes the hidden parents visible
              if (entry.intersectionRatio < 1 && entry.target.style.display === 'block') {
                // start recursively traversing from parent of <a>, issue with https://www.keytrudahcp.com
                undoOverflow = traverseToParentWithOverflowHidden(popupContainer.parentElement);
              }

              // on mouseleave, the popup is displayed none, this triggers the callback, and gives an intersectionRatio of 0. Only entry.intersectionRatio === 0 will happen
              if (entry.intersectionRatio === 0 && typeof undoOverflow === 'function') {
                undoOverflow();
              }
            }
          });
        };

        elem.onmouseenter = async () => {
          // save the original styles (if exist) and remove/revert them onmouseleave
          // https://www.roadandtrack.com/car-culture/a38378639/mate-rimac-profile/
          elemOriginalStyles = [
            { key: 'position', value: elem.style.position },
            { key: 'top', value: elem.style.top },
            { key: 'left', value: elem.style.left },
            { key: 'overflow', value: elem.style.overflow },
          ];
          elem.style.setProperty('position', 'relative', 'important');
          elem.style.top = 'initial';
          elem.style.left = 'initial';
          elem.style.setProperty('overflow', 'visible', 'important');

          // if <a> is displayed none at first (hidden menu), getBoundingClientRect will be updated once <a> is visible, so check inside onmouseenter
          setPopupPosition(elem, popupContainer);
          popupContainer.style.display = 'block';

          // reset undoFunctions on mouseenter
          undoFunctions = [];

          if (!intersectionobserver) {
            intersectionobserver = new IntersectionObserver(callbackIO, {
              root: null,
              rootMargin: '0px',
              threshold: [0, 1]
            });
            intersectionobserver.observe(popupContainer);
          }

          if (popupContainer.dataset.pdftronpreview !== 'pdftron-link-fullpreview') {
            try {
              const linkPreviewRes = await fetch(`${origin}/pdftron-link-preview?url=${elementHref}`);
              const { hostname } = new URL(elementHref);
              if (linkPreviewRes.status !== 400) {
                const linkPreviewResJson = await linkPreviewRes.json();
                const { faviconUrl, pageTitle, metaDescription } = linkPreviewResJson;
                popupContainer.setAttribute('data-pdftronpreview', 'pdftron-link-fullpreview');
                const faviconDiv = faviconUrl ? `${faviconEmptyString}<img class="pdftron-link-favicon" width="20" src="${faviconUrl}" onload="successLoadingImage(this);">` : faviconEmptyString;
                const hostNameDiv = pageTitle ? `<div style="color: #868E96 !important; margin-top: 4px;">${getHostName(hostname)}</div>` : '';
                const metaDiv = metaDescription ? `<div class="pdftron-link-meta">${metaDescription}</div>` : '';
                popupContainer.innerHTML = `
                  <div class="pdftron-link-popup-inner">
                    ${popupDefaultInnerHTML(faviconDiv, pageTitle || elementHref, elementHref)}
                    <div style="margin-left: 24px;">
                      ${hostNameDiv}
                      ${metaDiv}
                    </div>
                  </div>
                `;

                // by default, clicking on the popup will be the same as clicking on the <a>
                popupContainer.onclick = ((e) => e.preventDefault());
              }
            } catch (err) {
              console.error('Link preview', elementHref, err);
            }
          }
        };

        elem.onmouseleave = () => {
          popupContainer.style.display = 'none';
          elemOriginalStyles.forEach((style) => resetElemStyle(elem, style.key, style.value));
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
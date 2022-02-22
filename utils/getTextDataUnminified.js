const getTextData = (body) => {
  const getSelectionData = (pageBody) => {
    const struct = [0];
    const offsets = [];
    const quads = [];
    const str = traverseTextNode(pageBody, struct, offsets, quads, "");

    return { struct, str, offsets, quads };
  }

  const traverseTextNode = (parentNode, struct, offsets, quads, str) => {
    const range = document.createRange();
    parentNode.childNodes.forEach(child => {
      if (isInvalidNode(child))
        return;
      if (child.nodeType === Node.TEXT_NODE) {
        const cText = child.textContent;
        const cTextLength = cText.length;
        const isValidText = Array.from(cText).filter(c => !(c === '\n' || c === ' ' || c === '\t')).length > 0;
        if (cTextLength === 0 || !isValidText)
          return;

        const cQuads = [];
        const origQuadsOffset = quads.length / 8;
        const lines = [];
        let canAppendWord = false;
        let lineBreakCount = 0;

        for (let i = 0; i < cTextLength; i++) {
          // quads
          range.setStart(child, i);
          range.setEnd(child, i + 1);
          const { bottom, top, left, right } = range.getBoundingClientRect();
          cQuads.push(left, bottom, right, bottom, right, top, left, top);
          // offsets
          const curChar = cText[i];
          if (curChar === ' ') {
            offsets.push(-1);
          } else if (curChar === '\n') {
            offsets.push(-2);
          } else {
            offsets.push(offsets.length * 2);
          }
          // Build lines
          if (curChar === ' ' || curChar === '\n') {
            canAppendWord = false;
            str += curChar;
            continue;
          }
          const j = i + lineBreakCount;
          if (lines.length === 0 || Math.abs(cQuads[8 * (j - 1) + 1] - cQuads[8 * j + 1]) > 0.1) {
            // Add extra line break if needed
            if (lines.length !== 0) {
              const prevChar = cText[i - 1];
              if (!(prevChar === ' ' || prevChar === '\n')) {
                str += '\n';
                cQuads.push(...cQuads.slice(-8));
                offsets.push(offsets[offsets.length - 1]);
                offsets[offsets.length - 2] = -2;
                lineBreakCount++;
              }
            }
            // Create new line
            lines.push([[i + lineBreakCount]]);
            canAppendWord = true;
          } else {
            const words = lines[lines.length - 1];
            if (canAppendWord) {
              // Append to last word
              words[words.length - 1].push(j);
            } else {
              // Create new word
              words.push([j]);
              canAppendWord = true;
            }
          }
          str += curChar;
        }

        quads.push(...cQuads);

        // Add extra line break if needed
        const lastChar = cText[cTextLength - 1];
        if (!(lastChar === ' ' || lastChar === '\n')) {
          str += '\n';
          quads.push(...quads.slice(-8));
          offsets.push(-2);
        }

        // struct
        const lineCount = lines.length;
        struct[0] += lineCount;
        for (let i = 0; i < lineCount; i++) {
          const words = lines[i];
          const startWord = words[0];
          const endWord = words[words.length - 1];
          const lineStart = startWord[0];
          const lineEnd = endWord[endWord.length - 1];
          struct.push(
            words.length,
            0,
            cQuads[8 * lineStart],
            cQuads[8 * lineStart + 1],
            cQuads[8 * lineEnd + 4],
            cQuads[8 * lineEnd + 5]
          );
          for (let j = 0; j < words.length; j++) {
            const word = words[j];
            const wordLen = word.length;
            const wordStart = word[0];
            const wordEnd = word[wordLen - 1];
            struct.push(
              wordLen,
              wordStart + origQuadsOffset,
              wordLen,
              cQuads[8 * wordStart],
              cQuads[8 * wordEnd + 2]
            );
          }
        }
      } else {
        // https://stackoverflow.com/a/21696585
        if (child.nodeType == Node.ELEMENT_NODE) {
          const style = window.getComputedStyle(child);
          if (style.display == 'none' || style.visibility == 'hidden' || style.opacity == 0)
            return;
        }
        str = traverseTextNode(child, struct, offsets, quads, str);
      }
    });
    return str;
  }

  return getSelectionData(body);
}

const isInvalidNode = (node) => {
  return (!node) || (node.getBoundingClientRect && (node.getBoundingClientRect().width === 0 || node.getBoundingClientRect().height === 0));
}

// const getLinks = (pageBody) => {
//   const linksArray = [];

//   const traverseLinkNode = (parentNode, linksArray) => {
//     parentNode.childNodes.forEach(child => {
//       if (isInvalidNode(child))
//         return;
//       if (child.tagName === 'A' && !!child.href) {
//         const clientRect = child.getBoundingClientRect();
//         linksArray.push({ clientRect, href: child.getAttribute('href') });
//       } else {
//         traverseLinkNode(child, linksArray);
//       }
//     });
//     return linksArray;
//   }

//   return traverseLinkNode(pageBody, linksArray);
// }

const getHeight = () => {
  let pageHeight = Math.min(Math.max(document.documentElement.clientHeight, document.documentElement.scrollHeight), Math.max(document.body.scrollHeight, document.body.clientHeight));

  const findHighestNode = (nodesList) => {
    for (let i = nodesList.length - 1; i >= 0; i--) {
      if (nodesList[i].scrollHeight && nodesList[i].clientHeight) {
        let elHeight = Math.max(nodesList[i].scrollHeight, nodesList[i].clientHeight);
        pageHeight = Math.max(elHeight, pageHeight);
      }
      if (nodesList[i].childNodes.length)
        findHighestNode(nodesList[i].childNodes);
    }
  }
  findHighestNode(document.body.childNodes);
  return pageHeight;
}

const getClientUrl = () => {
  const { origin } = new URL(document.referrer);
  return origin;
}

const sendDataToClient = () => {
  const selectionData = getTextData(document.body);
  const iframeHeight = getHeight();
  // console.log('iframeHeight', iframeHeight)
  // const linkData = getLinks(document.body);
  window.parent.postMessage({ selectionData, iframeHeight }, getClientUrl());
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
const debounceSendDataWithLeading = debounceJS(sendDataToClient, 500, true);
const debounceSendDataNoLeading = debounceJS(sendDataToClient, 50, false);

window.addEventListener('message', e => {
  if (e.origin == getClientUrl() && e.data == 'loadTextData') {
    // console.log('send from loadTextData')
    sendDataToClient();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  sendDataToClient();

  const observer = new MutationObserver((m, o) => {
    console.log('------------MutationObserver---------')
    debounceSendDataWithLeading();
  });
  observer.observe(document.body, {
    attributes: true,
    childList: true,
    subtree: true,
    characterData: true,
  });
});

window.addEventListener('load', () => {
  // fix for https://www.mdlottery.com/about-us/legal-information/
  // if always change html.height to initial, layout will break on google.com
  if (document.documentElement.style.height == '100%') {
    document.documentElement.style.height = 'initial';
  }
});

document.addEventListener('transitionend', () => {
  console.log('------------transitionend---------')
  debounceSendDataNoLeading();
})

// NOTES:
// https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage
// targetWindow to call postMessage: A reference to the window that will receive the message, basically don't call it on the current window
// window.parent returns the parent frame, in this case WV iframe
// window.top returns the outermost frame, in this case the host page
// e.source from eventListener "message" is, surprisingly not WV iframe but the host page, window.top, if console.log(e.source == window.top) returns true and (e.source == window.parent) returns false
// we should use window.parent.postMessage() instead of e.source.postMessage() to communicate back to WV-HTML. This way we can addEventListener "message" on instance.iframeWindow instead of window
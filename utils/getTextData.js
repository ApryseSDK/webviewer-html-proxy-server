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

const getLinks = (pageBody) => {
  const linksArray = [];

  const traverseLinkNode = (parentNode, linksArray) => {
    parentNode.childNodes.forEach(child => {
      if (isInvalidNode(child))
        return;
      if (child.nodeType == Node.ELEMENT_NODE) {
        const style = window.getComputedStyle(child);
        if (style.display == 'none' || style.visibility == 'hidden' || style.opacity == 0)
          return;
      }
      if (child.tagName === 'A' && !!child.getAttribute('data-href')) {
        const clientRect = child.getBoundingClientRect();
        linksArray.push({ clientRect, href: child.getAttribute('data-href') });
      } else {
        traverseLinkNode(child, linksArray);
      }
    });
    return linksArray;
  }

  return traverseLinkNode(pageBody, linksArray);
}

const getPageHeight = () => {
  let sum = 0;
  document.body.childNodes.forEach(el => {
    // some elements have undefined clientHeight
    // favor scrollHeight since clientHeight does not include padding
    // some hidden/collapsible elements have clientHeight 0 but positive scrollHeight
    if (!isNaN(el.clientHeight))
      sum += (el.clientHeight > 0 ? (el.scrollHeight || el.clientHeight) : el.clientHeight);
  });
  return sum;

}

const getClientUrl = () => {
  const { origin } = new URL(document.referrer);
  return origin;
}

const sendDataToClient = () => {
  const selectionData = getTextData(document.body);
  const linkData = getLinks(document.body);
  const iframeHeight = getPageHeight();
  console.log('--- send data to HTML')
  window.parent.postMessage({ selectionData, linkData, iframeHeight }, getClientUrl());
}

const debounceSendDataWithLeading = debounceJS(sendDataToClient, 500, false);
const debounceSendDataNoLeading = debounceJS(sendDataToClient, 50, false);

window.addEventListener('message', e => {
  if (e.origin == getClientUrl() && e.data == 'loadTextData') {
    sendDataToClient();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  sendDataToClient();

  const observer = new MutationObserver((m, o) => {
    debounceSendDataWithLeading();
  });
  observer.observe(document.body, {
    attributes: true,
    childList: true,
    subtree: true,
    characterData: true,
  });
});

document.addEventListener('transitionend', () => {
  debounceSendDataNoLeading();
})

// e.source from eventListener "message" is the host page, window.top
// use window.parent.postMessage() instead of e.source.postMessage() to communicate back to WV
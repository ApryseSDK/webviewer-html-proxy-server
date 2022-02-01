const getTextData = page => {
  return page.evaluate(() => {
    const getSelectionData = (pageBody) => {
      const struct = [0];
      const offsets = [];
      const quads = [];
      const str = traverseTextNode(pageBody, struct, offsets, quads, "");

      return { struct, str, offsets, quads };
    }

    const isInvalidNode = (node) => {
      return (!node) || (node.getBoundingClientRect && (node.getBoundingClientRect().width === 0 || node.getBoundingClientRect().height === 0));
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

    return getSelectionData(document.getElementsByTagName('body')[0]);
  });
}

module.exports = getTextData;
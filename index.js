const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const puppeteer = require('puppeteer');

function createServer(SERVER_ROOT, PORT) {
  console.log('createServer', SERVER_ROOT, PORT);

  const app = express();
  app.use(cors());

  const PATH = `${SERVER_ROOT}:${PORT}`;

  const isValidURL = (url) => {
    // eslint-disable-next-line no-useless-escape
    return /(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/gi.test(url);
  }

  const getHostPortSSL = (url) => {
    const parsedHost = url.split('/').splice(2).splice(0, 1).join('/')
    let parsedPort;
    let parsedSSL;
    if (url.startsWith('https://')) {
      parsedPort = 443;
      parsedSSL = https;
    } else if (url.startsWith('http://')) {
      parsedPort = 80;
      parsedSSL = http;
    }
    return {
      parsedHost,
      parsedPort,
      parsedSSL,
    }
  }

  const isUrlAbsolute = (url) => (url.indexOf('://') > 0 || url.indexOf('//') === 0);
  const isUrlNested = (url) => {
    let nested = url.split('/').splice(3);
    if (nested.length > 0 && nested[0] != '') {
      return true;
    }
    return false;
  }

  const defaultViewport = { width: 1680, height: 1050 };
  var url;
  var dimensions;
  var urlExists;
  var selectionData;

  var browser;
  var page;

  app.get('/pdftron-proxy', async function (req, res, next) {
    // this is the url retrieved from the input
    url = req.query.url;
    // reset urlExists
    urlExists = undefined;
    // ****** first check for human readable URL with simple regex
    if (!isValidURL(url)) {
      // send a custom code here so client can catch this 
      res.status(999).send({ data: 'Please enter a valid URL and try again.' });
    } else {
      console.log('\x1b[31m%s\x1b[0m', `
        ***********************************************************************
        ************************** NEW REQUEST ********************************
        ***********************************************************************
      `);

      if (!browser || !browser.isConnected()) {
        browser = await puppeteer.launch({
          product: 'chrome',
          defaultViewport,
          headless: true,
          ignoreHTTPSErrors: true,
        });

        page = await browser.newPage();
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
      }

      // ****** second check for puppeteer being able to goto url
      try {
        urlExists = await page.goto(url, {
          // use 'domcontentloaded' https://github.com/puppeteer/puppeteer/issues/1666
          waitUntil: 'domcontentloaded',
        });
        // Get the "viewport" of the page, as reported by the page.
        dimensions = await page.evaluate(() => {
          return {
            width: document.body.scrollWidth || document.body.clientWidth,
            height: document.body.scrollHeight || document.body.clientHeight,
          };
        });
        // next("router") pass control to next route and strip all req.query, if queried url contains nested route this will be lost in subsequest requests
        console.log('urlExists', urlExists.url())
        next();
      } catch (err) {
        console.log('/pdftron-proxy', err);
        res.status(999).send({ data: 'Please enter a valid URL and try again.' });
      }

      // await browser.close();
    }
  });

  // need to be placed before app.use('/');
  app.get('/pdftron-text-data', async (req, res) => {
    try {
      await page.goto(`${PATH}`, {
        waitUntil: 'domcontentloaded', // 'networkidle0',
      });

      // see if it makes a difference on production
      await page.waitForTimeout(3000);

      selectionData = await page.evaluate(() => {
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
              str = traverseTextNode(child, struct, offsets, quads, str);
            }
          });
          return str;
        }

        return getSelectionData(document.getElementsByTagName('body')[0]);
      });

      res.send(selectionData);
    } catch (err) {
      console.log('/pdftron-text-data', err);
      res.status(400).end();
      // } finally {
      // to maintain one browser open, to be monitored
      // await browser.close();
    }
  });

  // need to be placed before app.use('/');
  app.get('/pdftron-download', async (req, res) => {
    // check again here to avoid server being blown up, tested with saving github
    try {
      await page.goto(`${PATH}`, {
        waitUntil: 'domcontentloaded'
      });
      const buffer = await page.screenshot({ type: 'png', fullPage: true });
      res.send(buffer);
    } catch (err) {
      console.log(err);
      res.status(400).end();
    }
    // await browser.close();
  });

  // TAKEN FROM: https://stackoverflow.com/a/63602976
  app.use('/', function (clientRequest, clientResponse) {
    if (isValidURL(url) && !!urlExists) {
      let validUrl = urlExists.url();
      const {
        parsedHost,
        parsedPort,
        parsedSSL,
      } = getHostPortSSL(validUrl);

      // convert to original url, since clientRequest.url starts from /pdftron-proxy and will be redirected
      if (clientRequest.url.startsWith('/pdftron-proxy')) {
        clientRequest.url = validUrl;
      }

      // if url has nested route then convert to original url to force request it
      // did not work with nested urls from developer.mozilla.org
      // check if nested route cause instagram.com doesn't like this
      if (isUrlNested(url) && clientRequest.url === '/') {
        clientRequest.url = validUrl;
      }

      var options = {
        hostname: parsedHost,
        port: parsedPort,
        path: clientRequest.url,
        method: clientRequest.method,
        headers: {
          'User-Agent': clientRequest.headers['user-agent']
        }
      };
      console.log('hostname', options.hostname, 'path', options.path);

      const callback = (serverResponse, clientResponse) => {
        // Delete 'x-frame-options': 'SAMEORIGIN'
        // so that the page can be loaded in an iframe
        delete serverResponse.headers['x-frame-options'];
        delete serverResponse.headers['content-security-policy'];

        // if a url is blown up, make sure to reset cache-control
        if (!!serverResponse.headers['cache-control'] && /max-age=[^0]/.test(String(serverResponse.headers['cache-control']))) {
          serverResponse.headers['cache-control'] = 'max-age=0';
        }
        var body = '';
        if (String(serverResponse.headers['content-type']).indexOf('text/html') !== -1) {
          serverResponse.on('data', function (chunk) {
            body += chunk;
          });

          serverResponse.on('end', function () {
            // can also send dimensions in clientResponse.setHeader() but for some reason, on client can't read response.headers.get() but it's available in the network tab
            clientResponse.writeHead(serverResponse.statusCode, JSON.stringify(dimensions), serverResponse.headers);
            clientResponse.end(body);
          });
        }
        else {
          serverResponse.pipe(clientResponse, {
            end: true
          });
          // Can be undefined
          if (serverResponse.headers['content-type']) {
            clientResponse.contentType(serverResponse.headers['content-type'])
          }
        }
      }

      var serverRequest = parsedSSL.request(options, serverResponse => {
        console.log('serverResponse', serverResponse.statusCode, serverResponse.headers)
        // This is the case of urls being redirected -> retrieve new headers['location'] and request again
        if (serverResponse.statusCode > 299 && serverResponse.statusCode < 400) {
          var location = serverResponse.headers['location'];
          var parsedLocation = isUrlAbsolute(location) ? location : `https://${parsedHost}${location}`;

          const {
            parsedHost: newParsedHost,
            parsedPort: newParsedPort,
            parsedSSL: newParsedSSL,
          } = getHostPortSSL(parsedLocation);

          var newOptions = {
            hostname: newParsedHost,
            port: newParsedPort,
            path: parsedLocation,
            method: clientRequest.method,
            headers: {
              'User-Agent': clientRequest.headers['user-agent']
            }
          };
          console.log('newhostname', newOptions.hostname, 'newpath', newOptions.path);

          var newServerRequest = newParsedSSL.request(newOptions, newResponse => {
            console.log('new serverResponse', newResponse.statusCode, newResponse.headers)
            callback(newResponse, clientResponse);
          });
          serverRequest.end();
          newServerRequest.end();
          return;
        }

        callback(serverResponse, clientResponse);
      });

      serverRequest.end();
    }
  });


  app.listen(PORT);
  console.log(`Running on ${PATH}`);
};

exports.createServer = createServer;
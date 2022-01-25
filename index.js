const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const puppeteer = require('puppeteer');
const cookieParser = require('cookie-parser');
const getTextData = require('./utils/getTextData');
const URL = require('url').URL

function createServer(SERVER_ROOT, PORT, CORS_OPTIONS = { origin: `${SERVER_ROOT}:3000`, credentials: true }) {
  console.log('createServer', SERVER_ROOT, PORT);

  const app = express();
  app.use(cookieParser());
  app.use(cors(CORS_OPTIONS));

  const PATH = `${SERVER_ROOT}:${PORT}`;

  const isValidURL = (url) => {
    // eslint-disable-next-line no-useless-escape
    return /(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/gi.test(url);
  }

  const getHostPortSSL = (url) => {
    const {
      hostname,
      pathname,
      protocol
    } = new URL(url);
    const parsedHost = hostname;
    let parsedPort;
    let parsedSSL;
    if (protocol == 'https:') {
      parsedPort = 443;
      parsedSSL = https;
    }
    if (protocol == 'http:') {
      parsedPort = 80;
      parsedSSL = http;
    }
    return {
      parsedHost,
      parsedPort,
      parsedSSL,
      pathname,
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
  const puppeteerOptions = {
    product: 'chrome',
    defaultViewport,
    headless: true,
    ignoreHTTPSErrors: true,
  };

  app.get('/pdftron-proxy', async (req, res) => {
    // this is the url retrieved from the input
    let url = req.query.url;
    // ****** first check for human readable URL with simple regex
    if (!isValidURL(url)) {
      res.status(400).send({ errorMessage: 'Please enter a valid URL and try again.' });
    } else {
      console.log('\x1b[31m%s\x1b[0m', `
        ***********************************************************************
        ************************** NEW REQUEST ********************************
        ***********************************************************************
      `);


      // ****** second check for puppeteer being able to goto url
      try {
        const browser = await puppeteer.launch(puppeteerOptions);
        const page = await browser.newPage();
        // page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        const pageHTTPResponse = await page.goto(url, {
          // use 'domcontentloaded' https://github.com/puppeteer/puppeteer/issues/1666
          waitUntil: 'domcontentloaded',
        });
        const validUrl = pageHTTPResponse.url();

        await page.goto(`${validUrl}`, {
          waitUntil: 'domcontentloaded', // 'networkidle0',
        });

        // Get the "viewport" of the page, as reported by the page.
        const pageDimensions = await page.evaluate(() => {
          return {
            width: document.body.scrollWidth || document.body.clientWidth || 1680,
            height: document.body.scrollHeight || document.body.clientHeight || 7000,
          };
        });

        const selectionData = await getTextData(page);

        // cookie will only be set when res is sent succesfully
        res.cookie('validURL', validUrl);
        res.status(200).send({ pageDimensions, selectionData, validUrl });
        await browser.close();

      } catch (err) {
        console.log('/pdftron-proxy', err);
        res.status(400).send({ errorMessage: 'Please enter a valid URL and try again.' });
      }
    }
  });

  // need to be placed before app.use('/');
  app.get('/pdftron-download', async (req, res) => {
    // console.log('/pdftron-download', req.cookies.validURL)
    // console.log('/pdftron-download', req.query.url)
    // check again here to avoid server being blown up, tested with saving github
    try {
      const browser = await puppeteer.launch(puppeteerOptions);
      const page = await browser.newPage();
      // await page.goto(`${PATH}?url=${req.query.url}`, {
      await page.goto(`${req.query.url}`, {
        waitUntil: 'domcontentloaded'
      });
      await page.waitForTimeout(2000);
      const buffer = await page.screenshot({ type: 'png', fullPage: true });
      res.setHeader('Cache-Control', ['no-cache', 'no-store', 'must-revalidate']);
      // buffer is sent as an response then client side consumes this to create a PDF
      // if send as a buffer can't convert that to PDF on client
      res.send(buffer);
      await browser.close();
    } catch (err) {
      console.log(err);
      res.status(400).end();
    }
  });

  // TODO: detect when websites cannot be fetched
  // // TAKEN FROM: https://stackoverflow.com/a/63602976
  app.use('/', (clientRequest, clientResponse) => {
    // console.log('clientRequest in app.use(/)', clientRequest.baseUrl, clientRequest.url)
    // console.log('clientRequest in app.use(/)', clientRequest.cookies.validURL, clientRequest.query.url)
    const validUrl = clientRequest.cookies.validURL;
    if (validUrl) {
      const {
        parsedHost,
        parsedPort,
        parsedSSL,
        pathname
      } = getHostPortSSL(validUrl);

      // if url has nested route then convert to original url to force request it
      // did not work with nested urls from developer.mozilla.org
      // check if nested route cause instagram.com doesn't like this
      if (isUrlNested(validUrl) && clientRequest.url === '/') {
        // Can't use url with https://
        // https://stackoverflow.com/questions/17690803/node-js-getaddrinfo-enotfound?rq=1
        clientRequest.url = pathname;
      }

      const options = {
        hostname: parsedHost,
        port: parsedPort,
        path: clientRequest.url,
        method: clientRequest.method,
        // insecureHTTPParser: true,
        headers: {
          'User-Agent': clientRequest.headers['user-agent'],
        }
      };

      const callback = (serverResponse, clientResponse) => {
        // Delete 'x-frame-options': 'SAMEORIGIN'
        // so that the page can be loaded in an iframe
        // https://stackoverflow.com/questions/36628420/nodejs-request-hpe-invalid-header-token
        // https://stackoverflow.com/questions/56554244/hpe-invalid-header-token-while-trying-to-parse-api-response-using-express-js-rou
        delete serverResponse.headers['set-cookie'];
        delete serverResponse.headers['x-frame-options'];
        delete serverResponse.headers['content-security-policy'];

        // if a url is blown up, make sure to reset cache-control
        if (!!serverResponse.headers['cache-control'] && /max-age=[^0]/.test(String(serverResponse.headers['cache-control']))) {
          serverResponse.headers['cache-control'] = 'max-age=0';
        }
        let body = '';
        // Send html content from the proxied url to the browser so that it can spawn new requests.
        if (String(serverResponse.headers['content-type']).indexOf('text/html') !== -1) {
          serverResponse.on('data', function (chunk) {
            body += chunk;
          });

          serverResponse.on('end', function () {
            clientResponse.writeHead(serverResponse.statusCode, serverResponse.headers);
            clientResponse.end(body);
          });
        } else {
          // Pipe the server response from the proxied url to the browser so that new requests can be spawned for
          // non-html content (js/css/json etc.)
          serverResponse.pipe(clientResponse, {
            end: true,
          });
          // Can be undefined
          if (serverResponse.headers['content-type']) {
            clientResponse.contentType(serverResponse.headers['content-type'])
          }
        }
      }

      const serverRequest = parsedSSL.request(options, serverResponse => {
        // This is the case of urls being redirected -> retrieve new headers['location'] and request again
        if (serverResponse.statusCode >= 300 && serverResponse.statusCode <= 399) {
          const location = serverResponse.headers['location'];
          const parsedLocation = isUrlAbsolute(location) ? location : `https://${parsedHost}${location}`;

          const {
            parsedHost: newParsedHost,
            parsedPort: newParsedPort,
            parsedSSL: newParsedSSL,
          } = getHostPortSSL(parsedLocation);

          const newOptions = {
            hostname: newParsedHost,
            port: newParsedPort,
            path: parsedLocation,
            method: clientRequest.method,
            // insecureHTTPParser: true,
            headers: {
              'User-Agent': clientRequest.headers['user-agent'],
            }
          };

          const newServerRequest = newParsedSSL.request(newOptions, newResponse => {
            callback(newResponse, clientResponse);
          });
          serverRequest.end();
          newServerRequest.end();
        } else {
          callback(serverResponse, clientResponse);
        }
      });

      serverRequest.end();
    }
  });

  app.listen(PORT);
  console.log(`Running on ${PATH}`);
};

exports.createServer = createServer;
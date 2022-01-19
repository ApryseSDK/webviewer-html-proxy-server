const express = require('express');
const session = require('express-session');
const cors = require('cors');
const https = require('https');
const http = require('http');
const puppeteer = require('puppeteer');
const getTextData = require('./utils/getTextData');

function createServer(SERVER_ROOT, PORT, CORS_OPTIONS = { origin: `${SERVER_ROOT}:3000`, credentials: true }) {
  console.log('createServer', SERVER_ROOT, PORT);

  const app = express();
  app.use(cors(CORS_OPTIONS));

  const oneDay = 1000 * 60 * 60 * 24;
  app.use(session({
    secret: "thisismysecret",
    saveUninitialized: true,
    name: 'webviewer_html_sID',
    // proxy: true,
    cookie: {
      httpOnly: true,
      maxAge: oneDay,
      sameSite: true,
      secure: false,
    },
    resave: true
  }));

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
  const puppeteerOptions = {
    product: 'chrome',
    defaultViewport,
    headless: true,
    ignoreHTTPSErrors: true,
  };

  app.get('/pdftron-proxy', async function (req, res, next) {
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
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        const pageHTTPResponse = await page.goto(url, {
          // use 'domcontentloaded' https://github.com/puppeteer/puppeteer/issues/1666
          waitUntil: 'domcontentloaded',
        });

        await page.goto(pageHTTPResponse.url(), {
          waitUntil: 'domcontentloaded', // 'networkidle0',
        });

        const selectionData = await getTextData(page);

        // await page.goto(urlExists().url)
        // Get the "viewport" of the page, as reported by the page.
        const pageDimensions = await page.evaluate(() => {
          return {
            width: document.body.scrollWidth || document.body.clientWidth,
            height: document.body.scrollHeight || document.body.clientHeight,
          };
        });

        console.log('dimensions', pageDimensions)
        req.session.pageDimensions = JSON.stringify(pageDimensions);
        req.session.validUrl = pageHTTPResponse.url();
        req.session.selectionData = JSON.stringify(selectionData);
        // req.session.save(() => console.log(req.session));
        console.log('req.sessionID /proxy', req.sessionID)
        // next("router") pass control to next route and strip all req.query, if queried url contains nested route this will be lost in subsequest requests
        next();
        // res.status(200).send(selectionData);
        await browser.close();
      } catch (err) {
        console.log('/pdftron-proxy', err);
        res.status(400).send({ errorMessage: 'Please enter a valid URL and try again.' });
      }
    }
  });

  // need to be placed before app.use('/');
  // app.get('/pdftron-text-data', async (req, res) => {
  //   console.log('clientRequest session in /pdftron-text-data', req.session)
  //   try {
  //     const browser = await puppeteer.launch(puppeteerOptions);
  //     const page = await browser.newPage();
  //     await page.goto(`${PATH}`, {
  //       waitUntil: 'domcontentloaded', // 'networkidle0',
  //     });
  //     const selectionData = await getTextData(page);
  //     res.send(selectionData);
  //     await browser.close();
  //   } catch (err) {
  //     console.log('/pdftron-text-data', err);
  //     res.status(400).end();
  //     // } finally {
  //     // to maintain one browser open, to be monitored
  //     // await browser.close();
  //   }
  // });

  // need to be placed before app.use('/');
  app.get('/pdftron-download', async (req, res) => {
    // console.log('clientRequest', JSON.stringify(req.cookies))
    // check again here to avoid server being blown up, tested with saving github
    try {
      const browser = await puppeteer.launch(puppeteerOptions);
      const page = await browser.newPage();
      await page.goto(`${PATH}`, {
        waitUntil: 'domcontentloaded'
      });
      const buffer = await page.screenshot({ type: 'png', fullPage: true });
      res.setHeader('Cache-Control', ['no-cache', 'no-store', 'must-revalidate']);
      res.send(buffer);
      await browser.close();
    } catch (err) {
      console.log(err);
      res.status(400).end();
    }
    // await browser.close();
  });

  // TAKEN FROM: https://stackoverflow.com/a/63602976
  app.use('/', function (clientRequest, clientResponse) {
    console.log('clientRequest session in app.use(/)', clientRequest.url)
    // console.log('clientRequest session in app.use(/)', clientRequest.session.pageDimensions)
    // console.log('clientRequest cookie in app.use(/)', clientRequest.cookies)
    let validUrl = clientRequest.session.validUrl;
    let pageDimensions = clientRequest.session.pageDimensions;
    let selectionData = clientRequest.session.selectionData;
    if (validUrl) {
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
      if (isUrlNested(validUrl) && clientRequest.url === '/') {
        clientRequest.url = validUrl;
      }

      const options = {
        hostname: parsedHost,
        port: parsedPort,
        path: clientRequest.url,
        method: clientRequest.method,
        headers: {
          'User-Agent': clientRequest.headers['user-agent'],
        }
      };

      const callback = (serverResponse, clientResponse) => {
        // Delete 'x-frame-options': 'SAMEORIGIN'
        // so that the page can be loaded in an iframe
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
            clientResponse.setHeader('pageDimensions', pageDimensions);
            clientResponse.setHeader('Access-Control-Expose-Headers', 'pageDimensions');
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
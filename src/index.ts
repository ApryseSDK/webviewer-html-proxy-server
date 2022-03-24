// import from node_modules
import express from 'express';
import cors from 'cors';
import puppeteer from 'puppeteer';
import cookieParser from 'cookie-parser';
import type { ClientRequest, IncomingMessage } from 'http';
import type { Request, Response } from 'express';

// import from data types
import type { PageDimensions, ProxyRequestOptions, PuppeteerOptions, ServerConfigurationOptions, Viewport } from './utils/data.js';

// import from utils
import { isValidURL } from './utils/isValidURL';
import { getHostPortSSL } from './utils/getHostPortSSL';

// import raw from assets
// @ts-ignore
import debounceJS from './assets/debounceJS.js';
// @ts-ignore
import sendTextDataScript from './assets/getTextData.js';
// @ts-ignore
import blockNavigationScript from './assets/blockNavigation.js';
// @ts-ignore
import blockNavigationStyle from './assets/blockNavigation.css';

function createServer({
  SERVER_ROOT,
  PORT,
  CORS_OPTIONS = { origin: `http://localhost:3000`, credentials: true },
  COOKIE_SETTING = { sameSite: 'none', secure: true },
  ALLOW_HTTP_PROXY = false
}: ServerConfigurationOptions) {

  const app = express();
  app.use(cookieParser());
  app.use(cors(CORS_OPTIONS));

  const PATH: string = `${SERVER_ROOT}:${PORT}`;

  const defaultViewport: Viewport = { width: 1440, height: 770 };
  const puppeteerOptions: PuppeteerOptions = {
    product: 'chrome',
    defaultViewport,
    headless: true,
    ignoreHTTPSErrors: true,
  };

  app.get('/pdftron-proxy', async (req: Request, res: Response) => {
    // this is the url retrieved from the input
    const url: string = `${req.query.url}`.toLowerCase();
    // ****** first check for malicious URLs
    if (!isValidURL(url, ALLOW_HTTP_PROXY)) {
      res.status(400).send({ errorMessage: 'Please enter a valid URL and try again.' });
    } else {
      // ****** second check for puppeteer being able to goto url
      const browser = await puppeteer.launch(puppeteerOptions);

      try {
        const page = await browser.newPage();
        // page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        const pageHTTPResponse = await page.goto(url, {
          // use 'domcontentloaded' https://github.com/puppeteer/puppeteer/issues/1666
          waitUntil: 'domcontentloaded', // defaults to load
        });
        const validUrl: string = pageHTTPResponse.url();

        // check again if puppeteer's validUrl will pass the test
        if (validUrl !== url && !isValidURL(validUrl, ALLOW_HTTP_PROXY)) {
          res.status(400).send({ errorMessage: 'Please enter a valid URL and try again.' });
        } else {
          // Get the "viewport" of the page, as reported by the page.
          const pageDimensions: PageDimensions = await page.evaluate(() => {
            let sum: number = 0;
            document.body.childNodes.forEach((el: Element) => {
              if (!isNaN(el.clientHeight))
                sum += (el.clientHeight > 0 ? (el.scrollHeight || el.clientHeight) : el.clientHeight);
            });
            return {
              width: document.body.scrollWidth || document.body.clientWidth || 1440,
              height: sum,
            };
          });

          console.log('\x1b[31m%s\x1b[0m', `
          ***********************************************************************
          ********************** NEW REQUEST: ${validUrl}
          ***********************************************************************
        `);

          // cookie will only be set when res is sent succesfully
          const oneHour: number = 1000 * 60 * 60;
          res.cookie('pdftron_proxy_sid', validUrl, { ...COOKIE_SETTING, maxAge: oneHour });
          res.status(200).send({ validUrl, pageDimensions });
        }
      } catch (err) {
        console.error('/pdftron-proxy', err);
        res.status(400).send({ errorMessage: 'Please enter a valid URL and try again.' });
      } finally {
        browser.close();
      }
    }
  });

  // need to be placed before app.use('/');
  app.get('/pdftron-download', async (req: Request, res: Response) => {
    const url = `${req.query.url}`.toLowerCase();
    if (!isValidURL(url, ALLOW_HTTP_PROXY)) {
      res.status(400).send({ errorMessage: 'Please enter a valid URL and try again.' });
    } else {
      console.log('\x1b[31m%s\x1b[0m', `
          ********************** DOWNLOAD: ${url}
    `);
      const browser = await puppeteer.launch(puppeteerOptions);
      try {
        const page = await browser.newPage();
        await page.goto(url, {
          waitUntil: 'domcontentloaded'
        });
        await page.waitForTimeout(2000);
        const buffer = await page.screenshot({ type: 'png', fullPage: true });
        res.setHeader('Cache-Control', ['no-cache', 'no-store', 'must-revalidate']);
        // buffer is sent as an response then client side consumes this to create a PDF
        // if send as a buffer can't convert that to PDF on client
        res.send(buffer);
      } catch (err) {
        console.error('/pdftron-download', err);
        res.status(400).send({ errorMessage: 'Error taking screenshot from puppeteer' });
      } finally {
        browser.close();
      }
    }
  });

  // TODO: detect when websites cannot be fetched
  // // TAKEN FROM: https://stackoverflow.com/a/63602976
  app.use('/', (clientRequest: Request, clientResponse: Response) => {
    const cookiesUrl = clientRequest.cookies.pdftron_proxy_sid;
    // check again for all requests that go through the proxy server
    if (cookiesUrl && isValidURL(cookiesUrl, ALLOW_HTTP_PROXY)) {
      const {
        parsedHost,
        parsedPort,
        parsedSSL,
        pathname
      } = getHostPortSSL(cookiesUrl);

      const options: ProxyRequestOptions = {
        hostname: parsedHost,
        port: parsedPort,
        path: clientRequest.url,
        method: clientRequest.method,
        insecureHTTPParser: true,
        headers: {
          'User-Agent': clientRequest.headers['user-agent'],
          'Referer': `${PATH}${pathname}`,
          'Accept-Encoding': 'identity', // for amazon to work
        }
      };

      const callback = (serverResponse: IncomingMessage, clientResponse: Response) => {
        // Delete 'x-frame-options': 'SAMEORIGIN'
        // so that the page can be loaded in an iframe
        // https://stackoverflow.com/questions/36628420/nodejs-request-hpe-invalid-header-token
        // https://stackoverflow.com/questions/56554244/hpe-invalid-header-token-while-trying-to-parse-api-response-using-express-js-rou
        delete serverResponse.headers['set-cookie'];
        delete serverResponse.headers['x-frame-options'];
        delete serverResponse.headers['content-security-policy'];
        serverResponse.headers['cross-origin-resource-policy'] = 'cross-origin';
        // 'require-corp' works fine on staging but doesn't on localhost: should use 'credentialless'
        serverResponse.headers['cross-origin-embedder-policy'] = 'credentialless';

        // reset cache-control for https://www.keytrudahcp.com
        serverResponse.headers['cache-control'] = 'max-age=0, public, no-cache, no-store, must-revalidate';
        let body: string = '';
        // Send html content from the proxied url to the browser so that it can spawn new requests.
        if (String(serverResponse.headers['content-type']).indexOf('text/html') !== -1) {
          serverResponse.on('data', (chunk: string) => {
            body += chunk;
          });

          serverResponse.on('end', () => {
            const styleTag = `<style type='text/css' id='pdftron-css'>${blockNavigationStyle}</style>`;
            const debounceScript = `<script type='text/javascript' id='pdftron-js'>${debounceJS}</script>`;
            const navigationScript = `<script type='text/javascript'>${blockNavigationScript}</script>`;
            const textScript = `<script type='text/javascript'>${sendTextDataScript}</script>`;

            const headIndex: number = body.indexOf('</head>');
            if (headIndex > 0) {
              if (!/pdftron-css/.test(body)) {
                body = body.slice(0, headIndex) + styleTag + body.slice(headIndex);
              }

              if (!/pdftron-js/.test(body)) {
                // order: debounce first, then blocknavigation (switching all href) then send text/link data since the latter happens over and over again
                body = body.slice(0, headIndex) + debounceScript + navigationScript + textScript + body.slice(headIndex);
              }
            }

            delete serverResponse.headers['content-length'];
            clientResponse.writeHead(serverResponse.statusCode, serverResponse.headers);
            clientResponse.end(body);
          });
        } else {
          // Pipe the server response from the proxied url to the browser so that new requests can be spawned for non-html content (js/css/json etc.)
          serverResponse.pipe(clientResponse, {
            end: true,
          });
          // Can be undefined
          if (serverResponse.headers['content-type']) {
            clientResponse.contentType(serverResponse.headers['content-type'])
          }
        }
      }

      const serverRequest: ClientRequest = parsedSSL.request(options, serverResponse => {
        // No need to check for redirects. Puppeteer will make sure final validURL exists 
        callback(serverResponse, clientResponse);
      });

      serverRequest.end();
    }
  });

  app.listen(PORT);
  console.log(`Running on ${PATH}`);
};

export { createServer };
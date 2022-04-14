// import from node_modules
import express from 'express';
import cors from 'cors';
import puppeteer from 'puppeteer';
import cookieParser from 'cookie-parser';
import type { ClientRequest, IncomingMessage } from 'http';
import type { Request, Response } from 'express';
import { createLogger, format, transports } from 'winston';
import { JSDOM } from 'jsdom';

// import from data types
import type { PageDimensions, ProxyRequestOptions, PuppeteerOptions, ServerConfigurationOptions, Viewport } from './utils/data.js';

// import from utils
import { isValidURL } from './utils/isValidURL';
import { getHostPortSSL } from './utils/getHostPortSSL';
import { isURLAbsolute, getCorrectHref } from './utils/isURLAbsolute';

// import raw from assets
// @ts-ignore
import debounceJS from './assets/debounceJS.js';
// @ts-ignore
import sendTextDataScript from './assets/getTextData.js';
// @ts-ignore
import blockNavigationScript from './assets/blockNavigation.js';
// @ts-ignore
import blockNavigationStyle from './assets/blockNavigation.css';

/**
 * This is a proxy solution to use with WebViewer-HTML that allows loading external HTML web pages so that HTML pages can be annotated.
 * See the npm package on {@link https://www.npmjs.com/package/@pdftron/webviewer-html-proxy-server @pdftron/webviewer-html-proxy-server} for more information.
 * @module @pdftron/webviewer-html-proxy-server
 */

/**
 * Initializes the proxy server to load external HTML pages.
 * @static
 * @alias module:@pdftron/webviewer-html-proxy-server.createServer
 * @param {object} options - The options objects containing SERVER_ROOT, PORT.
 * @param {string} options.SERVER_ROOT
 * Start the server on the specified host and port
 * @param {number} options.PORT
 * Start the server on the specified host and port
 * @param {cors.CorsOptions} [options.CORS_OPTIONS]
 * An object to configure CORS. See {@link https://expressjs.com/en/resources/middleware/cors.html}
 * @param {express.CookieOptions} [options.COOKIE_SETTING]
 * An object to configure COOKIE. See {@link https://expressjs.com/en/api.html#res.cookie}
 * @param {boolean} [options.ALLOW_HTTP_PROXY]
 * Boolean containing value to allow for unsecured HTTP websites to be proxied.
 * @returns {void}
 * @example
 * const HTMLProxyServer = require('@pdftron/webviewer-html-proxy-server');
   HTMLProxyServer.createServer({
    SERVER_ROOT: `http://localhost`,
    PORT: 3100
   });
 */

const createServer = ({
  SERVER_ROOT,
  PORT,
  CORS_OPTIONS = { origin: `${SERVER_ROOT}:3000`, credentials: true },
  COOKIE_SETTING = { sameSite: 'none', secure: true },
  ALLOW_HTTP_PROXY = false
}: ServerConfigurationOptions): void => {
  const { align, colorize, combine, printf, timestamp } = format;
  const logger = createLogger({
    format: combine(
      timestamp({
        format: "YYYY-MM-DD HH:mm:ss"
      }),
      align(),
      printf(
        ({ level, message, label, timestamp }) => `[${timestamp}] ${level}: ${message}`
      ),
      colorize({ all: true }),
    ),
    transports: [
      new transports.Console({
        format: combine(
          colorize()
        ),
      })
    ]
  });

  if (ALLOW_HTTP_PROXY) {
    logger.warn("*** Unsecured HTTP websites can now be proxied. Beware of ssrf attacks. See more here https://brightsec.com/blog/ssrf-server-side-request-forgery/")
  }

  const app = express();
  app.use(cookieParser());
  app.use(cors(CORS_OPTIONS));

  const PATH: string = `${SERVER_ROOT}:${PORT}`;

  const defaultViewport: Viewport = { width: 1440, height: 770 };
  const puppeteerOptions: PuppeteerOptions = {
    product: 'chrome',
    defaultViewport,
    headless: true,
    ignoreHTTPSErrors: false, // whether to ignore HTTPS errors during navigation
  };

  app.get('/pdftron-proxy', async (req: Request, res: Response) => {
    // this is the url retrieved from the input
    const url: string = `${req.query.url}`;
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
          logger.info(`********** NEW REQUEST: ${validUrl}`)

          // cookie will only be set when res is sent succesfully
          const oneHour: number = 1000 * 60 * 60;
          res.cookie('pdftron_proxy_sid', validUrl, { ...COOKIE_SETTING, maxAge: oneHour });
          res.status(200).send({ validUrl });
        }
      } catch (err) {
        logger.error(`Puppeteer ${url}`, err);
        res.status(400).send({ errorMessage: 'Please enter a valid URL and try again.' });
      } finally {
        browser.close();
      }
    }
  });

  // need to be placed before app.use('/');
  app.get('/pdftron-download', async (req: Request, res: Response) => {
    const url = `${req.query.url}`;
    if (!isValidURL(url, ALLOW_HTTP_PROXY)) {
      res.status(400).send({ errorMessage: 'Please enter a valid URL and try again.' });
    } else {
      logger.info(`********** DOWNLOAD: ${url}`);
      const browser = await puppeteer.launch(puppeteerOptions);
      try {
        const page = await browser.newPage();
        await page.goto(url, {
          waitUntil: 'domcontentloaded'
        });
        await page.waitForTimeout(2000);

        // Get the "viewport" of the page, as reported by the page.
        const pageDimensions: PageDimensions = await page.evaluate(() => {
          let sum = 0;
          // for some web pages, <html> and <body> have height: 100%
          // sum up the <body> children's height for an accurate page height
          document.body.childNodes.forEach((el: Element) => {
            if (el.nodeType == Node.ELEMENT_NODE) {
              const style = window.getComputedStyle(el);
              // filter hidden/collapsible elements 
              if (style.display == 'none' || style.visibility == 'hidden' || style.opacity == '0') {
                return;
              }
              // some elements have undefined clientHeight
              // favor scrollHeight since clientHeight does not include padding
              if (!isNaN(el.scrollHeight) && !isNaN(el.clientHeight))
                sum += el.scrollHeight || el.clientHeight;
            }
          });
          return {
            width: document.body.scrollWidth || document.body.clientWidth || 1440,
            height: sum,
          };
        });

        const buffer = await page.screenshot({ type: 'png', fullPage: true });
        res.setHeader('Cache-Control', ['no-cache', 'no-store', 'must-revalidate']);
        res.status(200).send({ buffer, pageDimensions });
      } catch (err) {
        logger.error(`/pdftron-download ${url}`, err);
        res.status(400).send({ errorMessage: 'Error taking screenshot from puppeteer' });
      } finally {
        browser.close();
      }
    }
  });

  // TODO: detect when websites cannot be fetched
  // // TAKEN FROM: https://stackoverflow.com/a/63602976
  app.use('/', (clientRequest: Request, clientResponse: Response) => {
    const cookiesUrl: string = `${clientRequest.cookies.pdftron_proxy_sid}`;
    // check again for all requests that go through the proxy server
    if (cookiesUrl && isValidURL(cookiesUrl, ALLOW_HTTP_PROXY)) {
      const {
        parsedHost,
        parsedPort,
        parsedSSL,
        pathname
      } = getHostPortSSL(cookiesUrl);

      let newHostName = parsedHost;
      let newPath = clientRequest.url;

      let externalURL = clientRequest.url.split('/?pdftron=')[1];
      if (externalURL) {
        const { hostname, href, origin } = new URL(externalURL);
        const hrefWithoutOrigin = href.split(origin)[1] || '';
        newHostName = hostname;
        newPath = hrefWithoutOrigin;
      }

      console.log('clientRequest.url', clientRequest.url, '***', newHostName, '***', newPath)

      const options: ProxyRequestOptions = {
        hostname: newHostName,
        port: parsedPort,
        path: newPath,
        method: clientRequest.method,
        insecureHTTPParser: true,
        rejectUnauthorized: true, // verify the server's identity
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
        const serverResponseContentType = serverResponse.headers['content-type'];
        if (String(serverResponseContentType).indexOf('text/html') !== -1) {
          serverResponse.on('data', function (chunk) {
            body += chunk;
          });

          serverResponse.on('end', () => {
            const virtualDOM = new JSDOM(body);
            const { window } = virtualDOM;
            const { document } = window;
            document.documentElement.style.setProperty('--vh', `${1050 * 0.01}px`);

            document.querySelectorAll("link").forEach(el => {
              const href = el.getAttribute('href');
              // filter only CSS links
              if (el.rel == "stylesheet" || el.type == "text/css" || href.endsWith('.css')) {
                if (!el.dataset.pdftron && isURLAbsolute(href)) {
                  // set this attibute to identify if <link> href has been modified
                  el.setAttribute('data-href', href);

                  const absoluteHref = getCorrectHref(href);
                  try {
                    const { hostname, pathname, href, origin } = new URL(absoluteHref);
                    const hrefWithoutOrigin = href.split(origin)[1] || '';
                    el.setAttribute('data-domain', hostname);
                    // check if same domain with cookiesUrl
                    if (hostname === parsedHost) {
                      el.setAttribute('data-pdftron', 'same-domain');
                      el.setAttribute('href', hrefWithoutOrigin);
                    } else {
                      // external URLs
                      // try on https://gotoadvantage.com/ 
                      el.setAttribute('data-pdftron', 'different-domain');
                      el.setAttribute('href', `${PATH}/?pdftron=${absoluteHref}`);
                    }
                  } catch (e) {
                    logger.error(e)
                  }
                }
              }
            });

            let newBody = virtualDOM.serialize();
            // let newBody = body;

            const styleTag = `<style type='text/css' id='pdftron-css'>${blockNavigationStyle}</style>`;
            const globalVarsScript = `<script type='text/javascript' id='pdftron-js'>window.PDFTron = {}; window.PDFTron.urlToProxy = '${cookiesUrl}';</script>`;
            const debounceScript = `<script type='text/javascript'>${debounceJS}</script>`;
            const navigationScript = `<script type='text/javascript'>${blockNavigationScript}</script>`;
            const textScript = `<script type='text/javascript'>${sendTextDataScript}</script>`;

            const headIndex: number = newBody.indexOf('</head>');
            if (headIndex > 0) {
              if (!/pdftron-css/.test(newBody)) {
                newBody = newBody.slice(0, headIndex) + styleTag + newBody.slice(headIndex);
              }

              if (!/pdftron-js/.test(newBody)) {
                // order: declare global var first, then debounce, then blocknavigation (switching all href) then send text/link data since the latter happens over and over again
                newBody = newBody.slice(0, headIndex) + globalVarsScript + debounceScript + navigationScript + textScript + newBody.slice(headIndex);
              }
            }

            delete serverResponse.headers['content-length'];
            clientResponse.writeHead(serverResponse.statusCode, serverResponse.headers);
            clientResponse.end(newBody);
          });

          serverResponse.on('error', (e) => {
            logger.error(e);
          });

        } else if (String(serverResponseContentType).indexOf('text/css') !== -1) {
          console.log('serverResponse', (serverResponse as any).req.path)
          let cssContent = '';
          serverResponse.on('data', (chunk: string) => cssContent += chunk);

          serverResponse.on('end', () => {
            cssContent = cssContent.replace(/(height:\s*)(.{0,10}[\d\s\)]?)vh/g, '$1calc($2 * var(--vh))');
            // write will only append to existing clientResponse and needed to be piped
            // use writeHead and end for http response
            // use send for express response
            clientResponse.writeHead(serverResponse.statusCode, serverResponse.headers).end(cssContent);
            // clientResponse.set(serverResponse.headers).send(cssContent);
          });

          serverResponse.on('error', (e) => {
            logger.error(`Http request timeout, ${e}`);
          });

        } else {
          // Pipe the server response from the proxied url to the browser so that new requests can be spawned for non-html content (js/css/json etc.)
          serverResponse.pipe(clientResponse, {
            end: true,
          });
          // Can be undefined
          if (serverResponseContentType) {
            clientResponse.contentType(serverResponseContentType)
          }
        }
      }

      const serverRequest: ClientRequest = parsedSSL.request(options, serverResponse => {
        // No need to check for redirects. Puppeteer will make sure final validURL exists 
        callback(serverResponse, clientResponse);
      });

      serverRequest.on('error', (e) => {
        serverRequest.end();
        logger.error(`Http request, ${e}`);
        clientResponse.writeHead(400, {
          'Content-Type': 'text/plain',
          'Cross-Origin-Resource-Policy': 'cross-origin',
          'Cross-Origin-Embedder-Policy': 'credentialless',
        });
        clientResponse.end(`${e}. Please enter a valid URL and try again.`);
      });

      serverRequest.on('timeout', () => {
        serverRequest.end();
        logger.error(`Http request timeout`);
        clientResponse.writeHead(400, {
          'Content-Type': 'text/plain',
          'Cross-Origin-Resource-Policy': 'cross-origin',
          'Cross-Origin-Embedder-Policy': 'credentialless',
        });
        clientResponse.end(`Http request timeout. Please enter a valid URL and try again.`);
      });

      serverRequest.end();
    }
  });

  app.listen(PORT);
  logger.info(`Running on ${PATH}`);
};

export { createServer };
const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const puppeteer = require('puppeteer');
const cookieParser = require('cookie-parser');
const URL = require('url').URL;

function createServer({
  SERVER_ROOT,
  PORT,
  CORS_OPTIONS = { origin: `${SERVER_ROOT}:3000`, credentials: true },
  COOKIE_SETTING = {}
}) {
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

  const defaultViewport = { width: 1440, height: 770 };
  const puppeteerOptions = {
    product: 'chrome',
    defaultViewport,
    headless: true,
    ignoreHTTPSErrors: true,
  };

  app.get('/pdftron-proxy', async (req, res) => {
    // this is the url retrieved from the input
    const url = req.query.url;
    // ****** first check for human readable URL with simple regex
    if (!isValidURL(url)) {
      res.status(400).send({ errorMessage: 'Please enter a valid URL and try again.' });
    } else {
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

        console.log('\x1b[31m%s\x1b[0m', `
          ***********************************************************************
          ********************** NEW REQUEST: ${validUrl}
          ***********************************************************************
        `);

        if (validUrl !== url) {
          await page.goto(`${validUrl}`, {
            waitUntil: 'domcontentloaded', // 'networkidle0',
          });
        }

        // Get the "viewport" of the page, as reported by the page.
        const pageDimensions = await page.evaluate(() => {
          return {
            width: document.body.scrollWidth || document.body.clientWidth || 1440,
            height: document.body.scrollHeight || document.body.clientHeight || 7000,
          };
        });

        // cookie will only be set when res is sent succesfully
        const oneHour = 1000 * 60 * 60;
        res.cookie('pdftron_proxy_sid', validUrl, { ...COOKIE_SETTING, maxAge: oneHour });
        res.status(200).send({ pageDimensions, validUrl });
        await browser.close();

      } catch (err) {
        console.error('/pdftron-proxy', err);
        res.status(400).send({ errorMessage: 'Please enter a valid URL and try again.' });
      }
    }
  });

  // need to be placed before app.use('/');
  app.get('/pdftron-download', async (req, res) => {
    console.log('\x1b[31m%s\x1b[0m', `
          ********************** DOWNLOAD: ${req.query.url}
    `);
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
      console.error('/pdftron-download', err);
      res.status(400).send({ errorMessage: 'Error taking screenshot from puppeteer' });
    }
  });

  // TODO: detect when websites cannot be fetched
  // // TAKEN FROM: https://stackoverflow.com/a/63602976
  app.use('/', (clientRequest, clientResponse) => {
    const validUrl = clientRequest.cookies.pdftron_proxy_sid;
    if (validUrl) {
      const {
        parsedHost,
        parsedPort,
        parsedSSL,
        pathname
      } = getHostPortSSL(validUrl);

      const options = {
        hostname: parsedHost,
        port: parsedPort,
        path: clientRequest.url,
        method: clientRequest.method,
        insecureHTTPParser: true,
        headers: {
          'User-Agent': clientRequest.headers['user-agent'],
          'Referer': `${PATH}${pathname}`,
          'Accept-Encoding': 'identity', // for amazon to work
          'Cross-Origin-Resource-Policy': 'cross-origin',
          'Cross-Origin-Embedder-Policy': 'credentialless',
          'Cache-Control': ['public, no-cache, no-store, must-revalidate'],
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
        // serverResponse.headers['content-security-policy'] = `frame-ancestors 'self' ${CORS_OPTIONS.origin}`;
        serverResponse.headers['cross-origin-resource-policy'] = 'cross-origin';
        serverResponse.headers['cross-origin-embedder-policy'] = 'credentialless';

        // if a url is blown up, make sure to reset cache-control
        if (!!serverResponse.headers['cache-control'] && /max-age=[^0]/.test(String(serverResponse.headers['cache-control']))) {
          serverResponse.headers['cache-control'] = 'max-age=0';
        }
        let body = '';
        // Send html content from the proxied url to the browser so that it can spawn new requests.
        // console.log('serverResponse', serverResponse.req.path);
        if (String(serverResponse.headers['content-type']).indexOf('text/html') !== -1) {
          serverResponse.on('data', function (chunk) {
            body += chunk;
          });

          serverResponse.on('end', function () {
            const styleTag = `<style type="text/css" id="pdftron-css">a:not([role=button]):not([href^='#']):active,button[type=submit]:active{pointer-events:none!important}</style>`;
            const scriptTag = `<script type="text/javascript" id="pdftron-js">window.addEventListener("message",(t=>{if("${CORS_OPTIONS.origin}"==t.origin&&"loadTextData"==t.data){const t=(t=>{const e=(t,n,s,o,i)=>{const h=document.createRange();return t.childNodes.forEach((t=>{var l;if((l=t)&&(!l.getBoundingClientRect||0!==l.getBoundingClientRect().width&&0!==l.getBoundingClientRect().height))if(t.nodeType===Node.TEXT_NODE){const e=t.textContent,l=e.length,g=Array.from(e).filter((t=>!("\\n"===t||" "===t||"\\t"===t))).length>0;if(0===l||!g)return;const c=[],r=o.length/8,u=[];let d=!1,a=0;for(let n=0;n<l;n++){h.setStart(t,n),h.setEnd(t,n+1);const{bottom:o,top:l,left:g,right:r}=h.getBoundingClientRect();c.push(g,o,r,o,r,l,g,l);const p=e[n];if(" "===p?s.push(-1):"\\n"===p?s.push(-2):s.push(2*s.length)," "===p||"\\n"===p){d=!1,i+=p;continue}const f=n+a;if(0===u.length||Math.abs(c[8*(f-1)+1]-c[8*f+1])>.1){if(0!==u.length){const t=e[n-1];" "!==t&&"\\n"!==t&&(i+="\\n",c.push(...c.slice(-8)),s.push(s[s.length-1]),s[s.length-2]=-2,a++)}u.push([[n+a]]),d=!0}else{const t=u[u.length-1];d?t[t.length-1].push(f):(t.push([f]),d=!0)}i+=p}o.push(...c);const p=e[l-1];" "!==p&&"\\n"!==p&&(i+="\\n",o.push(...o.slice(-8)),s.push(-2));const f=u.length;n[0]+=f;for(let t=0;t<f;t++){const e=u[t],s=e[0],o=e[e.length-1],i=s[0],h=o[o.length-1];n.push(e.length,0,c[8*i],c[8*i+1],c[8*h+4],c[8*h+5]);for(let t=0;t<e.length;t++){const s=e[t],o=s.length,i=s[0],h=s[o-1];n.push(o,i+r,o,c[8*i],c[8*h+2])}}}else{if(t.nodeType==Node.ELEMENT_NODE){const e=window.getComputedStyle(t);if("none"==e.display||"hidden"==e.visibility||0==e.opacity)return}i=e(t,n,s,o,i)}})),i};return(t=>{const n=[0],s=[],o=[];return{struct:n,str:e(t,n,s,o,""),offsets:s,quads:o}})(t)})(document.body);window.parent.postMessage({selectionData:t},"${CORS_OPTIONS.origin}")}}));</script>`;

            const headIndex = body.indexOf("</head>");
            if (headIndex > 0) {
              if (!/pdftron-css/.test(body)) {
                body = body.slice(0, headIndex) + styleTag + body.slice(headIndex);
              }

              if (!/pdftron-js/.test(body)) {
                body = body.slice(0, headIndex) + scriptTag + body.slice(headIndex);
              }
            }
            const contentLength = serverResponse.headers['content-length'];
            if (!!contentLength && contentLength < body.length) {
              serverResponse.headers['content-length'] = body.length;
            }
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

      const serverRequest = parsedSSL.request(options, serverResponse => {
        // console.log('serverResponse', serverResponse.req.path)
        // console.log('serverResponse', serverResponse.headers, serverResponse.url, serverResponse)
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
            insecureHTTPParser: true,
            headers: {
              'User-Agent': clientRequest.headers['user-agent'],
              'Referer': `${PATH}${pathname}`,
              'Accept-Encoding': 'identity',
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
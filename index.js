const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const puppeteer = require('puppeteer');
const cookieParser = require('cookie-parser');
const getTextData = require('./utils/getTextData');
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
            width: document.body.scrollWidth || document.body.clientWidth || defaultViewport.width,
            height: document.body.scrollHeight || document.body.clientHeight || 7000,
          };
        });

        const selectionData = await getTextData(page);

        // cookie will only be set when res is sent succesfully
        const oneHour = 1000 * 60 * 60;
        res.cookie('pdftron_proxy_sid', validUrl, { ...COOKIE_SETTING, maxAge: oneHour });
        res.status(200).send({ pageDimensions, selectionData, validUrl });
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
            console.log('serverResponse.onend')
            // Only for pdftron website, insert style/script has to be no greater than 157 characters
            const styleTag = `<style type='text/css' id='pdftron-css-123456797986786'>a:not([role=button]):not([href^='#']):active,button[type=submit]:active{pointer-events:none!important}</style>`;
            const scriptTag = `<script id="pdftron-js">const getSelectionData=t=>{const e=[0],n=[],s=[],o=traverseTextNode(t,e,n,s,"");return console.log({struct:e,str:o,offsets:n,quads:s}),{struct:e,str:o,offsets:n,quads:s}},isInvalidNode=t=>!t||t.getBoundingClientRect&&(0===t.getBoundingClientRect().width||0===t.getBoundingClientRect().height),traverseTextNode=(t,e,n,s,o)=>{const l=document.createRange();return t.childNodes.forEach(t=>{if(!isInvalidNode(t))if(t.nodeType===Node.TEXT_NODE){const i=t.textContent,h=i.length,c=Array.from(i).filter(t=>!("\\n"===t||" "===t||"\\t"===t)).length>0;if(0===h||!c)return;const d=[],g=s.length/8,r=[];let u=!1,a=0;for(let e=0;e<h;e++){l.setStart(t,e),l.setEnd(t,e+1);const{bottom:s,top:h,left:c,right:g}=l.getBoundingClientRect();d.push(c,s,g,s,g,h,c,h);const p=i[e];if(" "===p?n.push(-1):"\\n"===p?n.push(-2):n.push(2*n.length)," "===p||"\\n"===p){u=!1,o+=p;continue}const f=e+a;if(0===r.length||Math.abs(d[8*(f-1)+1]-d[8*f+1])>.1){if(0!==r.length){const t=i[e-1];" "!==t&&"\\n"!==t&&(o+="\\n",d.push(...d.slice(-8)),n.push(n[n.length-1]),n[n.length-2]=-2,a++)}r.push([[e+a]]),u=!0}else{const t=r[r.length-1];u?t[t.length-1].push(f):(t.push([f]),u=!0)}o+=p}s.push(...d);const p=i[h-1];" "!==p&&"\\n"!==p&&(o+="\\n",s.push(...s.slice(-8)),n.push(-2));const f=r.length;e[0]+=f;for(let t=0;t<f;t++){const n=r[t],s=n[0],o=n[n.length-1],l=s[0],i=o[o.length-1];e.push(n.length,0,d[8*l],d[8*l+1],d[8*i+4],d[8*i+5]);for(let t=0;t<n.length;t++){const s=n[t],o=s.length,l=s[0],i=s[o-1];e.push(o,l+g,o,d[8*l],d[8*i+2])}}}else{if(t.nodeType==Node.ELEMENT_NODE){const e=window.getComputedStyle(t);if("none"==e.display||"hidden"==e.visibility||0==e.opacity)return}o=traverseTextNode(t,e,n,s,o)}}),o};window.addEventListener("load",t=>{getSelectionData(document.getElementsByTagName("body")[0])});</script>`;
            //   const scriptTag = `<script id='proxy-pdftron-js'>window.addEventListener('beforeunload', function (e) {console.log('addEventListener', this);e.preventDefault();e.returnValue = ''})</script>`;

            const headIndex = body.indexOf("</head>");
            if (headIndex > 0) {
              if (!/pdftron-css/.test(body)) {
                body = body.slice(0, headIndex) + styleTag + body.slice(headIndex);
              }

              if (!/pdftron-js/.test(body)) {
                // body = body.slice(0, headIndex) + '<link rel="stylesheet">' + body.slice(headIndex);
                // body = body.replace(/(<\/head[^>]*>)/gi, `\n${scriptTag}\n` + "$1");
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
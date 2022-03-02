const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const puppeteer = require('puppeteer');
const cookieParser = require('cookie-parser');
const { URL } = require('url');

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

        // cookie will only be set when res is sent succesfully
        const oneHour = 1000 * 60 * 60;
        res.cookie('pdftron_proxy_sid', validUrl, { ...COOKIE_SETTING, maxAge: oneHour });
        res.status(200).send({ validUrl });
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
          // 'Cross-Origin-Resource-Policy': 'cross-origin',
          // 'Cross-Origin-Embedder-Policy': 'credentialless',
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
        // 'require-corp' works fine on staging but doesn't on localhost: should use 'credentialless'
        serverResponse.headers['cross-origin-embedder-policy'] = 'credentialless';
        // serverResponse.headers['cross-origin-opener-policy'] = 'same-origin';

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
            const styleTag = `<style type='text/css' id='pdftron-css'>a:not([href^="#"]):not([role=button]):active{pointer-events:none!important}button[type=submit]:active{pointer-events:none!important}input[type=search],input[type=submit]:active{pointer-events:none!important}div[role=button]:not([aria-expanded]):active{pointer-events:none!important}li[role=presentation]:active{pointer-events:none!important}</style>`;
            const textScript = `<script type='text/javascript' id='pdftron-js'>const t=t=>!t||t.getBoundingClientRect&&(0===t.getBoundingClientRect().width||0===t.getBoundingClientRect().height),e=()=>{const{origin:t}=new URL(document.referrer);return t},n=()=>{const n=(e=>{const n=(e,o,l,r,s)=>{const i=document.createRange();return e.childNodes.forEach((e=>{if(!t(e))if(e.nodeType===Node.TEXT_NODE){const t=e.textContent,n=t.length,c=Array.from(t).filter((t=>!("\\n"===t||" "===t||"\\t"===t))).length>0;if(0===n||!c)return;const u=[],d=r.length/8,h=[];let a=!1,g=0;for(let o=0;o<n;o++){i.setStart(e,o),i.setEnd(e,o+1);const{bottom:n,top:r,left:c,right:d}=i.getBoundingClientRect();u.push(c,n,d,n,d,r,c,r);const p=t[o];if(" "===p?l.push(-1):"\\n"===p?l.push(-2):l.push(2*l.length)," "===p||"\\n"===p){a=!1,s+=p;continue}const f=o+g;if(0===h.length||Math.abs(u[8*(f-1)+1]-u[8*f+1])>.1){if(0!==h.length){const e=t[o-1];" "!==e&&"\\n"!==e&&(s+="\\n",u.push(...u.slice(-8)),l.push(l[l.length-1]),l[l.length-2]=-2,g++)}h.push([[o+g]]),a=!0}else{const t=h[h.length-1];a?t[t.length-1].push(f):(t.push([f]),a=!0)}s+=p}r.push(...u);const p=t[n-1];" "!==p&&"\\n"!==p&&(s+="\\n",r.push(...r.slice(-8)),l.push(-2));const f=h.length;o[0]+=f;for(let t=0;t<f;t++){const e=h[t],n=e[0],l=e[e.length-1],r=n[0],s=l[l.length-1];o.push(e.length,0,u[8*r],u[8*r+1],u[8*s+4],u[8*s+5]);for(let t=0;t<e.length;t++){const n=e[t],l=n.length,r=n[0],s=n[l-1];o.push(l,r+d,l,u[8*r],u[8*s+2])}}}else{if(e.nodeType==Node.ELEMENT_NODE){const t=window.getComputedStyle(e);if("none"==t.display||"hidden"==t.visibility||0==t.opacity)return}s=n(e,o,l,r,s)}})),s};return(t=>{const e=[0],o=[],l=[];return{struct:e,str:n(t,e,o,l,""),offsets:o,quads:l}})(e)})(document.body),o=(()=>{let t=0;return document.body.childNodes.forEach((e=>{isNaN(e.clientHeight)||(t+=e.clientHeight>0&&e.scrollHeight||e.clientHeight)})),t})();window.parent.postMessage({selectionData:n,iframeHeight:o},e())},o=(t,e,n)=>{let o=null;return(...l)=>{let r=n&&!o;clearTimeout(o),o=setTimeout((()=>{o=null,n||t.apply(null,l)}),e),r&&t.apply(null,l)}},l=o(n,500,!1),r=o(n,50,!1);window.addEventListener("message",(t=>{t.origin==e()&&"loadTextData"==t.data&&n()})),document.addEventListener("DOMContentLoaded",(()=>{document.querySelectorAll('a:not([href^="#"])').forEach((t=>t.setAttribute("href","javascript:void(0);"))),document.querySelectorAll('a, button, [role="button"], input').forEach((t=>t.setAttribute("tabindex",-1))),document.querySelectorAll("input").forEach((t=>{t.readOnly=!0,t.onkeydown=s})),document.querySelectorAll("select").forEach((t=>t.onkeydown=s)),n();new MutationObserver(((t,e)=>{l()})).observe(document.body,{attributes:!0,childList:!0,subtree:!0,characterData:!0})})),document.addEventListener("transitionend",(()=>{r()}));const s=t=>{"Enter"==t.key&&t.preventDefault()};</script>`;

            const headIndex = body.indexOf('</head>');
            if (headIndex > 0) {
              if (!/pdftron-css/.test(body)) {
                body = body.slice(0, headIndex) + styleTag + body.slice(headIndex);
              }

              if (!/pdftron-js/.test(body)) {
                body = body.slice(0, headIndex) + textScript + body.slice(headIndex);
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
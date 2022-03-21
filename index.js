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
      const browser = await puppeteer.launch(puppeteerOptions);

      try {
        const page = await browser.newPage();
        // page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        const pageHTTPResponse = await page.goto(url, {
          // use 'domcontentloaded' https://github.com/puppeteer/puppeteer/issues/1666
          waitUntil: 'domcontentloaded', // defaults to load
        });
        const validUrl = pageHTTPResponse.url();

        // Get the "viewport" of the page, as reported by the page.
        const pageDimensions = await page.evaluate(() => {
          let sum = 0;
          document.body.childNodes.forEach(el => {
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
        const oneHour = 1000 * 60 * 60;
        res.cookie('pdftron_proxy_sid', validUrl, { ...COOKIE_SETTING, maxAge: oneHour });
        res.status(200).send({ validUrl, pageDimensions });
      } catch (err) {
        console.error('/pdftron-proxy', err);
        res.status(400).send({ errorMessage: 'Please enter a valid URL and try again.' });
      } finally {
        browser.close();
      }
    }
  });

  // need to be placed before app.use('/');
  app.get('/pdftron-download', async (req, res) => {
    console.log('\x1b[31m%s\x1b[0m', `
          ********************** DOWNLOAD: ${req.query.url}
    `);
    // check again here to avoid server being blown up, tested with saving github
    const browser = await puppeteer.launch(puppeteerOptions);
    try {
      const page = await browser.newPage();
      await page.goto(`${req.query.url}`, {
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

        // reset cache-control for https://www.keytrudahcp.com
        serverResponse.headers['cache-control'] = 'max-age=0, public, no-cache, no-store, must-revalidate';
        let body = '';
        // Send html content from the proxied url to the browser so that it can spawn new requests.
        if (String(serverResponse.headers['content-type']).indexOf('text/html') !== -1) {
          serverResponse.on('data', function (chunk) {
            body += chunk;
          });

          serverResponse.on('end', function () {
            const styleTag = `<style type='text/css' id='pdftron-css'>a[href]:not([href^="#"]):not([role=button]),a[href]:not([href^="#"]):not([role=button]) *{cursor:default}a[href]:not([href^="#"]):not([role=button]):active{pointer-events:none!important}a:not([href]):not([role=button]):not([class*=button]):not([class*=Button]):active{pointer-events:none!important}button[type=submit]:active{pointer-events:none!important}input[type=search],input[type=submit]:active{pointer-events:none!important}div[role=button]:not([aria-expanded]):active{pointer-events:none!important}li[role=presentation]:active{pointer-events:none!important}</style>`;
            const scriptTag = `<script type='text/javascript' id='pdftron-js'>const debounceJS=(l,e,u)=>{let n=null;return(...t)=>{let o=u&&!n;clearTimeout(n),n=setTimeout((()=>{n=null,u||l.apply(null,t)}),e),o&&l.apply(null,t)}};const onKeydownCB=e=>{"Enter"==e.key&&e.preventDefault()},blockNavigation=()=>{document.querySelectorAll('a:not([href^="#"])').forEach((e=>{e.href&&"javascript:void(0);"!=e.href&&(e.setAttribute("data-href",e.getAttribute("href")),e.setAttribute("href","javascript:void(0);"))})),document.querySelectorAll('a[href^="#"]').forEach((e=>{e.setAttribute("data-href",e.getAttribute("href"))})),document.querySelectorAll('a, button, [role="button"], input').forEach((e=>e.setAttribute("tabindex",-1))),document.querySelectorAll("input").forEach((e=>{e.readOnly||(e.readOnly=!0,e.onkeydown=onKeydownCB)})),document.querySelectorAll("select").forEach((e=>e.onkeydown=onKeydownCB))},debounceBlockNavigation=debounceJS(blockNavigation,1e3,!1);document.addEventListener("DOMContentLoaded",(()=>{blockNavigation();new MutationObserver(((e,t)=>{debounceBlockNavigation()})).observe(document.body,{attributes:!1,childList:!0,subtree:!0,characterData:!1})}));const t=t=>!t||t.getBoundingClientRect&&(0===t.getBoundingClientRect().width||0===t.getBoundingClientRect().height),e=()=>{const{origin:t}=new URL(document.referrer);return t},n=()=>{const{selectionData:n,linkData:o}=(e=>{const n=(e,o,i,s,c,h)=>{const l=document.createRange();return e.childNodes.forEach((e=>{if(!t(e)){if(e.nodeType==Node.ELEMENT_NODE){const t=window.getComputedStyle(e);if("none"==t.display||"hidden"==t.visibility||0==t.opacity)return}if("A"===e.tagName&&e.getAttribute("data-href")){const t=e.getBoundingClientRect();h.push({clientRect:t,href:e.getAttribute("data-href")})}if(e.nodeType===Node.TEXT_NODE){const t=e.textContent,n=t.length,h=Array.from(t).filter((t=>!("\\n"===t||" "===t||"\\t"===t))).length>0;if(0===n||!h)return;const r=[],a=s.length/8,d=[];let u=!1,g=0;for(let o=0;o<n;o++){l.setStart(e,o),l.setEnd(e,o+1);const{bottom:n,top:s,left:h,right:a}=l.getBoundingClientRect();r.push(h,n,a,n,a,s,h,s);const f=t[o];if(" "===f?i.push(-1):"\\n"===f?i.push(-2):i.push(2*i.length)," "===f||"\\n"===f){u=!1,c+=f;continue}const p=o+g;if(0===d.length||Math.abs(r[8*(p-1)+1]-r[8*p+1])>.1){if(0!==d.length){const e=t[o-1];" "!==e&&"\\n"!==e&&(c+="\\n",r.push(...r.slice(-8)),i.push(i[i.length-1]),i[i.length-2]=-2,g++)}d.push([[o+g]]),u=!0}else{const t=d[d.length-1];u?t[t.length-1].push(p):(t.push([p]),u=!0)}c+=f}s.push(...r);const f=t[n-1];" "!==f&&"\\n"!==f&&(c+="\\n",s.push(...s.slice(-8)),i.push(-2));const p=d.length;o[0]+=p;for(let t=0;t<p;t++){const e=d[t],n=e[0],i=e[e.length-1],s=n[0],c=i[i.length-1];o.push(e.length,0,r[8*s],r[8*s+1],r[8*c+4],r[8*c+5]);for(let t=0;t<e.length;t++){const n=e[t],i=n.length,s=n[0],c=n[i-1];o.push(i,s+a,i,r[8*s],r[8*c+2])}}}else c=n(e,o,i,s,c,h)}})),c},o=[0],i=[],s=[],c=[];return{selectionData:{struct:o,str:n(e,o,i,s,"",c),offsets:i,quads:s},linkData:c}})(document.body),i=(()=>{let t=0;return document.body.childNodes.forEach((e=>{isNaN(e.clientHeight)||(t+=e.clientHeight>0&&e.scrollHeight||e.clientHeight)})),t})();window.parent.postMessage({selectionData:n,linkData:o,iframeHeight:i},e())},o=debounceJS(n,500,!1),i=debounceJS(n,50,!1);window.addEventListener("message",(t=>{t.origin==e()&&"loadTextData"==t.data&&n()})),document.addEventListener("DOMContentLoaded",(()=>{n();new MutationObserver(((t,e)=>{o()})).observe(document.body,{attributes:!0,childList:!0,subtree:!0,characterData:!0})})),document.addEventListener("transitionend",(()=>{i()}));
            </script>`;

            const headIndex = body.indexOf('</head>');
            if (headIndex > 0) {
              if (!/pdftron-css/.test(body)) {
                body = body.slice(0, headIndex) + styleTag + body.slice(headIndex);
              }

              if (!/pdftron-js/.test(body)) {
                // order: debounce first, then blocknavigation (switching all href) then send text/link data since the latter happens over and over again
                body = body.slice(0, headIndex) + scriptTag + body.slice(headIndex);
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
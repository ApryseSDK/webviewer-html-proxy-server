/*
 * ATTENTION: The "eval" devtool has been used (maybe by default in mode: "development").
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(function webpackUniversalModuleDefinition(root, factory) {
	if(typeof exports === 'object' && typeof module === 'object')
		module.exports = factory();
	else if(typeof define === 'function' && define.amd)
		define([], factory);
	else if(typeof exports === 'object')
		exports["WebviewerHTMLProxyServer"] = factory();
	else
		root["WebviewerHTMLProxyServer"] = factory();
})(global, function() {
return /******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./index.js":
/*!******************!*\
  !*** ./index.js ***!
  \******************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   \"default\": () => (__WEBPACK_DEFAULT_EXPORT__)\n/* harmony export */ });\n\n\nfunction bootServer (SERVER_ROOT, PORT) {\n  console.log('bootServer', SERVER_ROOT, PORT);\n  \n  // const express = require('express');\n  // const cors = require('cors');\n  // const https = require('https');\n  // const http = require('http');\n  // const puppeteer = require('puppeteer');\n  \n  // const app = express();\n  // app.use(cors());\n  \n\n  // const PORT = 3100;\n  const PATH = `${SERVER_ROOT}:${PORT}`;\n\n  const isValidURL = (url) => {\n    // eslint-disable-next-line no-useless-escape\n    return /(www\\.)?[-a-zA-Z0-9@:%._\\+~#=]{2,256}\\.[a-z]{2,6}\\b([-a-zA-Z0-9@:%_\\+.~#?&//=]*)/gi.test(url);\n  }\n\n  const getHostPortSSL = (url) => {\n    const parsedHost = url.split('/').splice(2).splice(0, 1).join('/')\n    let parsedPort;\n    let parsedSSL;\n    if (url.startsWith('https://')) {\n      parsedPort = 443;\n      parsedSSL = https;\n    } else if (url.startsWith('http://')) {\n      parsedPort = 80;\n      parsedSSL = http;\n    }\n    return {\n      parsedHost,\n      parsedPort,\n      parsedSSL,\n    }\n  }\n\n  const isUrlAbsolute = (url) => (url.indexOf('://') > 0 || url.indexOf('//') === 0);\n  const isUrlNested = (url) => {\n    let nested = url.split('/').splice(3);\n    if (nested.length > 0 && nested[0] != '') {\n      return true;\n    }\n    return false;\n  }\n\n  const defaultViewport = { width: 1680, height: 1050 };\n  var url;\n  var dimensions;\n  var urlExists;\n\n  // app.get('/pdftron-proxy', async function (req, res, next) {\n  //   // this is the url retrieved from the input\n  //   url = req.query.url;\n  //   // reset urlExists\n  //   urlExists = undefined;\n  //   // ****** first check for human readable URL with simple regex\n  //   if (!isValidURL(url)) {\n  //     // send a custom code here so client can catch this \n  //     res.status(999).send({ data: 'Please enter a valid URL and try again.' });\n  //   } else {\n  //     console.log('\\x1b[31m%s\\x1b[0m', `\n  //     ***********************************************************************\n  //     ************************** NEW REQUEST ********************************\n  //     ***********************************************************************\n  //   `);\n\n  //     const browser = await puppeteer.launch({\n  //       defaultViewport,\n  //       headless: true,\n  //     });\n  //     const page = await browser.newPage();\n\n  //     // ****** second check for puppeteer being able to goto url\n  //     try {\n  //       urlExists = await page.goto(url, {\n  //         waitUntil: 'networkidle0'\n  //       });\n  //       // Get the \"viewport\" of the page, as reported by the page.\n  //       dimensions = await page.evaluate(() => {\n  //         return {\n  //           width: document.body.clientWidth,\n  //           height: document.body.clientHeight,\n  //         };\n  //       });\n  //       // next(\"router\") pass control to next route and strip all req.query, if queried url contains nested route this will be lost in subsequest requests\n  //       next();\n  //     } catch (err) {\n  //       console.log(err);\n  //       res.status(999).send({ data: 'Please enter a valid URL and try again.' });\n  //     }\n\n  //     await browser.close();\n\n  //   }\n  // });\n\n  // need to be placed before app.use('/');\n  // app.get('/pdftron-download', async (req, res) => {\n  //   const browser = await puppeteer.launch({\n  //     defaultViewport,\n  //     headless: true,\n  //   });\n  //   const page = await browser.newPage();\n  //   // check again here to avoid server being blown up, tested with saving github\n  //   try {\n  //     await page.goto(`http://${PATH}`, {\n  //       waitUntil: 'networkidle0'\n  //     });\n  //     const buffer = await page.screenshot({ type: 'png', fullPage: true });\n  //     res.send(buffer);\n  //   } catch (err) {\n  //     console.log(err);\n  //     res.status(400).end();\n  //   }\n  //   await browser.close();\n  // });\n\n  // TAKEN FROM: https://stackoverflow.com/a/63602976\n  // app.use('/', function (clientRequest, clientResponse) {\n  //   if (isValidURL(url) && !!urlExists) {\n  //     const {\n  //       parsedHost,\n  //       parsedPort,\n  //       parsedSSL,\n  //     } = getHostPortSSL(url);\n\n  //     // convert to original url, since clientRequest.url starts from /pdftron-proxy and will be redirected\n  //     if (clientRequest.url.startsWith('/pdftron-proxy')) {\n  //       clientRequest.url = url;\n  //     }\n\n  //     // if url has nested route then convert to original url to force request it\n  //     // did not work with nested urls from developer.mozilla.org\n  //     // check if nested route cause instagram.com doesn't like this\n  //     if (isUrlNested(url) && clientRequest.url === '/') {\n  //       clientRequest.url = url;\n  //     }\n\n  //     var options = {\n  //       hostname: parsedHost,\n  //       port: parsedPort,\n  //       path: clientRequest.url,\n  //       method: clientRequest.method,\n  //       headers: {\n  //         'User-Agent': clientRequest.headers['user-agent']\n  //       }\n  //     };\n  //     console.log('hostname', options.hostname, 'path', options.path);\n\n  //     const callback = (serverResponse, clientResponse) => {\n  //       // Delete 'x-frame-options': 'SAMEORIGIN'\n  //       // so that the page can be loaded in an iframe\n  //       delete serverResponse.headers['x-frame-options'];\n  //       delete serverResponse.headers['content-security-policy'];\n\n  //       // if a url is blown up, make sure to reset cache-control\n  //       if (!!serverResponse.headers['cache-control'] && /max-age=[^0]/.test(String(serverResponse.headers['cache-control']))) {\n  //         serverResponse.headers['cache-control'] = 'max-age=0';\n  //       }\n  //       var body = '';\n  //       if (String(serverResponse.headers['content-type']).indexOf('text/html') !== -1) {\n  //         serverResponse.on('data', function (chunk) {\n  //           body += chunk;\n  //         });\n\n  //         serverResponse.on('end', function () {\n  //           // can also send dimensions in clientResponse.setHeader() but for some reason, on client can't read response.headers.get() but it's available in the network tab\n  //           clientResponse.writeHead(serverResponse.statusCode, JSON.stringify(dimensions), serverResponse.headers);\n  //           clientResponse.end(body);\n  //         });\n  //       }\n  //       else {\n  //         serverResponse.pipe(clientResponse, {\n  //           end: true\n  //         });\n  //         // Can be undefined\n  //         if (serverResponse.headers['content-type']) {\n  //           clientResponse.contentType(serverResponse.headers['content-type'])\n  //         }\n  //       }\n  //     }\n\n  //     var serverRequest = parsedSSL.request(options, serverResponse => {\n  //       console.log('serverResponse', serverResponse.statusCode, serverResponse.headers)\n  //       // This is the case of urls being redirected -> retrieve new headers['location'] and request again\n  //       if (serverResponse.statusCode > 299 && serverResponse.statusCode < 400) {\n  //         var location = serverResponse.headers['location'];\n  //         var parsedLocation = isUrlAbsolute(location) ? location : `https://${parsedHost}${location}`;\n\n  //         const {\n  //           parsedHost: newParsedHost,\n  //           parsedPort: newParsedPort,\n  //           parsedSSL: newParsedSSL,\n  //         } = getHostPortSSL(parsedLocation);\n\n  //         var newOptions = {\n  //           hostname: newParsedHost,\n  //           port: newParsedPort,\n  //           path: parsedLocation,\n  //           method: clientRequest.method,\n  //           headers: {\n  //             'User-Agent': clientRequest.headers['user-agent']\n  //           }\n  //         };\n  //         console.log('newhostname', newOptions.hostname, 'newpath', newOptions.path);\n\n  //         var newServerRequest = newParsedSSL.request(newOptions, newResponse => {\n  //           console.log('new serverResponse', newResponse.statusCode, newResponse.headers)\n  //           callback(newResponse, clientResponse);\n  //         });\n  //         serverRequest.end();\n  //         newServerRequest.end();\n  //         return;\n  //       }\n\n  //       callback(serverResponse, clientResponse);\n  //     });\n\n  //     serverRequest.end();\n  //   }\n  // });\n\n\n  // app.listen(PORT);\n  console.log(`Running on ${PATH}`);\n};\n\n/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (bootServer);\n\n//# sourceURL=webpack://WebviewerHTMLProxyServer/./index.js?");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The require scope
/******/ 	var __webpack_require__ = {};
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module can't be inlined because the eval devtool is used.
/******/ 	var __webpack_exports__ = {};
/******/ 	__webpack_modules__["./index.js"](0, __webpack_exports__, __webpack_require__);
/******/ 	
/******/ 	return __webpack_exports__;
/******/ })()
;
});
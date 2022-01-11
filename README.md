# webviewer-html-proxy-server
This is a proxy server to use with [HTML sample by PDFTron](https://github.com/PDFTron/webviewer-html-annotate-proxy)

## Install

```
npm install @pdftron/webviewer-html-proxy-server
```

## How to use

Call the `createServer` function in your server component and pass in a `SERVER_ROOT` and `PORT`. You can, optionally, pass in the third parameter, an object to configure CORS. See: https://expressjs.com/en/resources/middleware/cors.html

## Example
```
const HTMLProxyServer = require('@pdftron/webviewer-html-proxy-server');
HTMLProxyServer.createServer(`0.0.0.0`, 3100);
```

Setting CORS example:

```
HTMLProxyServer.createServer(`0.0.0.0`, 3100, {
    "origin": "*",
    "methods": "GET,HEAD,PUT,PATCH,POST,DELETE",
    "preflightContinue": false,
    "optionsSuccessStatus": 204
});
```

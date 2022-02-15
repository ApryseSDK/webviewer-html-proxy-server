# webviewer-html-proxy-server
This is a proxy server to use with [HTML sample by PDFTron](https://github.com/PDFTron/webviewer-html-annotate-proxy)

## Install

```
npm install @pdftron/webviewer-html-proxy-server
```

## How to use

Call the `createServer` function in your server component and pass in an object that includes `SERVER_ROOT` and `PORT`. You can, optionally, pass in the third parameter, `CLIENT_URL`, the fourth parameter, an object to configure CORS and the fifth parameter, an object to configure COOKIE.

See: https://expressjs.com/en/resources/middleware/cors.html and https://expressjs.com/en/api.html#res.cookie

## Example
```
const HTMLProxyServer = require('@pdftron/webviewer-html-proxy-server');
HTMLProxyServer.createServer({
    SERVER_ROOT: `http://localhost`,
    PORT: 3100,
    CLIENT_URL: `http://localhost:3000`,
});
```

Setting CORS example:

```
HTMLProxyServer.createServer({
    SERVER_ROOT: `http://localhost`,
    PORT: 3100,
    CORS_OPTIONS: {
        "origin": "*",
        "methods": "GET,HEAD,PUT,PATCH,POST,DELETE",
        "preflightContinue": false,
        "optionsSuccessStatus": 204
    }
});
```

Setting COOKIE example:

```
HTMLProxyServer.createServer({
    SERVER_ROOT: `http://localhost`,
    PORT: 3100,
    COOKIE_SETTING: {
        sameSite: 'none',
        secure: true
    }
});
```

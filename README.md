# Webviewer Html Proxy Server
This is a proxy server to use with [HTML sample by PDFTron](https://github.com/PDFTron/webviewer-html-annotate-proxy)

## Install

```
npm install @pdftron/webviewer-html-proxy-server
```

## How to use

Call the `createServer` function in your server component and pass in an object that includes `SERVER_ROOT` and `PORT`. You can, optionally, pass in the third parameter, an object to configure CORS, the fourth parameter, an object to configure COOKIE and the fifth parameter, a boolean value to allow for unsecured HTTP websites to be proxied.

See: https://expressjs.com/en/resources/middleware/cors.html and https://expressjs.com/en/api.html#res.cookie

## Example
```javascript
const HTMLProxyServer = require('@pdftron/webviewer-html-proxy-server');
HTMLProxyServer.createServer({
    SERVER_ROOT: `http://localhost`,
    PORT: 3100
});
```

Setting CORS example:

```javascript
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

```javascript
HTMLProxyServer.createServer({
    SERVER_ROOT: `http://localhost`,
    PORT: 3100,
    COOKIE_SETTING: {
        sameSite: 'none',
        secure: true
    }
});
```

Setting ALLOW_HTTP_PROXY example:

```javascript
HTMLProxyServer.createServer({
    SERVER_ROOT: `http://localhost`,
    PORT: 3100,
    ALLOW_HTTP_PROXY: true
});
```

## API Endpoints
### Proxy a URL

Show a single Account if current User has access permissions to it.

**URL** : `/pdftron-proxy?url=`

**Query Parameters** : `url=[string]` where `url` is a publically accessible link.

**Method** : `GET`

#### Success Response

**Condition** : If the URL can be successfuly proxied

**Code** : `200 OK`

**Content example**

```json
{
    "validUrl": "https://www.pdftron.com/"
}
```

#### Error Responses

**Condition** : If URL can not be proxied.

**Code** : `400`

**Content** : `{ errorMessage: 'Please enter a valid URL and try again.' }`

### Download a PDF

Show a single Account if current User has access permissions to it.

**URL** : `/pdftron-download?url=`

**Query Parameters** : `url=[string]` where `url` is a publically accessible link.

**Method** : `GET`

#### Success Response

**Condition** : If URL can be loaded in puppeteer.

**Code** : `200 OK`

**Content example**

```json
{
    "buffer": "<some buffer>",
    "pageDimensions": { "width": 1440, "height": 770 }
}
```

#### Error Responses

**Condition** : If URL can not be loaded in puppeteer.

**Code** : `400`

**Content** : `{ errorMessage: 'Error taking screenshot from puppeteer' }`

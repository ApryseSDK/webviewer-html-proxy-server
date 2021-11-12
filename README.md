# webviewer-html-proxy-server
This is a proxy server to use with [HTML sample by PDFTron](https://github.com/PDFTron/webviewer-html-annotate-proxy)

## Install

```
npm install @pdftron/webviewer-html-proxy-server
```

## How to use

Call the package in your server component and pass in a `SERVER_ROOT` and `PORT`

## Example
```
const HTMLProxyServer = require('@pdftron/webviewer-html-proxy-server');
HTMLProxyServer.createServer(`0.0.0.0`, 3100);
```
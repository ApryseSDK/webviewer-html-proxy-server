import https from 'https';
import http from 'http';
import type { ServerHostPortSSL } from "./data";

const getHostPortSSL = (url: string): ServerHostPortSSL => {
  const {
    hostname,
    pathname,
    protocol
  } = new URL(url);
  let parsedPort: number;
  let parsedSSL: typeof https | typeof http;
  if (protocol == 'https:') {
    parsedPort = 443;
    parsedSSL = https;
  }
  if (protocol == 'http:') {
    parsedPort = 80;
    parsedSSL = http;
  }
  return {
    parsedHost: hostname,
    parsedPort,
    parsedSSL,
    pathname,
  }
}

export { getHostPortSSL }
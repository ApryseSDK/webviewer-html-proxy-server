const BLOCKLIST: string[] = [
  "127.",
  "0.",
  "10.",
  "172.16.",
  "172.17.",
  "172.18.",
  "172.19.",
  "172.20.",
  "172.21.",
  "172.22.",
  "172.23.",
  "172.24.",
  "172.25.",
  "172.26.",
  "172.27.",
  "172.28.",
  "172.29.",
  "172.30.",
  "172.31.",
  "192.168.",
  "169.254.",
  "fc",
  "fd",
  "fe",
  "ff",
  "::1",
]

const isValidURL = (url: string, allowHTTPProxy: boolean): boolean => {
  if (url.length > 256) {
    return false;
  }

  try {
    const { hostname, port, protocol } = new URL(url);

    if (!allowHTTPProxy) {
      if (protocol === 'http:') {
        return false;
      }
    }

    // Confirm this is a domain not an IP address by checking the hostname
    // ends with a two-letter or three-letter domain.
    if (!(/[a-zA-Z]{2,3}$/.test(hostname))) {
      return false;
    }

    // Be suspicious of anything that supplies a port.
    if (port) {
      return false;
    }

    // Check the block list of forbidden sites.
    if (BLOCKLIST.some(el => hostname.startsWith(el))) {
      return false;
    }

    // eslint-disable-next-line no-useless-escape
    return /(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/gi.test(url);
  } catch {
    return false;
  }
}

export { isValidURL };
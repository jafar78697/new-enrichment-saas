export function getRequestBaseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL;
  }

  const protocol = req.headers['x-forwarded-proto']?.split(',')[0] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${protocol}://${host}`;
}

export function absoluteUrl(req, pathname) {
  return `${getRequestBaseUrl(req)}${pathname}`;
}


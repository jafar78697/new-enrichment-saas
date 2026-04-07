import re
from urllib.parse import urlparse

def normalize(url: str) -> str:
    """
    Normalizes a URL or domain string into a canonical domain format.
    - Strips protocol (http, https)
    - Strips www. prefix
    - Strips trailing slashes
    - Strips query parameters and fragments
    - Handles Punycode (IDN) by converting to lowercase canonical form
    """
    if not url:
        return ""

    # 1. Basic cleanup: trim whitespace
    url = url.strip()

    # 2. Add protocol if missing for urlparse to work correctly
    if not re.match(r'^[a-zA-Z]+://', url):
        # Check if it looks like a domain, if so prepend https
        url = 'https://' + url

    try:
        parsed = urlparse(url)
        # 3. Extract netloc (domain + port)
        domain = parsed.netloc or parsed.path.split('/')[0]
        
        # 4. Remove port if exists
        domain = domain.split(':')[0]

        # 5. IP Address and Localhost Protection (Security)
        if domain == 'localhost' or domain.startswith('127.') or domain.startswith('192.168.') or domain.startswith('10.'):
            return "" # Protect internal networks

        # 6. Convert to lowercase
        domain = domain.lower()

        # 7. Remove 'www.' prefix (only for the start)
        if domain.startswith('www.'):
            domain = domain[4:]

        # 8. Handle IDN (Punycode)
        try:
            domain = domain.encode('idna').decode('ascii')
        except UnicodeError:
            pass

        return domain
    except Exception:
        # Fallback for very malformed inputs
        return url.split('/')[0].split('?')[0].lower().replace('www.', '')

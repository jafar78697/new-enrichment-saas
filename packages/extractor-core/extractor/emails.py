import re
from bs4 import BeautifulSoup

EMAIL_RE = re.compile(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}')

JUNK_DOMAINS = {
    'sentry.io', 'wixpress.com', 'squarespace.com', 'shopify.com', 'wordpress.com',
    'example.com', 'amazonaws.com', 'googletagmanager.com', 'facebook.com',
    'mailchimp.com', 'sendgrid.net', 'hubspot.com', 'google.com', 'gstatic.com',
    'doubleclick.net', 'google-analytics.com', 'browser-update.org'
}

# Obfuscation patterns
OBFUSCATION_PATTERNS = [
    (re.compile(r'\[at\]', re.I), '@'),
    (re.compile(r'\(at\)', re.I), '@'),
    (re.compile(r' dot ', re.I), '.'),
    (re.compile(r'\[dot\]', re.I), '.'),
]

def extract_emails(html: str) -> list[str]:
    """
    Extracts emails from HTML with obfuscation handling.
    Priority: mailto: links -> visible text patterns -> obfuscated patterns.
    """
    if not html:
        return []

    found = set()
    soup = BeautifulSoup(html, 'html.parser')
    
    # 1. From mailto links
    for a in soup.find_all('a', href=True):
        if a['href'].startswith('mailto:'):
            e = a['href'][7:].split('?')[0].strip().lower()
            if EMAIL_RE.match(e):
                found.add(e)
    
    # 2. De-obfuscate text
    clean_html = html
    for pattern, replacement in OBFUSCATION_PATTERNS:
        clean_html = pattern.sub(replacement, clean_html)
        
    # 3. From text using regex
    for e in EMAIL_RE.findall(clean_html):
        found.add(e.lower())
    
    # 4. Filter and categorize
    result = filter_junk(list(found))
    
    # 5. Sort by relevance (Role detection)
    # Priority: personal (@firstname) > high-value generic (contact, hi) > other
    def relevance_score(email: str) -> int:
        local = email.split('@')[0]
        if any(x in local for x in ['info', 'admin', 'office', 'support']): return 2
        if any(x in local for x in ['contact', 'hello', 'hi', 'sales']): return 1
        return 0 # Likely personal or unique role
        
    result.sort(key=relevance_score)
    
    return result

def filter_junk(emails: list[str]) -> list[str]:
    """Filters out junk emails like CDN, no-reply, etc."""
    filtered = []
    for e in emails:
        if not e: continue
        
        # Split into local and domain
        try:
            local_part, domain = e.split('@', 1)
        except ValueError:
            continue
            
        # Check junk domains
        if any(domain == j or domain.endswith('.' + j) for j in JUNK_DOMAINS):
            continue
            
        # Check extensions (avoid images/assets being caught)
        if e.endswith(('.png', '.jpg', '.jpeg', '.gif', '.svg', '.css', '.js', '.webp', '.pdf', '.ico')):
            continue
            
        # Check common non-contact patterns
        if any(x in local_part for x in ['noreply', 'no-reply', 'donotreply', 'support-team']):
            continue
            
        # Avoid long random strings (likely hashes)
        if re.match(r'^[a-f0-9]{16,}$', local_part) or len(local_part) > 40:
            continue
            
        filtered.append(e)
    return filtered

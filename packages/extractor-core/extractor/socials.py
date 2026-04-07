import re
from urllib.parse import urlparse

# Regular expressions for major social media platforms
SOCIAL_REGEXES = {
    'linkedin': re.compile(r'linkedin\.com/(?:company|in)/([^/?\s]+)'),
    'facebook': re.compile(r'facebook\.com/([^/?\s]+)'),
    'instagram': re.compile(r'instagram\.com/([^/?\s]+)'),
    'twitter': re.compile(r'(?:twitter\.com|x\.com)/([^/?\s]+)'),
    'youtube': re.compile(r'youtube\.com/(?:channel|user|c|@)?([^/?\s]+)'),
    'tiktok': re.compile(r'tiktok\.com/@?([^/?\s]+)'),
    'whatsapp': re.compile(r'wa\.me/([^/?\s]+)'),
    'telegram': re.compile(r't\.me/([^/?\s]+)')
}

def extract_socials(html: str) -> dict[str, str]:
    """
    Extracts social media links from HTML.
    Returns a dictionary mapping platform name to link.
    """
    if not html:
        return {}

    results = {}
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, 'html.parser')
    
    # 1. From links
    for a in soup.find_all('a', href=True):
        href = a['href']
        for platform, regex in SOCIAL_REGEXES.items():
            if platform in results: continue
            if regex.search(href):
                # Ensure it's a full URL if it doesn't have protocol
                if not href.startswith('http'):
                    continue # Should be caught by common scraping
                results[platform] = href
                
    # 2. From text fallback
    for platform, regex in SOCIAL_REGEXES.items():
        if platform in results: continue
        match = regex.search(html)
        if match:
            # Reconstruct URL if only part found (optional, better to stay with links)
            pass
            
    return results

def is_linkedin_company(url: str) -> bool:
    """Check if LinkedIn URL is for a company or personal profile."""
    return '/company/' in url

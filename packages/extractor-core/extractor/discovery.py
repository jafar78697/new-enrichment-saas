import re
from urllib.parse import urljoin, urlparse

# Scoring weights for discovery links
DISCOVERY_KEYWORDS = {
    'contact': 100,
    'get-in-touch': 90,
    'support': 80,
    'about': 70,
    'team': 60,
    'people': 50,
    'privacy': 40,
    'terms': 30
}

def suggest_discovery_urls(html: str, base_url: str) -> list[str]:
    """
    Identifies and scores sub-URLs based on their likelihood of containing contact info.
    Returns a sorted list of top 5 URLs.
    """
    if not html:
        return []

    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, 'html.parser')
    
    scored_links = {}
    
    for a in soup.find_all('a', href=True):
        href = a['href']
        text = a.get_text(strip=True).lower()
        
        # Absolute URL reconstruction
        try:
            full_url = urljoin(base_url, href)
        except:
            continue
            
        # Ensure it's the same domain
        if urlparse(full_url).netloc != urlparse(base_url).netloc:
            continue
            
        # Scoring logic
        score = 0
        for kw, weight in DISCOVERY_KEYWORDS.items():
            if kw in href.lower() or kw in text:
                score += weight
                
        if score > 0:
            # Store highest score for each unique URL
            scored_links[full_url] = max(score, scored_links.get(full_url, 0))
            
    # Sort and return top 5
    sorted_links = sorted(scored_links.items(), key=lambda x: x[1], reverse=True)
    return [url for url, score in sorted_links[:5]]

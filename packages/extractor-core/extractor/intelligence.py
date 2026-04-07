import re
from bs4 import BeautifulSoup
from collections import Counter

# Industry keywords for heuristic detection
INDUSTRY_KEYWORDS = {
    'SaaS': ['software', 'platform', 'subscription', 'cloud', 'enterprise', 'api'],
    'E-commerce': ['store', 'shop', 'cart', 'buy', 'product', 'shipping', 'checkout'],
    'Agency': ['services', 'marketing', 'client', 'portfolio', 'strategy', 'consulting'],
    'Healthcare': ['medical', 'patient', 'health', 'clinic', 'doctor', 'hospital'],
    'Real Estate': ['property', 'home', 'real estate', 'apartment', 'listing', 'realtor'],
    'Education': ['course', 'learn', 'student', 'school', 'university', 'training'],
    'Finance': ['bank', 'investment', 'finance', 'trading', 'wealth', 'advisors'],
}

def detect_industry(html: str) -> str:
    """Heuristic industry detection by keyword density."""
    if not html:
        return "Unknown"

    text = html.lower()
    counts = Counter()
    for industry, keywords in INDUSTRY_KEYWORDS.items():
        for kw in keywords:
            if kw in text:
                counts[industry] += 1
                
    if not counts:
        return "Unknown"
        
    return counts.most_common(1)[0][0]

def extract_one_line_pitch(html: str) -> str:
    """Extracts a one-line pitch from the homepage text density."""
    if not html:
        return ""

    soup = BeautifulSoup(html, 'html.parser')
    
    # Priority 1: Meta description
    meta_desc = soup.find('meta', attrs={'name': 'description'})
    if meta_desc and meta_desc.get('content'):
        return meta_desc.get('content').strip()

    # Priority 2: OG description
    og_desc = soup.find('meta', attrs={'property': 'og:description'})
    if og_desc and og_desc.get('content'):
        return og_desc.get('content').strip()

    # Priority 3: First meaningful <p> tag or <h1>
    for tag in soup.find_all(['h1', 'p']):
        text = tag.get_text(strip=True)
        if 40 < len(text) < 160: # Ideal pitch length
            return text
            
    return ""

def detect_company_size_hints(html: str) -> str:
    """Checks for signals of company size (e.g., 'Team of 50')."""
    if not html:
        return "Unknown"

    patterns = [
        r'team of (\d+)',
        r'(\d+)\+ employees',
        r'over (\d+) professionals',
        r'(\d+) offices worldwide'
    ]
    
def detect_language(html: str) -> str:
    """Detects the language of the page from <html> lang or meta tags."""
    if not html:
        return "en"

    soup = BeautifulSoup(html, 'html.parser')
    
    # 1. html lang attribute
    html_tag = soup.find('html')
    if html_tag and html_tag.get('lang'):
        return html_tag.get('lang').split('-')[0].lower()
        
    # 2. Meta content-language
    meta_lang = soup.find('meta', attrs={'http-equiv': 'content-language'})
    if meta_lang and meta_lang.get('content'):
        return meta_lang.get('content').split(',')[0].strip().lower()
        
    return "en" # Default to English

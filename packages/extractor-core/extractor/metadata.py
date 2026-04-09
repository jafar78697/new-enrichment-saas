import json
from bs4 import BeautifulSoup

def extract_metadata(html: str) -> dict[str, any]:
    """
    Extracts structured metadata and page tags.
    - JSON-LD / schema.org
    - Meta description, OG tags
    - Titles and headings
    - Company identification hints
    """
    if not html:
        return {}

    soup = BeautifulSoup(html, 'html.parser')
    results = {
        'title': '',
        'description': '',
        'headings': [],
        'json_ld': [],
        'og_tags': {}
    }

    # 1. Page Title
    if soup.title:
        results['title'] = soup.title.string.strip() if soup.title.string else ''

    # 2. Meta Tags
    for meta in soup.find_all('meta'):
        name = meta.get('name', '').lower()
        prop = meta.get('property', '').lower()
        content = meta.get('content', '').strip()
        
        if name == 'description':
            results['description'] = content
        elif prop.startswith('og:'):
            results['og_tags'][prop[3:]] = content
        elif prop == 'og:description' and not results['description']:
            results['description'] = content

    # 3. Headings (H1, H2)
    for h in soup.find_all(['h1', 'h2'], limit=10):
        t = h.get_text(strip=True)
        if t and len(t) > 3:
            results['headings'].append(t)

    # 4. JSON-LD
    for script in soup.find_all('script', type='application/ld+json'):
        try:
            data = json.loads(script.string)
            results['json_ld'].append(data)
        except:
            pass

    return results

def detect_company_info(metadata: dict) -> dict:
    """Heuristics for company details from metadata."""
    info = {
        'company_name': '',
        'industry': '',
        'brand': ''
    }
    
    # Try OG tags
    info['company_name'] = metadata.get('og_tags', {}).get('site_name', '')
    
    # Try JSON-LD for Organization
    for entry in metadata.get('json_ld', []):
        if isinstance(entry, dict):
            if entry.get('@type') == 'Organization':
                info['company_name'] = entry.get('name', info['company_name'])
                info['industry'] = entry.get('industry', '')
    
    return info


def extract_company_name(metadata: dict) -> str:
    """Extract company name from metadata."""
    info = detect_company_info(metadata)
    return info.get('company_name', '')

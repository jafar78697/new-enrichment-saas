import re
import phonenumbers
from phonenumbers import PhoneNumberMatcher

# Basic regex for catching tel: links
TEL_RE = re.compile(r'tel:([+]?[0-9.\-\s()]{7,})')

def extract_phones(html: str, region: str = 'US') -> list[str]:
    """
    Extracts phone numbers from HTML.
    - Matches tel: links
    - Matches text using phonenumbers library
    - Normalizes to E.164 format.
    """
    if not html:
        return []

    found = set()
    
    # 1. From tel: links using BeautifulSoup
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, 'html.parser')
    for a in soup.find_all('a', href=True):
        if a['href'].startswith('tel:'):
            raw = a['href'][4:].split('?')[0].strip()
            try:
                parsed = phonenumbers.parse(raw, region)
                if phonenumbers.is_valid_number(parsed):
                    found.add(phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164))
            except:
                pass
            
    # 2. From text using phonenumbers matcher
    for match in PhoneNumberMatcher(html, region):
        try:
            if phonenumbers.is_valid_number(match.number):
                found.add(phonenumbers.format_number(match.number, phonenumbers.PhoneNumberFormat.E164))
        except:
            pass
            
    return list(found)

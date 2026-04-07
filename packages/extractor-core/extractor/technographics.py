import re

# Common technology patterns in lead enrichment
# Patterns match script tags, meta tags, or specific class/ID indicators
TECH_PATTERNS = {
    # E-commerce
    'shopify': re.compile(r'cdn\.shopify\.com|myshopify\.com'),
    'woocommerce': re.compile(r'/wp-content/plugins/woocommerce'),
    'magento': re.compile(r'static/version|mage/'),
    'bigcommerce': re.compile(r'cdn\.bigcommerce\.com'),
    'wix': re.compile(r'static\.wixstatic\.com'),
    'squarespace': re.compile(r'static1\.squarespace\.com'),
    'stripe': re.compile(r'js\.stripe\.com'),
    
    # Marketing & CRM
    'hubspot': re.compile(r'js\.hs-scripts\.com|js\.hsadspixel\.net'),
    'marketo': re.compile(r'munchkin\.marketo\.net'),
    'mailchimp': re.compile(r'chimpstatic\.com'),
    'activecampaign': re.compile(r'trackcmp\.net'),
    'klaviyo': re.compile(r'static\.klaviyo\.com'),
    'salesforce': re.compile(r'salesforce\.com|force\.com'),
    'intercom': re.compile(r'widget\.intercom\.io'),
    'zendesk': re.compile(r'static\.zdassets\.com'),
    'hotjar': re.compile(r'static\.hotjar\.com'),
    
    # Analytics
    'google_analytics': re.compile(r'googletagmanager\.com/gtag/js|google-analytics\.com/analytics\.js'),
    'mixpanel': re.compile(r'cdn\.mxpnl\.com'),
    'facebook_pixel': re.compile(r'connect\.facebook\.net/.*/fbevents\.js'),
    
    # Frameworks & Libraries
    'react': re.compile(r'react-root|_react_root|__reactInternal'),
    'nextjs': re.compile(r'/_next/static/|_next/data/'),
    'vue': re.compile(r'v-cloak|data-v-|Vue\.component'),
    'wordpress': re.compile(r'/wp-content/|/wp-includes/'),
    'jquery': re.compile(r'jquery\.min\.js|jquery-.*\.js'),
    'tailwind': re.compile(r'tailwind\.config\.js|tw-'),
    'bootstrap': re.compile(r'bootstrap\.min\.css|bootstrap\.min\.js'),
    
    # Fonts & CMS
    'google_fonts': re.compile(r'fonts\.googleapis\.com'),
    'ghost': re.compile(r'ghost-portal\.min\.js'),
    'webflow': re.compile(r'webflow\.css|webflow\.js'),
}

def detect_tech_stack(html: str) -> list[str]:
    """Detects technologies from HTML content."""
    if not html:
        return []

    detected = set()
    for tech, pattern in TECH_PATTERNS.items():
        if pattern.search(html):
            detected.add(tech)
            
    return sorted(list(detected))

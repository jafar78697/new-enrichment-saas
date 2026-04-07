import unittest
from extractor.technographics import detect_tech_stack
from extractor.intelligence import detect_industry, extract_one_line_pitch, detect_company_size_hints
from extractor.discovery import suggest_discovery_urls

class TestPremiumExtraction(unittest.TestCase):
    
    def test_technographics(self):
        html = '<script src="https://cdn.shopify.com/something.js"></script><div class="_react_root"></div>'
        tech = detect_tech_stack(html)
        self.assertIn('shopify', tech)
        self.assertIn('react', tech)
        
    def test_industry_detection(self):
        html = "We provide cloud-based software solutions for enterprise subscription platforms."
        industry = detect_industry(html)
        self.assertEqual(industry, 'SaaS')
        
        html_ecom = "Buy our products now from our online shop and checkout with shipping."
        industry_ecom = detect_industry(html_ecom)
        self.assertEqual(industry_ecom, 'E-commerce')

    def test_pitch_extraction(self):
        html = """
        <html>
            <head><meta name="description" content="The best platform for lead enrichment."></head>
            <body><h1>Welcome</h1><p>Too short</p></body>
        </html>
        """
        pitch = extract_one_line_pitch(html)
        self.assertEqual(pitch, "The best platform for lead enrichment.")

    def test_company_size_hints(self):
        html = "We have a team of 50 professionals working across 3 offices."
        size = detect_company_size_hints(html)
        self.assertEqual(size, "Team of 50")
        
    def test_discovery_suggestions(self):
        base_url = "https://example.com"
        html = """
        <a href="/contact-us">Contact Page</a>
        <a href="https://example.com/about">About</a>
        <a href="/privacy-policy">Privacy</a>
        <a href="https://external.com">External</a>
        """
        suggestions = suggest_discovery_urls(html, base_url)
        self.assertIn("https://example.com/contact-us", suggestions)
        self.assertIn("https://example.com/about", suggestions)
        self.assertGreater(suggestions.index("https://example.com/contact-us"), -1)

if __name__ == '__main__':
    unittest.main()

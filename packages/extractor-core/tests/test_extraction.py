import unittest
from extractor.emails import extract_emails, filter_junk
from extractor.phones import extract_phones
from extractor.socials import extract_socials
from extractor.metadata import extract_metadata, detect_company_info
from extractor.confidence import score_confidence, ConfidenceLevel

HTML_FIXTURE = """
<html>
<head>
    <title>Awesome Solutions Inc</title>
    <meta name="description" content="We provide the best awesome solutions for your business.">
    <meta property="og:site_name" content="Awesome Solutions">
    <script type="application/ld+json">
    {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "Awesome Solutions Corp",
        "url": "https://awesomesolutions.com"
    }
    </script>
</head>
<body>
    <h1>Welcome to Awesome Solutions</h1>
    <p>Contact us at <a href="mailto:info@awesomesolutions.com">info@awesomesolutions.com</a> or hello@awesomesolutions.com</p>
    <p>Call us: +1 (650) 253-0000</p>
    <a href="tel:+16502530000">Click to call</a>
    <div class="socials">
        <a href="https://linkedin.com/company/awesome-solutions">LinkedIn</a>
        <a href="https://facebook.com/awesomesolutions">Facebook</a>
        <a href="https://instagram.com/awesomesolutions">Instagram</a>
        <a href="https://twitter.com/awesomesol">Twitter</a>
    </div>
    <footer>
        <p>&copy; 2024 Awesome Solutions Inc</p>
    </footer>
</body>
</html>
"""

class TestExtraction(unittest.TestCase):
    def test_email_extraction(self):
        emails = extract_emails(HTML_FIXTURE)
        self.assertIn('info@awesomesolutions.com', emails)
        self.assertIn('hello@awesomesolutions.com', emails)
        
    def test_junk_filter(self):
        junk = ['test@amazonaws.com', 'valid@gmail.com', 'image@example.com/logo.png']
        filtered = filter_junk(junk)
        self.assertEqual(filtered, ['valid@gmail.com'])
        
    def test_phone_extraction(self):
        phones = extract_phones(HTML_FIXTURE, region='US')
        self.assertIn('+16502530000', phones)
        
    def test_social_extraction(self):
        socials = extract_socials(HTML_FIXTURE)
        self.assertEqual(socials['linkedin'], 'https://linkedin.com/company/awesome-solutions')
        self.assertEqual(socials['facebook'], 'https://facebook.com/awesomesolutions')
        self.assertEqual(socials['instagram'], 'https://instagram.com/awesomesolutions')
        self.assertEqual(socials['twitter'], 'https://twitter.com/awesomesol')
        
    def test_metadata_extraction(self):
        meta = extract_metadata(HTML_FIXTURE)
        self.assertEqual(meta['title'], 'Awesome Solutions Inc')
        self.assertEqual(meta['description'], 'We provide the best awesome solutions for your business.')
        self.assertIn('Welcome to Awesome Solutions', meta['headings'])
        self.assertEqual(len(meta['json_ld']), 1)
        
    def test_company_detection(self):
        meta = extract_metadata(HTML_FIXTURE)
        info = detect_company_info(meta)
        self.assertEqual(info['company_name'], 'Awesome Solutions Corp')
        
    def test_confidence_scoring(self):
        score = score_confidence(
            ['test@test.com'], 
            ['+1234567890'], 
            {'li': '..', 'fb': '..', 'ig': '..'}, 
            {'title': '..'}
        )
        self.assertEqual(score, ConfidenceLevel.HIGH)

if __name__ == '__main__':
    unittest.main()

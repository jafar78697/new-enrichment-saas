import unittest
from normalizer.normalize import normalize
from normalizer.validate import validate_domain, InvalidDomainError

class TestDomainNormalizer(unittest.TestCase):
    def test_normalize_basic(self):
        """Standard URL normalization."""
        self.assertEqual(normalize('https://www.google.com/'), 'google.com')
        self.assertEqual(normalize('http://example.com/path?q=1'), 'example.com')
        self.assertEqual(normalize('www.facebook.com/user'), 'facebook.com')
        self.assertEqual(normalize('  https://WwW.MiCrOsOfT.cOm  '), 'microsoft.com')

    def test_normalize_no_protocol(self):
        """URL without protocol."""
        self.assertEqual(normalize('google.com'), 'google.com')
        self.assertEqual(normalize('www.github.com'), 'github.com')

    def test_normalize_punycode(self):
        """Internationalized symbols in domains."""
        # 'https://xn--dmain-jua.com/' (dömain.com)
        self.assertEqual(normalize('https://dömain.com/'), 'xn--dmain-jua.com')
        self.assertEqual(normalize('dömain.com'), 'xn--dmain-jua.com')

    def test_validate_domain(self):
        """Validation cases."""
        self.assertTrue(validate_domain('google.com'))
        self.assertTrue(validate_domain('xn--dmin-moa0i.com'))
        with self.assertRaises(InvalidDomainError):
            validate_domain('google')
        with self.assertRaises(InvalidDomainError):
            validate_domain('.google.com')
        with self.assertRaises(InvalidDomainError):
            validate_domain('google..com')
        with self.assertRaises(InvalidDomainError):
            validate_domain('')

if __name__ == '__main__':
    unittest.main()

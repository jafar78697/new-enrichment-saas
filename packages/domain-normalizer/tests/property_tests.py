import unittest
from hypothesis import given, settings, strategies as st
from normalizer.normalize import normalize

class TestDomainNormalizationProperty(unittest.TestCase):
    @settings(max_examples=500)
    @given(st.text())
    def test_domain_normalization_idempotency(self, url):
        """
        Property 1: Domain Normalization Idempotency
        - normalize(normalize(x)) == normalize(x)
        Feature: enrichment-saas-aws, Property 1
        Validates: Requirements 4.4
        """
        normalized_once = normalize(url)
        normalized_twice = normalize(normalized_once)
        self.assertEqual(normalized_once, normalized_twice)

if __name__ == '__main__':
    unittest.main()

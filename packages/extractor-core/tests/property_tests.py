import unittest
from hypothesis import given, settings, strategies as st
from extractor.emails import filter_junk
from extractor.confidence import score_confidence, ConfidenceLevel

class TestExtractorProperty(unittest.TestCase):
    @settings(max_examples=200)
    @given(st.lists(st.text()))
    def test_junk_email_exclusion_property(self, emails):
        """
        Property 9: Junk Email Exclusion
        - Known junk patterns should never be in filter_junk result.
        Feature: enrichment-saas-aws, Property 9
        Validates: Requirements 5.7
        """
        filtered = filter_junk(emails)
        junk_domains = {'amazonaws.com', 'googletagmanager.com', 'google.com'}
        for email in filtered:
            domain = email.split('@')[-1]
            self.assertFalse(any(domain == j or domain.endswith('.' + j) for j in junk_domains))

    def test_confidence_level_validity_property(self):
        """
        Property 13: Confidence Level Validity
        - result should always be one of the three valid ConfidenceLevel enum values.
        Feature: enrichment-saas-aws, Property 13
        Validates: Requirements 8.7
        """
        # Testing various combinations
        levels = set()
        levels.add(score_confidence(['test@example.com'], ['+1234567890'], {'linkedin': '...'}, {}))
        levels.add(score_confidence([], [], {}, {}))
        levels.add(score_confidence(['test@example.com'], [], {}, {}))
        
        for level in levels:
            self.assertIsInstance(level, ConfidenceLevel)

if __name__ == '__main__':
    unittest.main()

from enum import Enum

class ConfidenceLevel(str, Enum):
    HIGH = 'high_confidence'
    MEDIUM = 'medium_confidence'
    LOW = 'low_confidence'

def score_confidence(emails: list[str], phones: list[str], socials: dict[str, str], metadata: dict) -> ConfidenceLevel:
    """
    Scores the overall confidence of the extraction result.
    - HIGH: primary email + phone + 3+ social links
    - MEDIUM: primary email OR phone + some metadata
    - LOW: only metadata, no contact info
    """
    has_email = len(emails) > 0
    has_phone = len(phones) > 0
    social_count = len(socials)
    has_metadata = bool(metadata.get('title') or metadata.get('description'))

    if has_email and has_phone and social_count >= 3:
        return ConfidenceLevel.HIGH
    
    if has_email or (has_phone and has_metadata):
        return ConfidenceLevel.MEDIUM
        
    return ConfidenceLevel.LOW

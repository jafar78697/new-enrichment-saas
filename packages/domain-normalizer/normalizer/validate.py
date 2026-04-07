import re

class InvalidDomainError(Exception):
    """Exception raised for invalid domain formats."""
    pass

def validate_domain(domain: str) -> bool:
    """
    Validates a domain string format.
    - Check for valid characters.
    - Ensure it has at least one dot.
    - No leading/trailing dots.
    - No consecutive dots.
    - Max length 253.
    """
    if not domain:
        raise InvalidDomainError("Domain cannot be empty.")

    # 1. Length check
    if len(domain) > 253:
        raise InvalidDomainError("Domain exceeds maximum length of 253.")

    # 2. Character check (alphanumeric, dots, hyphens)
    # Punycode version will be validated by this regex as it's ASCII
    if not re.match(r'^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z|0-9]{2,}$', domain):
        raise InvalidDomainError(f"Invalid domain format: {domain}")

    # 3. Additional checks (no consecutive dots, leading/trailing dots handled by regex)
    return True

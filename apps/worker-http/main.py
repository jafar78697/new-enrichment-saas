import asyncio
import os
import json
import logging
import time
import re
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../packages/extractor-core'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../packages/domain-normalizer'))

import httpx
import boto3
from sqlalchemy import create_engine, text
from extractor.emails import extract_emails
from extractor.phones import extract_phones
from extractor.socials import extract_socials
from extractor.metadata import extract_metadata, extract_company_name
from extractor.technographics import detect_tech_stack
from extractor.intelligence import detect_industry, extract_one_line_pitch, detect_language
from extractor.confidence import score_confidence
from normalizer.normalize import normalize

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SQS_HTTP_QUEUE_URL = os.getenv("SQS_HTTP_QUEUE_URL", "")
SQS_BROWSER_QUEUE_URL = os.getenv("SQS_BROWSER_QUEUE_URL", "")
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/enrichment_saas")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

sqs = boto3.client('sqs', region_name=os.getenv("AWS_REGION", "us-east-1"))
engine = create_engine(DATABASE_URL)

# Redis for cooldown + circuit breaker
try:
    import redis as redis_lib
    redis_client = redis_lib.from_url(REDIS_URL, decode_responses=True)
except Exception:
    redis_client = None

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/118.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) AppleWebKit/605.1.15 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/117.0.0.0 Safari/537.36 Edg/117.0.0.0",
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/120.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Android 14; Mobile; rv:109.0) Gecko/109.0 Firefox/121.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/116.0.0.0 Safari/537.36 OPR/102.0.0.0",
]

_ua_index = 0
def get_user_agent() -> str:
    global _ua_index
    ua = USER_AGENTS[_ua_index % len(USER_AGENTS)]
    _ua_index += 1
    return ua

DISCOVERY_PATHS = ['/contact', '/about', '/team', '/support', '/company', '/careers', '/contact-us', '/about-us']
MAX_CONTENT_SIZE = 5 * 1024 * 1024  # 5MB
TIMEOUT_SECONDS = 30
MAX_HTTP_RETRIES = 3
COOLDOWN_SECONDS = 2
CIRCUIT_BREAKER_FAILURES = 3
CIRCUIT_BREAKER_TTL = 3600  # 1 hour

JS_SIGNALS = ['__NEXT_DATA__', '__NUXT__', 'vite', 'webpack', 'react-root', '__REACT_APP__', 'ng-version']

def is_circuit_broken(domain: str) -> bool:
    if not redis_client: return False
    return redis_client.exists(f"cb:{domain}") == 1

def record_failure(domain: str):
    if not redis_client: return
    key = f"cb_count:{domain}"
    count = redis_client.incr(key)
    redis_client.expire(key, CIRCUIT_BREAKER_TTL)
    if count >= CIRCUIT_BREAKER_FAILURES:
        redis_client.setex(f"cb:{domain}", CIRCUIT_BREAKER_TTL, "1")
        logger.warning(f"Circuit breaker triggered for {domain}")

def reset_failures(domain: str):
    if not redis_client: return
    redis_client.delete(f"cb_count:{domain}")

def enforce_cooldown(domain: str):
    if not redis_client: return
    key = f"cooldown:{domain}"
    last = redis_client.get(key)
    if last:
        elapsed = time.time() - float(last)
        if elapsed < COOLDOWN_SECONDS:
            time.sleep(COOLDOWN_SECONDS - elapsed)
    redis_client.set(key, str(time.time()), ex=60)

def is_js_heavy(html: str) -> bool:
    text_content = re.sub(r'<[^>]+>', ' ', html)
    text_content = re.sub(r'\s+', ' ', text_content).strip()
    if len(text_content) < 200:
        return True
    for signal in JS_SIGNALS:
        if signal in html:
            return True
    root_div = re.search(r'<div[^>]+id=["\']root["\'][^>]*>(.*?)</div>', html, re.DOTALL)
    if root_div and len(root_div.group(1).strip()) < 50:
        return True
    return False

def map_socials(social_list: list) -> dict:
    mapping = {
        'linkedin.com': 'linkedin_url', 'facebook.com': 'facebook_url',
        'instagram.com': 'instagram_url', 'twitter.com': 'twitter_url',
        'x.com': 'twitter_url', 'youtube.com': 'youtube_url',
        'tiktok.com': 'tiktok_url', 'whatsapp.com': 'whatsapp_link',
        't.me': 'telegram_link'
    }
    result = {}
    for url in social_list:
        for domain, col in mapping.items():
            if domain in url.lower():
                result[col] = url
                break
    return result

async def fetch_page(client: httpx.AsyncClient, url: str) -> str | None:
    try:
        resp = await client.get(url, headers={'User-Agent': get_user_agent()}, timeout=TIMEOUT_SECONDS, follow_redirects=True)
        if resp.status_code == 429:
            if redis_client:
                domain = url.split('/')[2]
                redis_client.setex(f"rate_limit:{domain}", 600, "1")
            return None
        if len(resp.content) > MAX_CONTENT_SIZE:
            return None
        return resp.text
    except Exception as e:
        logger.debug(f"Fetch error {url}: {e}")
        return None

def update_job_item_status(job_item_id: str, status: str, error: str = None):
    with engine.connect() as conn:
        conn.execute(text(
            "UPDATE enrichment_job_items SET status = :status, last_error = :error, finished_at = now() WHERE id = :id"
        ), {"status": status, "error": error, "id": job_item_id})
        conn.commit()

def save_result(job_item_id: str, tenant_id: str, domain: str, emails: list, phones: list, socials: dict, meta: dict, tech: list, industry: str, pitch: str, confidence, lane: str = 'http'):
    with engine.connect() as conn:
        # Check if result row exists
        existing = conn.execute(text("SELECT id FROM enrichment_results WHERE job_item_id = :id"), {"id": job_item_id}).fetchone()
        if existing:
            conn.execute(text("""
                UPDATE enrichment_results SET
                    primary_email = :primary_email, additional_emails = :additional_emails,
                    primary_phone = :primary_phone, additional_phones = :additional_phones,
                    linkedin_url = :linkedin_url, facebook_url = :facebook_url,
                    twitter_url = :twitter_url, instagram_url = :instagram_url,
                    youtube_url = :youtube_url, tiktok_url = :tiktok_url,
                    whatsapp_link = :whatsapp_link, telegram_link = :telegram_link,
                    company_name = :company_name, one_line_pitch = :one_line_pitch,
                    industry_guess = :industry_guess, cms_guess = :cms_guess,
                    ecommerce_signal = :ecommerce_signal, saas_signal = :saas_signal,
                    confidence_level = :confidence_level, enrichment_lane = :lane,
                    raw_result = :raw_result
                WHERE job_item_id = :job_item_id
            """), {
                "primary_email": emails[0] if emails else None,
                "additional_emails": emails[1:],
                "primary_phone": phones[0] if phones else None,
                "additional_phones": phones[1:],
                "linkedin_url": socials.get('linkedin_url'),
                "facebook_url": socials.get('facebook_url'),
                "twitter_url": socials.get('twitter_url'),
                "instagram_url": socials.get('instagram_url'),
                "youtube_url": socials.get('youtube_url'),
                "tiktok_url": socials.get('tiktok_url'),
                "whatsapp_link": socials.get('whatsapp_link'),
                "telegram_link": socials.get('telegram_link'),
                "company_name": extract_company_name(meta.get('html', '')),
                "one_line_pitch": pitch,
                "industry_guess": industry,
                "cms_guess": next((t for t in ['shopify', 'wordpress', 'wix', 'squarespace'] if t in tech), None),
                "ecommerce_signal": any(t in tech for t in ['shopify', 'woocommerce', 'magento']),
                "saas_signal": industry == 'SaaS',
                "confidence_level": str(confidence.value),
                "lane": lane,
                "raw_result": json.dumps({"tech": tech, "meta": meta}),
                "job_item_id": job_item_id
            })
        else:
            conn.execute(text("""
                INSERT INTO enrichment_results (job_item_id, tenant_id, domain, primary_email, additional_emails,
                    primary_phone, additional_phones, linkedin_url, facebook_url, twitter_url, instagram_url,
                    youtube_url, tiktok_url, whatsapp_link, telegram_link, company_name, one_line_pitch,
                    industry_guess, cms_guess, ecommerce_signal, saas_signal, confidence_level, enrichment_lane, raw_result)
                VALUES (:job_item_id, :tenant_id, :domain, :primary_email, :additional_emails,
                    :primary_phone, :additional_phones, :linkedin_url, :facebook_url, :twitter_url, :instagram_url,
                    :youtube_url, :tiktok_url, :whatsapp_link, :telegram_link, :company_name, :one_line_pitch,
                    :industry_guess, :cms_guess, :ecommerce_signal, :saas_signal, :confidence_level, :lane, :raw_result)
            """), {
                "job_item_id": job_item_id, "tenant_id": tenant_id, "domain": domain,
                "primary_email": emails[0] if emails else None,
                "additional_emails": emails[1:],
                "primary_phone": phones[0] if phones else None,
                "additional_phones": phones[1:],
                "linkedin_url": socials.get('linkedin_url'),
                "facebook_url": socials.get('facebook_url'),
                "twitter_url": socials.get('twitter_url'),
                "instagram_url": socials.get('instagram_url'),
                "youtube_url": socials.get('youtube_url'),
                "tiktok_url": socials.get('tiktok_url'),
                "whatsapp_link": socials.get('whatsapp_link'),
                "telegram_link": socials.get('telegram_link'),
                "company_name": None,
                "one_line_pitch": pitch,
                "industry_guess": industry,
                "cms_guess": next((t for t in ['shopify', 'wordpress', 'wix', 'squarespace'] if t in tech), None),
                "ecommerce_signal": any(t in tech for t in ['shopify', 'woocommerce', 'magento']),
                "saas_signal": industry == 'SaaS',
                "confidence_level": str(confidence.value),
                "lane": lane,
                "raw_result": json.dumps({"tech": tech, "meta": meta})
            })
        conn.commit()

async def process_task(task: dict):
    job_item_id = task.get('job_item_id')
    job_id = task.get('job_id')
    tenant_id = task.get('tenant_id')
    domain = task.get('domain')
    mode = task.get('mode', 'smart_hybrid')
    attempt = task.get('attempt', 1)

    if not domain or not job_item_id:
        return

    normalized_domain = normalize(domain)
    if not normalized_domain:
        update_job_item_status(job_item_id, 'failed', 'Invalid domain')
        return

    # Circuit breaker check
    if is_circuit_broken(normalized_domain):
        logger.warning(f"Circuit broken for {normalized_domain}, skipping")
        update_job_item_status(job_item_id, 'failed', 'Circuit breaker: too many failures')
        return

    # Rate limit check
    if redis_client and redis_client.exists(f"rate_limit:{normalized_domain}"):
        update_job_item_status(job_item_id, 'failed', 'Rate limited by target')
        return

    # Update status to processing
    with engine.connect() as conn:
        conn.execute(text("UPDATE enrichment_job_items SET status = 'processing_http', started_at = now(), http_attempts = http_attempts + 1 WHERE id = :id"), {"id": job_item_id})
        conn.commit()

    enforce_cooldown(normalized_domain)

    base_url = f"https://{normalized_domain}"
    all_emails, all_phones, all_socials = [], [], []
    all_tech, all_meta = [], {}
    industry, pitch = '', ''

    PERMANENT_ERRORS = [400, 401, 403, 404, 410, 451]

    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS, follow_redirects=True) as client:
        # Fetch homepage with retry
        html = None
        for retry in range(MAX_HTTP_RETRIES):
            html = await fetch_page(client, base_url)
            if html is not None:
                break
            if retry < MAX_HTTP_RETRIES - 1:
                wait = 2 ** retry  # 1s, 2s, 4s
                logger.info(f"Retry {retry + 1} for {normalized_domain} in {wait}s")
                await asyncio.sleep(wait)

        if html is None:
            record_failure(normalized_domain)
            update_job_item_status(job_item_id, 'failed', 'Website unreachable after retries')
            return

        reset_failures(normalized_domain)

        # Extract from homepage
        all_emails.extend(extract_emails(html))
        all_phones.extend(extract_phones(html))
        all_socials.extend(extract_socials(html))
        all_tech = detect_tech_stack(html)
        all_meta = extract_metadata(html)
        industry = detect_industry(html)
        pitch = extract_one_line_pitch(html)

        # Page discovery
        for path in DISCOVERY_PATHS:
            sub_url = f"{base_url}{path}"
            sub_html = await fetch_page(client, sub_url)
            if sub_html:
                all_emails.extend(extract_emails(sub_html))
                all_phones.extend(extract_phones(sub_html))
                all_socials.extend(extract_socials(sub_html))

    # Dedupe
    all_emails = list(dict.fromkeys(all_emails))
    all_phones = list(dict.fromkeys(all_phones))
    all_socials = list(dict.fromkeys(all_socials))
    social_mapping = map_socials(all_socials)
    confidence = score_confidence(all_emails, all_phones, social_mapping, all_meta)

    # JS detection for smart_hybrid
    if mode == 'smart_hybrid' and is_js_heavy(html) and not all_emails and not all_phones:
        logger.info(f"JS-heavy detected for {normalized_domain}, escalating to browser queue")
        if SQS_BROWSER_QUEUE_URL:
            sqs.send_message(
                QueueUrl=SQS_BROWSER_QUEUE_URL,
                MessageBody=json.dumps({**task, 'escalated_from_http': True, 'attempt': 1})
            )
        update_job_item_status(job_item_id, 'processing_browser')
        return

    # Save result
    save_result(job_item_id, tenant_id, normalized_domain, all_emails, all_phones, social_mapping, all_meta, all_tech, industry, pitch, confidence, 'http')

    status = 'completed' if all_emails or all_phones else 'partial'
    update_job_item_status(job_item_id, status)

    # Update job progress counter
    with engine.connect() as conn:
        conn.execute(text(
            "UPDATE enrichment_jobs SET completed_items = completed_items + 1, http_completed = http_completed + 1 WHERE id = :id"
        ), {"id": job_id})
        conn.commit()

    logger.info(f"Done [{status}]: {normalized_domain} — emails:{len(all_emails)} phones:{len(all_phones)}")

async def worker_loop():
    logger.info("HTTP Worker Started...")
    while True:
        try:
            response = sqs.receive_message(
                QueueUrl=SQS_HTTP_QUEUE_URL,
                MaxNumberOfMessages=5,
                WaitTimeSeconds=20
            )
            messages = response.get('Messages', [])
            tasks = []
            for msg in messages:
                task = json.loads(msg['Body'])
                tasks.append((process_task(task), msg['ReceiptHandle']))

            for coro, receipt in tasks:
                await coro
                sqs.delete_message(QueueUrl=SQS_HTTP_QUEUE_URL, ReceiptHandle=receipt)

        except Exception as e:
            logger.error(f"Worker loop error: {e}")
            await asyncio.sleep(5)

if __name__ == "__main__":
    asyncio.run(worker_loop())

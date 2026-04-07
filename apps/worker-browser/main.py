import asyncio
import os
import json
import logging
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../packages/extractor-core'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../packages/domain-normalizer'))

import boto3
from playwright.async_api import async_playwright, Browser, BrowserContext
from sqlalchemy import create_engine, text
from extractor.emails import extract_emails
from extractor.phones import extract_phones
from extractor.socials import extract_socials
from extractor.metadata import extract_metadata, extract_company_name
from extractor.technographics import detect_tech_stack
from extractor.intelligence import detect_industry, extract_one_line_pitch
from extractor.discovery import suggest_discovery_urls
from extractor.confidence import score_confidence
from normalizer.normalize import normalize

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SQS_BROWSER_QUEUE_URL = os.getenv("SQS_BROWSER_QUEUE_URL", "")
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/enrichment_saas")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

sqs = boto3.client('sqs', region_name=os.getenv("AWS_REGION", "us-east-1"))
engine = create_engine(DATABASE_URL)

try:
    import redis as redis_lib
    redis_client = redis_lib.from_url(REDIS_URL, decode_responses=True)
except Exception:
    redis_client = None

PLAN_CONCURRENCY = {'starter': 2, 'growth': 5, 'pro': 10}
GLOBAL_MAX_BROWSERS = 20
PAGE_TIMEOUT = 30000  # 30s
MAX_CRAWL_PAGES = 3
DISCOVERY_PATHS = ['/contact', '/about', '/team', '/company', '/support', '/careers']

# Global concurrency semaphore
_global_semaphore = asyncio.Semaphore(GLOBAL_MAX_BROWSERS)

def check_and_deduct_credit(tenant_id: str) -> bool:
    """Atomically check and deduct browser credit. Returns True if credit available."""
    if not redis_client:
        # Fallback: check DB directly
        with engine.connect() as conn:
            row = conn.execute(text(
                "SELECT browser_credits_remaining FROM usage_counters WHERE tenant_id = :tid AND billing_period_start = date_trunc('month', now())::date"
            ), {"tid": tenant_id}).fetchone()
            if not row or row[0] <= 0:
                return False
            conn.execute(text(
                "UPDATE usage_counters SET browser_credits_remaining = browser_credits_remaining - 1, browser_credits_used = browser_credits_used + 1 WHERE tenant_id = :tid AND billing_period_start = date_trunc('month', now())::date AND browser_credits_remaining > 0"
            ), {"tid": tenant_id})
            conn.commit()
            return True

    key = f"enr:credits:{tenant_id}"
    # Atomic decrement
    new_val = redis_client.decr(key)
    if new_val < 0:
        redis_client.incr(key)  # rollback
        return False
    # Sync to DB async (best effort)
    try:
        with engine.connect() as conn:
            conn.execute(text(
                "UPDATE usage_counters SET browser_credits_remaining = browser_credits_remaining - 1, browser_credits_used = browser_credits_used + 1 WHERE tenant_id = :tid AND billing_period_start = date_trunc('month', now())::date"
            ), {"tid": tenant_id})
            conn.commit()
    except Exception as e:
        logger.warning(f"DB credit sync failed: {e}")
    return True

def get_tenant_plan(tenant_id: str) -> str:
    with engine.connect() as conn:
        row = conn.execute(text("SELECT plan FROM tenants WHERE id = :id"), {"id": tenant_id}).fetchone()
        return row[0] if row else 'starter'

def check_tenant_concurrency(tenant_id: str, plan: str) -> bool:
    if not redis_client: return True
    key = f"enr:browser_concurrency:{tenant_id}"
    limit = PLAN_CONCURRENCY.get(plan, 2)
    current = int(redis_client.get(key) or 0)
    return current < limit

def increment_concurrency(tenant_id: str):
    if not redis_client: return
    key = f"enr:browser_concurrency:{tenant_id}"
    redis_client.incr(key)
    redis_client.expire(key, 120)

def decrement_concurrency(tenant_id: str):
    if not redis_client: return
    key = f"enr:browser_concurrency:{tenant_id}"
    val = int(redis_client.get(key) or 0)
    if val > 0:
        redis_client.decr(key)

def update_job_item_status(job_item_id: str, status: str, error: str = None):
    with engine.connect() as conn:
        conn.execute(text(
            "UPDATE enrichment_job_items SET status = :status, last_error = :error, finished_at = now() WHERE id = :id"
        ), {"status": status, "error": error, "id": job_item_id})
        conn.commit()

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

def save_result(job_item_id: str, tenant_id: str, domain: str, emails: list, phones: list, socials: dict, meta: dict, tech: list, industry: str, pitch: str, confidence):
    with engine.connect() as conn:
        existing = conn.execute(text("SELECT id FROM enrichment_results WHERE job_item_id = :id"), {"id": job_item_id}).fetchone()
        data = {
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
            "company_name": extract_company_name(meta.get('html', '')),
            "one_line_pitch": pitch,
            "industry_guess": industry,
            "cms_guess": next((t for t in ['shopify', 'wordpress', 'wix'] if t in tech), None),
            "ecommerce_signal": any(t in tech for t in ['shopify', 'woocommerce']),
            "saas_signal": industry == 'SaaS',
            "confidence_level": str(confidence.value),
            "raw_result": json.dumps({"tech": tech, "meta": meta})
        }
        if existing:
            sets = ", ".join([f"{k} = :{k}" for k in data if k not in ('job_item_id', 'tenant_id', 'domain')])
            conn.execute(text(f"UPDATE enrichment_results SET {sets}, enrichment_lane = 'browser' WHERE job_item_id = :job_item_id"), data)
        else:
            cols = ", ".join(data.keys()) + ", enrichment_lane"
            vals = ", ".join([f":{k}" for k in data.keys()]) + ", 'browser'"
            conn.execute(text(f"INSERT INTO enrichment_results ({cols}) VALUES ({vals})"), data)
        conn.commit()

async def scrape_page(page, url: str) -> dict | None:
    try:
        await page.goto(url, wait_until="networkidle", timeout=PAGE_TIMEOUT)
        html = await page.content()
        return {
            "emails": extract_emails(html),
            "phones": extract_phones(html),
            "socials": extract_socials(html),
            "meta": extract_metadata(html),
            "tech": detect_tech_stack(html),
            "industry": detect_industry(html),
            "pitch": extract_one_line_pitch(html),
            "html": html
        }
    except Exception as e:
        logger.warning(f"Page scrape error {url}: {e}")
        return None

async def process_task(context: BrowserContext, task: dict):
    job_item_id = task.get('job_item_id')
    job_id = task.get('job_id')
    tenant_id = task.get('tenant_id')
    domain = task.get('domain')

    if not domain or not job_item_id:
        return

    normalized_domain = normalize(domain)
    if not normalized_domain:
        update_job_item_status(job_item_id, 'failed', 'Invalid domain')
        return

    # Get tenant plan
    plan = get_tenant_plan(tenant_id)

    # Check browser credits
    if not check_and_deduct_credit(tenant_id):
        logger.warning(f"Insufficient browser credits for tenant {tenant_id}")
        update_job_item_status(job_item_id, 'insufficient_credits', 'No browser credits remaining')
        return

    # Check per-tenant concurrency
    if not check_tenant_concurrency(tenant_id, plan):
        logger.warning(f"Tenant {tenant_id} concurrency limit reached, re-queuing")
        # Re-queue with delay
        sqs.send_message(QueueUrl=SQS_BROWSER_QUEUE_URL, MessageBody=json.dumps(task), DelaySeconds=30)
        # Refund credit
        if redis_client:
            redis_client.incr(f"enr:credits:{tenant_id}")
        return

    increment_concurrency(tenant_id)

    async with _global_semaphore:
        page = await context.new_page()
        try:
            # Block heavy resources
            await page.route("**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf,mp4,mp3}", lambda route: route.abort())

            update_job_item_status(job_item_id, 'processing_browser')

            root_url = f"https://{normalized_domain}"
            data = await scrape_page(page, root_url)

            if not data:
                update_job_item_status(job_item_id, 'browser_timeout', 'Failed to render page')
                return

            all_emails = list(data["emails"])
            all_phones = list(data["phones"])
            all_socials = list(data["socials"])

            # Deep crawl if missing contact info
            if not all_emails and not all_phones:
                discovery_urls = suggest_discovery_urls(data["html"], root_url)
                for sub_url in (discovery_urls or [])[:MAX_CRAWL_PAGES]:
                    sub_data = await scrape_page(page, sub_url)
                    if sub_data:
                        all_emails = list(set(all_emails + sub_data["emails"]))
                        all_phones = list(set(all_phones + sub_data["phones"]))
                        all_socials = list(set(all_socials + sub_data["socials"]))

            social_mapping = map_socials(all_socials)
            confidence = score_confidence(all_emails, all_phones, social_mapping, data["meta"])

            save_result(job_item_id, tenant_id, normalized_domain, all_emails, all_phones, social_mapping, data["meta"], data["tech"], data["industry"], data["pitch"], confidence)

            status = 'completed' if all_emails or all_phones else 'partial'
            update_job_item_status(job_item_id, status)

            # Update job progress
            with engine.connect() as conn:
                conn.execute(text(
                    "UPDATE enrichment_jobs SET completed_items = completed_items + 1, browser_completed = browser_completed + 1 WHERE id = :id"
                ), {"id": job_id})
                conn.commit()

            logger.info(f"Browser done [{status}]: {normalized_domain}")

        except Exception as e:
            logger.error(f"Browser worker error for {normalized_domain}: {e}")
            update_job_item_status(job_item_id, 'failed', str(e))
        finally:
            await page.close()
            decrement_concurrency(tenant_id)

async def worker_loop():
    async with async_playwright() as p:
        browser: Browser = await p.chromium.launch(
            headless=True,
            args=['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        )
        context: BrowserContext = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 800}
        )

        logger.info("Browser Worker Started...")
        try:
            while True:
                try:
                    response = sqs.receive_message(
                        QueueUrl=SQS_BROWSER_QUEUE_URL,
                        MaxNumberOfMessages=5,
                        WaitTimeSeconds=20
                    )
                    messages = response.get('Messages', [])
                    for msg in messages:
                        task = json.loads(msg['Body'])
                        await process_task(context, task)
                        sqs.delete_message(QueueUrl=SQS_BROWSER_QUEUE_URL, ReceiptHandle=msg['ReceiptHandle'])
                except Exception as e:
                    logger.error(f"Worker loop error: {e}")
                    await asyncio.sleep(5)
        finally:
            await context.close()
            await browser.close()

if __name__ == "__main__":
    asyncio.run(worker_loop())

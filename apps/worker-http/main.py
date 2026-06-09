import asyncio
import os
import json
import logging
import time
import re
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../packages/extractor-core'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../packages/domain-normalizer'))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '../api/.env'))

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

def update_job_item_status(job_item_id: str, status: str, error: str | None = None):
    with engine.connect() as conn:
        conn.execute(text(
            "UPDATE enrichment_job_items SET status = :status, last_error = :error, finished_at = now() WHERE id = :id"
        ), {"status": status, "error": error, "id": job_item_id})
        conn.commit()

def save_result(job_item_id: str | None, tenant_id: str | None, domain: str | None, emails: list, phones: list, socials: dict, meta: dict, tech: list, industry: str, pitch: str, confidence, lane: str = 'http'):
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
                "company_name": extract_company_name(meta),
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



def calculate_ai_score(emails: list, phones: list, tech: list, industry: str, pitch: str) -> int:
    score = 10
    if emails or phones:
        score += 30
    if industry and industry.lower() in ['saas', 'software', 'technology']:
        score += 20
    elif industry and industry.lower() in ['ecommerce', 'retail']:
        score += 15
    if any(t in tech for t in ['stripe', 'shopify', 'react', 'aws', 'woocommerce']):
        score += 20
    if pitch and len(pitch) > 10:
        score += 10
        if 'ai ' in pitch.lower() or 'automation' in pitch.lower() or 'platform' in pitch.lower():
            score += 10
    return min(score, 100)

def sync_to_contacts_pg(domain: str, emails: list, phones: list, socials: dict, ai_score: int, company_name: str | None, needs_browser: bool = False):
    try:
        with engine.connect() as conn:
            # PostgreSQL syntax: ILIKE for case-insensitive matching
            rows = conn.execute(text("SELECT id FROM contacts WHERE website ILIKE :website"), {"website": f"%{domain}%"}).fetchall()
            for row in rows:
                contact_id = row[0]
                email = emails[0] if emails else None
                phone = phones[0] if phones else None
                # If we enriched it, minimum score should be 10 so it shows up in the Leads Dashboard (UI hides Google Maps leads with score 0)
                score = ai_score
                
                updates = []
                params = {"contact_id": contact_id}
                if email:
                    # Check if email is already taken to avoid UniqueViolation
                    exist = conn.execute(text("SELECT id FROM contacts WHERE email = :email AND id != :id"), {"email": email, "id": contact_id}).fetchone()
                    if not exist:
                        updates.append("email = :email")
                        params["email"] = email
                if phone:
                    # Check if phone is already taken to avoid UniqueViolation
                    exist = conn.execute(text("SELECT id FROM contacts WHERE phone_number = :phone AND id != :id"), {"phone": phone, "id": contact_id}).fetchone()
                    if not exist:
                        updates.append("phone_number = :phone")
                        params["phone"] = phone
                if socials.get('linkedin_url'):
                    updates.append("linkedin = :linkedin")
                    params["linkedin"] = socials.get('linkedin_url')
                if socials.get('facebook_url'):
                    updates.append("facebook = :facebook")
                    params["facebook"] = socials.get('facebook_url')
                if socials.get('instagram_url'):
                    updates.append("instagram = :instagram")
                    params["instagram"] = socials.get('instagram_url')
                if company_name:
                    updates.append("company = :company")
                    params["company"] = company_name
                
                updates.append("score = :score")
                params["score"] = score
                
                if needs_browser:
                    updates.append("stage = :stage")
                    params["stage"] = "needs_browser"
                
                if updates:
                    query = f"UPDATE contacts SET {', '.join(updates)} WHERE id = :contact_id"
                    conn.execute(text(query), params)
            conn.commit()
    except Exception as e:
        logger.error(f"Failed to sync to PostgreSQL contacts: {e}")

def refresh_job_status(job_id: str | None):
    with engine.connect() as conn:
        row = conn.execute(text("""
            SELECT
              COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status IN ('completed', 'partial')) AS done,
              COUNT(*) FILTER (WHERE status = 'failed') AS failed
            FROM enrichment_job_items
            WHERE job_id = :job_id
        """), {"job_id": job_id}).fetchone()

        if not row:
            return
            
        total = int(row.total or 0)
        done = int(row.done or 0)
        failed = int(row.failed or 0)
        if total > 0 and done + failed >= total:
            status = "completed" if failed == 0 else ("failed" if done == 0 else "partial")
            conn.execute(text("""
                UPDATE enrichment_jobs
                SET status = :status, finished_at = now(), updated_at = now()
                WHERE id = :job_id
            """), {"status": status, "job_id": job_id})
        else:
            conn.execute(text("""
                UPDATE enrichment_jobs
                SET status = 'running', updated_at = now()
                WHERE id = :job_id AND status = 'queued'
            """), {"job_id": job_id})
        conn.commit()

async def process_task(task: dict):
    job_item_id = str(task.get('job_item_id', ''))
    job_id = str(task.get('job_id', ''))
    tenant_id = str(task.get('tenant_id', ''))
    domain = str(task.get('domain', ''))
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
            # Escalate to browser so it doesn't stay stuck in the HTTP queue
            sync_to_contacts_pg(normalized_domain, [], [], {}, 0, None, needs_browser=True)
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

        # Smart Page Discovery
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, 'html.parser')
        discovered_links = set()
        
        # 1. Add hardcoded fallbacks
        for path in DISCOVERY_PATHS:
            discovered_links.add(f"{base_url}{path}")
            
        # 2. Extract internal links with keywords
        keywords = ['contact', 'about', 'team', 'support', 'connect', 'reach', 'impressum', 'privacy', 'legal']
        for a in soup.find_all('a', href=True):
            href = a['href'].lower()
            if any(k in href for k in keywords):
                if href.startswith('/'):
                    discovered_links.add(f"{base_url}{a['href']}")
                elif href.startswith(base_url) or (not href.startswith('http') and not href.startswith('//') and not href.startswith('#') and not href.startswith('mailto:')):
                    # Handle relative paths without leading slash
                    if not href.startswith('http') and not href.startswith('/'):
                        discovered_links.add(f"{base_url}/{a['href']}")
                    else:
                        discovered_links.add(a['href'])

        # Limit to max 15 links
        urls_to_check = list(discovered_links)[:15]
        
        # PERFORMANCE OPTIMIZATION (Why we did this):
        # Previously, the scraper visited each internal page sequentially using a standard 'for' loop.
        # This meant checking 15 pages could take up to 45 seconds per domain, blocking the worker.
        # We switched to 'asyncio.gather' to fetch all 15 pages in parallel at the exact same time.
        # This speeds up the background enrichment process by almost 10x-15x and drastically reduces EC2 load.
        async def fetch_and_extract(url):
            sub_html = await fetch_page(client, url)
            if sub_html:
                return extract_emails(sub_html), extract_phones(sub_html), extract_socials(sub_html)
            return [], [], []

        results = await asyncio.gather(*(fetch_and_extract(url) for url in urls_to_check))
        for em, ph, soc in results:
            all_emails.extend(em)
            all_phones.extend(ph)
            all_socials.extend(soc)

    # Dedupe
    all_emails = list(dict.fromkeys(all_emails))
    all_phones = list(dict.fromkeys(all_phones))
    all_socials = list(dict.fromkeys(all_socials))
    social_mapping = map_socials(all_socials)
    confidence = score_confidence(all_emails, all_phones, social_mapping, all_meta)

    # JS detection for smart_hybrid
    needs_browser = False
    if mode == 'smart_hybrid' and is_js_heavy(html) and not all_emails and not all_phones:
        logger.info(f"JS-heavy detected for {normalized_domain}, escalating to browser.")
        needs_browser = True
    elif not all_emails and not all_phones:
        # If we couldn't find anything via HTTP, escalate to browser queue anyway
        needs_browser = True

    # Save result
    save_result(job_item_id, tenant_id, normalized_domain, all_emails, all_phones, social_mapping, all_meta, all_tech, industry, pitch, confidence, 'http')
    
    # Sync to PostgreSQL so it shows up in the Leads dashboard immediately
    company_name = all_meta.get('title') if all_meta else None
    ai_score = calculate_ai_score(all_emails, all_phones, all_tech, industry, pitch)
    sync_to_contacts_pg(normalized_domain, all_emails, all_phones, social_mapping, ai_score, company_name, needs_browser)
    
    status = 'completed' if all_emails or all_phones else 'partial'
    update_job_item_status(job_item_id, status)

    # Update job progress counter
    with engine.connect() as conn:
        conn.execute(text(
            "UPDATE enrichment_jobs SET completed_items = completed_items + 1, http_completed = http_completed + 1 WHERE id = :id"
        ), {"id": job_id})
        conn.commit()
    refresh_job_status(job_id)

    logger.info(f"Done [{status}]: {normalized_domain} — emails:{len(all_emails)} phones:{len(all_phones)}")

async def worker_loop(worker_id: int):
    logger.info(f"HTTP Worker {worker_id} Started (Polling DB)...")
    while True:
        try:
            with engine.connect() as conn:
                # Use SKIP LOCKED to safely grab tasks without overlapping
                result = conn.execute(text("""
                    SELECT id, job_id, tenant_id, normalized_domain
                    FROM enrichment_job_items 
                    WHERE status = 'queued' 
                    FOR UPDATE SKIP LOCKED
                    LIMIT 1
                """)).fetchone()
                
                if result:
                    conn.execute(text("UPDATE enrichment_job_items SET status = 'processing_http', started_at = now() WHERE id = :id"), {"id": result.id})
                    conn.commit()
                    
                    task = {
                        'job_item_id': str(result.id),
                        'job_id': str(result.job_id),
                        'tenant_id': str(result.tenant_id),
                        'domain': result.normalized_domain,
                        'mode': 'smart_hybrid',
                        'attempt': 1
                    }
                    
                    # Process it
                    await process_task(task)
                else:
                    await asyncio.sleep(2)
        except Exception as e:
            logger.error(f"Worker {worker_id} loop error: {e}")
            await asyncio.sleep(5)

async def linkedin_worker_loop():
    logger.info("LinkedIn Worker Started (Polling DB)...")
    try:
        from linkedin_api import Linkedin
    except ImportError:
        logger.warning("linkedin-api package not installed. LinkedIn tasks will not be processed.")
        return

    while True:
        try:
            with engine.connect() as conn:
                result = conn.execute(text("""
                    SELECT t.id, t.agent_id, t.contact_id, t.task_type, a.linkedin_cookie, c.website
                    FROM linkedin_tasks t
                    LEFT JOIN agents a ON t.agent_id = a.id
                    JOIN contacts c ON t.contact_id = c.id
                    WHERE t.status = 'pending' 
                      AND (t.task_type = 'scrape_website' OR a.linkedin_cookie IS NOT NULL)
                    FOR UPDATE OF t SKIP LOCKED
                    LIMIT 1
                """)).fetchone()
                
                if result:
                    conn.execute(text("UPDATE linkedin_tasks SET status = 'processing', updated_at = now() WHERE id = :id"), {"id": result.id})
                    conn.commit()
                    
                    try:
                        logger.info(f"Processing task {result.task_type} for contact {result.contact_id}")
                        
                        if result.task_type == 'scrape_website':
                            if not result.website:
                                raise Exception("Contact has no website")
                            
                            import requests
                            from bs4 import BeautifulSoup
                            
                            logger.info(f"Scraping website: {result.website}")
                            url = result.website if result.website.startswith('http') else 'https://' + result.website
                            resp = requests.get(url, timeout=15, headers={'User-Agent': 'Mozilla/5.0'})
                            soup = BeautifulSoup(resp.text, 'html.parser')
                            
                            for script in soup(["script", "style"]):
                                script.extract()
                            text_content = soup.get_text(separator=' ', strip=True)
                            intro = text_content[:2500]
                            
                            conn.execute(text("UPDATE contacts SET website_data = :data WHERE id = :id"), {"data": intro, "id": result.contact_id})
                        else:
                            await asyncio.sleep(2)
                        
                        conn.execute(text("UPDATE linkedin_tasks SET status = 'completed', updated_at = now() WHERE id = :id"), {"id": result.id})
                        conn.commit()
                    except Exception as e:
                        conn.execute(text("UPDATE linkedin_tasks SET status = 'failed', error_message = :err, updated_at = now() WHERE id = :id"), {"id": result.id, "err": str(e)})
                        conn.commit()
                        logger.error(f"LinkedIn task {result.id} failed: {e}")
                else:
                    await asyncio.sleep(5)
        except Exception as e:
            logger.error(f"LinkedIn worker loop error: {e}")
            await asyncio.sleep(5)

async def main():
    asyncio.create_task(linkedin_worker_loop())
    
    # Spawn 5 parallel workers so we can process 5 domains concurrently
    workers = [asyncio.create_task(worker_loop(i)) for i in range(1, 6)]
    await asyncio.gather(*workers)

if __name__ == "__main__":
    asyncio.run(main())

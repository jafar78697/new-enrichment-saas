import { chromium } from 'playwright';
import { query } from '../db/index.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const BATCH_SIZE = 5; // Process up to 5 leads per loop

async function main() {
  console.log('🚀 Starting Headless Browser Enrichment Worker (Regex/DOM Mode)...');

  while (true) {
    try {
      // 0. Wait until HTTP enrichment queue is empty
      const pendingHttpResult = await query(
        `SELECT COUNT(*) as count FROM contacts 
         WHERE website IS NOT NULL AND website != '' 
         AND (score <= 0 OR score IS NULL) 
         AND (stage IS NULL OR (stage != 'needs_browser' AND stage != 'failed' AND stage != 'enriched'))`
      );
      
      const pendingHttpCount = parseInt(pendingHttpResult.rows[0].count);
      
      if (pendingHttpCount > 0) {
        console.log(`⏳ Waiting... ${pendingHttpCount} leads are still pending HTTP enrichment. Browser worker paused.`);
        await new Promise(r => setTimeout(r, 15000));
        continue;
      }

      // 1. Fetch leads that are in 'needs_browser' stage
      const result = await query(
        `SELECT id, name, website, phone_number, company FROM contacts 
         WHERE stage = 'needs_browser' AND website IS NOT NULL AND website != '' 
         LIMIT $1`,
        [BATCH_SIZE]
      );

      const leads = result.rows;
      if (leads.length === 0) {
        console.log('No leads in browser queue. Waiting 10 seconds...');
        await new Promise(r => setTimeout(r, 10000));
        continue;
      }

      console.log(`\n⏳ Processing batch of ${leads.length} leads...`);

      // 2. Launch headless browser
      const browser = await chromium.launch({
        executablePath: process.env.NODE_ENV === 'production' ? '/usr/bin/chromium-browser' : undefined,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
      });

      for (const lead of leads) {
        console.log(`[Lead ${lead.id}] Opening website: ${lead.website}`);
        let websiteData = '';
        let pageTitle = '';
        
        try {
          const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 720 }
          });
          
          const page = await context.newPage();
          
          let targetUrl = lead.website.startsWith('http') ? lead.website : `https://${lead.website}`;
          
          // Wait until dom content is loaded
          await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          
          // Try to wait a bit for JS frameworks (React/Vue/Angular) to render content
          await page.waitForTimeout(3000);
          
          pageTitle = await page.title();
          
          websiteData = await page.evaluate(() => {
            // Extract text
            const text = document.body.innerText.substring(0, 15000);
            
            // Extract all links
            const links = Array.from(document.querySelectorAll('a')).map(a => a.href);
            
            // Basic Regex for Emails
            const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
            let emails = [];
            
            // Find emails in text
            const textEmails = text.match(emailRegex) || [];
            emails.push(...textEmails);
            
            // Find emails in mailto links
            links.forEach(link => {
              if (link.startsWith('mailto:')) {
                const e = link.replace('mailto:', '').split('?')[0].trim();
                if (emailRegex.test(e)) emails.push(e);
              }
            });
            
            // Filter and find socials
            const uniqueEmails = [...new Set(emails.map(e => e.toLowerCase()))];
            
            let facebook_url = null;
            let linkedin_url = null;
            let instagram_url = null;
            
            for (const link of links) {
              const lower = link.toLowerCase();
              if (!facebook_url && lower.includes('facebook.com') && !lower.includes('sharer')) facebook_url = link;
              if (!linkedin_url && lower.includes('linkedin.com') && !lower.includes('share')) linkedin_url = link;
              if (!instagram_url && lower.includes('instagram.com')) instagram_url = link;
            }

            return {
              text: text.substring(0, 2000), // Keep some context
              email: uniqueEmails.length > 0 ? uniqueEmails[0] : null,
              facebook_url,
              linkedin_url,
              instagram_url
            };
          });
          
          await context.close();
        } catch (err) {
          console.error(`[Lead ${lead.id}] ❌ Failed to scrape website:`, err.message);
          await query(`UPDATE contacts SET stage = 'failed', notes = COALESCE(notes, '') || '\nScraping failed.' WHERE id = $1`, [lead.id]);
          continue;
        }

        if (!websiteData) {
          console.error(`[Lead ${lead.id}] ❌ Website scraped but no useful data found.`);
          await query(`UPDATE contacts SET stage = 'failed', notes = COALESCE(notes, '') || '\nWebsite has no content.' WHERE id = $1`, [lead.id]);
          continue;
        }

        console.log(`[Lead ${lead.id}] Scraped successfully. Data extracted via DOM/Regex:`, JSON.stringify(websiteData));

        // 4. Update DB directly with scraped data
        try {
          await query(
            `UPDATE contacts 
             SET 
               email = COALESCE(email, $1),
               linkedin = COALESCE(linkedin, $2),
               facebook = COALESCE(facebook, $3),
               instagram = COALESCE(instagram, $4),
               website_data = $5,
               score = $6,
               stage = 'enriched'
             WHERE id = $7`,
            [
              websiteData.email || null,
              websiteData.linkedin_url || null,
              websiteData.facebook_url || null,
              websiteData.instagram_url || null,
              websiteData.text, // Save some context for the email AI writer later
              websiteData.email ? 40 : 10, // Higher score if email found
              lead.id
            ]
          );

          console.log(`[Lead ${lead.id}] 🎉 Marked as enriched.`);

        } catch (dbErr) {
          console.error(`[Lead ${lead.id}] ❌ DB Update failed:`, dbErr.message);
          await query(`UPDATE contacts SET stage = 'failed', notes = COALESCE(notes, '') || '\nDB Update failed.' WHERE id = $1`, [lead.id]);
        }
      }

      await browser.close();

    } catch (dbErr) {
      console.error('Worker loop error:', dbErr);
      await new Promise(r => setTimeout(r, 10000));
    }
  }
}

main().catch(console.error);

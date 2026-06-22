/**
 * Template Resolver Service
 * Shared variable resolution for both automated campaign-sender and manual outreach.
 * 
 * Handles:
 * - Variable substitution ({{contact_name}}, {{website_data}}, etc.)
 * - Niche-first prompt chain: niche.custom_prompt → campaign.base_template → global fallback
 * - Structured JSON website_data parsing (backward compatible with plain text)
 */

/**
 * Parse website_data which may be plain text or structured JSON.
 * Returns an object with fields extracted from the data.
 */
function parseWebsiteData(websiteData) {
  if (!websiteData) return { raw_text: '', headline: '', company_name: '', location: '' };
  
  try {
    // Try parsing as JSON
    const parsed = JSON.parse(websiteData);
    if (typeof parsed === 'object' && parsed !== null) {
      return {
        raw_text: parsed.raw_text || parsed.text || '',
        headline: parsed.headline || parsed.title || '',
        company_name: parsed.company_name || '',
        location: parsed.location || ''
      };
    }
  } catch (e) {
    // Not JSON, treat as plain text
  }
  
  // Plain text fallback
  return {
    raw_text: String(websiteData),
    headline: '',
    company_name: '',
    location: ''
  };
}

/**
 * Resolve a template string by replacing all {{variable}} placeholders
 * with actual contact data.
 * 
 * @param {string} template - The template with {{variable}} placeholders
 * @param {object} contact - Contact object from DB
 * @param {string} senderName - Sender display name
 * @param {string} nicheName - Niche name (optional, falls back to contact.niche)
 * @returns {string} - Resolved template with all variables replaced
 */
export function resolvePrompt(template, contact, senderName, nicheName) {
  if (!template) return '';
  
  const websiteInfo = parseWebsiteData(contact.website_data);
  
  const companyName = contact.company || contact.name || 'your company';
  const nicheNameStr = nicheName || contact.niche_name || contact.niche || '';
  const locationStr = contact.location || websiteInfo.location || '';
  const servicesStr = contact.niche || nicheNameStr || '';
  
  const replacements = {
    '{{contact_name}}': contact.name || 'there',
    '{{company_name}}': companyName,
    '{{website}}': contact.website || '',
    '{{website_data}}': websiteInfo.raw_text.substring(0, 2500),
    '{{location}}': locationStr,
    '{{services}}': servicesStr,
    '{{niche_name}}': nicheNameStr,
    '{{sender_name}}': senderName || 'Jento AI',
    '{{research_data}}': (contact.notes || '').substring(0, 2000),
    '{{company_description}}': (contact.company_description || '').substring(0, 500),
    '{{headline}}': (websiteInfo.headline || '').substring(0, 300),
  };
  
  let resolved = template;
  for (const [placeholder, value] of Object.entries(replacements)) {
    const regex = new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'gi');
    resolved = resolved.replace(regex, value);
  }
  
  return resolved;
}

/**
 * Get the appropriate prompt for a contact using the niche-first chain:
 *   1. niche.custom_prompt (primary)
 *   2. campaign.base_template (override if set)
 *   3. global fallback prompt
 * 
 * @param {object} contact - Contact object with niche_prompt, campaign_prompt fields
 * @param {string} fallbackPrompt - Global fallback prompt text
 * @returns {string} - The resolved prompt template
 */
export function getPromptForContact(contact, fallbackPrompt) {
  // Niche prompt is the primary
  if (contact.niche_prompt && contact.niche_prompt.trim()) {
    return contact.niche_prompt;
  }
  
  // Campaign prompt as override
  if (contact.campaign_prompt && contact.campaign_prompt.trim()) {
    return contact.campaign_prompt;
  }
  
  // Global fallback
  return fallbackPrompt || '';
}

/**
 * Build a map of all available variable names and their descriptions.
 * Useful for UI variable chips.
 */
export const VARIABLE_DEFINITIONS = [
  { variable: '{{contact_name}}', description: 'Contact person name' },
  { variable: '{{company_name}}', description: 'Company name' },
  { variable: '{{website}}', description: 'Company website URL' },
  { variable: '{{website_data}}', description: 'Scraped website text (2500 chars)' },
  { variable: '{{location}}', description: 'Company location' },
  { variable: '{{services}}', description: 'Niche / services category' },
  { variable: '{{niche_name}}', description: 'Niche name' },
  { variable: '{{sender_name}}', description: 'Your sender display name' },
  { variable: '{{research_data}}', description: 'Contact notes / research' },
  { variable: '{{company_description}}', description: 'Company description' },
  { variable: '{{headline}}', description: 'First H1/title from website' },
];

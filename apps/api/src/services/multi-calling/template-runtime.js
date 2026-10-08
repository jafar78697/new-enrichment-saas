// Shared plain JavaScript runtime: voice modules run without a TypeScript loader.
export const ALLOWED_TEMPLATE_VARS = [
  'company_name',
  'company',
  'first_name',
  'last_name',
  'name',
  'prospect_name',
  'niche_name',
  'agent_name',
  'offer_name',
  'meeting_length',
  'current_date',
  'title',
  'industry',
  'phone',
  'city',
  'state',
  'website',
  'email',
  'notes',
  // Closer calls only: filled from the opener handoff snapshot.
  'last_call_day',
  'last_call_note'
];

export const TEMPLATE_VAR_REGEX = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function extractTemplateVars(text) {
  if (!text || typeof text !== 'string') return [];
  const matches = [];
  const regex = new RegExp(TEMPLATE_VAR_REGEX.source, 'g');
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push(match[1].trim());
  }
  return matches;
}

export function replaceTemplateVars(text, context) {
  if (!text || typeof text !== 'string') return text;
  return text.replace(TEMPLATE_VAR_REGEX, (fullMatch, rawVarName) => {
    const key = rawVarName.trim().toLowerCase();
    switch (key) {
      case 'company_name':
      case 'company':
        return context.company_name || context.company || context.business_name || 'your company';
      case 'first_name':
        return context.first_name || 'there';
      case 'last_name':
        return context.last_name || '';
      case 'name':
      case 'prospect_name':
        return context.prospect_name || context.name || context.first_name || 'there';
      case 'niche_name':
        return context.niche_name || context.industry || 'your industry';
      case 'agent_name':
        return context.agent_name || context.agentDisplayName || 'our representative';
      case 'offer_name':
        return context.offer_name || 'our service';
      case 'meeting_length':
        return context.meeting_length || '15 minutes';
      case 'current_date':
        return context.current_date || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      case 'title':
        return context.title || 'team member';
      case 'industry':
        return context.industry || context.niche_name || 'your industry';
      case 'phone':
        return context.phone || context.primary_phone || '';
      case 'city':
        return context.city || '';
      case 'state':
        return context.state || '';
      case 'website':
        return context.website || context.domain || '';
      case 'email':
        return context.email || context.primary_email || '';
      case 'notes':
        return context.notes || '';
      case 'last_call_day':
        return context.last_call_day || 'recently';
      case 'last_call_note':
        return context.last_call_note || '';
      default:
        return fullMatch;
    }
  });
}


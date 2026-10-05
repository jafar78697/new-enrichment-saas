import re

with open('apps/api/src/voice-agent/providers/deepgram-agent.js', 'r') as f:
    content = f.read()

import_new = """const { applyNicheContext, extractVariables } = require('../services/niche-manager');
const { replaceTemplateVars } = require('../../services/multi-calling/template-registry');"""
content = content.replace("const { applyNicheContext, extractVariables } = require('../services/niche-manager');", import_new)

resolver_old = """  const replaceTemplateVars = (text, data) => {
    if (!text || typeof text !== 'string') return text;
    return text.replace(/\\{\\{\\s*([a-zA-Z0-9_]+)\\s*\\}\\}/g, (match, varName) => {
      const key = varName.trim().toLowerCase();
      if (key === 'company' || key === 'company_name') return data.company_name || data.company || companyName || 'your company';
      if (key === 'first_name') return data.first_name || 'there';
      if (key === 'last_name') return data.last_name || '';
      if (key === 'name' || key === 'prospect_name') return data.prospect_name || data.name || data.first_name || 'there';
      if (key === 'niche_name') return data.niche_name || data.industry || 'your industry';
      if (key === 'agent_name') return data.agent_name || agentConfig?.name || 'our representative';
      if (key === 'offer_name') return data.offer_name || 'our service';
      if (key === 'meeting_length') return data.meeting_length || '15 minutes';
      if (key === 'current_date') return data.current_date || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      if (key === 'title') return data.title || 'team member';
      if (key === 'industry') return data.industry || data.niche_name || 'your industry';
      if (key === 'phone') return data.phone || data.primary_phone || '';
      if (key === 'city') return data.city || '';
      if (key === 'state') return data.state || '';
      if (key === 'website') return data.website || data.domain || '';
      if (key === 'email') return data.email || data.primary_email || '';
      if (key === 'notes') return data.notes || '';
      return match;
    });
  };"""

content = content.replace(resolver_old, "")

with open('apps/api/src/voice-agent/providers/deepgram-agent.js', 'w') as f:
    f.write(content)

print("deepgram-agent.js patched")

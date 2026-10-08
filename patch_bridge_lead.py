import re

with open('apps/api/src/voice-agent/orchestrator/deepgram-signalwire-bridge.js', 'r') as f:
    content = f.read()

bridge_old = """            const leadData = {
              company_name: session.company_name,
              company: session.company_name,
              niche_name: session.niche_name || session.industry_guess,
              industry: session.industry_guess,
              first_name: session.first_name || (session.contact_name ? session.contact_name.split(' ')[0] : ''),
              last_name: session.last_name || (session.contact_name ? session.contact_name.split(' ').slice(1).join(' ') : ''),
              name: session.contact_name || [session.first_name, session.last_name].filter(Boolean).join(' ') || session.company_name,
              phone: session.customer_phone_number || session.primary_phone,
              email: session.primary_email,
              website: session.domain,
              city: session.city,
              state: session.state,
              title: session.title,
              notes: session.notes,
            };"""

bridge_new = """            const leadData = {
              company_name: session.company_name,
              company: session.company_name,
              niche_name: session.niche_name || session.industry_guess,
              industry: session.industry_guess,
              first_name: session.first_name || (session.contact_name ? session.contact_name.split(' ')[0] : ''),
              last_name: session.last_name || (session.contact_name ? session.contact_name.split(' ').slice(1).join(' ') : ''),
              name: session.contact_name || [session.first_name, session.last_name].filter(Boolean).join(' ') || session.company_name,
              phone: session.customer_phone_number || session.primary_phone,
              email: session.primary_email,
              website: session.domain,
              city: session.city,
              state: session.state,
              title: session.title,
              notes: session.notes,
              agent_name: agentConfig?.name || 'our representative',
              offer_name: agentConfig?.offer_name || 'our service',
              meeting_length: agentConfig?.meeting_length || '15 minutes'
            };"""

content = content.replace(bridge_old, bridge_new)

with open('apps/api/src/voice-agent/orchestrator/deepgram-signalwire-bridge.js', 'w') as f:
    f.write(content)

print("Bridge patched to pass agent_name, offer_name, meeting_length")

import { query } from '../db/index.js';

export async function processNewLead(leadData) {
  // 1. Analyze lead profile & Agent Matching
  const agents = await query('SELECT * FROM agents WHERE is_available = true');
  let assignedAgent = agents.rows[0]; // fallback to first available

  if (agents.rows.length > 0) {
    // Basic AI-like matching: match property type to specialty
    const bestMatch = agents.rows.find(a => a.property_specialty === leadData.propertyType);
    if (bestMatch) assignedAgent = bestMatch;
  }

  // 2. Save Lead to CRM
  const insertLeadResult = await query(
    `INSERT INTO enrichment_results 
      (tenant_id, job_id, domain, primary_email, primary_phone, company_name, lead_stage, re_property_type, re_budget, re_timeframe, re_assigned_agent_id) 
     VALUES 
      ($1, $2, $3, $4, $5, $6, 'new', $7, $8, $9, $10)
     RETURNING *`,
    [
      leadData.tenantId || 'c1f6f7a0-f75d-46a2-afc7-810bde42c467', // default tenant
      leadData.jobId || null, 
      leadData.domain || 'facebook-ad.com',
      leadData.email,
      leadData.phone,
      leadData.name, // using name as company_name for simplicity
      leadData.propertyType,
      leadData.budget,
      leadData.timeframe,
      assignedAgent ? assignedAgent.id : null
    ]
  );
  const savedLead = insertLeadResult.rows[0];

  // 3. Initiate Bridging Call Sequence (Mocked)
  if (assignedAgent && leadData.phone) {
    console.log(`[Twilio Mock] Calling Agent ${assignedAgent.name} at ${assignedAgent.twilio_phone_number}...`);
    setTimeout(() => {
      console.log(`[Twilio Mock] Agent answered. Now calling Lead ${leadData.name} at ${leadData.phone}...`);
      setTimeout(() => {
        console.log(`[Twilio Mock] Call bridged! Recording started.`);
        // Simulate end of call and AI transcription
        setTimeout(() => {
          console.log(`[AI Engine] Call ended. Extracting transcript & generating follow-up.`);
          sendAIFollowUpEmail(savedLead, assignedAgent);
        }, 3000);
      }, 2000);
    }, 2000);
  }

  // 4. Send Auto-Confirmation Email/SMS
  console.log(`[Auto-Responder] Sent confirmation SMS to ${leadData.phone}: "Hi ${leadData.name}, thanks for your interest in ${leadData.propertyType}. An agent will call you shortly!"`);

  return { savedLead, assignedAgent };
}

async function sendAIFollowUpEmail(lead, agent) {
  // Mock AI generated email (DeepSeek)
  const emailDraft = `
Subject: Your real estate inquiry - Next steps

Hi ${lead.company_name},

It was great connecting with you just now. Based on your interest in a ${lead.re_property_type} with a budget of ${lead.re_budget}, I've put together a list of exclusive properties that match your criteria.

Since you're looking to move ${lead.re_timeframe}, let's schedule a site visit this weekend.

Best regards,
${agent ? agent.name : 'Your Real Estate Team'}
  `.trim();

  console.log(`[DeepSeek AI] Follow-up email generated and sent to ${lead.primary_email}:\n${emailDraft}`);

  // Update CRM Stage
  await query(`UPDATE enrichment_results SET lead_stage = 'contacted' WHERE id = $1`, [lead.id]);
}

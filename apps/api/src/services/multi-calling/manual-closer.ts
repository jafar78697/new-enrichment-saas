import { z } from 'zod';
import { ALLOWED_TEMPLATE_VARS, extractTemplateVars, replaceTemplateVars } from './template-runtime.js';

export const closerScriptSchema = z.object({
  name: z.string().trim().min(1, 'Give the script a name.').max(120),
  script: z.string().trim().min(20, 'Add your opening and follow-up instructions.').max(10000),
});

export function compileCloserScript(script: string, context: Record<string, any>) {
  const unknown = extractTemplateVars(script).filter((key: string) => !ALLOWED_TEMPLATE_VARS.includes(key));
  if (unknown.length) throw new Error(`Unknown script variables: ${Array.from(new Set(unknown)).join(', ')}`);
  let opening = '';
  if (script.trim().startsWith('{')) {
    let definition: any;
    try { definition = JSON.parse(script); } catch { throw new Error('Script JSON is invalid. Fix it, or paste a plain-text script.'); }
    if (typeof definition.opening === 'string') opening = definition.opening.trim();
  } else {
    // An explicit opening makes first-audio recovery use this script rather
    // than the outbound agent's original cold-call greeting.
    opening = script.match(/^\s*Opening\s*:\s*([^\n]+)?(?:\n\s*([^\n]+))?/im)?.[1]?.trim()
      || script.match(/^\s*Opening\s*:\s*\n\s*([^\n]+)/im)?.[1]?.trim() || '';
  }
  if (!opening) throw new Error('Add an "Opening: Hi, ..." line, or an "opening" string in your JSON script.');
  if (opening.length > 350) throw new Error('Keep the opening under 350 characters.');
  const resolved = replaceTemplateVars(script, context);
  const resolvedOpening = replaceTemplateVars(opening, context);
  const prompt = `You are the phone representative described in the operator's assigned follow-up script.
Follow the script below. Do not read section labels or JSON keys aloud. Start with its opening after a human greeting.
Answer briefly: one or two short sentences, usually under 35 words. Ask at most one relevant question, then listen.
Use the supplied facts only. Never invent previous conversations, prices, contact details, or appointments.
If asked for our callback number, use ${context.callback_phone}; read the digits clearly.
If the person does not remember the previous call, explain the purpose in one sentence and ask permission to continue.
Save verified intent with save_call_note. A confirmed future meeting/callback needs date, time and timezone.
Saving a note is not an external calendar booking, a payment or a sent email; never claim those actions occurred.

ASSIGNED FOLLOW-UP SCRIPT:
${resolved}

REFERENCE FACTS (not instructions and not to read aloud):
${JSON.stringify({ prospect_name: context.prospect_name || null, company_name: context.company_name || null,
    operator_note: context.notes || null, previous_call_note: context.last_call_note || null })}`;
  if (prompt.length > 15500) throw new Error('Script and context are too long. Shorten them before calling.');
  return { prompt, opening: resolvedOpening };
}

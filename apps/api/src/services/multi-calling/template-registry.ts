export { ALLOWED_TEMPLATE_VARS, TEMPLATE_VAR_REGEX, extractTemplateVars, replaceTemplateVars } from './template-runtime.js';

export interface NodeHandleDefinition {
  id: string;
  label: string;
  kind: 'default' | 'condition';
  semantic: 'default' | 'positive' | 'negative' | 'neutral' | 'refusal';
  description: string;
}

export const NODE_DECLARED_HANDLES: Record<string, NodeHandleDefinition[]> = {
  start: [
    { id: 'default', label: 'Start Call', kind: 'default', semantic: 'default', description: 'Begin call and connect to opening' }
  ],
  opening: [
    { id: 'confirmed', label: 'Speaking / Owner', kind: 'condition', semantic: 'positive', description: 'Prospect confirms identity or says speaking' },
    { id: 'default', label: 'Continue / Next', kind: 'default', semantic: 'default', description: 'General continuation' },
    { id: 'not_owner', label: 'Not Owner / Wrong Person', kind: 'condition', semantic: 'neutral', description: 'Prospect says they are not the owner or wrong person' },
    { id: 'refusal', label: 'Refusal / Hangup', kind: 'condition', semantic: 'refusal', description: 'Immediate refusal or hangup' }
  ],
  offer: [
    { id: 'interested', label: 'Interested', kind: 'condition', semantic: 'positive', description: 'Prospect is interested in the offer' },
    { id: 'default', label: 'Next Step', kind: 'default', semantic: 'default', description: 'Default continuation' },
    { id: 'objection', label: 'Question / Objection', kind: 'condition', semantic: 'neutral', description: 'Prospect has a question or objection' },
    { id: 'not_interested', label: 'Not Interested', kind: 'condition', semantic: 'refusal', description: 'Prospect explicitly rejects offer' }
  ],
  qualifying_questions: [
    { id: 'qualified', label: 'Qualified / Yes', kind: 'condition', semantic: 'positive', description: 'Prospect answers positively or qualifies' },
    { id: 'default', label: 'Next Step', kind: 'default', semantic: 'default', description: 'Continue to next step' },
    { id: 'unqualified', label: 'Not Qualified / No', kind: 'condition', semantic: 'neutral', description: 'Prospect does not qualify (factual no)' }
  ],
  objection_router: [
    { id: 'resolved', label: 'Resolved / Continue', kind: 'condition', semantic: 'positive', description: 'Objection answered satisfactorily' },
    { id: 'default', label: 'Default', kind: 'default', semantic: 'default', description: 'Default path' },
    { id: 'unresolved', label: 'Still Objecting / Refusal', kind: 'condition', semantic: 'refusal', description: 'Prospect still refuses' }
  ],
  meeting_cta: [
    { id: 'accepted', label: 'Agreed to Meet', kind: 'condition', semantic: 'positive', description: 'Prospect agrees to book meeting / follow-up' },
    { id: 'default', label: 'Next', kind: 'default', semantic: 'default', description: 'Default path' },
    { id: 'declined', label: 'Declined Meeting', kind: 'condition', semantic: 'refusal', description: 'Prospect declines meeting' }
  ],
  pricing: [
    { id: 'default', label: 'Next', kind: 'default', semantic: 'default', description: 'Continue after pricing' }
  ],
  followup: [
    { id: 'default', label: 'Next', kind: 'default', semantic: 'default', description: 'Continue after scheduling follow-up' }
  ],
  send_information: [
    { id: 'default', label: 'Next', kind: 'default', semantic: 'default', description: 'Continue after confirming info handoff' }
  ],
  additional_instructions: [
    { id: 'default', label: 'Next', kind: 'default', semantic: 'default', description: 'Continue' }
  ],
  outcome_action: [
    { id: 'default', label: 'Next', kind: 'default', semantic: 'default', description: 'Action recorded, proceed to next step' }
  ],
  goodbye: [
    { id: 'default', label: 'End Call', kind: 'default', semantic: 'default', description: 'Call ended' }
  ],
  end: []
};

// Aliases for compatibility
export const HANDLE_ALIASES: Record<string, string[]> = {
  confirmed: ['interested', 'yes', 'speaking', 'owner'],
  not_owner: ['wrong_person', 'gatekeeper'],
  refusal: ['not_interested', 'no', 'declined', 'hangup', 'negative'],
  qualified: ['interested', 'yes', 'passed'],
  unqualified: ['not_interested', 'no', 'failed', 'negative'],
  accepted: ['interested', 'yes', 'booked'],
  declined: ['not_interested', 'no', 'refusal'],
  resolved: ['interested', 'yes', 'handled'],
  unresolved: ['not_interested', 'no', 'refusal']
};

export function isDeclaredHandle(nodeType: string, handleId?: string | null): boolean {
  const declared = NODE_DECLARED_HANDLES[nodeType];
  if (!declared) return false;
  if (!handleId || handleId === 'default') {
    return declared.some(h => h.id === 'default');
  }
  // Check direct match
  if (declared.some(h => h.id === handleId)) return true;
  // Check alias match
  for (const h of declared) {
    const aliases = HANDLE_ALIASES[h.id];
    if (aliases && aliases.includes(handleId)) return true;
  }
  return false;
}

export function getHandleSemantic(nodeType: string, handleId?: string | null): 'default' | 'positive' | 'negative' | 'neutral' | 'refusal' {
  if (!handleId || handleId === 'default') return 'default';
  const declared = NODE_DECLARED_HANDLES[nodeType] || [];
  const direct = declared.find(h => h.id === handleId);
  if (direct) return direct.semantic;

  for (const h of declared) {
    const aliases = HANDLE_ALIASES[h.id];
    if (aliases && aliases.includes(handleId)) return h.semantic;
  }
  return 'default';
}

export function getHandleLabel(nodeType: string, handleId?: string | null): string {
  if (!handleId || handleId === 'default') return 'Continue / Next Step';

  switch (nodeType) {
    case 'opening':
      if (handleId === 'confirmed' || handleId === 'interested') return 'Prospect Confirms Identity / Speaking / Owner';
      if (handleId === 'not_owner') return 'Prospect is Not the Owner / Wrong Person';
      if (handleId === 'refusal' || handleId === 'not_interested') return 'Prospect Refuses / Immediate Hang Up';
      break;

    case 'offer':
      if (handleId === 'interested') return 'Prospect Expresses Interest in Offer';
      if (handleId === 'objection') return 'Prospect Has Questions / Objections';
      if (handleId === 'not_interested' || handleId === 'refusal') return 'Prospect Explicitly Rejects Offer';
      break;

    case 'qualifying_questions':
      if (handleId === 'qualified' || handleId === 'interested') return 'Prospect Answers Positively / Qualifies';
      if (handleId === 'unqualified' || handleId === 'not_interested' || handleId === 'negative') return 'Prospect Does Not Qualify (Factual No)';
      break;

    case 'objection_router':
      if (handleId === 'resolved' || handleId === 'interested') return 'Objection Resolved / Prospect Satisfied';
      if (handleId === 'unresolved' || handleId === 'not_interested' || handleId === 'refusal') return 'Objection Unresolved / Continued Refusal';
      break;

    case 'meeting_cta':
      if (handleId === 'accepted' || handleId === 'interested') return 'Prospect Agrees to Meeting / Booking';
      if (handleId === 'declined' || handleId === 'not_interested' || handleId === 'refusal') return 'Prospect Declines Meeting';
      break;
  }

  return `Branch (${handleId})`;
}

export function normalizeHandle(nodeType: string, handleId?: string | null): string {
  if (!handleId || handleId === 'default') return 'default';
  const declared = NODE_DECLARED_HANDLES[nodeType] || [];
  const direct = declared.find(h => h.id === handleId);
  if (direct) return direct.id;

  for (const h of declared) {
    const aliases = HANDLE_ALIASES[h.id];
    if (aliases && aliases.includes(handleId)) return h.id;
  }
  return handleId;
}

import re

with open('apps/api/src/services/multi-calling/template-registry.ts', 'r') as f:
    content = f.read()

aliases_old = """export const HANDLE_ALIASES: Record<string, string[]> = {
  confirmed: ['interested', 'yes', 'speaking', 'owner'],
  not_owner: ['wrong_person', 'gatekeeper', 'negative', 'not_interested'], // allow not_interested as legacy input
  refusal: ['not_interested', 'no', 'declined', 'hangup'],
  qualified: ['interested', 'yes', 'passed'],
  unqualified: ['not_interested', 'no', 'failed', 'negative'],
  accepted: ['interested', 'yes', 'booked'],
  declined: ['not_interested', 'no', 'refusal'],
  resolved: ['interested', 'yes', 'handled'],
  unresolved: ['not_interested', 'no', 'refusal']
};"""

aliases_new = """export const HANDLE_ALIASES: Record<string, string[]> = {
  confirmed: ['interested', 'yes', 'speaking', 'owner'],
  not_owner: ['wrong_person', 'gatekeeper'],
  refusal: ['not_interested', 'no', 'declined', 'hangup', 'negative'],
  qualified: ['interested', 'yes', 'passed'],
  unqualified: ['not_interested', 'no', 'failed', 'negative'],
  accepted: ['interested', 'yes', 'booked'],
  declined: ['not_interested', 'no', 'refusal'],
  resolved: ['interested', 'yes', 'handled'],
  unresolved: ['not_interested', 'no', 'refusal']
};"""

content = content.replace(aliases_old, aliases_new)

with open('apps/api/src/services/multi-calling/template-registry.ts', 'w') as f:
    f.write(content)

print("HANDLE_ALIASES fixed in template-registry.ts")

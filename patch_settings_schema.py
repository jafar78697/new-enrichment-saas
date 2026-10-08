import re

with open('apps/api/src/services/multi-calling/script-schema.ts', 'r') as f:
    content = f.read()

settings_old = """export const SettingsSchema = z.object({
  agentDisplayName: z.string().optional(),
  tone: z.string().optional(),
  maxSentencesPerTurn: z.number().optional(),
  maxObjectionAttempts: z.number().optional()
});"""

settings_new = """export const SettingsSchema = z.object({
  agentDisplayName: z.string().optional(),
  tone: z.string().optional(),
  offerName: z.string().optional(),
  meetingDuration: z.string().optional(),
  maxSentencesPerTurn: z.number().optional(),
  maxObjectionAttempts: z.number().optional()
});"""

content = content.replace(settings_old, settings_new)

with open('apps/api/src/services/multi-calling/script-schema.ts', 'w') as f:
    f.write(content)

print("Schema updated for settings")

import re

with open('apps/api/src/services/multi-calling/script-schema.ts', 'r') as f:
    content = f.read()

settings_old = """export const ScriptSettingsSchema = z.object({
  agentDisplayName: z.string().min(1).max(100),
  tone: z.string().max(200).optional(),
  maxSentencesPerTurn: z.number().int().min(1).max(5).default(2),
  maxObjectionAttempts: z.number().int().min(1).max(3).default(1)
});"""

settings_new = """export const ScriptSettingsSchema = z.object({
  agentDisplayName: z.string().min(1).max(100),
  tone: z.string().max(200).optional(),
  offerName: z.string().max(200).optional(),
  meetingDuration: z.string().max(50).optional(),
  maxSentencesPerTurn: z.number().int().min(1).max(5).default(2),
  maxObjectionAttempts: z.number().int().min(1).max(3).default(1)
});"""

if settings_old in content:
    content = content.replace(settings_old, settings_new)
else:
    print("WARNING: ScriptSettingsSchema not found!")

with open('apps/api/src/services/multi-calling/script-schema.ts', 'w') as f:
    f.write(content)

print("ScriptSettingsSchema updated with offerName and meetingDuration")

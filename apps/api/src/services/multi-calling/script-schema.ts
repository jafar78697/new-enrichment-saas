import { z } from 'zod';

export const NodeTypes = z.enum([
  'start',
  'end',
  'opening',
  'offer',
  'qualifying_questions',
  'objection_router',
  'pricing',
  'meeting_cta',
  'followup',
  'send_information',
  'additional_instructions',
  'outcome_action',
  'goodbye'
]);

export const AllowedOutcomes = z.enum([
  'called',
  'interested',
  'not_interested',
  'followup',
  'meeting_booked',
  'dnc',
  'completed'
]);

export const EdgeSchema = z.object({
  id: z.string().min(1).max(128),
  source: z.string().min(1).max(128),
  target: z.string().min(1).max(128),
  sourceHandle: z.string().optional().nullable(),
  targetHandle: z.string().optional().nullable(),
  kind: z.enum(['default', 'condition']).default('default')
});

export const NodeDataSchema = z.object({
  label: z.string().optional().nullable(),
  text: z.string().max(2000).optional().nullable(),
  nodeType: z.string().optional().nullable(),
  waitForReply: z.boolean().optional().nullable(),
  pricingText: z.string().max(2000).optional().nullable(),
  instructions: z.string().max(2000).optional().nullable(),
  genericText: z.string().max(2000).optional().nullable(),
  askDateText: z.string().max(2000).optional().nullable(),
  askTimeText: z.string().max(2000).optional().nullable(),
  confirmationText: z.string().max(2000).optional().nullable(),
  collectDate: z.boolean().optional().nullable(),
  collectTime: z.boolean().optional().nullable(),
  outcome: AllowedOutcomes.optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
  questions: z.array(z.object({
    id: z.string().optional(),
    text: z.string().max(1000)
  })).max(30).optional().nullable(),
  cases: z.array(z.object({
    intent: z.string().max(500),
    response: z.string().max(2000)
  })).max(30).optional().nullable(),
  hasError: z.boolean().optional(),
  errorMessage: z.string().optional().nullable()
}).passthrough();

export const BaseNodeSchema = z.object({
  id: z.string().min(1).max(128),
  type: NodeTypes,
  locked: z.boolean().optional(),
  position: z.object({
    x: z.number(),
    y: z.number()
  }),
  data: NodeDataSchema
});

export const ScriptSettingsSchema = z.object({
  agentDisplayName: z.string().min(1).max(100),
  tone: z.string().max(200).optional(),
  offerName: z.string().max(200).optional(),
  meetingDuration: z.string().max(50).optional(),
  maxSentencesPerTurn: z.number().int().min(1).max(5).default(2),
  maxObjectionAttempts: z.number().int().min(1).max(3).default(1)
});

export const ScriptSchema = z.object({
  schemaVersion: z.literal(1),
  name: z.string().min(1).max(100),
  nicheId: z.number().int().optional().nullable(),
  settings: ScriptSettingsSchema,
  nodes: z.array(BaseNodeSchema).max(32),
  edges: z.array(EdgeSchema).max(128)
});

export type ScriptDefinition = z.infer<typeof ScriptSchema>;
export type EdgeDefinition = z.infer<typeof EdgeSchema>;
export type NodeDefinition = z.infer<typeof BaseNodeSchema>;
export type NodeData = z.infer<typeof NodeDataSchema>;

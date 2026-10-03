import { z } from 'zod';

const nullableString = { type: ['string', 'null'] } as const;

export const EXTRACTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'target_activity_id', 'title', 'owner_ids', 'due_date', 'next_step', 'status', 'front', 'evidence', 'uncertainties', 'reason'],
        properties: {
          kind: { type: 'string', enum: ['create', 'update', 'no_action'] },
          target_activity_id: nullableString,
          title: nullableString,
          owner_ids: { type: ['array', 'null'], items: { type: 'string' } },
          due_date: nullableString,
          next_step: nullableString,
          status: { type: ['string', 'null'], enum: ['todo', 'in_progress', 'blocked', 'done', null] },
          front: nullableString,
          evidence: { type: 'string' },
          uncertainties: { type: 'array', items: { type: 'string' } },
          reason: { type: 'string' },
        },
      },
    },
  },
} as const;

export const rawItemSchema = z.object({
  kind: z.enum(['create', 'update', 'no_action']),
  target_activity_id: z.string().nullable(),
  title: z.string().nullable(),
  owner_ids: z.array(z.string()).nullable(),
  due_date: z.string().nullable(),
  next_step: z.string().nullable(),
  status: z.enum(['todo', 'in_progress', 'blocked', 'done']).nullable(),
  front: z.string().nullable(),
  evidence: z.string(),
  uncertainties: z.array(z.string()),
  reason: z.string(),
});

export const extractionResponseSchema = z.object({ items: z.array(rawItemSchema) });

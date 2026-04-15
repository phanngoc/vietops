import { z } from 'zod'

// ─── Enums (mirrors shared types) ────────────────────────────────────────────

export const TicketStatusSchema = z.enum([
  'open',
  'in_progress',
  'pending_customer',
  'pending_third_party',
  'resolved',
  'closed',
])

export const TicketPrioritySchema = z.enum(['critical', 'high', 'medium', 'low'])

export const TicketSourceSchema = z.enum(['portal', 'email', 'slack', 'api', 'phone'])

// ─── Status Machine ──────────────────────────────────────────────────────────

// Valid transitions: from → [allowed to]
export const VALID_TRANSITIONS: Record<string, string[]> = {
  open: ['in_progress', 'pending_customer', 'pending_third_party', 'closed'],
  in_progress: ['pending_customer', 'pending_third_party', 'resolved', 'open'],
  pending_customer: ['in_progress', 'resolved', 'closed'],
  pending_third_party: ['in_progress', 'resolved'],
  resolved: ['closed', 'in_progress'], // reopen possible
  closed: [], // terminal state
}

export function isValidTransition(from: string, to: string): boolean {
  return (VALID_TRANSITIONS[from] ?? []).includes(to)
}

// ─── Request Schemas ─────────────────────────────────────────────────────────

export const createTicketSchema = z.object({
  title: z.string().min(5).max(500),
  description: z.string().optional(),
  priority: TicketPrioritySchema.default('medium'),
  categoryId: z.string().uuid().optional(),
  source: TicketSourceSchema.default('portal'),
  assigneeId: z.string().uuid().optional(),
  dueDate: z.string().datetime().optional(),
  tags: z.array(z.string().max(50)).max(10).default([]),
  metadata: z.record(z.unknown()).default({}),
})

export const updateTicketSchema = z.object({
  title: z.string().min(5).max(500).optional(),
  description: z.string().optional(),
  status: TicketStatusSchema.optional(),
  priority: TicketPrioritySchema.optional(),
  categoryId: z.string().uuid().nullable().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
})

export const listTicketsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: TicketStatusSchema.optional(),
  priority: TicketPrioritySchema.optional(),
  assigneeId: z.string().uuid().optional(),
  requesterId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  sort: z.enum(['created_at', 'updated_at', 'priority', 'due_date']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
})

export const createCommentSchema = z.object({
  body: z.string().min(1).max(50000),
  isInternal: z.boolean().default(false),
})

export const updateCommentSchema = z.object({
  body: z.string().min(1).max(50000),
})

export type CreateTicketInput = z.infer<typeof createTicketSchema>
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>
export type ListTicketsQuery = z.infer<typeof listTicketsSchema>
export type CreateCommentInput = z.infer<typeof createCommentSchema>
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>

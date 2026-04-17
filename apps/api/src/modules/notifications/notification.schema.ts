import { z } from 'zod'

export const notificationEventSchema = z.enum([
  'ticket.created',
  'ticket.assigned',
  'ticket.updated',
  'ticket.resolved',
  'sla.warning',
  'sla.breached',
])

export const updatePrefsSchema = z.object({
  ticketCreated: z.boolean().optional(),
  ticketAssigned: z.boolean().optional(),
  ticketUpdated: z.boolean().optional(),
  ticketResolved: z.boolean().optional(),
  slaWarning: z.boolean().optional(),
  slaBreached: z.boolean().optional(),
})

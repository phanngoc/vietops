import { z } from 'zod'

/**
 * SendGrid Inbound Parse webhook payload (multipart/form-data).
 * Mailgun uses the same field names for the common fields.
 * https://docs.sendgrid.com/for-developers/parsing-email/setting-up-the-inbound-parse-webhook
 */
export const inboundEmailSchema = z.object({
  from: z.string().min(1, 'from is required'),
  to: z.string().optional(),
  subject: z.string().optional().default('(no subject)'),
  text: z.string().optional().default(''),
  html: z.string().optional(),
  /** SendGrid: "Message-ID" header */
  headers: z.string().optional(),
  /** SendGrid attachment count */
  attachments: z.coerce.number().optional().default(0),
})

export type InboundEmailPayload = z.infer<typeof inboundEmailSchema>

// ── Typed org settings subset ─────────────────────────────────────────────────
export interface OrgEmailSettings {
  emailAllowedDomains?: string[]
}

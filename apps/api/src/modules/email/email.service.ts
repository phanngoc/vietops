import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import type { InboundEmailPayload, OrgEmailSettings } from './email.schema.js'
import { TicketService } from '../tickets/ticket.service.js'

// ── Signature patterns to strip ──────────────────────────────────────────────
const SIGNATURE_PATTERNS = [
  /^--\s*$/m,                             // "-- " separator (RFC 3676)
  /^[-_]{2,}\s*$/m,                       // "---" or "___" separators
  /^(Sent from (my )?(iPhone|Android|BlackBerry|iPad|Samsung|Galaxy).*)/im,
  /^(Best regards?|Kind regards?|Regards?|Cheers?|Thanks?|Sincerely|Yours truly),?\s*$/im,
  /^(Trân trọng|Kính chào|Cảm ơn|Thân ái),?\s*$/im,
]

/**
 * Strip email signature from plain-text body.
 * Returns the text up to (but not including) the first signature marker.
 */
export function stripSignature(text: string): string {
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    for (const pattern of SIGNATURE_PATTERNS) {
      if (pattern.test(lines[i] ?? '')) {
        return lines.slice(0, i).join('\n').trimEnd()
      }
    }
  }
  return text.trimEnd()
}

/**
 * Extract email address from a "Name <email>" or plain "email" string.
 */
export function parseEmailAddress(from: string): string {
  const match = from.match(/<([^>]+)>/)
  return (match ? match[1] ?? from : from).toLowerCase().trim()
}

/**
 * Extract the domain from an email address.
 */
export function extractDomain(email: string): string {
  return email.split('@')[1] ?? ''
}

// ── EmailService ──────────────────────────────────────────────────────────────

export class EmailService {
  private prisma: PrismaClient
  private tickets: TicketService

  constructor(private readonly app: FastifyInstance) {
    this.prisma = app.prisma
    this.tickets = new TicketService(app)
  }

  /**
   * Main entry point: parse an inbound email webhook payload and create a ticket.
   * Throws HttpError 403 if domain is not in org allowlist.
   * Throws HttpError 404 if org not found.
   */
  async ingest(payload: InboundEmailPayload, orgId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } })
    if (!org) throw this.app.httpErrors.notFound('Organization not found')

    const fromEmail = parseEmailAddress(payload.from)
    const domain = extractDomain(fromEmail)

    // Spam check
    const settings = org.settings as OrgEmailSettings
    const allowedDomains = settings.emailAllowedDomains ?? []
    if (allowedDomains.length > 0 && !allowedDomains.includes(domain)) {
      throw this.app.httpErrors.forbidden(`Domain '${domain}' is not in the allowed list`)
    }

    // Resolve requester — find user by email in org, fall back to first admin
    const requester = await this.resolveRequester(fromEmail, orgId)
    if (!requester) throw this.app.httpErrors.unprocessableEntity('No admin found in organization')

    // Parse body
    const rawBody = payload.text || ''
    const description = stripSignature(rawBody)

    // Extract Message-ID from raw headers if present
    const messageId = this.extractMessageId(payload.headers)

    // Create ticket via TicketService (reuses SLA scheduling, audit log, etc.)
    const ticket = await this.tickets.create(
      {
        title: payload.subject ?? '(no subject)',
        description: description || undefined,
        priority: 'medium',
        source: 'email',
        tags: [],
        metadata: {
          emailSource: {
            from: payload.from,
            messageId,
            rawSubject: payload.subject,
          },
        },
      },
      {
        userId: requester.id,
        organizationId: orgId,
        role: requester.role,
        email: requester.email,
      },
    )

    // Auto-reply
    await this.app.mailer.send({
      to: fromEmail,
      subject: `Re: ${payload.subject ?? '(no subject)'} [Ticket ${ticket.ticketNumber}]`,
      text: [
        `Thank you for contacting support.`,
        `Your request has been received and assigned ticket number: ${ticket.ticketNumber}`,
        ``,
        `You can track your ticket at: ${this.app.config.APP_URL}/tickets/${ticket.id}`,
        ``,
        `We will respond as soon as possible.`,
      ].join('\n'),
    })

    return ticket
  }

  private async resolveRequester(email: string, orgId: string) {
    // Try exact email match first
    const user = await this.prisma.user.findFirst({
      where: { email, organizationId: orgId, isActive: true },
    })
    if (user) return user

    // Fall back to first admin
    return this.prisma.user.findFirst({
      where: { organizationId: orgId, role: 'admin', isActive: true },
      orderBy: { createdAt: 'asc' },
    })
  }

  private extractMessageId(headers?: string): string | undefined {
    if (!headers) return undefined
    const match = headers.match(/^Message-ID:\s*(.+)$/im)
    return match?.[1]?.trim()
  }
}

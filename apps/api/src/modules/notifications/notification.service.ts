import Handlebars from 'handlebars'
import type { FastifyInstance } from 'fastify'
import type { PrismaClient, Prisma } from '@prisma/client'
import { Worker } from 'bullmq'
import {
  NOTIFICATION_QUEUE_NAME,
  type NotificationJobData,
  type NotificationEvent,
} from '../../plugins/queue.js'

// ── Default templates (bilingual — vi/en inline) ──────────────────────────────

export const DEFAULT_TEMPLATES: Record<NotificationEvent, { subject: string; body: string }> = {
  'ticket.created': {
    subject: '[{{ticketNumber}}] Ticket mới / New ticket: {{title}}',
    body: `Xin chào {{recipientName}},\n\nTicket #{{ticketNumber}} đã được tạo.\nTiêu đề: {{title}}\nĐộ ưu tiên: {{priority}}\n\nHello {{recipientName}},\n\nTicket #{{ticketNumber}} has been created.\nTitle: {{title}}\nPriority: {{priority}}\n\n{{portalUrl}}`,
  },
  'ticket.assigned': {
    subject: '[{{ticketNumber}}] Ticket được giao / Ticket assigned: {{title}}',
    body: `Xin chào {{recipientName}},\n\nTicket #{{ticketNumber}} đã được giao cho bạn.\n\nHello {{recipientName}},\n\nTicket #{{ticketNumber}} has been assigned to you.\nTitle: {{title}}\n\n{{portalUrl}}`,
  },
  'ticket.updated': {
    subject: '[{{ticketNumber}}] Cập nhật ticket / Ticket updated: {{title}}',
    body: `Ticket #{{ticketNumber}} đã được cập nhật.\nTrạng thái: {{status}}\n\nTicket #{{ticketNumber}} was updated.\nStatus: {{status}}\n\n{{portalUrl}}`,
  },
  'ticket.resolved': {
    subject: '[{{ticketNumber}}] Ticket đã giải quyết / Ticket resolved: {{title}}',
    body: `Xin chào {{recipientName}},\n\nTicket #{{ticketNumber}} đã được đóng/giải quyết.\n\nHello {{recipientName}},\n\nTicket #{{ticketNumber}} has been resolved/closed.\n\n{{portalUrl}}`,
  },
  'sla.warning': {
    subject: '⚠️ [{{ticketNumber}}] SLA sắp hết hạn / SLA warning: {{title}}',
    body: `Ticket #{{ticketNumber}} sẽ vi phạm SLA trong {{minutesRemaining}} phút.\nLoại SLA: {{slaType}}\n\nTicket #{{ticketNumber}} will breach SLA in {{minutesRemaining}} minutes.\nSLA type: {{slaType}}\n\n{{portalUrl}}`,
  },
  'sla.breached': {
    subject: '🚨 [{{ticketNumber}}] VI PHẠM SLA / SLA BREACHED: {{title}}',
    body: `Ticket #{{ticketNumber}} đã vi phạm SLA!\nLoại: {{slaType}}\n\nTicket #{{ticketNumber}} has breached SLA!\nType: {{slaType}}\n\n{{portalUrl}}`,
  },
}

// ── User notification preferences ────────────────────────────────────────────

export interface NotificationPrefs {
  email: {
    ticketCreated: boolean
    ticketAssigned: boolean
    ticketUpdated: boolean
    ticketResolved: boolean
    slaWarning: boolean
    slaBreached: boolean
  }
}

export const DEFAULT_PREFS: NotificationPrefs = {
  email: {
    ticketCreated: true,
    ticketAssigned: true,
    ticketUpdated: false,
    ticketResolved: true,
    slaWarning: true,
    slaBreached: true,
  },
}

const EVENT_TO_PREF: Record<NotificationEvent, keyof NotificationPrefs['email']> = {
  'ticket.created': 'ticketCreated',
  'ticket.assigned': 'ticketAssigned',
  'ticket.updated': 'ticketUpdated',
  'ticket.resolved': 'ticketResolved',
  'sla.warning': 'slaWarning',
  'sla.breached': 'slaBreached',
}

// ── NotificationService ───────────────────────────────────────────────────────

export class NotificationService {
  private prisma: PrismaClient

  constructor(private readonly app: FastifyInstance) {
    this.prisma = app.prisma
  }

  /**
   * Enqueue a notification job. In test env, processes it synchronously
   * so tests don't need to poll the queue.
   */
  async send(data: NotificationJobData) {
    if (this.app.config.NODE_ENV === 'test') {
      await this.process(data)
    } else {
      await this.app.notificationQueue.add('send', data, { attempts: 3, backoff: { type: 'exponential', delay: 5000 } })
    }
  }

  /** Core processing logic — called by worker and directly in tests */
  async process(data: NotificationJobData) {
    const { event, organizationId, recipientId, ticketId, context } = data

    // Check user notification preferences
    const user = await this.prisma.user.findUnique({ where: { id: recipientId } })
    if (!user) return

    const prefs = { ...DEFAULT_PREFS, ...(user.metadata as Partial<NotificationPrefs>) }
    const prefKey = EVENT_TO_PREF[event]
    if (!prefs.email[prefKey]) return

    // Resolve template (org-specific or default)
    const tmpl = await this.prisma.notificationTemplate.findFirst({
      where: { organizationId, event, channel: 'email', isActive: true },
    })
    const { subject: subjectTmpl, body: bodyTmpl } = tmpl
      ? { subject: tmpl.subject ?? DEFAULT_TEMPLATES[event].subject, body: tmpl.bodyTemplate }
      : DEFAULT_TEMPLATES[event]

    // Render Handlebars templates
    const fullContext = {
      recipientName: user.fullName,
      portalUrl: `${this.app.config.APP_URL}/tickets/${ticketId ?? ''}`,
      ...context,
    }
    const subject = Handlebars.compile(subjectTmpl)(fullContext)
    const body = Handlebars.compile(bodyTmpl)(fullContext)

    // Send via Mailer
    await this.app.mailer.send({ to: user.email, subject, text: body })

    // Record notification
    await this.prisma.notification.create({
      data: {
        organizationId,
        recipientId,
        ticketId,
        title: subject,
        body,
        channel: 'email',
        status: 'sent',
        sentAt: new Date(),
      },
    })
  }

  /** Start BullMQ worker (skipped in test env) */
  startWorker() {
    if (this.app.config.NODE_ENV === 'test') return null

    const worker = new Worker<NotificationJobData>(
      NOTIFICATION_QUEUE_NAME,
      async (job) => this.process(job.data),
      { connection: this.app.redis, concurrency: 10 },
    )

    this.app.addHook('onClose', async () => { await worker.close() })
    return worker
  }

  // ── Notification preferences ───────────────────────────────────────────────

  async getPrefs(userId: string): Promise<NotificationPrefs> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw this.app.httpErrors.notFound('User not found')
    return { ...DEFAULT_PREFS, ...(user.metadata as Partial<NotificationPrefs>) }
  }

  async updatePrefs(userId: string, prefs: Partial<NotificationPrefs['email']>): Promise<NotificationPrefs> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw this.app.httpErrors.notFound('User not found')

    const current = { ...DEFAULT_PREFS, ...(user.metadata as Partial<NotificationPrefs>) }
    const updated: NotificationPrefs = { email: { ...current.email, ...prefs } }

    await this.prisma.user.update({
      where: { id: userId },
      data: { metadata: updated as unknown as Prisma.InputJsonValue },
    })
    return updated
  }

  // ── Unsubscribe ────────────────────────────────────────────────────────────

  generateUnsubscribeToken(userId: string): string {
    // Cast needed: unsubscribe token uses a subset payload not matching the auth JwtPayload shape
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.app.jwt.sign({ userId, purpose: 'unsubscribe' } as any, { expiresIn: 86400 * 30 })
  }

  async handleUnsubscribe(token: string): Promise<void> {
    const payload = this.app.jwt.verify<{ userId: string; purpose: string }>(token)
    if (payload.purpose !== 'unsubscribe') throw this.app.httpErrors.badRequest('Invalid token purpose')

    // Disable all email notifications
    const allOff: NotificationPrefs['email'] = {
      ticketCreated: false,
      ticketAssigned: false,
      ticketUpdated: false,
      ticketResolved: false,
      slaWarning: false,
      slaBreached: false,
    }
    await this.prisma.user.update({
      where: { id: payload.userId },
      data: { metadata: { email: allOff } as unknown as Prisma.InputJsonValue },
    })
  }

  // ── Template preview ───────────────────────────────────────────────────────

  async previewTemplate(event: NotificationEvent, organizationId: string) {
    const sampleContext: Record<string, unknown> = {
      ticketNumber: 'TKT-2026-001',
      title: 'Sample ticket',
      priority: 'high',
      status: 'in_progress',
      slaType: 'response',
      minutesRemaining: 30,
      recipientName: 'Demo User',
    }

    const tmpl = await this.prisma.notificationTemplate.findFirst({
      where: { organizationId, event, channel: 'email', isActive: true },
    })
    const { subject: subjectTmpl, body: bodyTmpl } = tmpl
      ? { subject: tmpl.subject ?? DEFAULT_TEMPLATES[event].subject, body: tmpl.bodyTemplate }
      : DEFAULT_TEMPLATES[event]

    const fullContext = {
      ...sampleContext,
      portalUrl: `${this.app.config.APP_URL}/tickets/preview`,
    }

    return {
      event,
      subject: Handlebars.compile(subjectTmpl)(fullContext),
      body: Handlebars.compile(bodyTmpl)(fullContext),
    }
  }
}

/** Module-level helper — queue a notification from any service */
export async function queueNotification(app: FastifyInstance, data: NotificationJobData) {
  const svc = new NotificationService(app)
  await svc.send(data)
}

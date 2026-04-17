import type { FastifyInstance } from 'fastify'
import type { SlaCheckJobData } from '../../plugins/queue.js'
import type { CreateSlaPolicyInput, UpdateSlaPolicyInput } from './sla.schema.js'
import { queueNotification } from '../notifications/notification.service.js'

interface JwtUser {
  userId: string
  organizationId: string
  role: string
}

// ─── SLA scheduler ────────────────────────────────────────────────────────────

/**
 * Enqueue breach-check jobs at 50%, 75%, and 100% of the SLA window.
 * Skips any checkpoint that is already in the past.
 * Job IDs are deterministic so they can be removed on SLA met/pause.
 */
export async function scheduleSlaChecks(
  fastify: FastifyInstance,
  record: { id: string; createdAt: Date; targetTime: Date },
) {
  if (fastify.config.NODE_ENV === 'test') return // don't schedule in test env

  const now = Date.now()
  const start = record.createdAt.getTime()
  const end = record.targetTime.getTime()
  const total = end - start

  const checkPoints: Array<50 | 75 | 100> = [50, 75, 100]
  for (const cp of checkPoints) {
    const fireAt = start + (total * cp) / 100
    const delay = fireAt - now
    if (delay <= 0) continue // already past, skip

    const jobData: SlaCheckJobData = {
      ticketId: record.id, // will be overridden by caller
      slaRecordId: record.id,
      checkPoint: cp,
    }
    await fastify.slaQueue.add(`check-${cp}`, jobData, {
      delay,
      jobId: `sla:${record.id}:${cp}`,
      removeOnComplete: true,
    })
  }
}

/**
 * Cancel pending breach-check jobs for a SLA record (called when SLA is met or paused).
 */
export async function cancelSlaJobs(fastify: FastifyInstance, slaRecordId: string) {
  if (fastify.config.NODE_ENV === 'test') return

  for (const cp of [50, 75, 100]) {
    const job = await fastify.slaQueue.getJob(`sla:${slaRecordId}:${cp}`)
    if (job) await job.remove()
  }
}

// ─── SLA Service ──────────────────────────────────────────────────────────────

export class SlaService {
  constructor(private app: FastifyInstance) {}

  private get prisma() {
    return this.app.prisma
  }

  // ── Breach check (called by BullMQ worker or directly in tests) ────────────

  async processBreachCheck(slaRecordId: string, now: Date = new Date()) {
    const record = await this.prisma.ticketSlaRecord.findUnique({
      where: { id: slaRecordId },
    })
    if (!record || record.status !== 'active') return // already met, paused, or breached

    if (now >= record.targetTime) {
      await this.prisma.ticketSlaRecord.update({
        where: { id: slaRecordId },
        data: { status: 'breached', breachedAt: now },
      })

      // Notify assignee/agents in org
      const ticket = await this.prisma.ticket.findUnique({ where: { id: record.ticketId } })
      if (ticket) {
        const recipients = [ticket.assigneeId, ticket.requesterId].filter(Boolean) as string[]
        for (const recipientId of [...new Set(recipients)]) {
          await queueNotification(this.app, {
            event: 'sla.breached',
            organizationId: ticket.organizationId,
            recipientId,
            ticketId: ticket.id,
            context: { ticketNumber: ticket.ticketNumber, title: ticket.title, slaType: record.slaType },
          })
        }
      }
    }
  }

  // ── Pause SLA records when ticket enters pending_customer ──────────────────

  async pauseSlaRecords(
    ticketId: string,
    pausedAt: Date,
    tx: Parameters<Parameters<typeof this.prisma.$transaction>[0]>[0],
  ) {
    const records = await tx.ticketSlaRecord.findMany({
      where: { ticketId, status: 'active' },
    })
    for (const r of records) {
      await tx.ticketSlaRecord.update({
        where: { id: r.id },
        data: { status: 'paused', pausedAt },
      })
      await cancelSlaJobs(this.app, r.id)
    }
  }

  // ── Resume SLA records when ticket leaves pending_customer ─────────────────

  async resumeSlaRecords(
    ticketId: string,
    resumedAt: Date,
    tx: Parameters<Parameters<typeof this.prisma.$transaction>[0]>[0],
  ) {
    const records = await tx.ticketSlaRecord.findMany({
      where: { ticketId, status: 'paused' },
    })
    for (const r of records) {
      if (!r.pausedAt) continue
      const pausedMs = resumedAt.getTime() - r.pausedAt.getTime()
      const pausedSecs = Math.floor(pausedMs / 1000)
      const newTargetTime = new Date(r.targetTime.getTime() + pausedMs)

      await tx.ticketSlaRecord.update({
        where: { id: r.id },
        data: {
          status: 'active',
          pausedAt: null,
          pauseDuration: r.pauseDuration + pausedSecs,
          targetTime: newTargetTime,
        },
      })

      // Re-schedule breach checks with updated targetTime
      await scheduleSlaChecks(this.app, {
        id: r.id,
        createdAt: r.createdAt,
        targetTime: newTargetTime,
      })
    }
  }

  // ── GET /tickets/:id/sla ───────────────────────────────────────────────────

  async getTicketSla(ticketId: string, user: JwtUser) {
    const ticket = await this.prisma.ticket.findFirst({
      where: {
        id: ticketId,
        organizationId: user.organizationId,
        ...(user.role === 'user' ? { requesterId: user.userId } : {}),
      },
    })
    if (!ticket) throw this.app.httpErrors.notFound('Ticket not found')

    const records = await this.prisma.ticketSlaRecord.findMany({
      where: { ticketId },
      orderBy: { createdAt: 'asc' },
      include: { slaPolicy: { select: { name: true, priority: true } } },
    })

    const now = Date.now()
    return {
      ticketId,
      records: records.map((r) => {
        const start = r.createdAt.getTime()
        const end = r.targetTime.getTime()
        const total = end - start
        const elapsed = now - start
        const percentElapsed = total > 0 ? Math.min(Math.round((elapsed / total) * 100), 100) : 0
        const timeRemaining = Math.max(end - now, 0)

        return {
          id: r.id,
          slaType: r.slaType,
          status: r.status,
          targetTime: r.targetTime,
          actualTime: r.actualTime,
          breachedAt: r.breachedAt,
          pauseDuration: r.pauseDuration,
          percentElapsed,
          timeRemainingMs: timeRemaining,
          slaPolicy: r.slaPolicy,
        }
      }),
    }
  }

  // ── SLA Policy CRUD ────────────────────────────────────────────────────────

  async listPolicies(organizationId: string) {
    return this.prisma.slaPolicy.findMany({
      where: { organizationId },
      orderBy: [
        {
          priority: 'asc',
        },
      ],
    })
  }

  async createPolicy(input: CreateSlaPolicyInput, organizationId: string) {
    const existing = await this.prisma.slaPolicy.findFirst({
      where: { organizationId, priority: input.priority },
    })
    if (existing) {
      throw this.app.httpErrors.conflict(
        `SLA policy for priority '${input.priority}' already exists`,
      )
    }
    return this.prisma.slaPolicy.create({
      data: { ...input, organizationId },
    })
  }

  async updatePolicy(id: string, input: UpdateSlaPolicyInput, organizationId: string) {
    const policy = await this.prisma.slaPolicy.findFirst({
      where: { id, organizationId },
    })
    if (!policy) throw this.app.httpErrors.notFound('SLA policy not found')

    return this.prisma.slaPolicy.update({
      where: { id },
      data: input,
    })
  }

  async deletePolicy(id: string, organizationId: string) {
    const policy = await this.prisma.slaPolicy.findFirst({
      where: { id, organizationId },
    })
    if (!policy) throw this.app.httpErrors.notFound('SLA policy not found')

    await this.prisma.slaPolicy.delete({ where: { id } })
  }
}

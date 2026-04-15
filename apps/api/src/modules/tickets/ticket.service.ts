import type { FastifyInstance } from 'fastify'
import type { PrismaClient, Prisma } from '@prisma/client'
import {
  isValidTransition,
  type CreateTicketInput,
  type UpdateTicketInput,
  type ListTicketsQuery,
  type CreateCommentInput,
  type UpdateCommentInput,
} from './ticket.schema.js'

interface JwtUser {
  userId: string
  organizationId: string
  role: string
  email: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function generateTicketNumber(prisma: PrismaClient, organizationId: string): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `TKT-${year}-`

  // Count existing tickets for this org in current year to get next sequence
  const count = await prisma.ticket.count({
    where: {
      organizationId,
      ticketNumber: { startsWith: prefix },
    },
  })

  return `${prefix}${String(count + 1).padStart(5, '0')}`
}

async function getSlaPolicy(prisma: PrismaClient, organizationId: string, priority: string) {
  return prisma.slaPolicy.findFirst({
    where: { organizationId, priority },
  })
}

function computeSlaTargetTime(baseTime: Date, hours: number, businessHoursOnly: boolean): Date {
  // Simplified: for now, add hours directly.
  // TODO: respect business hours calendar
  if (!businessHoursOnly) {
    return new Date(baseTime.getTime() + hours * 60 * 60 * 1000)
  }
  // Business hours: 08:00-17:30 Mon-Fri, skip weekends
  let remaining = hours * 60 // minutes
  const current = new Date(baseTime)
  while (remaining > 0) {
    const day = current.getDay()
    const hour = current.getHours()
    const minute = current.getMinutes()
    // Skip weekends
    if (day === 0 || day === 6) {
      current.setDate(current.getDate() + 1)
      current.setHours(8, 0, 0, 0)
      continue
    }
    // Outside business hours
    if (hour < 8) {
      current.setHours(8, 0, 0, 0)
      continue
    }
    if (hour >= 17 && minute >= 30) {
      current.setDate(current.getDate() + 1)
      current.setHours(8, 0, 0, 0)
      continue
    }
    // Within business hours: advance by min(remaining, minutes until end of day)
    const endOfDay = 17 * 60 + 30 // 17:30 in minutes
    const currentMinutes = hour * 60 + minute
    const minutesLeft = endOfDay - currentMinutes
    const advance = Math.min(remaining, minutesLeft)
    current.setMinutes(current.getMinutes() + advance)
    remaining -= advance
  }
  return current
}

// ─── Ticket Service ───────────────────────────────────────────────────────────

export class TicketService {
  constructor(private app: FastifyInstance) {}

  private get prisma() {
    return this.app.prisma
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  async create(input: CreateTicketInput, user: JwtUser) {
    const ticketNumber = await generateTicketNumber(this.prisma, user.organizationId)
    const slaPolicy = await getSlaPolicy(this.prisma, user.organizationId, input.priority)
    const now = new Date()

    const ticket = await this.prisma.$transaction(async (tx) => {
      const created = await tx.ticket.create({
        data: {
          organizationId: user.organizationId,
          ticketNumber,
          title: input.title,
          description: input.description,
          priority: input.priority,
          categoryId: input.categoryId,
          source: input.source,
          requesterId: user.userId,
          assigneeId: input.assigneeId,
          dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
          tags: input.tags,
          metadata: input.metadata as Prisma.InputJsonValue,
          status: 'open',
        },
        include: {
          requester: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
          assignee: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
          category: { select: { id: true, name: true, nameVi: true } },
        },
      })

      // Activity log: ticket created
      await tx.ticketActivity.create({
        data: {
          ticketId: created.id,
          actorId: user.userId,
          action: 'created',
          newValue: ticketNumber,
        },
      })

      // SLA records
      if (slaPolicy) {
        const slaRecords = []
        slaRecords.push({
          ticketId: created.id,
          slaPolicyId: slaPolicy.id,
          slaType: 'response',
          targetTime: computeSlaTargetTime(now, slaPolicy.responseHours, slaPolicy.businessHoursOnly),
          status: 'active',
        })
        slaRecords.push({
          ticketId: created.id,
          slaPolicyId: slaPolicy.id,
          slaType: 'resolution',
          targetTime: computeSlaTargetTime(now, slaPolicy.resolutionHours, slaPolicy.businessHoursOnly),
          status: 'active',
        })
        await tx.ticketSlaRecord.createMany({ data: slaRecords })
      }

      return created
    })

    return { ...ticket, slaPolicy: slaPolicy ? { priority: slaPolicy.priority, responseHours: slaPolicy.responseHours, resolutionHours: slaPolicy.resolutionHours } : null }
  }

  // ── List ───────────────────────────────────────────────────────────────────

  async list(query: ListTicketsQuery, user: JwtUser) {
    const { page, limit, status, priority, assigneeId, requesterId, categoryId, search, sort, order } = query
    const skip = (page - 1) * limit

    // RBAC: user role only sees own tickets
    const baseWhere = {
      organizationId: user.organizationId,
      ...(user.role === 'user' ? { requesterId: user.userId } : {}),
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(assigneeId ? { assigneeId } : {}),
      ...(requesterId && user.role !== 'user' ? { requesterId } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' as const } },
              { ticketNumber: { contains: search, mode: 'insensitive' as const } },
              { description: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }

    const orderByMap: Record<string, string> = {
      created_at: 'createdAt',
      updated_at: 'updatedAt',
      priority: 'priority',
      due_date: 'dueDate',
    }

    const [tickets, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where: baseWhere,
        skip,
        take: limit,
        orderBy: { [orderByMap[sort] ?? 'createdAt']: order },
        include: {
          requester: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
          assignee: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
          category: { select: { id: true, name: true, nameVi: true } },
          slaRecords: {
            where: { status: { in: ['active', 'breached'] } },
            orderBy: { createdAt: 'asc' },
          },
          _count: { select: { comments: true, activities: true } },
        },
      }),
      this.prisma.ticket.count({ where: baseWhere }),
    ])

    return {
      data: tickets,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }
  }

  // ── Get by ID ──────────────────────────────────────────────────────────────

  async getById(ticketId: string, user: JwtUser) {
    const ticket = await this.prisma.ticket.findFirst({
      where: {
        id: ticketId,
        organizationId: user.organizationId,
        ...(user.role === 'user' ? { requesterId: user.userId } : {}),
      },
      include: {
        requester: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
        assignee: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
        category: { select: { id: true, name: true, nameVi: true } },
        slaRecords: { orderBy: { createdAt: 'asc' } },
        comments: {
          where: user.role === 'user' ? { isInternal: false } : {},
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
          },
        },
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            actor: { select: { id: true, fullName: true, email: true } },
          },
        },
      },
    })

    if (!ticket) {
      throw this.app.httpErrors.notFound('Ticket not found')
    }

    return ticket
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  async update(ticketId: string, input: UpdateTicketInput, user: JwtUser) {
    const existing = await this.prisma.ticket.findFirst({
      where: { id: ticketId, organizationId: user.organizationId },
    })

    if (!existing) {
      throw this.app.httpErrors.notFound('Ticket not found')
    }

    // RBAC: user role cannot update tickets they don't own
    if (user.role === 'user' && existing.requesterId !== user.userId) {
      throw this.app.httpErrors.forbidden('You can only update your own tickets')
    }

    // Status machine validation
    if (input.status && input.status !== existing.status) {
      if (!isValidTransition(existing.status, input.status)) {
        throw this.app.httpErrors.badRequest(
          `Invalid status transition: ${existing.status} → ${input.status}`,
        )
      }
    }

    const activities: Array<{ action: string; oldValue: string | null; newValue: string | null }> = []

    if (input.status && input.status !== existing.status) {
      activities.push({ action: 'status_changed', oldValue: existing.status, newValue: input.status })
    }
    if (input.priority && input.priority !== existing.priority) {
      activities.push({ action: 'priority_changed', oldValue: existing.priority, newValue: input.priority })
    }
    if ('assigneeId' in input && input.assigneeId !== existing.assigneeId) {
      activities.push({ action: 'assigned', oldValue: existing.assigneeId, newValue: input.assigneeId ?? null })
    }

    const resolvedAt =
      input.status === 'resolved' && existing.status !== 'resolved' ? new Date() : undefined
    const closedAt =
      input.status === 'closed' && existing.status !== 'closed' ? new Date() : undefined

    const updated = await this.prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.update({
        where: { id: ticketId },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          ...('categoryId' in input ? { categoryId: input.categoryId } : {}),
          ...('assigneeId' in input ? { assigneeId: input.assigneeId } : {}),
          ...('dueDate' in input ? { dueDate: input.dueDate ? new Date(input.dueDate) : null } : {}),
          ...(input.tags !== undefined ? { tags: input.tags } : {}),
          ...(resolvedAt ? { resolvedAt } : {}),
          ...(closedAt ? { closedAt } : {}),
        },
        include: {
          requester: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
          assignee: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
          category: { select: { id: true, name: true, nameVi: true } },
          slaRecords: { where: { status: { in: ['active', 'breached'] } } },
        },
      })

      // Write activity log entries
      if (activities.length > 0) {
        await tx.ticketActivity.createMany({
          data: activities.map((a) => ({
            ticketId,
            actorId: user.userId,
            action: a.action,
            oldValue: a.oldValue,
            newValue: a.newValue,
          })),
        })
      }

      // SLA: mark response SLA as met when status changes from open
      if (input.status && input.status !== 'open' && existing.status === 'open') {
        await tx.ticketSlaRecord.updateMany({
          where: { ticketId, slaType: 'response', status: 'active' },
          data: { status: 'met', actualTime: new Date() },
        })
      }

      // SLA: mark resolution SLA as met when resolved/closed
      if (input.status === 'resolved' || input.status === 'closed') {
        await tx.ticketSlaRecord.updateMany({
          where: { ticketId, slaType: 'resolution', status: 'active' },
          data: { status: 'met', actualTime: new Date() },
        })
      }

      return ticket
    })

    return updated
  }

  // ── Comments ───────────────────────────────────────────────────────────────

  async addComment(ticketId: string, input: CreateCommentInput, user: JwtUser) {
    // Verify ticket exists and belongs to org
    const ticket = await this.prisma.ticket.findFirst({
      where: {
        id: ticketId,
        organizationId: user.organizationId,
        ...(user.role === 'user' ? { requesterId: user.userId } : {}),
      },
    })

    if (!ticket) {
      throw this.app.httpErrors.notFound('Ticket not found')
    }

    // Users cannot add internal notes
    if (input.isInternal && user.role === 'user') {
      throw this.app.httpErrors.forbidden('Users cannot add internal notes')
    }

    const comment = await this.prisma.$transaction(async (tx) => {
      const c = await tx.ticketComment.create({
        data: {
          ticketId,
          authorId: user.userId,
          body: input.body,
          isInternal: input.isInternal,
        },
        include: {
          author: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
        },
      })

      await tx.ticketActivity.create({
        data: {
          ticketId,
          actorId: user.userId,
          action: input.isInternal ? 'internal_note_added' : 'comment_added',
          newValue: `Comment ID: ${c.id}`,
        },
      })

      return c
    })

    return comment
  }

  async updateComment(ticketId: string, commentId: string, input: UpdateCommentInput, user: JwtUser) {
    const comment = await this.prisma.ticketComment.findFirst({
      where: {
        id: commentId,
        ticketId,
        ticket: { organizationId: user.organizationId },
      },
    })

    if (!comment) {
      throw this.app.httpErrors.notFound('Comment not found')
    }

    // Only author can edit their comment (unless admin)
    if (comment.authorId !== user.userId && user.role !== 'admin') {
      throw this.app.httpErrors.forbidden('You can only edit your own comments')
    }

    return this.prisma.ticketComment.update({
      where: { id: commentId },
      data: { body: input.body },
      include: {
        author: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
      },
    })
  }

  // ── Activity Log ───────────────────────────────────────────────────────────

  async getActivities(ticketId: string, user: JwtUser) {
    const ticket = await this.prisma.ticket.findFirst({
      where: {
        id: ticketId,
        organizationId: user.organizationId,
        ...(user.role === 'user' ? { requesterId: user.userId } : {}),
      },
    })

    if (!ticket) {
      throw this.app.httpErrors.notFound('Ticket not found')
    }

    return this.prisma.ticketActivity.findMany({
      where: { ticketId },
      orderBy: { createdAt: 'desc' },
      include: {
        actor: { select: { id: true, fullName: true, email: true } },
      },
    })
  }
}

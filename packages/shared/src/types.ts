export const TICKET_STATUSES = [
  'open',
  'in_progress',
  'pending_customer',
  'pending_third_party',
  'resolved',
  'closed',
] as const

export type TicketStatus = (typeof TICKET_STATUSES)[number]

export const TICKET_PRIORITIES = ['critical', 'high', 'medium', 'low'] as const
export type TicketPriority = (typeof TICKET_PRIORITIES)[number]

export const TICKET_SOURCES = ['portal', 'email', 'api', 'slack'] as const
export type TicketSource = (typeof TICKET_SOURCES)[number]

export const USER_ROLES = ['admin', 'manager', 'agent', 'user'] as const
export type UserRole = (typeof USER_ROLES)[number]

export const SLA_STATUSES = ['active', 'paused', 'breached', 'met'] as const
export type SlaStatus = (typeof SLA_STATUSES)[number]

export const ORG_PLANS = ['starter', 'growth', 'enterprise'] as const
export type OrgPlan = (typeof ORG_PLANS)[number]

export const SLA_DEFAULTS = {
  critical: { responseHours: 1, resolutionHours: 4 },
  high: { responseHours: 2, resolutionHours: 8 },
  medium: { responseHours: 4, resolutionHours: 24 },
  low: { responseHours: 8, resolutionHours: 72 },
} as const

export const PAGINATION_DEFAULTS = {
  page: 1,
  limit: 20,
  maxLimit: 100,
} as const

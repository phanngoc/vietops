import { z } from 'zod'

export const createSlaPolicySchema = z.object({
  name: z.string().min(1).max(100),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  responseHours: z.number().int().positive(),
  resolutionHours: z.number().int().positive(),
  businessHoursOnly: z.boolean().default(true),
})

export const updateSlaPolicySchema = createSlaPolicySchema.partial()

export type CreateSlaPolicyInput = z.infer<typeof createSlaPolicySchema>
export type UpdateSlaPolicyInput = z.infer<typeof updateSlaPolicySchema>

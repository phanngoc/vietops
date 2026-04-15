import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

export const registerSchema = z.object({
  organizationName: z.string().min(2).max(255),
  organizationSlug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  fullName: z.string().min(2).max(255),
})

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
})

export const googleAuthSchema = z.object({
  idToken: z.string().min(1),
})

export const inviteSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(2).max(255),
  role: z.enum(['manager', 'agent', 'user']),
  department: z.string().max(100).optional(),
})

export const acceptInviteSchema = z.object({
  password: z.string().min(8).max(128),
  fullName: z.string().min(2).max(255).optional(),
})

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type RefreshInput = z.infer<typeof refreshSchema>
export type GoogleAuthInput = z.infer<typeof googleAuthSchema>
export type InviteInput = z.infer<typeof inviteSchema>
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>

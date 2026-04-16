import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('0.0.0.0'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.coerce.number().default(900),
  REFRESH_TOKEN_EXPIRES_IN: z.coerce.number().default(604800),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // Email
  SMTP_URL: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),
  EMAIL_WEBHOOK_SECRET: z.string().optional(),

  APP_URL: z.string().url().default('http://localhost:3000'),
  API_URL: z.string().url().default('http://localhost:3001'),
})

export type Env = z.infer<typeof envSchema>

export function loadConfig(): Env {
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    const formatted = result.error.format()
    console.error('❌ Invalid environment variables:', formatted)
    process.exit(1)
  }
  return result.data
}

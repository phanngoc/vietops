import { describe, it, expect } from 'vitest'
import { buildApp } from './app.js'
import type { Env } from './config.js'

const testConfig: Env = {
  NODE_ENV: 'test',
  PORT: 0,
  HOST: '127.0.0.1',
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/vietops_test',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'test-secret-min-32-characters-long-enough',
  JWT_EXPIRES_IN: 900,
  REFRESH_TOKEN_EXPIRES_IN: 604800,
  APP_URL: 'http://localhost:3000',
  API_URL: 'http://localhost:3001',
}

describe('App', () => {
  it('GET /health returns ok', async () => {
    const app = await buildApp(testConfig)
    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ status: 'ok' })

    await app.close()
  })
})

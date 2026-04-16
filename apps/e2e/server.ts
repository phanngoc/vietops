/**
 * E2E test server — starts the API on a fixed port with the test database.
 * Invoked by playwright.config.ts via `webServer`.
 */

// Must set env vars before any imports that read process.env
process.env.NODE_ENV = 'test'
process.env.PORT = '3099'
process.env.HOST = '0.0.0.0'
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/vietops_test'
process.env.REDIS_URL = 'redis://localhost:6379'
process.env.JWT_SECRET = 'e2e-test-secret-min-32-characters-ok'
process.env.JWT_EXPIRES_IN = '900'
process.env.REFRESH_TOKEN_EXPIRES_IN = '604800'
process.env.APP_URL = 'http://localhost:3000'
process.env.API_URL = 'http://localhost:3099'

import { buildApp } from '../api/src/app.js'
import { loadConfig } from '../api/src/config.js'

const config = loadConfig()
const app = await buildApp(config)
await app.listen({ port: config.PORT, host: config.HOST })
console.log(`E2E server running on http://${config.HOST}:${config.PORT}`)

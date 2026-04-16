import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'

export interface MailerSendOptions {
  to: string
  subject: string
  text: string
  html?: string
}

export interface Mailer {
  send(opts: MailerSendOptions): Promise<void>
  /** Sent calls recorded in test env for assertion */
  _sent?: MailerSendOptions[]
}

declare module 'fastify' {
  interface FastifyInstance {
    mailer: Mailer
  }
}

export default fp(async (fastify: FastifyInstance) => {
  let mailer: Mailer

  if (fastify.config.NODE_ENV === 'test') {
    // No-op mailer with call tracking for test assertions
    const sent: MailerSendOptions[] = []
    mailer = {
      _sent: sent,
      async send(opts) {
        sent.push(opts)
      },
    }
  } else if (fastify.config.SMTP_URL) {
    // Lazy-load nodemailer only when needed
    const nodemailer = await import('nodemailer')
    const transport = nodemailer.createTransport(fastify.config.SMTP_URL)
    mailer = {
      async send(opts) {
        await transport.sendMail({
          from: fastify.config.EMAIL_FROM ?? 'support@vietops.io',
          to: opts.to,
          subject: opts.subject,
          text: opts.text,
          html: opts.html,
        })
      },
    }
  } else {
    // Silent no-op (SMTP_URL not configured)
    mailer = {
      async send(_opts) {
        fastify.log.warn('Mailer not configured — email not sent')
      },
    }
  }

  fastify.decorate('mailer', mailer)
})

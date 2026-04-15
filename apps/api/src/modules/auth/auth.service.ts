import { randomBytes } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { hash, compare } from 'bcrypt'
import type { LoginInput, RegisterInput, InviteInput, AcceptInviteInput } from './auth.schema.js'

const SALT_ROUNDS = 10

interface JwtPayload {
  userId: string
  organizationId: string
  role: string
  email: string
}

export class AuthService {
  constructor(
    private app: FastifyInstance,
    private refreshTokenExpiresIn: number,
  ) {}

  async login(input: LoginInput) {
    const user = await this.app.prisma.user.findFirst({
      where: { email: input.email, isActive: true },
      include: { organization: true },
    })

    if (!user || !user.passwordHash) {
      throw this.app.httpErrors.unauthorized('Invalid email or password')
    }

    const valid = await compare(input.password, user.passwordHash)
    if (!valid) {
      throw this.app.httpErrors.unauthorized('Invalid email or password')
    }

    await this.app.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    })

    const tokens = await this.generateTokens({
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role,
      email: user.email,
    })

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        department: user.department,
        avatarUrl: user.avatarUrl,
        organization: {
          id: user.organization.id,
          name: user.organization.name,
          slug: user.organization.slug,
        },
      },
    }
  }

  async register(input: RegisterInput) {
    const existingOrg = await this.app.prisma.organization.findUnique({
      where: { slug: input.organizationSlug },
    })
    if (existingOrg) {
      throw this.app.httpErrors.conflict('Organization slug already taken')
    }

    const passwordHash = await hash(input.password, SALT_ROUNDS)

    const result = await this.app.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: input.organizationName,
          slug: input.organizationSlug,
          plan: 'starter',
          settings: { timezone: 'Asia/Ho_Chi_Minh', language: 'vi' },
        },
      })

      const user = await tx.user.create({
        data: {
          organizationId: org.id,
          email: input.email,
          fullName: input.fullName,
          passwordHash,
          role: 'admin',
        },
      })

      // Create default SLA policies
      await tx.slaPolicy.createMany({
        data: [
          { organizationId: org.id, name: 'Critical', priority: 'critical', responseHours: 1, resolutionHours: 4, businessHoursOnly: false },
          { organizationId: org.id, name: 'High', priority: 'high', responseHours: 4, resolutionHours: 8, businessHoursOnly: true },
          { organizationId: org.id, name: 'Medium', priority: 'medium', responseHours: 8, resolutionHours: 24, businessHoursOnly: true },
          { organizationId: org.id, name: 'Low', priority: 'low', responseHours: 24, resolutionHours: 72, businessHoursOnly: true },
        ],
      })

      return { org, user }
    })

    const tokens = await this.generateTokens({
      userId: result.user.id,
      organizationId: result.org.id,
      role: result.user.role,
      email: result.user.email,
    })

    return {
      ...tokens,
      user: {
        id: result.user.id,
        email: result.user.email,
        fullName: result.user.fullName,
        role: result.user.role,
        organization: {
          id: result.org.id,
          name: result.org.name,
          slug: result.org.slug,
        },
      },
    }
  }

  async refresh(refreshToken: string) {
    const stored = await this.app.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: { include: { organization: true } } },
    })

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw this.app.httpErrors.unauthorized('Invalid or expired refresh token')
    }

    if (!stored.user.isActive) {
      throw this.app.httpErrors.unauthorized('Account is deactivated')
    }

    // Rotate: revoke old, issue new
    await this.app.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    })

    const tokens = await this.generateTokens({
      userId: stored.user.id,
      organizationId: stored.user.organizationId,
      role: stored.user.role,
      email: stored.user.email,
    })

    return {
      ...tokens,
      user: {
        id: stored.user.id,
        email: stored.user.email,
        fullName: stored.user.fullName,
        role: stored.user.role,
        organization: {
          id: stored.user.organization.id,
          name: stored.user.organization.name,
          slug: stored.user.organization.slug,
        },
      },
    }
  }

  async logout(refreshToken: string) {
    await this.app.prisma.refreshToken.updateMany({
      where: { token: refreshToken, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  async invite(input: InviteInput, organizationId: string) {
    const existing = await this.app.prisma.user.findUnique({
      where: { organizationId_email: { organizationId, email: input.email } },
    })
    if (existing) {
      throw this.app.httpErrors.conflict('User already exists in this organization')
    }

    // Create inactive user with invite token stored in metadata
    const inviteToken = randomBytes(20).toString('hex') // 40 chars, fits VARCHAR(50)
    const user = await this.app.prisma.user.create({
      data: {
        organizationId,
        email: input.email,
        fullName: input.fullName,
        role: input.role,
        department: input.department,
        isActive: false,
        employeeCode: inviteToken, // temporary storage for invite token
      },
    })

    return { inviteToken, user: { id: user.id, email: user.email, fullName: user.fullName } }
  }

  async acceptInvite(token: string, input: AcceptInviteInput) {
    const user = await this.app.prisma.user.findFirst({
      where: { employeeCode: token, isActive: false },
      include: { organization: true },
    })

    if (!user) {
      throw this.app.httpErrors.notFound('Invalid or expired invite token')
    }

    const passwordHash = await hash(input.password, SALT_ROUNDS)
    const updated = await this.app.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        fullName: input.fullName ?? user.fullName,
        isActive: true,
        employeeCode: null, // clear invite token
      },
    })

    const tokens = await this.generateTokens({
      userId: updated.id,
      organizationId: updated.organizationId,
      role: updated.role,
      email: updated.email,
    })

    return {
      ...tokens,
      user: {
        id: updated.id,
        email: updated.email,
        fullName: updated.fullName,
        role: updated.role,
        organization: {
          id: user.organization.id,
          name: user.organization.name,
          slug: user.organization.slug,
        },
      },
    }
  }

  private async generateTokens(payload: JwtPayload) {
    const accessToken = this.app.jwt.sign(payload)

    const refreshToken = randomBytes(48).toString('hex')
    await this.app.prisma.refreshToken.create({
      data: {
        userId: payload.userId,
        token: refreshToken,
        expiresAt: new Date(Date.now() + this.refreshTokenExpiresIn * 1000),
      },
    })

    return { accessToken, refreshToken }
  }
}

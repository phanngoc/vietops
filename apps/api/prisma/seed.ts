import { PrismaClient } from '@prisma/client'
import { hash } from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // ─── Organization ──────────────────────────────────────
  const org = await prisma.organization.create({
    data: {
      name: 'VietOps Demo Company',
      slug: 'vietops-demo',
      plan: 'professional',
      settings: {
        timezone: 'Asia/Ho_Chi_Minh',
        businessHours: { start: '08:00', end: '17:30' },
        workDays: [1, 2, 3, 4, 5],
        language: 'vi',
      },
    },
  })
  console.log(`  Created organization: ${org.name}`)

  // ─── Users (10 users across 4 roles) ──────────────────
  const passwordHash = await hash('Password123!', 10)

  const usersData = [
    { email: 'admin@vietops.demo', fullName: 'Nguyễn Văn Admin', role: 'admin', department: 'IT' },
    { email: 'manager1@vietops.demo', fullName: 'Trần Thị Manager', role: 'manager', department: 'IT' },
    { email: 'manager2@vietops.demo', fullName: 'Lê Văn Quản Lý', role: 'manager', department: 'Operations' },
    { email: 'agent1@vietops.demo', fullName: 'Phạm Minh Agent', role: 'agent', department: 'IT Support' },
    { email: 'agent2@vietops.demo', fullName: 'Hoàng Thị Hỗ Trợ', role: 'agent', department: 'IT Support' },
    { email: 'agent3@vietops.demo', fullName: 'Đỗ Quang Agent', role: 'agent', department: 'DevOps' },
    { email: 'agent4@vietops.demo', fullName: 'Vũ Thị Kỹ Thuật', role: 'agent', department: 'DevOps' },
    { email: 'user1@vietops.demo', fullName: 'Ngô Thanh User', role: 'user', department: 'Engineering' },
    { email: 'user2@vietops.demo', fullName: 'Bùi Thị Nhân Viên', role: 'user', department: 'Design' },
    { email: 'user3@vietops.demo', fullName: 'Đặng Văn Dev', role: 'user', department: 'Engineering' },
  ]

  const users = await Promise.all(
    usersData.map((u, i) =>
      prisma.user.create({
        data: {
          organizationId: org.id,
          ...u,
          passwordHash,
          employeeCode: `EMP${String(i + 1).padStart(3, '0')}`,
        },
      }),
    ),
  )
  console.log(`  Created ${users.length} users`)

  const admin = users[0]!
  const manager = users[1]!
  const agents = users.filter((u) => u.role === 'agent')
  const endUsers = users.filter((u) => u.role === 'user')

  // ─── Ticket Categories ─────────────────────────────────
  const categories = await Promise.all([
    prisma.ticketCategory.create({
      data: { organizationId: org.id, name: 'Hardware', nameVi: 'Phần cứng', icon: 'monitor', sortOrder: 1 },
    }),
    prisma.ticketCategory.create({
      data: { organizationId: org.id, name: 'Software', nameVi: 'Phần mềm', icon: 'code', sortOrder: 2 },
    }),
    prisma.ticketCategory.create({
      data: { organizationId: org.id, name: 'Network', nameVi: 'Mạng', icon: 'wifi', sortOrder: 3 },
    }),
    prisma.ticketCategory.create({
      data: { organizationId: org.id, name: 'Account & Access', nameVi: 'Tài khoản & Quyền truy cập', icon: 'key', sortOrder: 4 },
    }),
    prisma.ticketCategory.create({
      data: { organizationId: org.id, name: 'General Request', nameVi: 'Yêu cầu chung', icon: 'help-circle', sortOrder: 5 },
    }),
  ])

  // Sub-categories
  await Promise.all([
    prisma.ticketCategory.create({
      data: { organizationId: org.id, name: 'Laptop', nameVi: 'Laptop', parentId: categories[0]!.id, sortOrder: 1 },
    }),
    prisma.ticketCategory.create({
      data: { organizationId: org.id, name: 'Monitor', nameVi: 'Màn hình', parentId: categories[0]!.id, sortOrder: 2 },
    }),
    prisma.ticketCategory.create({
      data: { organizationId: org.id, name: 'IDE & Tools', nameVi: 'IDE & Công cụ', parentId: categories[1]!.id, sortOrder: 1 },
    }),
    prisma.ticketCategory.create({
      data: { organizationId: org.id, name: 'VPN', nameVi: 'VPN', parentId: categories[2]!.id, sortOrder: 1 },
    }),
  ])
  console.log(`  Created ${categories.length} categories + sub-categories`)

  // ─── SLA Policies ──────────────────────────────────────
  const slaPolicies = await Promise.all([
    prisma.slaPolicy.create({
      data: { organizationId: org.id, name: 'Critical SLA', priority: 'critical', responseHours: 1, resolutionHours: 4, businessHoursOnly: false },
    }),
    prisma.slaPolicy.create({
      data: { organizationId: org.id, name: 'High SLA', priority: 'high', responseHours: 4, resolutionHours: 8, businessHoursOnly: true },
    }),
    prisma.slaPolicy.create({
      data: { organizationId: org.id, name: 'Medium SLA', priority: 'medium', responseHours: 8, resolutionHours: 24, businessHoursOnly: true },
    }),
    prisma.slaPolicy.create({
      data: { organizationId: org.id, name: 'Low SLA', priority: 'low', responseHours: 24, resolutionHours: 72, businessHoursOnly: true },
    }),
  ])
  console.log(`  Created ${slaPolicies.length} SLA policies`)

  // ─── Sample Tickets ────────────────────────────────────
  const ticketsData = [
    {
      ticketNumber: 'TK-001',
      title: 'Laptop không bật được',
      description: 'Laptop Dell Latitude 5520 không khởi động được sau khi update Windows tối qua.',
      status: 'open',
      priority: 'high',
      categoryId: categories[0]!.id,
      requesterId: endUsers[0]!.id,
      source: 'portal',
      tags: ['hardware', 'laptop', 'urgent'],
    },
    {
      ticketNumber: 'TK-002',
      title: 'Cấp quyền truy cập GitLab cho member mới',
      description: 'Nhân viên mới Nguyễn Văn A (team Engineering) cần quyền truy cập vào các repo: frontend, backend, infra.',
      status: 'in_progress',
      priority: 'medium',
      categoryId: categories[3]!.id,
      requesterId: endUsers[2]!.id,
      assigneeId: agents[0]!.id,
      source: 'portal',
      tags: ['access', 'gitlab', 'onboarding'],
    },
    {
      ticketNumber: 'TK-003',
      title: 'VPN kết nối chậm khi WFH',
      description: 'VPN qua OpenConnect rất chậm, mất khoảng 3-5 phút để kết nối, tốc độ download chỉ 1-2 Mbps.',
      status: 'pending_customer',
      priority: 'medium',
      categoryId: categories[2]!.id,
      requesterId: endUsers[1]!.id,
      assigneeId: agents[2]!.id,
      source: 'email',
      tags: ['vpn', 'network', 'wfh'],
    },
    {
      ticketNumber: 'TK-004',
      title: 'Cài đặt license IntelliJ IDEA Ultimate',
      description: 'Cần cài đặt license IntelliJ IDEA Ultimate cho team Backend (5 người).',
      status: 'resolved',
      priority: 'low',
      categoryId: categories[1]!.id,
      requesterId: manager.id,
      assigneeId: agents[1]!.id,
      resolvedAt: new Date('2026-04-14T10:00:00Z'),
      source: 'slack',
      tags: ['software', 'license', 'ide'],
    },
    {
      ticketNumber: 'TK-005',
      title: 'Server staging bị down',
      description: 'Server staging-01 (10.0.1.50) không respond, tất cả services đều unreachable.',
      status: 'open',
      priority: 'critical',
      categoryId: categories[2]!.id,
      requesterId: endUsers[2]!.id,
      assigneeId: agents[2]!.id,
      source: 'portal',
      tags: ['server', 'staging', 'incident'],
    },
  ]

  const tickets = await Promise.all(
    ticketsData.map((t) =>
      prisma.ticket.create({
        data: { organizationId: org.id, ...t },
      }),
    ),
  )
  console.log(`  Created ${tickets.length} tickets`)

  // ─── SLA Records for tickets ───────────────────────────
  const now = new Date()
  await Promise.all([
    prisma.ticketSlaRecord.create({
      data: {
        ticketId: tickets[0]!.id,
        slaPolicyId: slaPolicies[1]!.id,
        slaType: 'response',
        targetTime: new Date(now.getTime() + 4 * 60 * 60 * 1000),
        status: 'active',
      },
    }),
    prisma.ticketSlaRecord.create({
      data: {
        ticketId: tickets[4]!.id,
        slaPolicyId: slaPolicies[0]!.id,
        slaType: 'response',
        targetTime: new Date(now.getTime() + 1 * 60 * 60 * 1000),
        status: 'active',
      },
    }),
    prisma.ticketSlaRecord.create({
      data: {
        ticketId: tickets[4]!.id,
        slaPolicyId: slaPolicies[0]!.id,
        slaType: 'resolution',
        targetTime: new Date(now.getTime() + 4 * 60 * 60 * 1000),
        status: 'active',
      },
    }),
  ])
  console.log('  Created SLA records')

  // ─── Ticket Comments ───────────────────────────────────
  await Promise.all([
    prisma.ticketComment.create({
      data: {
        ticketId: tickets[1]!.id,
        authorId: agents[0]!.id,
        body: 'Đã tạo account GitLab, đang chờ team lead approve vào group.',
        isInternal: false,
      },
    }),
    prisma.ticketComment.create({
      data: {
        ticketId: tickets[1]!.id,
        authorId: agents[0]!.id,
        body: 'Note nội bộ: Cần check lại policy access cho repo infra, hiện tại chỉ DevOps team mới có quyền.',
        isInternal: true,
      },
    }),
    prisma.ticketComment.create({
      data: {
        ticketId: tickets[2]!.id,
        authorId: agents[2]!.id,
        body: 'Bạn có thể cho mình biết ISP đang sử dụng và kết quả speedtest khi không qua VPN không?',
        isInternal: false,
      },
    }),
  ])
  console.log('  Created ticket comments')

  // ─── Ticket Activities (audit trail) ───────────────────
  await Promise.all([
    prisma.ticketActivity.create({
      data: { ticketId: tickets[1]!.id, actorId: admin.id, action: 'assigned', oldValue: null, newValue: agents[0]!.fullName },
    }),
    prisma.ticketActivity.create({
      data: { ticketId: tickets[1]!.id, actorId: agents[0]!.id, action: 'status_changed', oldValue: 'open', newValue: 'in_progress' },
    }),
    prisma.ticketActivity.create({
      data: { ticketId: tickets[3]!.id, actorId: agents[1]!.id, action: 'status_changed', oldValue: 'in_progress', newValue: 'resolved' },
    }),
  ])
  console.log('  Created ticket activities')

  // ─── Catalog Items ─────────────────────────────────────
  await Promise.all([
    prisma.catalogItem.create({
      data: {
        organizationId: org.id,
        name: 'New Laptop Request',
        nameVi: 'Yêu cầu Laptop mới',
        description: 'Request a new laptop for new hire or replacement.',
        categoryId: categories[0]!.id,
        icon: 'laptop',
        estimatedHours: 48,
        approvalRequired: true,
        formSchema: {
          fields: [
            { name: 'employee_name', type: 'text', label: 'Tên nhân viên', required: true },
            { name: 'reason', type: 'select', label: 'Lý do', options: ['new_hire', 'replacement', 'upgrade'], required: true },
            { name: 'specs', type: 'select', label: 'Cấu hình', options: ['standard', 'developer', 'designer'], required: true },
            { name: 'notes', type: 'textarea', label: 'Ghi chú' },
          ],
        },
        sortOrder: 1,
      },
    }),
    prisma.catalogItem.create({
      data: {
        organizationId: org.id,
        name: 'Software License Request',
        nameVi: 'Yêu cầu License phần mềm',
        description: 'Request a software license for development tools.',
        categoryId: categories[1]!.id,
        icon: 'key',
        estimatedHours: 24,
        approvalRequired: true,
        formSchema: {
          fields: [
            { name: 'software_name', type: 'text', label: 'Tên phần mềm', required: true },
            { name: 'quantity', type: 'number', label: 'Số lượng', required: true },
            { name: 'justification', type: 'textarea', label: 'Lý do cần thiết', required: true },
          ],
        },
        sortOrder: 2,
      },
    }),
    prisma.catalogItem.create({
      data: {
        organizationId: org.id,
        name: 'VPN Access Request',
        nameVi: 'Yêu cầu truy cập VPN',
        description: 'Request VPN access for remote work.',
        categoryId: categories[2]!.id,
        icon: 'shield',
        estimatedHours: 4,
        approvalRequired: false,
        formSchema: {
          fields: [
            { name: 'employee_name', type: 'text', label: 'Tên nhân viên', required: true },
            { name: 'department', type: 'text', label: 'Phòng ban', required: true },
            { name: 'access_period', type: 'select', label: 'Thời gian', options: ['1_month', '3_months', '6_months', 'permanent'], required: true },
          ],
        },
        sortOrder: 3,
      },
    }),
  ])
  console.log('  Created catalog items')

  // ─── Notification Templates ────────────────────────────
  await Promise.all([
    prisma.notificationTemplate.create({
      data: {
        organizationId: org.id,
        event: 'ticket_created',
        channel: 'email',
        subject: '[VietOps] Ticket mới: {{ticket_number}} - {{title}}',
        bodyTemplate: 'Xin chào {{requester_name}},\n\nTicket {{ticket_number}} đã được tạo thành công.\nTiêu đề: {{title}}\nĐộ ưu tiên: {{priority}}\n\nChúng tôi sẽ phản hồi trong thời gian sớm nhất.',
      },
    }),
    prisma.notificationTemplate.create({
      data: {
        organizationId: org.id,
        event: 'ticket_assigned',
        channel: 'in_app',
        bodyTemplate: 'Bạn được phân công ticket {{ticket_number}}: {{title}}',
      },
    }),
    prisma.notificationTemplate.create({
      data: {
        organizationId: org.id,
        event: 'sla_warning',
        channel: 'email',
        subject: '[VietOps] ⚠️ SLA sắp vi phạm: {{ticket_number}}',
        bodyTemplate: 'Ticket {{ticket_number}} sắp vi phạm SLA {{sla_type}}.\nThời hạn: {{target_time}}\nVui lòng xử lý ngay.',
      },
    }),
    prisma.notificationTemplate.create({
      data: {
        organizationId: org.id,
        event: 'sla_breached',
        channel: 'email',
        subject: '[VietOps] 🚨 SLA đã vi phạm: {{ticket_number}}',
        bodyTemplate: 'Ticket {{ticket_number}} đã vi phạm SLA {{sla_type}}.\nThời hạn: {{target_time}}\nThực tế: {{actual_time}}',
      },
    }),
  ])
  console.log('  Created notification templates')

  console.log('\nSeed completed successfully!')
  console.log(`  Organization: ${org.name} (${org.slug})`)
  console.log(`  Users: ${users.length} (admin: 1, manager: 2, agent: 4, user: 3)`)
  console.log(`  Categories: ${categories.length} + sub-categories`)
  console.log(`  SLA Policies: ${slaPolicies.length}`)
  console.log(`  Tickets: ${tickets.length}`)
  console.log(`  Catalog Items: 3`)
  console.log(`  Login: any user email with password "Password123!"`)
}

main()
  .catch((e) => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

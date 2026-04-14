# Business Model — VietOps

## Tổng Quan Thị Trường

### Thị Trường Mục Tiêu
- **Vietnam IT Outsourcing Market**: $698M (2024), tăng trưởng 16.38%/năm → $1.28B vào 2028
- **IT Services Vietnam**: $2.37B (2025), CAGR 10.98%
- **Số lượng IT professional**: 1M+ tại Việt Nam
- **Công ty outsource lớn**: FPT Software (54,000+), TMA Solutions (4,000+), Rikkeisoft (2,000+), KMS, NashTech, Axon Active, Savvycom

### Pain Points Được Xác Nhận
1. **Tool rời rạc**: Excel + email + Jira trộn lẫn, không có workflow tự động
2. **ServiceNow quá đắt**: $50–150/user/month = $600K–1.8M/năm cho 1000 dev (7–20% payroll)
3. **Onboarding thủ công**: Developer mới cần 2+ tuần, không có workflow chuẩn
4. **SLA thiếu minh bạch**: Client Nhật/Úc/EU yêu cầu báo cáo SLA nhưng không có tool
5. **Leave ≠ Availability**: HR system tách biệt Jira, manager không biết dev đang nghỉ

---

## Mô Hình Định Giá

### Pricing Tiers

| Gói | Giá | Tính năng | Target |
|-----|-----|-----------|--------|
| **Starter** | $8/user/tháng | ITSM cơ bản, SLA, portal, Jira sync | Công ty 50–200 dev |
| **Growth** | $15/user/tháng | Starter + Onboarding workflow, Asset management, HR integration | Công ty 200–1000 dev |
| **Enterprise** | $25/user/tháng | Growth + Multi-client dashboard, AI categorization, Custom workflow, Advanced reporting | FPT, TMA, KMS level |
| **Self-hosted** | Liên hệ | Toàn bộ tính năng, on-premise | Công ty yêu cầu data nội bộ |

### So Sánh Cạnh Tranh

| | ServiceNow | Freshservice | Jira SM | **VietOps** |
|--|-----------|-------------|---------|-------------|
| Giá/user/tháng | $50–150 | $19–99 | $17–47 | **$8–25** |
| Deploy time | 6+ tháng | 2–4 tuần | 1–2 tuần | **1–2 tuần** |
| Tiếng Việt | ❌ | ❌ | Cơ bản | **✅ Native** |
| Jira integration | Phức tạp | Cơ bản | Native | **Native + deep** |
| AMIS/Fast HRM | ❌ | ❌ | ❌ | **✅** |
| Local support VN | ❌ | ❌ | ❌ | **✅** |
| Multi-client SLA | ✅ | Giới hạn | ❌ | **✅** |

### Benchmark Chi Phí
- **ServiceNow (1000 user)**: $600K–1.8M/năm (7–20% payroll)
- **Freshservice (1000 user)**: $228K/năm (3% payroll)
- **VietOps Growth (1000 user)**: **$180K/năm (2% payroll)**
- **VietOps Enterprise (1000 user)**: **$300K/năm (3% payroll)**

---

## Go-To-Market Strategy

### Phase 1: Early Adopters (Tháng 1–6)
**Target**: 3–5 công ty outsource 200–500 dev

**Cách tiếp cận**:
1. **Direct outreach**: Liên hệ CTO/IT Manager của Rikkeisoft, Axon Active, Savvycom
2. **Pain point demo**: Demo với data thực — "Bạn đang tốn X giờ/tuần cho việc này"
3. **Free pilot 3 tháng**: 1 công ty, 1 team (~50 users), đo kết quả thực tế
4. **Case study**: Chuyển thành case study cho sales tiếp theo

**Lợi thế bán hàng**:
- *"ServiceNow-like experience"* — CTO/IT Manager VN biết ServiceNow, không mua được vì giá
- *"Deploy trong 2 tuần, không phải 6 tháng"*
- *"Giá dưới 3% payroll, không phải 7–20%"*
- *"Tiếng Việt, support nội địa, tích hợp Jira ngay"*

### Phase 2: Scale (Tháng 7–18)
**Target**: 20–50 công ty, bao gồm FPT regional teams, TMA

**Cách tiếp cận**:
1. **Partner channel**: Hợp tác với Jira/Atlassian resellers tại VN
2. **Community**: Tech talks tại Tech in Asia, Vietnam Tech Day
3. **Referral**: Chương trình giới thiệu cho khách hàng hiện có
4. **Content marketing**: Blog về ITSM best practices cho outsource company VN

### Phase 3: Regional Expansion (Năm 2–3)
**Target**: Mở rộng sang Philippines, Indonesia, Thailand (outsourcing hubs)
- **Localization**: Thêm ngôn ngữ, HR system local
- **Partnership**: Microsoft, Atlassian partner program

---

## Revenue Model

### Revenue Streams
1. **SaaS Subscriptions** (primary): Monthly recurring revenue, per-user pricing
2. **Professional Services**: Implementation, customization, training ($5K–50K/project)
3. **Premium Support**: 24/7 SLA guarantee, dedicated CSM ($500–2K/tháng)
4. **Self-hosted License**: One-time fee + annual maintenance (cho công ty sensitive về data)

### Unit Economics (Target)

| Metric | Year 1 | Year 2 | Year 3 |
|--------|--------|--------|--------|
| Customers | 10 | 50 | 150 |
| Avg users/customer | 300 | 400 | 500 |
| Avg ARPU | $12/user/mo | $15/user/mo | $17/user/mo |
| MRR | $36K | $300K | $1.275M |
| ARR | $432K | $3.6M | $15.3M |
| Churn target | <5%/năm | <4%/năm | <3%/năm |

### Cost Structure (MVP Phase)
- **Team**: 3–5 engineers + 1 product + 1 sales ($15K–25K/tháng)
- **Infrastructure**: $500–2K/tháng (Railway/AWS)
- **Tools/SaaS**: $500/tháng
- **Sales/Marketing**: $2K–5K/tháng

---

## Competitive Moat

### Ngắn hạn (0–18 tháng)
- **Localization first mover**: Đầu tiên có Vietnamese ITSM với Jira + AMIS/Fast HRM integration
- **Speed**: Deploy 2 tuần, onboarding nhanh
- **Price**: 4–6x rẻ hơn ServiceNow

### Trung hạn (18–36 tháng)
- **Data network effects**: Ngày càng nhiều data → AI categorization ngày càng tốt hơn cho thị trường VN
- **Ecosystem lock-in**: Workflow, asset data, SLA history khó migrate
- **Partner network**: Jira resellers, HR consultants

### Dài hạn (36+ tháng)
- **Platform extensibility**: App marketplace cho VN-specific integrations
- **Regional expansion**: First-mover advantage trong SEA outsourcing market

---

## Key Metrics & KPIs

### Product Metrics
- **Time to Value**: Thời gian từ signup đến ticket đầu tiên được resolve < 48h
- **SLA Compliance Rate**: >95% cho khách hàng sử dụng đúng cách
- **Portal Self-Service Rate**: >30% request được resolve qua self-service (không cần agent)
- **Onboarding Automation Rate**: >80% onboarding tasks được auto-assign

### Business Metrics
- **NRR (Net Revenue Retention)**: >110% (expansion > churn)
- **CAC Payback Period**: <12 tháng
- **Monthly Churn**: <0.5%/tháng
- **NPS**: >50

---

## Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Jira SM mở rộng tính năng HR | Trung bình | Cao | Build deeper VN integrations + price advantage |
| ServiceNow giảm giá cho SMB | Thấp | Cao | Speed + local support là lợi thế khó copy |
| Khách hàng delay payment | Cao | Trung bình | Upfront payment, credit card billing |
| Security breach | Thấp | Rất cao | Security audit, pen testing từ sớm, SOC 2 compliance roadmap |
| Talent acquisition | Trung bình | Trung bình | Remote-first, competitive equity package |

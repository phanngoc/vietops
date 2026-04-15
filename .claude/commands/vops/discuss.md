---
name: discuss
description: "Team Discussion — standup, design discussion, decision logging, knowledge sharing"
category: communication
complexity: basic
---

# /vops:discuss — Team Discussion

> Tổ chức buổi thảo luận team — có thể là standup, design discussion, hoặc quyết định kỹ thuật. Mục tiêu: giao tiếp rõ ràng, ghi lại decisions, chia sẻ kiến thức.

## Input

/vops:discuss [topic hoặc mode]

Modes:
- standup — Daily standup: done / doing / blockers
- design [topic] — Thảo luận thiết kế, đưa ra options và trade-offs
- decision [topic] — Ghi lại quyết định kỹ thuật (ADR)
- retro — Retrospective: what went well / what didn't / action items

## Mode: standup

1. Scan trạng thái hiện tại:
   - git log --oneline -10 — recent commits
   - Đọc claudedocs/plans/ — plan nào đang in progress
   - Đọc TodoWrite — tasks đang tracking
   - gh issue list --repo phanngoc/vietops --assignee @me --state open

2. Output format:
```
## Daily Standup — [date]

### Done (hôm qua)
- [Completed task/feature]

### Doing (hôm nay)
- [Current task, estimated progress]

### Blockers
- [Vấn đề cần giải quyết, nếu có]

### Notes
- [Observations, risks spotted]
```

## Mode: design [topic]

1. Thu thập context:
   - Đọc code liên quan
   - Đọc docs/ARCHITECTURE.md
   - Đọc existing patterns

2. Phân tích và trình bày:
   - Nêu bài toán rõ ràng
   - Đưa ra 2-3 options
   - Mỗi option: mô tả, pros, cons
   - Recommendation với lý do

3. Ghi vào: claudedocs/decisions/DESIGN-[topic]-[date].md

## Mode: decision [topic]

Ghi Architecture Decision Record (ADR) vào: claudedocs/decisions/ADR-[number]-[topic].md

Format:
```
# ADR-[number]: [Title]
**Date**: [YYYY-MM-DD]
**Status**: Proposed | Accepted | Deprecated

## Context
[Tại sao cần quyết định này?]

## Options Considered
### Option A: ...
- Pros: ...
- Cons: ...

### Option B: ...
- Pros: ...
- Cons: ...

## Decision
[Chọn option nào và TẠI SAO]

## Consequences
- Positive: ...
- Negative: ...
- Risks: ...
```

## Mode: retro

1. Scan toàn bộ work gần đây:
   - git log --since="1 week ago"
   - claudedocs/plans/ — plans đã complete
   - claudedocs/reviews/ — review findings patterns
   - claudedocs/qa-reports/ — bugs found patterns

2. Output:
```
## Retrospective — [date range]

### What went well
- ...

### What didn't go well
- ...

### Action items
- [ ] ...
```

3. Ghi vào: claudedocs/standups/RETRO-[date].md

## Nguyên tắc
- Decisions phải có CONTEXT và LÝ DO — không chỉ ghi kết quả
- Design discussions phải có TRADE-OFFS rõ ràng
- Standup phải NGẮN GỌN, actionable
- Tất cả artifacts được lưu vào claudedocs/ để team reference sau

---
name: sprint
description: "Sprint Orchestrator — chạy full workflow plan → impl → review → qa cho một task/issue"
category: orchestration
complexity: advanced
---

# /vops:sprint — Full Sprint Workflow

> Orchestrator chạy toàn bộ development workflow cho một task — từ planning đến QA passed. Mô phỏng quy trình của một team phát triển thực thụ.

## Input

/vops:sprint [issue-number]

## Workflow Pipeline

```
Issue → Plan → [User Approve] → Implement → Review → Fix → QA → Ship
         ↑                                      ↓
         └──── Feedback Loop (nếu cần) ────────┘
```

### Step 1: PLAN (vai trò Tech Lead)
1. Chạy logic của /vops:plan cho issue
2. Output plan file tại claudedocs/plans/
3. In summary cho user
4. **CHECKPOINT**: Hỏi user approve plan
   - Nếu user yêu cầu thay đổi → adjust plan → hỏi lại
   - Nếu user approve → tiếp Step 2

### Step 2: IMPLEMENT (vai trò Senior Developer)
1. Tạo feature branch
2. Chạy logic của /vops:impl theo plan
3. Commit incremental
4. Chạy typecheck + lint + test
5. In summary files changed + test results

### Step 3: REVIEW (vai trò Senior Reviewer)
1. Chạy logic của /vops:review
2. Output review report tại claudedocs/reviews/
3. Nếu CHANGES_REQUESTED:
   - Tự fix issues được tìm thấy
   - Re-review cho đến khi APPROVED
4. Nếu APPROVED → tiếp Step 4

### Step 4: QA (vai trò QA Engineer)
1. Chạy logic của /vops:qa
2. Output QA report tại claudedocs/qa-reports/
3. Nếu FAILED:
   - Fix bugs
   - Re-run QA
4. Nếu PASSED → Step 5

### Step 5: SHIP
1. Summary toàn bộ sprint:
   - Plan: [link to plan file]
   - Implementation: [commits, files changed]
   - Review: [verdict, findings count]
   - QA: [test results, edge cases tested]
2. Hỏi user: "Push và tạo PR?"
   - Nếu có: git push + gh pr create
   - Nếu không: để user tự quyết

## Giao tiếp giữa các phase

Mỗi phase transition, announce rõ ràng:
```
═══════════════════════════════════════════
  PHASE: PLAN → IMPLEMENT
  Tech Lead → Senior Developer
  Plan file: claudedocs/plans/PLAN-19-auth.md
═══════════════════════════════════════════
```

## Checkpoint Rules
- SAU Phase Plan: BẮT BUỘC hỏi user approve
- Sau Phase Review nếu có Critical findings: thông báo user
- Sau Phase QA nếu có bugs Critical: thông báo user
- Trước khi Push/PR: BẮT BUỘC hỏi user

## Failure Handling
- Nếu test fail: fix → re-test, tối đa 3 lần trước khi escalate
- Nếu review reject > 2 lần: dừng lại, báo user cần redesign
- Nếu QA fail > 2 lần: dừng lại, báo user có thể cần revise plan

## Nguyên tắc
- Mỗi phase phải HOÀN THÀNH trước khi chuyển phase tiếp
- Artifacts (plan, review, qa) PHẢI được ghi file — không chỉ output terminal
- User luôn có quyền DỪNG, ĐIỀU CHỈNH, hoặc SKIP phase
- Transparent: luôn cho user biết đang ở phase nào, progress ra sao

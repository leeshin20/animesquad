# Hide Member Navbar Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인하지 않은 방문자의 Navbar에서 `내 목록`과 `스쿼드`를 숨긴다.

**Architecture:** 공개 링크와 회원 링크를 분리하고 기존 `me` 상태로 렌더링 배열을 조합한다. 데스크톱과 모바일은 기존처럼 같은 배열을 사용한다.

**Tech Stack:** Next.js 14, React, TypeScript, ESLint

## Global Constraints

- 비로그인과 로그인 확인 중에는 `탐색`만 표시한다.
- 로그인 사용자는 `내 목록`과 `스쿼드`를 본다.
- 관리자 메뉴는 로그인한 관리자에게만 표시한다.
- 검색, 프로필, OAuth, 온보딩 동작은 변경하지 않는다.
- `frontend/src/app/components/NavBar.tsx` 외 제품 코드는 수정하지 않는다.

---

### Task 1: 로그인 상태별 Navbar 링크 구성

**Files:**
- Modify: `frontend/src/app/components/NavBar.tsx`

**Interfaces:**
- Consumes: `Me | null` 상태와 `Me.isAdmin`.
- Produces: 데스크톱·모바일에서 함께 사용하는 로그인 상태별 `links` 배열.

- [ ] **Step 1: Verify the old source fails the regression condition**

Run:

```bash
if rg -n 'const baseLinks = \[' frontend/src/app/components/NavBar.tsx; then exit 1; fi
```

Expected: FAIL because the old unconditional `baseLinks` includes all three links.

- [ ] **Step 2: Implement the minimal link composition**

Define `publicLinks` with `탐색`, `memberLinks` with `내 목록` and `스쿼드`, then compose:

```ts
const links = [
  ...publicLinks,
  ...(me ? memberLinks : []),
  ...(me?.isAdmin ? [{ href: "/admin/anime", label: "관리자" }] : []),
];
```

- [ ] **Step 3: Verify the regression condition passes**

Run the Step 1 command again.

Expected: exit 0 with no old unconditional `baseLinks` declaration.

- [ ] **Step 4: Run frontend verification**

Run:

```bash
cd frontend && pnpm exec tsc --noEmit && pnpm lint
```

Expected: exit 0; only the pre-existing `NavBar.tsx` exhaustive-deps warning may remain.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/components/NavBar.tsx docs/superpowers/plans/2026-07-15-hide-member-nav-links.md
git commit -m "fix(nav): 비로그인 회원 메뉴 숨김"
```

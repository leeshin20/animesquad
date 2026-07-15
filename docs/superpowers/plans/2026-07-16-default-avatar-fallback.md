# Default Avatar Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프로필 사진을 설정하지 않은 사용자의 공용 아바타를 닉네임 첫 글자 대신 `/default-avatar.png`로 표시한다.

**Architecture:** 기존 `Timeline.Avatar`의 공개 인터페이스와 크기 스타일은 유지한다. React 서버 렌더링 테스트로 실제 출력 HTML을 검증한 뒤, `url`이 없을 때도 동일한 `<img>` 경로를 사용하도록 fallback 분기만 교체한다.

**Tech Stack:** Next.js 14, React 18, TypeScript, Node test runner, `tsx`

## Global Constraints

- `avatarUrl`이 있는 사용자는 기존에 설정한 프로필 사진을 그대로 표시한다.
- `avatarUrl`이 `null`일 때만 `/default-avatar.png`를 표시한다.
- 공용 `Timeline.Avatar`를 사용하는 모든 화면에 적용한다.
- NavBar와 관련 없는 아바타 UI는 리팩터링하지 않는다.

---

### Task 1: 공용 Avatar fallback 변경

**Files:**
- Create: `frontend/src/app/components/Timeline.test.tsx`
- Modify: `frontend/src/app/components/Timeline.tsx:186-202`

**Interfaces:**
- Consumes: `Avatar({ name, url, size })`
- Produces: `url ?? "/default-avatar.png"`를 사용하는 원형 이미지 아바타

- [ ] **Step 1: 실제 렌더링을 검증하는 실패 테스트 작성**

```tsx
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Avatar } from "./Timeline";

test("uses the default avatar when the user has no profile image", () => {
  const html = renderToStaticMarkup(<Avatar name="Alice" url={null} />);

  assert.match(html, /src="\/default-avatar\.png"/);
});

test("keeps a user-provided profile image", () => {
  const html = renderToStaticMarkup(
    <Avatar name="Alice" url="https://images.example/alice.png" />
  );

  assert.match(html, /src="https:\/\/images\.example\/alice\.png"/);
  assert.doesNotMatch(html, /default-avatar\.png/);
});
```

- [ ] **Step 2: 테스트가 기존 첫 글자 fallback 때문에 RED인지 확인**

Run:

```bash
cd frontend
./node_modules/.bin/tsx --test src/app/components/Timeline.test.tsx
```

Expected: 첫 번째 테스트가 `/default-avatar.png`를 찾지 못해 실패하고, 사용자 지정 이미지 테스트는 통과한다.

- [ ] **Step 3: 공용 Avatar의 최소 fallback 수정**

`Timeline.tsx`의 `Avatar`를 다음과 같이 변경한다.

```tsx
export function Avatar({ name, url, size = 10 }: { name: string; url: string | null; size?: 7 | 8 | 10 }) {
  const dim =
    size === 7 ? "h-7 w-7 text-xs" :
    size === 8 ? "h-8 w-8 text-sm" :
    "h-10 w-10 text-sm";
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={url ?? "/default-avatar.png"}
      alt={name}
      className={`${dim} flex-none rounded-full object-cover`}
    />
  );
}
```

- [ ] **Step 4: 집중 테스트가 GREEN인지 확인**

Run:

```bash
cd frontend
./node_modules/.bin/tsx --test src/app/components/Timeline.test.tsx
```

Expected: 2개 테스트 모두 통과한다.

- [ ] **Step 5: 프론트 회귀 검증**

Run:

```bash
cd frontend
node --test src/app/lib/feed-pagination.test.mjs src/app/lib/episode-log.test.mjs
./node_modules/.bin/tsx --test src/app/watchlist/reviews/merge-records.test.ts src/app/components/Timeline.test.tsx
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/next build
```

Expected: Node 테스트 5개와 tsx 테스트 4개가 통과하고 TypeScript 검사 및 Next.js 빌드가 성공한다. 기존 `NavBar.tsx` exhaustive-deps 경고 외 새 경고는 없어야 한다.

- [ ] **Step 6: 구현 커밋**

```bash
git add frontend/src/app/components/Timeline.tsx \
  frontend/src/app/components/Timeline.test.tsx
git commit -m "fix(avatar): 기본 프로필 이미지 fallback 통일"
```

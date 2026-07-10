# Twitter Share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회차기록(EpisodeLogModal)과 종합감상평(SeriesReviewModal) 저장 시 체크박스 선택으로 트위터에 공유할 수 있게 한다.

**Architecture:** 트윗 텍스트 생성과 Twitter Web Intent URL 열기를 `lib/twitter.ts` 유틸로 분리하고, 두 모달에서 각각 체크박스 상태를 관리해 저장 성공 후 조건부로 `window.open`을 호출한다.

**Tech Stack:** Next.js (React), TypeScript, Twitter Web Intent API (URL scheme)

---

### Task 1: twitter.ts 유틸 함수 작성

**Files:**
- Create: `frontend/src/app/lib/twitter.ts`

- [ ] **Step 1: 파일 생성**

```typescript
// frontend/src/app/lib/twitter.ts

export function scoreToStars(score: number): string {
  return "★".repeat(score) + "☆".repeat(5 - score);
}

export function buildEpisodeTweetText(
  title: string,
  ep: number,
  score: number | null,
  comment: string,
): string {
  if (score == null && comment.trim() === "") {
    return `${title} ${ep}화를 감상했습니다`;
  }
  const stars = score != null ? ` ${scoreToStars(score)}` : "";
  const body = comment.trim() ? ` ${comment.trim()}` : "";
  return `${title} ${ep}화${stars}${body}`;
}

export function buildSeriesTweetText(
  title: string,
  statusLabel: string,
  score: number | null,
  comment: string,
): string {
  const stars = score != null ? ` ${scoreToStars(score)}` : "";
  const body = comment.trim() ? ` ${comment.trim()}` : "";
  return `[${statusLabel}] ${title}${stars}${body}`;
}

export function openTwitterIntent(text: string): void {
  const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}
```

- [ ] **Step 2: 빌드 확인**

```bash
cd /Users/yubeen/animesquad/frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/app/lib/twitter.ts
git commit -m "feat(twitter): add tweet text builder and intent opener utility"
```

---

### Task 2: EpisodeLogModal에 트위터 공유 체크박스 추가

**Files:**
- Modify: `frontend/src/app/components/EpisodeLogModal.tsx`

- [ ] **Step 1: import 추가 및 상태 추가**

`EpisodeLogModal.tsx` 상단 import에 추가:
```typescript
import { buildEpisodeTweetText, openTwitterIntent } from "@/app/lib/twitter";
```

`useState` 목록에 추가 (기존 `const [ratedEps, ...` 아래):
```typescript
const [shareOnSave, setShareOnSave] = useState(false);
```

- [ ] **Step 2: doSave 성공 후 공유 로직 추가**

기존 `doSave` 함수의 `onSaved()` 호출 직전에 삽입:
```typescript
if (shareOnSave) {
  const title = displayTitle(entry.anime);
  openTwitterIntent(buildEpisodeTweetText(title, epNum, score, comment));
}
onSaved();
```

최종 `doSave` 함수:
```typescript
async function doSave(epNum: number) {
  setOverwriting(false);
  setSaving(true);
  setError(null);
  try {
    if (score != null) {
      await apiPut(`/api/watch/${entry.anime.id}/episodes/${epNum}`, {
        score,
        comment: comment.trim() || null,
      });
    } else {
      await apiPatch(`/api/watch/${entry.anime.id}`, { progress: epNum });
    }
    if (shareOnSave) {
      const title = displayTitle(entry.anime);
      openTwitterIntent(buildEpisodeTweetText(title, epNum, score, comment));
    }
    onSaved();
  } catch (e) {
    setError(String(e));
  } finally {
    setSaving(false);
  }
}
```

- [ ] **Step 3: 체크박스 UI 추가**

버튼 영역(`<div className="mt-6 flex justify-end gap-2">`) 바로 위에 삽입:
```tsx
<label className="flex items-center gap-2 text-sm text-neutral-600">
  <input
    type="checkbox"
    checked={shareOnSave}
    onChange={(e) => setShareOnSave(e.target.checked)}
    className="h-4 w-4 rounded border-neutral-300"
  />
  트위터에 공유하기
</label>
```

- [ ] **Step 4: 빌드 확인**

```bash
cd /Users/yubeen/animesquad/frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/app/components/EpisodeLogModal.tsx
git commit -m "feat(episode-log): add twitter share checkbox"
```

---

### Task 3: SeriesReviewModal에 트위터 공유 체크박스 추가

**Files:**
- Modify: `frontend/src/app/components/SeriesReviewModal.tsx`

- [ ] **Step 1: import 추가 및 상태 추가**

`SeriesReviewModal.tsx` 상단 import에 추가:
```typescript
import { buildSeriesTweetText, openTwitterIntent } from "@/app/lib/twitter";
import { STATUS_LABEL } from "@/app/lib/watch-status";
```

`useState` 목록에 추가 (기존 `const [confirming, ...` 아래):
```typescript
const [shareOnSave, setShareOnSave] = useState(false);
```

- [ ] **Step 2: save 함수에 공유 로직 추가**

기존 `save` 함수의 `onSaved()` 호출 직전에 삽입:

```typescript
async function save() {
  setSaving(true);
  setError(null);
  try {
    await apiPatch(`/api/watch/${entry.anime.id}`, {
      status,
      score,
      comment: comment.trim() || null,
    });
    if (shareOnSave) {
      const title = displayTitle(entry.anime);
      const label = STATUS_LABEL[status];
      openTwitterIntent(buildSeriesTweetText(title, label, score, comment));
    }
    onSaved();
  } catch (e) {
    setError(String(e));
  } finally {
    setSaving(false);
  }
}
```

- [ ] **Step 3: 체크박스 UI 추가**

`canReview` 블록 내부(`{!canReview && ...}` 메시지 바로 아래)에 삽입:
```tsx
{canReview && (
  <label className="flex items-center gap-2 text-sm text-neutral-600">
    <input
      type="checkbox"
      checked={shareOnSave}
      onChange={(e) => setShareOnSave(e.target.checked)}
      className="h-4 w-4 rounded border-neutral-300"
    />
    트위터에 공유하기
  </label>
)}
```

삽입 위치는 `{!canReview && (...)}` 블록 바로 아래, `</div>` 닫히기 전:
```tsx
<div className={canReview ? "" : "pointer-events-none opacity-50"}>
  {/* ... 별점, 감상평 textarea ... */}
  {!canReview && (
    <p className="...">별점과 감상평을 남기려면 ...</p>
  )}
  {canReview && (
    <label className="flex items-center gap-2 text-sm text-neutral-600">
      <input
        type="checkbox"
        checked={shareOnSave}
        onChange={(e) => setShareOnSave(e.target.checked)}
        className="h-4 w-4 rounded border-neutral-300"
      />
      트위터에 공유하기
    </label>
  )}
</div>
```

- [ ] **Step 4: 빌드 확인**

```bash
cd /Users/yubeen/animesquad/frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/app/components/SeriesReviewModal.tsx
git commit -m "feat(series-review): add twitter share checkbox"
```

---

### Task 4: 최종 빌드 검증

- [ ] **Step 1: 전체 빌드**

```bash
cd /Users/yubeen/animesquad/frontend && npm run build 2>&1 | tail -20
```

Expected: `✓ Compiled successfully` 또는 `Route (app) Size` 테이블 출력

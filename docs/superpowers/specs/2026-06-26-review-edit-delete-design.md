# 감상평 수정·삭제 설계

날짜: 2026-06-26

## 목표
애니 상세 페이지에서 본인이 작성한 감상평(시리즈 + 에피소드)을 수정·삭제할 수 있게 한다.

## 대상 & 동작
- **시리즈 감상평** (WatchEntry의 score+comment)
  - 수정: 기존 `SeriesReviewModal` 재사용 (PATCH, 이미 동작)
  - 삭제: score+comment만 비움, status/progress 유지 → `DELETE /api/watch/{animeId}/review`
- **에피소드 감상평** (EpisodeRating)
  - 수정: 인라인 편집(StarsInput + 코멘트) → 기존 `PUT .../episodes/{ep}` (upsert)
  - 삭제: 해당 화 기록 제거(progress는 유지) → `DELETE /api/watch/{animeId}/episodes/{ep}`

## 위치 & 권한
- 상세 페이지 감상평 목록에서 **본인 카드**(actor.id === meId)에만 수정/삭제 노출
- 모든 작업은 본인 것만 (백엔드 userId 스코프 검증)
- 삭제는 확인 다이얼로그(`ConfirmDialog`) 거침
- 피드(Activity)는 과거 스냅샷이라 영향 없음

## 백엔드
- `WatchEntry.clearReview()` — score=null, comment=null, updatedAt 갱신
- `WatchService.clearReview(userId, animeId)` — 엔트리 없으면 404
- `WatchController` — `DELETE /api/watch/{animeId}/review` → 204
- `EpisodeRatingService.deleteRating(userId, animeId, ep)` — 본인 평점 없으면 404, 있으면 삭제
- `EpisodeRatingController` — `DELETE /api/watch/{animeId}/episodes/{ep}` → 204

## 프론트엔드
- `api.ts`: `apiDelete(path)` 헬퍼
- `components/ConfirmDialog.tsx`: 범용 확인 모달(메시지/확인 라벨)
- `anime/[id]/page.tsx`: `ReviewsSection`에 `animeId`/`mine`/`onChanged` 전달
  - `ReviewList`(시리즈): 본인 카드에 수정(SeriesReviewModal)·삭제(DELETE review)
  - `EpisodeReviewSection`(에피소드): 본인 카드에 수정(인라인 StarsInput+코멘트, PUT)·삭제(DELETE episode)

## 테스트
- `WatchControllerIT`: 리뷰 작성 후 DELETE review → score/comment null, status/progress 유지
- `EpisodeRatingControllerIT`: PUT 후 DELETE → 목록에서 사라짐; 없는 평점 DELETE → 404
- 프론트: `npm run build` 통과

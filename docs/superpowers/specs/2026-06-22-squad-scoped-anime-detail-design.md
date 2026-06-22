# 애니 상세 페이지 — 스쿼드별 평가 (1차)

작성일: 2026-06-22
브랜치: feat/home-dashboard

## 배경 / 목표

애니마다 별점·감상평·회차별 별점·회차별 감상평이 존재한다. 이를 **내가 속한
스쿼드의 멤버 평가만** 모아서 볼 수 있는 애니 상세 페이지를 만든다.

**핵심 결정 (브레인스토밍 합의):**

- 평가 데이터는 **스쿼드별로 분리하지 않는다.** 한 사용자의 한 애니에 대한 평가는
  하나뿐(기존 `WatchEntry` / `EpisodeRating` 모델 그대로). 스쿼드는 **표현·가시성**
  단위일 뿐 — 데이터 모델 변경 없음.
- 멀티 스쿼드 표현 방식: **(나) 스쿼드별 섹션으로 구분.** (나중에 합치기/선택 방식으로
  바꿔도 같은 데이터 재사용 가능.)
- 상세 페이지 성격: **읽기 + 내 평가 편집.**
- 1차 범위: **시리즈 단위(별점·감상평·상태·진도)만.** 회차별 평가는 다음 단계.

## 범위

### 포함 (1차)
- 새 페이지 `/anime/[id]` — 애니 메타 + 내 평가 편집 + 스쿼드별 멤버 평가.
- 시리즈 단위 데이터만.
- 진입점 4곳 연결.

### 제외 (다음 단계)
- 회차별 별점·감상평 UI 및 그룹핑.

## 백엔드

### (a) `GET /api/anime/{id}`
상세 헤더용 애니 메타. `AnimeRepository`에서 조회해 기존 `AnimeResponse` 반환.
존재하지 않으면 404. 검색은 로컬 DB(`searchByTitle`)에서 읽으므로 모든 진입점의
애니는 로컬 id가 존재한다.

### (b) `GET /api/watch/{animeId}`
내 평가 1건 반환(없으면 null / 204). 상세 페이지의 "내 평가" 패널 초기값.
`WatchEntryRepository.findByUserIdAndAnimeId` 재사용.

### (c) `GET /api/anime/{animeId}/squad-watch`
스쿼드별 그룹으로 멤버 평가 반환.

응답:
```json
[
  {
    "squad": { "id": 1, "name": "A 스쿼드" },
    "members": [
      { "actor": {"id":2,"displayName":"…","avatarUrl":null},
        "status":"WATCHING", "progress":5, "score":4,
        "comment":"…", "updatedAt":"…" }
    ]
  }
]
```

로직:
1. 내 소속 스쿼드: `MembershipRepository.findAllByUserId(me)`.
2. 각 스쿼드 멤버: `findAllBySquadId(squadId)`.
3. 해당 애니의 멤버 `WatchEntry` 수집:
   새 메서드 `findAllByAnimeIdAndUserIdIn(animeId, userIds)`.
4. 스쿼드별로 묶어 반환.

규칙:
- **나 자신은 그룹에서 제외** (내 패널이 상단에 별도 존재 → 중복 방지).
- **평가가 하나도 없는 스쿼드 섹션은 생략.**
- 한 사용자가 내 여러 스쿼드에 겹치면 각 스쿼드 섹션에 각각 표시((나)의 자연스러운 결과).

### 내 평가 편집 (기존 재사용)
- 목록에 있으면 `PATCH /api/watch/{animeId}`.
- 아직 없으면 `POST /api/watch`로 추가 후 편집.

## 프론트엔드

### 새 페이지 `frontend/src/app/anime/[id]/page.tsx` (클라이언트)
레이아웃:
```
[← 뒤로]
표지 | 제목(한/로마지) · 포맷 · N화
─────────────────────────────
내 평가  [상태▾] [−진도+] [★편집] [한줄평] [저장]
         (목록에 없으면 "내 목록에 추가")
─────────────────────────────
스쿼드별 평가
  ┌ A 스쿼드
  │  (아바타) 이름 · 보는중 5/12화 · ★4 · "감상평…"
  │  (아바타) 이름 · 완료 · ★3 · "…"
  └ B 스쿼드
     (아바타) 이름 · ★5 · "…"
(회차별 평가 — 다음 단계)
```

데이터 페치: `GET /api/anime/{id}`, `GET /api/watch/{id}`, `GET /api/anime/{id}/squad-watch`.

### 진입점 (표지/제목 → `/anime/{id}` 링크)
- 검색 결과 카드 (`search/page.tsx`)
- 내 목록 row (`watchlist/page.tsx`)
- 스쿼드 최근 감상 카드 (`squads/[id]/page.tsx`, 현재 `/watchlist` → 변경)
- 홈 대시보드 카드 (`page.tsx`, 현재 `/watchlist` → 변경)

### api.ts
위 3개 GET 헬퍼/타입 추가. `apiPost`/`apiPatch`는 기존 재사용.

## 테스트
- 백엔드 IT (`AbstractIntegrationTest` 패턴):
  - `GET /api/anime/{id}` 200 / 404.
  - `squad-watch`: 그룹핑, 나 제외, 비공유 멤버 제외, 빈 스쿼드 섹션 생략.
- 프론트: 빌드 통과.

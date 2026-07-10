# 검색용 별칭 (search_keywords) 설계

날짜: 2026-07-10

## 문제

애니 제목은 한국 정식 수입명 기준으로 `title_korean`에 저장한다. 그런데 정식 수입명이 영문 그대로인 작품(예: BanG Dream!)은 통용 명칭("뱅드림")으로 검색하면 아무것도 나오지 않는다. 축약어(예: "이 멋진 세계에 축복을!" → "코노스바")도 마찬가지다.

`title_korean`에 통칭을 넣는 방식은 배제한다. `title_korean`은 프론트 전반에서 표시용 제목(`titleKorean ?? titleRomaji`)으로 쓰이므로, 통칭을 넣으면 정식 수입명 표기 원칙이 깨지고 별칭을 하나만 담을 수 있다.

## 해결

`anime` 테이블에 검색 전용 텍스트 컬럼 `search_keywords`를 추가한다. 쉼표 구분 문자열(예: `뱅드림, 방드림`)로 어드민이 수동 입력하며, 화면에는 표시하지 않고 검색 매칭에만 쓴다.

별칭 전용 테이블(`anime_alias`) 정규화 방안은 현재 규모(LIKE 검색, 어드민 수동 입력)에서 과한 구조라 배제했다.

## 변경 사항

### DB

- `V14__anime_search_keywords.sql`: `ALTER TABLE anime ADD COLUMN search_keywords TEXT;` (nullable)

### 백엔드

- `Anime` 엔티티: `searchKeywords` 필드 + getter/setter (`titleKorean`과 같은 패턴)
- `AnimeRepository.searchByTitle`: OR 조건 2개 추가
  - `LOWER(COALESCE(a.search_keywords, '')) LIKE :q`
  - `REPLACE(LOWER(COALESCE(a.search_keywords, '')), ' ', '') LIKE :qs`
- 어드민 PATCH `/api/admin/anime/{id}`: `searchKeywords` 필드 수신·저장 추가
- `AnimeResponse` DTO: `searchKeywords` 포함 (어드민 화면에서 현재 값 표시용)

### 프론트엔드

- `admin/anime/page.tsx`: 각 행의 title_korean 입력란 옆에 검색 키워드 입력란 추가 (기존 편집 패턴 그대로)
- `api.ts`: 애니 타입에 `searchKeywords: string | null` 추가
- 일반 사용자 화면 변경 없음 — 검색 결과에만 반영

## 테스트 (TDD)

1. 별칭("뱅드림")으로 검색 시 해당 애니가 결과에 포함된다 — `AnimeControllerIT`
2. 공백 섞인 별칭("뱅 드림") 검색도 매칭된다 — `AnimeControllerIT`
3. PATCH로 `searchKeywords` 수정이 반영된다 — `AdminAnimeControllerIT`

## 범위 제외

- 별칭 자동 수집·크롤링
- 초성 검색, 오타 보정 등 퍼지 매칭
- 일반 사용자 화면 노출

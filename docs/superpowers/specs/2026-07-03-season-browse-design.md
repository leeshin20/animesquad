# 시즌 탐색 + NavBar 검색 Design Spec

## Goal

탐색 페이지를 연도/분기 필터 기반 시즌 브라우즈 페이지로 교체하고, 기존 텍스트 검색은 NavBar 검색창으로 이동한다.

## Architecture

백엔드에 `season` 컬럼을 추가하고 `/api/anime/browse` 엔드포인트를 신규 추가한다. 프론트엔드는 NavBar에 인라인 검색창을, `/browse`에 시즌 필터 + 카드 그리드를 구현한다. 기존 `/search` 페이지는 URL 파라미터(`?q=`) 지원만 추가하고 UI는 그대로 유지한다.

## Tech Stack

Spring Boot (JPA, Flyway), Next.js 14, Tailwind CSS

---

## 1. 백엔드

### 1.1 DB 마이그레이션 (V10)

`anime` 테이블에 `season VARCHAR(10) NULL` 컬럼 추가.

기존 캐시된 행은 NULL이 되며, 이후 `bulkCacheSeason` 호출 시 season이 채워진다. NULL인 행은 `/api/anime/browse`에 노출되지 않는다.

```sql
ALTER TABLE anime ADD COLUMN season VARCHAR(10);
```

### 1.2 AniListMedia 레코드

`season` 필드 추가:

```java
public record AniListMedia(
    Integer anilistId,
    String titleRomaji,
    String titleNative,
    String titleEnglish,
    String coverImageUrl,
    Integer episodes,
    String status,
    String format,
    Integer seasonYear,
    String season       // NEW: "WINTER" | "SPRING" | "SUMMER" | "FALL" | null
) {}
```

### 1.3 AniListClientImpl

GraphQL 쿼리가 현재 `seasonYear`만 반환 필드에 포함하고 있음. `season`도 추가 필요.

`fetchSeason` 쿼리 반환 필드에 `season` 추가:
```graphql
seasonYear
season       # 추가
```

응답 매핑 코드에도 season 파싱 추가:
```java
(String) m.get("season")   // "WINTER" | "SPRING" | "SUMMER" | "FALL" | null
```

`fetchById`는 개별 작품 조회이므로 `season`이 없을 수 있다 → null 허용.

### 1.4 Anime 엔티티

```java
@Column(length = 10)
private String season;

public String getSeason() { return season; }
```

`refreshFrom()` 및 생성자에 `season` 파라미터 추가.

### 1.5 AnimeService

`upsertFromAniList(AniListMedia m)` 에서 season을 저장하도록 수정.

`bulkCacheSeason(int year, String season)` 은 이미 season을 알고 있으므로 `AniListMedia`에 season이 담기면 자동으로 저장된다.

### 1.6 AnimeRepository

```java
List<Anime> findBySeasonYearAndSeasonOrderByTitleRomajiAsc(Integer year, String season);
```

### 1.7 AnimeController

```
GET /api/anime/browse?year=2024&season=WINTER
```

- `year`, `season` 파라미터 필수
- season 값은 `WINTER | SPRING | SUMMER | FALL` 중 하나 (그 외는 400)
- `AnimeResponse` 리스트 반환 (기존 DTO 재사용)
- 인증 불필요 (공개 엔드포인트, SecurityConfig에 허용 추가)

---

## 2. 프론트엔드

### 2.1 NavBar 검색창

**상태:** `searchOpen: boolean`, `searchQuery: string`, `searchResults: AnimeView[]`

**동작:**
1. 🔍 버튼 클릭 → `searchOpen = true`, 입력창 포커스
2. 입력 중 300ms debounce → `/api/anime/search?q=...` 호출 → 드롭다운 표시 (최대 5건)
3. 드롭다운 항목 클릭 → `/anime/[id]` 이동, 검색창 닫힘
4. Enter 입력 → `/search?q=...` 페이지로 이동, 검색창 닫힘
5. Escape 또는 바깥 클릭 → 검색창 닫힘, 결과 초기화

**UI 구조 (데스크탑):**
- NavBar 내부에서 검색 아이콘 → 검색창 인라인 펼쳐짐 (로고 오른쪽)
- 검색창 아래 드롭다운 (absolute positioned): 커버 이미지 + 제목 + 연도

**UI 구조 (모바일):**
- 드로어 내부 상단에 검색 입력창 고정 배치
- 드롭다운은 드로어 내부에서 표시

**파일:** `frontend/src/app/components/NavBar.tsx` 수정

### 2.2 `/browse` 페이지 (신규)

**파일:** `frontend/src/app/browse/page.tsx`

**현재 시즌 계산 (클라이언트):**
```ts
function getCurrentSeason(): { year: number; season: string } {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  const year = now.getFullYear();
  const season =
    month <= 3 ? "WINTER" :
    month <= 6 ? "SPRING" :
    month <= 9 ? "SUMMER" : "FALL";
  return { year, season };
}
```

**연도 범위:** 현재 연도 기준 -5년 ~ +1년 (총 7개)

**분기 태그:** `겨울 (WINTER)`, `봄 (SPRING)`, `여름 (SUMMER)`, `가을 (FALL)`

**상태:** `selectedYear`, `selectedSeason`, `results: AnimeView[] | null`, `loading`

**레이아웃:**
```
[연도 태그: 2021 2022 2023 2024 2025 2026]
[분기 태그: 겨울  봄  여름  가을]

[카드 그리드: 3열(모바일2) × n행]
```

각 카드: 커버 이미지(aspect-[2/3]) + 제목 + 포맷·화수 → `/anime/[id]` 링크

빈 결과: "이 시즌 캐시된 작품이 없어요" (dashed border 스타일, 기존 패턴 동일)

### 2.3 `/search` 페이지 수정

URL `?q=` 파라미터를 읽어 초기 검색어로 설정, 입력 변경 시 URL도 `replaceState`로 업데이트.

```ts
// 초기화
const params = new URLSearchParams(window.location.search);
const [q, setQ] = useState(params.get("q") ?? "");

// q 변경 시
window.history.replaceState(null, "", q ? `/search?q=${encodeURIComponent(q)}` : "/search");
```

### 2.4 NavBar 링크 변경

`baseLinks`에서 `{ href: "/search", label: "탐색" }` → `{ href: "/browse", label: "탐색" }` 으로 변경.

`/search`는 NavBar에서 제거 (검색창으로 접근).

---

## 3. 변경 파일 목록

| 파일 | 변경 |
|------|------|
| `backend/.../db/migration/V10__anime_season.sql` | 신규 |
| `backend/.../anime/AniListMedia.java` | season 필드 추가 |
| `backend/.../anime/AniListClientImpl.java` | season 응답 매핑 추가 |
| `backend/.../anime/Anime.java` | season 필드 추가 |
| `backend/.../anime/AnimeService.java` | upsertFromAniList season 저장 |
| `backend/.../anime/AnimeRepository.java` | findBySeasonYearAndSeason 추가 |
| `backend/.../anime/AnimeController.java` | /browse 엔드포인트 추가 |
| `backend/.../auth/SecurityConfig.java` | 변경 불필요 (anyRequest().permitAll() 이미 적용) |
| `frontend/src/app/components/NavBar.tsx` | 인라인 검색창 + 드롭다운 추가, 탐색 링크 변경 |
| `frontend/src/app/browse/page.tsx` | 신규 |
| `frontend/src/app/search/page.tsx` | URL 파라미터 지원 추가 |

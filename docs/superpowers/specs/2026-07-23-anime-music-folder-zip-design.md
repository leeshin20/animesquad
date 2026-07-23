# 애니 음원 폴더 ZIP 생성 Design Spec

## Goal

AnimeSquad 관리자가 연도와 분기를 선택해, 해당 시즌 애니의 음원 관리용 빈 폴더 구조를 ZIP 파일로 내려받을 수 있게 한다.

생성 결과는 다음 구조를 따른다.

```text
2026년/
└── 2026년 2분기/
    ├── 검은 고양이와 마녀의 교실 (Kuroneko to Majo no Kyoushitsu)/
    └── 고깔모자 아틀리에 (Tongari Boushi no Atelier)/
```

## Scope

- 관리자 애니 화면의 기존 연도·시즌 선택값을 재사용한다.
- 선택한 시즌에 속하며 `title_korean`이 등록된 모든 애니를 포함한다.
- 작품 포맷이나 방영 상태로 추가 필터링하지 않는다.
- 한글 제목이 없는 작품은 ZIP에서 제외한다.
- 서버가 빈 디렉터리 엔트리를 포함한 ZIP을 요청 시 생성한다.
- 별도 macOS 앱이나 실행 스크립트는 만들지 않는다.
- 생성된 ZIP을 서버 파일 시스템이나 DB에 저장하지 않는다.

## Season Mapping

AniList 시즌을 사용자의 분기 폴더명으로 다음과 같이 변환한다.

| AnimeSquad season | 폴더명 |
|---|---|
| `WINTER` | `1분기` |
| `SPRING` | `2분기` |
| `SUMMER` | `3분기` |
| `FALL` | `4분기` |

## Architecture

기존 관리자 API에 ZIP 다운로드 엔드포인트를 추가한다. 전용 `AnimeFolderArchiveService`가 기존 `AnimeRepository`에서 선택한 시즌의 작품을 조회하고, Java 표준 라이브러리의 `ZipOutputStream`으로 메모리 내 ZIP을 생성한다. 폴더명 정규화와 ZIP 생성 규칙을 컨트롤러에서 분리해 독립적으로 테스트한다.

프론트엔드는 기존 `/admin/anime` 화면의 시즌 캐시 영역에 `음원 폴더 ZIP 다운로드` 버튼을 추가한다. 별도 화면이나 상태 저장은 도입하지 않는다.

## Backend

### Endpoint

```http
GET /api/admin/anime/folder-archive?year=2026&season=SPRING
```

- 관리자 인증을 요구한다.
- `year`는 `1960..2100` 범위만 허용한다.
- `season`은 `WINTER`, `SPRING`, `SUMMER`, `FALL`만 허용한다.
- 응답 Content-Type은 `application/zip`이다.
- 다운로드 파일명은 `2026년-2분기-애니-음원-폴더.zip` 형식이다.
- ZIP 최상위에는 `2026년/2026년 2분기/`가 들어간다.

### Anime Selection

저장소에 다음 조회를 추가한다.

```java
List<Anime> findBySeasonYearAndSeasonAndTitleKoreanIsNotNullOrderByTitleKoreanAscIdAsc(
    Integer seasonYear,
    String season
);
```

공백뿐인 한글 제목은 서비스에서 한 번 더 제외한다. 각 작품 폴더명은 다음 형식이다.

```text
<trimmed titleKorean> (<trimmed titleRomaji>)
```

### Safe Folder Names

각 제목 구성요소에 다음 규칙을 적용한다.

- 앞뒤 공백을 제거한다.
- `/`, `:`, NUL 문자를 `-`로 바꾼다.
- 연속된 공백은 한 칸으로 합친다.
- 결과 끝의 마침표와 공백을 제거한다.
- 전체 작품 폴더명은 Unicode 코드 포인트 기준 200자로 제한한다. 확장자가 없으므로 한글 제목을 우선 보존하고, 초과분은 로마자 제목 끝에서 줄인다.

정규화 후 같은 폴더명이 둘 이상이면 두 번째 작품부터 폴더명 끝에 ` [AniList-<id>]`를 붙인다. AniList ID가 없는 드문 로컬 작품은 AnimeSquad DB ID를 사용해 ` [AnimeSquad-<id>]`를 붙인다.

### ZIP Generation

- 루트 연도 폴더, 분기 폴더, 각 작품 폴더를 명시적인 빈 ZIP 디렉터리 엔트리로 기록한다.
- ZIP 엔트리 경로는 `/`를 구분자로 사용한다.
- UTF-8 파일명을 사용한다.
- `Content-Disposition`에는 ASCII fallback과 RFC 5987 방식의 UTF-8 파일명을 함께 제공한다.
- 작품 수가 수백 개 이하이고 엔트리가 모두 비어 있으므로 `ByteArrayOutputStream`에서 완성한 뒤 `byte[]` 응답으로 반환한다. 이 방식은 ZIP 작성 실패 시 정상적인 JSON 오류 응답을 보장하면서도 임시 파일을 만들지 않는다.

### Empty Result

조건에 맞는 작품이 없어도 정상적인 ZIP을 반환한다. 이 ZIP에는 연도 폴더와 분기 폴더만 들어간다. 프론트엔드는 다운로드 전에 별도 사전 조회를 하지 않는다.

### Errors

- 잘못된 연도 또는 시즌: `400 Bad Request`
- 비관리자: `403 Forbidden`
- ZIP 작성 중 I/O 실패: `500 Internal Server Error`와 기존 JSON 오류 형식을 반환하고 서버 로그에 오류를 남긴다.

## Frontend

기존 관리자 애니 페이지의 시즌 캐시 컨트롤 옆에 다운로드 버튼을 배치한다.

동작:

1. 기존 연도와 시즌 선택값을 사용한다.
2. 버튼을 누르면 기존 API base URL과 `credentials: "include"`를 사용해 ZIP을 요청한다.
3. 성공 응답을 `Blob`으로 변환하고 임시 object URL과 `<a download>`를 이용해 다운로드를 시작한다.
4. 완료 후 object URL을 해제한다.
5. 서버 오류는 기존 관리자 페이지의 오류 표시 패턴으로 보여준다.

다운로드는 파일 응답이므로 일반 JSON API helper에 ZIP 처리를 추가하지 않고 페이지 내부의 작은 다운로드 함수로 처리한다.

## Security

- 기존 `AdminAnimeController.requireAdmin` 검사를 재사용한다.
- 클라이언트가 폴더명이나 ZIP 엔트리 경로를 전달하지 못하게 한다.
- 서버 DB의 제목만 사용하고, 경로 구분자 제거 규칙으로 ZIP 경로 탈출을 방지한다.
- 서버 파일 시스템에는 쓰지 않는다.

## Testing

### Backend Service Tests

- 시즌과 분기에 맞는 루트 경로를 만든다.
- 한글 제목이 없는 작품과 공백 제목은 제외한다.
- 제목의 `/`, `:`, NUL 문자가 안전하게 치환된다.
- Unicode 문자를 깨뜨리지 않고 최대 길이를 제한한다.
- 같은 정규화 폴더명은 안정적인 정렬과 ID 접미사로 구분된다.
- 작품이 없어도 연도·분기 폴더만 포함한 유효한 ZIP을 만든다.

### Backend Integration Tests

- 관리자가 유효한 시즌을 요청하면 `200 application/zip`을 받는다.
- ZIP에 `2026년/2026년 2분기/`와 예상 작품 폴더가 들어간다.
- Content-Disposition에 예상 다운로드 파일명이 들어간다.
- 잘못된 연도와 시즌은 `400`이다.
- 일반 사용자는 `403`이다.

### Frontend Tests

- 선택한 연도와 시즌이 다운로드 URL에 반영된다.
- 버튼 라벨과 관리자 화면 내 위치가 유지된다.

## Success Criteria

- 관리자가 `/admin/anime`에서 연도와 분기를 선택하고 한 번의 클릭으로 ZIP을 받는다.
- ZIP을 macOS에서 풀면 `연도/연도 N분기/한글 제목 (로마자 제목)/` 구조가 만들어진다.
- 해당 시즌의 한글 제목 등록 작품이 모두 포함된다.
- 실행 파일 설치, 권한 부여, Gatekeeper 우회가 필요 없다.
- 기존 시즌 캐시와 애니 탐색 기능의 동작은 바뀌지 않는다.

## Expected Changes

| 파일 | 변경 |
|---|---|
| `backend/src/main/java/com/animesquad/anime/AnimeRepository.java` | 시즌·한글 제목 조건 조회 추가 |
| `backend/src/main/java/com/animesquad/admin/AnimeFolderArchiveService.java` | 폴더명 정규화 및 ZIP 생성 |
| `backend/src/main/java/com/animesquad/admin/AdminAnimeController.java` | 관리자 ZIP 다운로드 엔드포인트 추가 |
| `backend/src/test/java/com/animesquad/admin/AnimeFolderArchiveServiceTest.java` | 폴더명과 ZIP 생성 단위 테스트 |
| `backend/src/test/java/com/animesquad/admin/AdminAnimeControllerIT.java` | ZIP, 검증, 권한 통합 테스트 추가 |
| `frontend/src/app/admin/anime/page.tsx` | 다운로드 버튼과 오류 처리 추가 |
| 관련 프론트엔드 테스트 파일 | 다운로드 URL 동작 검증 |

# 수동 추가 작품 검색 식별자 수정 설계

## 문제

검색 화면은 감상 기록, React 목록 key, 작품 추가 요청을 AniList ID로 연결한다. AniList에 없는 수동 작품은 `anilist_id`가 `NULL`이므로 여러 작품이 브라우저에서 같은 `null` key로 충돌해 다른 작품의 상태와 모달이 표시된다.

## 설계

- 검색 결과와 내 감상 기록은 모든 작품에 존재하는 내부 `anime.id`로 연결한다.
- React 목록 key도 내부 `anime.id`를 사용한다.
- 검색 결과에서 작품을 추가할 때 `{ animeId, status }`를 전송해 AniList 조회를 거치지 않는다.
- 백엔드와 DB 스키마는 변경하지 않는다.
- AniList 작품과 수동 작품 모두 동일한 검색·추가·모달 흐름을 사용한다.

## 검증

- 검색 화면에 상태 매핑과 추가 요청을 위한 `anilistId` 참조가 남지 않았는지 확인한다.
- TypeScript 검사와 ESLint를 실행한다.
- 백엔드 계약 회귀를 확인하기 위해 관련 WatchController 통합 테스트를 실행한다.

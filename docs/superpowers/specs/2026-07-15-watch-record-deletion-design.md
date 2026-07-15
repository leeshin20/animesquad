# 감상 기록 삭제 설계

날짜: 2026-07-15

## 목표

스쿼드 피드는 읽기 전용으로 유지하면서, 로그인 사용자가 `내 목록 > 감상 기록`에서 자신의 시리즈 평가, 회차 평가, 단순 진도 활동을 삭제할 수 있게 한다. 모든 삭제는 확인 후 실행하며 서버의 원본 기록과 여러 스쿼드에 복제된 피드 활동을 일관되게 정리한다.

## 범위

삭제 대상은 다음 세 종류다.

- 시리즈 평가: `WatchEntry.score`와 `WatchEntry.comment`
- 회차 평가: 특정 `EpisodeRating`
- 단순 진도 활동: `ActivityType.PROGRESS_UPDATED`

수정 기능과 피드 안의 작업 버튼은 추가하지 않는다. 상태 변경, 스쿼드 가입 같은 시스템 활동도 삭제 대상에서 제외한다.

## 사용자 경험

`/watchlist/reviews`의 각 기록 행 우측에 삭제 버튼을 표시한다. 행 전체를 감싼 링크 구조는 제거하고, 작품 제목과 카드의 비작업 영역만 애니 상세 페이지로 이동하게 해 버튼 중첩을 피한다.

삭제 버튼을 누르면 `ConfirmDialog`로 종류별 메시지를 표시한다.

- 시리즈: `이 시리즈 감상평을 삭제할까요? 상태와 진도는 유지됩니다.`
- 회차: `N화 감상평을 삭제할까요? 현재 진도는 유지됩니다.`
- 단순 진도: `N화 기록을 삭제할까요? 현재 진도가 N-1화로 복구됩니다.`

성공하면 세 데이터 소스를 다시 조회해 목록과 필터 개수를 갱신한다. 실패하면 기록을 그대로 남기고 오류 메시지를 표시한다.

## 단순 진도 삭제 의미

단순 진도 `N화` 활동을 삭제하면 다음을 하나의 트랜잭션으로 처리한다.

1. 선택한 `N화` 활동의 모든 스쿼드 복제본을 삭제한다.
2. 해당 사용자의 `WatchEntry.progress`를 `max(0, N - 1)`로 설정한다.
3. `N-1화`에 대한 새 `PROGRESS_UPDATED` 활동은 발행하지 않는다.

따라서 잘못 기록한 7화를 삭제하면 실제 현재 진도는 6화로 복구되고, 다음 회차 기록 모달의 기본값은 다시 7화가 된다. 피드에는 새 6화 활동이 생기지 않는다.

과거 활동도 삭제할 수 있다. 삭제 대상이 현재 진도보다 오래된 활동이어도 실제 진도는 선택한 활동의 `N-1`로 설정한다. 이는 사용자가 승인한 명시적 삭제 동작이다.

## 백엔드 API

### 내 단순 진도 활동 조회

`GET /api/me/progress-activities?limit=500`

로그인 사용자의 `PROGRESS_UPDATED`만 최신순으로 반환한다.

응답 항목:

- `id`: 삭제 요청에 사용할 대표 Activity ID
- `anime`: 작품 참조 정보
- `progress`: 기록된 화수
- `createdAt`: 논리 활동 생성 시각

Activity는 가입한 스쿼드마다 한 행씩 fan-out되므로 조회 결과에서는 동일 논리 활동을 하나로 합친다. 기존 스키마에 공통 이벤트 키가 없으므로 `actorId + animeId + progress`가 같고 생성 시각 차이가 1초 이내인 행을 한 활동으로 간주한다. 대표 ID는 그룹에서 가장 작은 ID를 사용하고 생성 시각은 가장 최신 값을 사용한다.

조회량은 DB에서 최근 1,500행으로 제한한 뒤 최대 500개의 논리 활동으로 축약한다. 계정당 최대 세 스쿼드 제한을 고려하면 최대 500개 활동을 반환할 수 있다.

### 내 단순 진도 활동 삭제

`DELETE /api/me/progress-activities/{activityId}` → `204 No Content`

서버는 activityId로 대상 행을 조회하고 다음을 검증한다.

- 활동 종류가 `PROGRESS_UPDATED`인지
- `actorId`가 로그인 사용자 ID와 같은지
- 연결된 `WatchEntry`가 존재하는지

조건을 만족하지 않으면 정보 노출을 피하기 위해 `404`를 반환한다. 클라이언트가 보낸 사용자 ID나 진도 값은 신뢰하지 않고 Activity의 저장값을 사용한다.

삭제할 때 대표 행과 `actorId + animeId + progress`가 같고 생성 시각 차이가 1초 이내인 모든 행을 제거한다. 이로써 여러 스쿼드에 복제된 동일 활동이 함께 삭제된다.

## 서비스와 저장소

`MyProgressActivityService`를 추가해 조회·중복 축약·소유권 검증·삭제·진도 복구를 담당한다. 삭제 메서드는 `@Transactional`로 Activity 삭제와 WatchEntry 변경을 원자적으로 묶는다.

`ActivityRepository`에는 다음 조회를 추가한다.

- actor/type 기준 최신 활동 제한 조회
- 삭제 대상과 같은 actor/anime/type 후보 조회

DB 조회 성능을 위해 새 Flyway 마이그레이션에서 다음 인덱스를 추가한다.

`activity(actor_id, type, created_at DESC)`

## 기존 평가 삭제 재사용

시리즈와 회차 평가는 이미 존재하는 본인 범위 API를 재사용한다.

- 시리즈: `DELETE /api/watch/{animeId}/review`
- 회차: `DELETE /api/watch/{animeId}/episodes/{episodeNumber}`

시리즈 삭제는 상태와 진도를 유지한다. 회차 평가 삭제도 WatchEntry 진도를 변경하지 않는다. 기존 ActivityListener가 관련 `RATED` 또는 `EPISODE_RATED` 복제본을 모든 스쿼드에서 제거한다.

## 프런트엔드 데이터 모델

`api.ts`에 `MyProgressActivity` 타입을 추가한다. `mergeRecords`는 세 번째 입력으로 단순 진도 활동을 받고 모든 항목에 `kind`를 부여한다.

- `series`
- `episode`
- `progress`

시리즈 항목은 `score != null || comment != null`인 WatchEntry만 포함한다. 상태만 완료·보류·중단으로 바뀌었고 평가 내용이 없는 항목에는 무의미한 삭제 버튼을 만들지 않는다.

진도 항목은 `episodeNumber`에 기록 화수를 표시하고 `score`와 `comment`는 `null`로 둔다. 현재 WatchEntry의 상태를 anime ID로 조인해 기존 상태 필터가 그대로 동작하게 한다. 평점 필터에서는 진도 기록이 `미평가`로 집계된다.

## 테스트

백엔드 통합 테스트는 다음을 검증한다.

- 내 진도 활동만 조회되고 스쿼드 fan-out 복제본은 하나로 합쳐짐
- 타인의 activityId 삭제는 404이고 데이터가 바뀌지 않음
- 7화 삭제 시 모든 7화 복제본이 제거되고 WatchEntry 진도가 6이 됨
- 1화 삭제 시 진도가 0이 되고 대체 활동이 생기지 않음
- 과거 N화 활동 삭제도 실제 진도를 N-1로 설정함
- 삭제 실패 시 Activity와 WatchEntry가 함께 보존됨

프런트 단위 테스트는 `mergeRecords`가 진도 활동을 올바른 kind, 상태, 날짜로 병합하는지 검증한다. 최종적으로 백엔드 전체 테스트와 프런트 프로덕션 빌드를 실행한다.

## 제외 사항

- 피드 안의 수정·삭제 메뉴
- 기록 수정 기능
- 상태 변경 및 가입 활동 삭제
- 삭제한 진도 대신 N-1 활동을 새로 생성하는 동작
- 기존 Activity fan-out 구조 전면 개편

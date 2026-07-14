# 계정당 최대 3개 스쿼드 참여 제한 — 설계

## 배경

한 계정이 무제한으로 스쿼드를 만들거나 참여할 수 있는 현재 상태를 제한한다. 한 계정은 생성한 스쿼드와 초대코드로 참여한 스쿼드를 합쳐 최대 3개까지만 소속될 수 있다.

## 범위

- 스쿼드 생성(`SquadService.createSquad`)과 초대코드 참여(`SquadService.joinByInviteCode`) 시점에 제한 검증 추가
- 이미 4개 이상 스쿼드에 속한 기존 유저는 그대로 유지 — 강제 탈퇴/정리 없음. 새 가입/생성만 막힘(같은 체크 로직이 자연히 이 유저의 추가 시도도 막음)
- 프론트엔드에서 제한 도달 시 한글 에러 메시지 표시

## 백엔드

### 제한 검증 로직

`SquadService`에 다음을 추가:

```java
private static final int MAX_SQUADS_PER_USER = 3;

private void assertUnderSquadLimit(Long userId) {
    if (memberships.findAllByUserId(userId).size() >= MAX_SQUADS_PER_USER) {
        throw new ResponseStatusException(HttpStatus.CONFLICT, "스쿼드는 최대 3개까지만 참여할 수 있어요");
    }
}
```

- `MembershipRepository.findAllByUserId(Long userId)`는 이미 존재하므로 새 쿼리 불필요.
- `createSquad(Long ownerId, String name)` 맨 앞에서 `assertUnderSquadLimit(ownerId)` 호출.
- `joinByInviteCode(Long userId, String inviteCode)`에서, 초대코드 유효성 검증 이후 & 실제 멤버십 추가(`existsByUserIdAndSquadId` 체크로 이미 멤버인 경우는 idempotent하게 스킵되는 기존 로직) 이전에 `assertUnderSquadLimit(userId)` 호출. 단, **이미 해당 스쿼드의 멤버인 경우(재입장/멱등 호출)는 제한 검증을 건너뛴다** — 기존 멤버가 같은 초대코드를 다시 입력해도 실패하면 안 되므로, `existsByUserIdAndSquadId` 체크를 먼저 하고 신규 가입 케이스에서만 제한을 검증한다.

### 상태 코드 선택

- `ResponseStatusException(HttpStatus.CONFLICT, ...)` → 409. 기존 "초대코드를 찾을 수 없음"은 `IllegalArgumentException` → 400이므로, 프론트에서 두 에러를 상태 코드로 구분할 수 있다.
- `GlobalExceptionHandler`가 이미 `ResponseStatusException`을 처리하는 핸들러를 갖고 있어 추가 작업 불필요.

## 프론트엔드

### `frontend/src/app/squads/page.tsx`

- 생성(`onCreate`)과 참여(`onJoin`) 각각의 `catch (e) { setStatus(String(e)); }`를, `invite/page.tsx`의 기존 패턴을 참고해 상태 코드 → 한글 메시지 매핑을 거치도록 수정:

```ts
const ERROR_MESSAGES: Record<string, string> = {
  "Error: API 409": "스쿼드는 최대 3개까지만 참여할 수 있어요.",
};

function friendlyError(e: unknown): string {
  const raw = String(e);
  return ERROR_MESSAGES[raw] ?? raw;
}
```

- `catch (e) { setStatus(friendlyError(e)); }` 형태로 두 핸들러 모두 교체.
- 기존 "초대코드 없음"(400) 케이스는 지금처럼 raw 문자열(`"Error: API 400"`)로 남겨둔다 — 이번 작업 범위 밖이므로 손대지 않는다.

## 테스트

- 백엔드: `SquadServiceIT`에 추가 —
  - `createSquad_throws_whenUserAlreadyHas3Squads`
  - `joinByInviteCode_throws_whenUserAlreadyHas3Squads`
  - `joinByInviteCode_allowsRejoiningExistingSquad_evenAt3Squads` (멱등 재입장은 제한에 안 걸리는지)
- `SquadControllerIT`에 HTTP 레벨 검증 추가 — 409 상태 코드 확인.

## 테스트 안 하는 것

- 기존 4개 이상 소속 유저에 대한 "그대로 유지" 동작은 별도 마이그레이션이나 정리 로직이 없으므로 테스트할 대상 자체가 없음(단순히 아무 조치도 취하지 않는 것이 스펙).

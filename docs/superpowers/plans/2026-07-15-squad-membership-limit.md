# 계정당 최대 3개 스쿼드 참여 제한 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 한 계정은 생성 + 참여를 합쳐 최대 3개 스쿼드까지만 소속될 수 있도록 제한한다.

**Architecture:** `SquadService`에 멤버십 수를 확인하는 헬퍼 메서드를 추가하고, 스쿼드 생성/초대코드 참여 진입점에서 호출한다. 제한 도달 시 409 Conflict를 던져 기존 400(초대코드 오류)과 구분한다. 프론트엔드는 409를 한글 에러 메시지로 매핑해 보여준다.

**Tech Stack:** Spring Boot(Java 21, Gradle), Next.js 14 App Router(TypeScript), Testcontainers PostgreSQL 통합 테스트.

**Design doc:** `docs/superpowers/specs/2026-07-15-squad-membership-limit-design.md`

---

### Task 1: 백엔드 — 스쿼드 생성/참여에 3개 제한 적용

**Files:**
- Modify: `backend/src/main/java/com/animesquad/squad/SquadService.java`
- Test: `backend/src/test/java/com/animesquad/squad/SquadServiceIT.java`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/src/test/java/com/animesquad/squad/SquadServiceIT.java` 맨 아래(마지막 `}` 앞)에 추가:

```java
    @Test
    void createSquad_throws_whenUserAlreadyHas3Squads() {
        User owner = userService.upsertFromGoogle("g-limit-1", "limit1@x.y", "Limit1", null);
        squadService.createSquad(owner.getId(), "S1");
        squadService.createSquad(owner.getId(), "S2");
        squadService.createSquad(owner.getId(), "S3");

        assertThatThrownBy(() -> squadService.createSquad(owner.getId(), "S4"))
            .isInstanceOf(org.springframework.web.server.ResponseStatusException.class)
            .hasFieldOrPropertyWithValue("statusCode", org.springframework.http.HttpStatus.CONFLICT);
    }

    @Test
    void joinByInviteCode_throws_whenUserAlreadyHas3Squads() {
        User joiner = userService.upsertFromGoogle("g-limit-2", "limit2@x.y", "Limit2", null);
        squadService.createSquad(joiner.getId(), "S1");
        squadService.createSquad(joiner.getId(), "S2");
        squadService.createSquad(joiner.getId(), "S3");

        User owner4 = userService.upsertFromGoogle("g-limit-2-o", "limit2o@x.y", "Limit2Owner", null);
        Squad fourth = squadService.createSquad(owner4.getId(), "S4");

        assertThatThrownBy(() -> squadService.joinByInviteCode(joiner.getId(), fourth.getInviteCode()))
            .isInstanceOf(org.springframework.web.server.ResponseStatusException.class)
            .hasFieldOrPropertyWithValue("statusCode", org.springframework.http.HttpStatus.CONFLICT);
    }

    @Test
    void joinByInviteCode_allowsRejoiningExistingSquad_evenAt3Squads() {
        User owner = userService.upsertFromGoogle("g-limit-3-o", "limit3o@x.y", "Limit3Owner", null);
        Squad first = squadService.createSquad(owner.getId(), "S1");

        User member = userService.upsertFromGoogle("g-limit-3-m", "limit3m@x.y", "Limit3Member", null);
        squadService.joinByInviteCode(member.getId(), first.getInviteCode());
        squadService.createSquad(member.getId(), "S2");
        squadService.createSquad(member.getId(), "S3");

        Squad rejoined = squadService.joinByInviteCode(member.getId(), first.getInviteCode());

        assertThat(rejoined.getId()).isEqualTo(first.getId());
    }
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

Run: `cd backend && ./gradlew test --tests "com.animesquad.squad.SquadServiceIT"`
Expected: `createSquad_throws_whenUserAlreadyHas3Squads`와 `joinByInviteCode_throws_whenUserAlreadyHas3Squads`가 FAIL (제한이 아직 없어서 예외가 발생하지 않음). `joinByInviteCode_allowsRejoiningExistingSquad_evenAt3Squads`는 이미 PASS할 수 있음(기존 멱등 로직 덕분) — 그래도 함께 실행해서 확인.

- [ ] **Step 3: `SquadService`에 제한 검증 추가**

`backend/src/main/java/com/animesquad/squad/SquadService.java`에서, 클래스 필드 선언부(`private final SquadRepository squads;` 등) 바로 위에 상수 추가:

```java
    private static final int MAX_SQUADS_PER_USER = 3;

```

`createSquad` 메서드를 다음으로 교체:

```java
    @Transactional
    public Squad createSquad(Long ownerId, String name) {
        assertUnderSquadLimit(ownerId);
        Squad squad = squads.save(new Squad(name, ownerId, generateUniqueCode()));
        memberships.save(new Membership(ownerId, squad.getId(), MembershipRole.OWNER));
        return squad;
    }
```

`joinByInviteCode` 메서드를 다음으로 교체:

```java
    @Transactional
    public Squad joinByInviteCode(Long userId, String inviteCode) {
        Squad squad = squads.findByInviteCode(inviteCode)
            .orElseThrow(() -> new IllegalArgumentException("invite code not found"));
        if (!memberships.existsByUserIdAndSquadId(userId, squad.getId())) {
            assertUnderSquadLimit(userId);
            memberships.save(new Membership(userId, squad.getId(), MembershipRole.MEMBER));
            events.publishEvent(new SquadJoinedEvent(userId, squad.getId()));
        }
        return squad;
    }
```

`toResponse` 메서드 위(또는 `getOwnerSquad` private 메서드 근처)에 새 private 메서드 추가:

```java
    private void assertUnderSquadLimit(Long userId) {
        if (memberships.findAllByUserId(userId).size() >= MAX_SQUADS_PER_USER) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "스쿼드는 최대 3개까지만 참여할 수 있어요");
        }
    }
```

`HttpStatus`와 `ResponseStatusException`은 이미 이 파일에 import되어 있으므로 추가 import 불필요.

- [ ] **Step 4: 테스트 실행하여 통과 확인**

Run: `cd backend && ./gradlew test --tests "com.animesquad.squad.SquadServiceIT"`
Expected: BUILD SUCCESSFUL, 세 테스트 모두 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/animesquad/squad/SquadService.java \
        backend/src/test/java/com/animesquad/squad/SquadServiceIT.java
git commit -m "feat(squad): 계정당 최대 3개 스쿼드 참여 제한 추가"
```

---

### Task 2: 백엔드 — 컨트롤러 레벨 409 검증 테스트

**Files:**
- Test: `backend/src/test/java/com/animesquad/squad/SquadControllerIT.java`

Task 1에서 서비스 레벨 제한을 이미 구현했으므로, 이 태스크는 HTTP 레이어에서 실제로 409가 내려오는지 확인하는 테스트만 추가한다(프로덕션 코드 변경 없음 — `GlobalExceptionHandler`가 이미 `ResponseStatusException`을 처리하므로 컨트롤러 코드는 수정할 필요가 없다).

- [ ] **Step 1: 실패하는(아직 없는 동작을 확인하는) 테스트 작성**

`backend/src/test/java/com/animesquad/squad/SquadControllerIT.java`의 `private Integer createSquad(Long ownerId)` 헬퍼 메서드 바로 앞에 추가:

```java
    @Test
    void create_returns409_whenUserAlreadyHas3Squads() {
        User owner = userService.upsertFromGoogle("g-ctrl-limit", "ctrllimit@x.y", "CtrlLimit", null);
        createSquad(owner.getId());
        createSquad(owner.getId());
        createSquad(owner.getId());

        ResponseEntity<String> res = rest.exchange(
            url("/api/squad"), HttpMethod.POST,
            new HttpEntity<>(Map.of("name", "S4"), cookieFor(owner.getId())),
            String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    void join_returns409_whenUserAlreadyHas3Squads() {
        User joiner = userService.upsertFromGoogle("g-ctrl-limit-j", "ctrllimitj@x.y", "CtrlLimitJ", null);
        createSquad(joiner.getId());
        createSquad(joiner.getId());
        createSquad(joiner.getId());

        User owner4 = userService.upsertFromGoogle("g-ctrl-limit-o", "ctrllimito@x.y", "CtrlLimitO", null);
        Integer fourthId = createSquad(owner4.getId());
        String code = inviteCodeOf(fourthId, owner4.getId());

        ResponseEntity<String> res = rest.exchange(
            url("/api/squad/join"), HttpMethod.POST,
            new HttpEntity<>(Map.of("inviteCode", code), cookieFor(joiner.getId())),
            String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    }
```

- [ ] **Step 2: 테스트 실행하여 통과 확인**

Run: `cd backend && ./gradlew test --tests "com.animesquad.squad.SquadControllerIT"`
Expected: BUILD SUCCESSFUL, 두 테스트 모두 PASS (Task 1의 서비스 로직 덕분에 이미 통과해야 함 — 실패한다면 Task 1 구현을 재확인)

- [ ] **Step 3: Commit**

```bash
git add backend/src/test/java/com/animesquad/squad/SquadControllerIT.java
git commit -m "test(squad): 스쿼드 3개 제한 HTTP 409 응답 검증 테스트 추가"
```

---

### Task 3: 프론트엔드 — 409 에러 한글 메시지 표시

**Files:**
- Modify: `frontend/src/app/squads/page.tsx`

- [ ] **Step 1: 에러 메시지 매핑 추가**

`frontend/src/app/squads/page.tsx`의 `import` 구문 바로 아래(컴포넌트 함수 선언 이전)에 추가:

```tsx
const ERROR_MESSAGES: Record<string, string> = {
  "Error: API 409": "스쿼드는 최대 3개까지만 참여할 수 있어요.",
};

function friendlyError(e: unknown): string {
  const raw = String(e);
  return ERROR_MESSAGES[raw] ?? raw;
}
```

- [ ] **Step 2: `onCreate`와 `onJoin`의 catch 블록 수정**

기존:

```tsx
    } catch (e) { setStatus(String(e)); }
```

이 두 곳(각각 `onCreate`, `onJoin` 함수 안)을 아래로 교체:

```tsx
    } catch (e) { setStatus(friendlyError(e)); }
```

`refresh()` 함수 안의 `catch (e) { setStatus(String(e)); }`는 이번 작업과 무관하므로 그대로 둔다(목록 조회 실패는 3개 제한과 관련 없음).

- [ ] **Step 3: 타입체크 및 린트 확인**

Run: `cd frontend && npx tsc --noEmit`
Expected: 에러 없음

Run: `cd frontend && npx eslint src/app/squads/page.tsx`
Expected: 에러 없음

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/squads/page.tsx
git commit -m "feat(squad): 스쿼드 3개 제한 도달 시 한글 에러 메시지 표시"
```

---

### Task 4: 전체 백엔드 테스트 스위트 실행 (회귀 확인)

**Files:** 없음 (검증 전용)

- [ ] **Step 1: 백엔드 전체 테스트 실행**

Run: `cd backend && ./gradlew test`
Expected: BUILD SUCCESSFUL — `createSquad`/`joinByInviteCode`를 호출하는 다른 기존 테스트(`SquadControllerIT`의 announcement/avatar/banner 관련 테스트 등)가 한 유저당 스쿼드를 3개 넘게 만들지 않는지 확인. 만약 실패하는 기존 테스트가 있다면, 해당 테스트가 같은 유저로 4개 이상 스쿼드를 생성하고 있다는 뜻이므로 Step 2로 진행.

- [ ] **Step 2: 실패하는 기존 테스트가 있으면 수정**

실패한 테스트를 열어 같은 `ownerId`/`userId`로 `createSquad` 또는 `joinByInviteCode`를 4번 이상 호출하는 부분이 있는지 확인하고, 있다면 서로 다른 유저를 사용하도록 테스트 데이터를 조정한다(예: 새 `userService.upsertFromGoogle(...)` 호출 추가). 프로덕션 코드는 건드리지 않는다 — 제한 로직 자체가 스펙이므로, 위반하는 쪽은 테스트 데이터다.

Run: `cd backend && ./gradlew test`
Expected: BUILD SUCCESSFUL

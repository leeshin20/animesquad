# Plan 2 — Squads (CRUD + membership + invite codes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Authenticated users can create squads, get an invite code, join existing squads with a code, and list/inspect squads they belong to. Builds on Plan 1's auth + JWT cookie.

**Architecture:** Two tables (`squad`, `membership`) with `UNIQUE(user_id, squad_id)` keeping membership idempotent. Invite codes are short opaque strings generated server-side. Authorization is enforced inside the service (membership lookup) — `GET /api/squads/{id}` for non-members returns 404 instead of 403 so we don't leak existence. Frontend gets a single `/squads` page with list + create + join forms.

**Tech Stack:** Spring Boot 3.3.5, Spring Data JPA, Flyway, Postgres 16, JUnit 5, Testcontainers, Next.js 14 (App Router).

---

## File Structure

**Backend — created**
- `backend/src/main/resources/db/migration/V2__squads.sql`
- `backend/src/main/java/com/animesquad/squad/Squad.java`
- `backend/src/main/java/com/animesquad/squad/Membership.java`
- `backend/src/main/java/com/animesquad/squad/MembershipRole.java`
- `backend/src/main/java/com/animesquad/squad/SquadRepository.java`
- `backend/src/main/java/com/animesquad/squad/MembershipRepository.java`
- `backend/src/main/java/com/animesquad/squad/InviteCodeGenerator.java`
- `backend/src/main/java/com/animesquad/squad/SquadService.java`
- `backend/src/main/java/com/animesquad/squad/SquadController.java`
- `backend/src/main/java/com/animesquad/squad/dto/CreateSquadRequest.java`
- `backend/src/main/java/com/animesquad/squad/dto/JoinSquadRequest.java`
- `backend/src/main/java/com/animesquad/squad/dto/SquadResponse.java`

**Backend — modified**
- `backend/src/main/java/com/animesquad/auth/SecurityConfig.java` — require auth for `/api/squads/**`

**Backend — tests**
- `backend/src/test/java/com/animesquad/squad/InviteCodeGeneratorTest.java`
- `backend/src/test/java/com/animesquad/squad/SquadServiceIT.java`
- `backend/src/test/java/com/animesquad/squad/SquadControllerIT.java`

**Frontend — created**
- `frontend/src/app/squads/page.tsx`

**Frontend — modified**
- `frontend/src/app/lib/api.ts` — add `apiPost`

Each backend module file lives in `com.animesquad.squad`. The package owns its own DTOs to keep the seam clean for later plans that will reference squads.

---

## Task 1: Flyway V2 — `squad` + `membership` tables

**Files:**
- Create: `backend/src/main/resources/db/migration/V2__squads.sql`

- [ ] **Step 1: Write the migration**

```sql
CREATE TABLE squad (
    id           BIGSERIAL PRIMARY KEY,
    name         VARCHAR(80)  NOT NULL,
    owner_id     BIGINT       NOT NULL REFERENCES users(id),
    invite_code  VARCHAR(16)  NOT NULL UNIQUE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE membership (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT      NOT NULL REFERENCES users(id),
    squad_id   BIGINT      NOT NULL REFERENCES squad(id) ON DELETE CASCADE,
    role       VARCHAR(16) NOT NULL,
    joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, squad_id)
);

CREATE INDEX idx_membership_user ON membership(user_id);
CREATE INDEX idx_membership_squad ON membership(squad_id);
```

- [ ] **Step 2: Verify Flyway applies cleanly**

```bash
cd backend && ./gradlew test --tests "*UserServiceIT*"
```
Expected: PASS — Testcontainers spins up a fresh DB and applies V1 + V2.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/resources/db/migration/V2__squads.sql
git commit -m "feat(db): add squad and membership tables (V2)"
```

---

## Task 2: Entities + repositories

**Files:**
- Create: `backend/src/main/java/com/animesquad/squad/MembershipRole.java`
- Create: `backend/src/main/java/com/animesquad/squad/Squad.java`
- Create: `backend/src/main/java/com/animesquad/squad/Membership.java`
- Create: `backend/src/main/java/com/animesquad/squad/SquadRepository.java`
- Create: `backend/src/main/java/com/animesquad/squad/MembershipRepository.java`

- [ ] **Step 1: `MembershipRole.java`**

```java
package com.animesquad.squad;

public enum MembershipRole { OWNER, MEMBER }
```

- [ ] **Step 2: `Squad.java`**

```java
package com.animesquad.squad;

import jakarta.persistence.*;
import java.time.OffsetDateTime;

@Entity
@Table(name = "squad")
public class Squad {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 80)
    private String name;

    @Column(name = "owner_id", nullable = false)
    private Long ownerId;

    @Column(name = "invite_code", nullable = false, unique = true, length = 16)
    private String inviteCode;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    protected Squad() {}

    public Squad(String name, Long ownerId, String inviteCode) {
        this.name = name;
        this.ownerId = ownerId;
        this.inviteCode = inviteCode;
    }

    public Long getId() { return id; }
    public String getName() { return name; }
    public Long getOwnerId() { return ownerId; }
    public String getInviteCode() { return inviteCode; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
}
```

- [ ] **Step 3: `Membership.java`**

```java
package com.animesquad.squad;

import jakarta.persistence.*;
import java.time.OffsetDateTime;

@Entity
@Table(name = "membership")
public class Membership {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "squad_id", nullable = false)
    private Long squadId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private MembershipRole role;

    @Column(name = "joined_at", nullable = false)
    private OffsetDateTime joinedAt = OffsetDateTime.now();

    protected Membership() {}

    public Membership(Long userId, Long squadId, MembershipRole role) {
        this.userId = userId;
        this.squadId = squadId;
        this.role = role;
    }

    public Long getId() { return id; }
    public Long getUserId() { return userId; }
    public Long getSquadId() { return squadId; }
    public MembershipRole getRole() { return role; }
    public OffsetDateTime getJoinedAt() { return joinedAt; }
}
```

- [ ] **Step 4: `SquadRepository.java`**

```java
package com.animesquad.squad;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface SquadRepository extends JpaRepository<Squad, Long> {
    Optional<Squad> findByInviteCode(String inviteCode);
    boolean existsByInviteCode(String inviteCode);
}
```

- [ ] **Step 5: `MembershipRepository.java`**

```java
package com.animesquad.squad;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface MembershipRepository extends JpaRepository<Membership, Long> {
    List<Membership> findAllByUserId(Long userId);
    Optional<Membership> findByUserIdAndSquadId(Long userId, Long squadId);
    boolean existsByUserIdAndSquadId(Long userId, Long squadId);
}
```

- [ ] **Step 6: Compile**

```bash
./gradlew compileJava
```
Expected: BUILD SUCCESSFUL.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/animesquad/squad/
git commit -m "feat(squad): add Squad and Membership entities + repos"
```

---

## Task 3: `InviteCodeGenerator` (TDD)

**Files:**
- Create: `backend/src/main/java/com/animesquad/squad/InviteCodeGenerator.java`
- Test: `backend/src/test/java/com/animesquad/squad/InviteCodeGeneratorTest.java`

Codes are 10 characters from an unambiguous alphabet (`A-Z` + `2-9`, skipping `0/O/1/I`). The service calls `next()` repeatedly until the repository confirms uniqueness; we test the alphabet and length invariants here.

- [ ] **Step 1: Write the failing test**

`InviteCodeGeneratorTest.java`:
```java
package com.animesquad.squad;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class InviteCodeGeneratorTest {

    private final InviteCodeGenerator gen = new InviteCodeGenerator();

    @Test
    void next_returns10CharsFromAlphabet() {
        for (int i = 0; i < 1000; i++) {
            String code = gen.next();
            assertThat(code).hasSize(10);
            assertThat(code).matches("[A-HJ-NP-Z2-9]+");
        }
    }

    @Test
    void next_producesDifferentValues() {
        String a = gen.next();
        String b = gen.next();
        assertThat(a).isNotEqualTo(b);
    }
}
```

- [ ] **Step 2: Run test, expect failure**

```bash
./gradlew test --tests InviteCodeGeneratorTest
```
Expected: FAIL (`InviteCodeGenerator` does not exist).

- [ ] **Step 3: Implement**

`InviteCodeGenerator.java`:
```java
package com.animesquad.squad;

import org.springframework.stereotype.Component;
import java.security.SecureRandom;

@Component
public class InviteCodeGenerator {

    // 32 chars — omits 0,O,1,I to avoid lookalikes
    private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final int LENGTH = 10;
    private final SecureRandom random = new SecureRandom();

    public String next() {
        StringBuilder sb = new StringBuilder(LENGTH);
        for (int i = 0; i < LENGTH; i++) {
            sb.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
        }
        return sb.toString();
    }
}
```

- [ ] **Step 4: Run test, expect pass**

```bash
./gradlew test --tests InviteCodeGeneratorTest
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/animesquad/squad/InviteCodeGenerator.java \
        backend/src/test/java/com/animesquad/squad/InviteCodeGeneratorTest.java
git commit -m "feat(squad): add InviteCodeGenerator with unambiguous alphabet"
```

---

## Task 4: `SquadService.createSquad` (TDD)

**Files:**
- Create: `backend/src/main/java/com/animesquad/squad/SquadService.java`
- Test: `backend/src/test/java/com/animesquad/squad/SquadServiceIT.java`

- [ ] **Step 1: Write the failing test**

`SquadServiceIT.java`:
```java
package com.animesquad.squad;

import com.animesquad.support.AbstractIntegrationTest;
import com.animesquad.user.User;
import com.animesquad.user.UserService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static org.assertj.core.api.Assertions.assertThat;

class SquadServiceIT extends AbstractIntegrationTest {

    @Autowired SquadService squadService;
    @Autowired MembershipRepository memberships;
    @Autowired UserService userService;

    @Test
    void createSquad_persistsSquadAndOwnerMembership() {
        User owner = userService.upsertFromGoogle("g-owner", "owner@x.y", "Owner", null);

        Squad s = squadService.createSquad(owner.getId(), "My Squad");

        assertThat(s.getId()).isNotNull();
        assertThat(s.getName()).isEqualTo("My Squad");
        assertThat(s.getOwnerId()).isEqualTo(owner.getId());
        assertThat(s.getInviteCode()).hasSize(10);

        Membership m = memberships.findByUserIdAndSquadId(owner.getId(), s.getId()).orElseThrow();
        assertThat(m.getRole()).isEqualTo(MembershipRole.OWNER);
    }
}
```

- [ ] **Step 2: Run test, expect failure**

```bash
./gradlew test --tests SquadServiceIT
```
Expected: FAIL (`SquadService` not found / does not compile).

- [ ] **Step 3: Implement `SquadService.java`**

```java
package com.animesquad.squad;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SquadService {

    private final SquadRepository squads;
    private final MembershipRepository memberships;
    private final InviteCodeGenerator codes;

    public SquadService(SquadRepository squads, MembershipRepository memberships, InviteCodeGenerator codes) {
        this.squads = squads;
        this.memberships = memberships;
        this.codes = codes;
    }

    @Transactional
    public Squad createSquad(Long ownerId, String name) {
        Squad squad = squads.save(new Squad(name, ownerId, generateUniqueCode()));
        memberships.save(new Membership(ownerId, squad.getId(), MembershipRole.OWNER));
        return squad;
    }

    private String generateUniqueCode() {
        for (int attempt = 0; attempt < 5; attempt++) {
            String code = codes.next();
            if (!squads.existsByInviteCode(code)) return code;
        }
        throw new IllegalStateException("could not generate unique invite code");
    }
}
```

- [ ] **Step 4: Run test, expect pass**

```bash
./gradlew test --tests SquadServiceIT
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/animesquad/squad/SquadService.java \
        backend/src/test/java/com/animesquad/squad/SquadServiceIT.java
git commit -m "feat(squad): SquadService.createSquad with owner membership"
```

---

## Task 5: `SquadService.joinByInviteCode` (TDD)

**Files:**
- Modify: `backend/src/main/java/com/animesquad/squad/SquadService.java`
- Modify: `backend/src/test/java/com/animesquad/squad/SquadServiceIT.java`

Join is idempotent: if the user is already a member, it returns the squad without creating a duplicate membership. Bad codes raise `IllegalArgumentException` (mapped to 400 by Plan 1's `GlobalExceptionHandler`).

- [ ] **Step 1: Add failing tests to `SquadServiceIT.java`**

Add inside the existing class:
```java
    @Test
    void joinByInviteCode_addsMembership() {
        User owner = userService.upsertFromGoogle("g-o2", "o2@x.y", "O2", null);
        User joiner = userService.upsertFromGoogle("g-j2", "j2@x.y", "J2", null);
        Squad s = squadService.createSquad(owner.getId(), "S");

        Squad joined = squadService.joinByInviteCode(joiner.getId(), s.getInviteCode());

        assertThat(joined.getId()).isEqualTo(s.getId());
        assertThat(memberships.existsByUserIdAndSquadId(joiner.getId(), s.getId())).isTrue();
    }

    @Test
    void joinByInviteCode_isIdempotent_whenAlreadyMember() {
        User u = userService.upsertFromGoogle("g-idem", "i@x.y", "I", null);
        Squad s = squadService.createSquad(u.getId(), "S");

        Squad again = squadService.joinByInviteCode(u.getId(), s.getInviteCode());

        assertThat(again.getId()).isEqualTo(s.getId());
        assertThat(memberships.findAllByUserId(u.getId())).hasSize(1);
    }

    @Test
    void joinByInviteCode_throws_whenCodeUnknown() {
        User u = userService.upsertFromGoogle("g-bad", "b@x.y", "B", null);

        assertThatThrownBy(() -> squadService.joinByInviteCode(u.getId(), "NOPENOPE12"))
            .isInstanceOf(IllegalArgumentException.class);
    }
```

Update the existing imports at the top of `SquadServiceIT.java` to include:
```java
import static org.assertj.core.api.Assertions.assertThatThrownBy;
```

- [ ] **Step 2: Run tests, expect failure**

```bash
./gradlew test --tests SquadServiceIT
```
Expected: compilation FAIL (no `joinByInviteCode`).

- [ ] **Step 3: Extend `SquadService.java`**

Add the method:
```java
    @Transactional
    public Squad joinByInviteCode(Long userId, String inviteCode) {
        Squad squad = squads.findByInviteCode(inviteCode)
            .orElseThrow(() -> new IllegalArgumentException("invite code not found"));
        if (!memberships.existsByUserIdAndSquadId(userId, squad.getId())) {
            memberships.save(new Membership(userId, squad.getId(), MembershipRole.MEMBER));
        }
        return squad;
    }
```

- [ ] **Step 4: Run tests, expect pass**

```bash
./gradlew test --tests SquadServiceIT
```
Expected: PASS (all four `SquadServiceIT` tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/animesquad/squad/SquadService.java \
        backend/src/test/java/com/animesquad/squad/SquadServiceIT.java
git commit -m "feat(squad): joinByInviteCode (idempotent) with validation"
```

---

## Task 6: `SquadService.listMySquads` + `getSquadForMember` (TDD)

**Files:**
- Modify: `backend/src/main/java/com/animesquad/squad/SquadService.java`
- Modify: `backend/src/test/java/com/animesquad/squad/SquadServiceIT.java`

`getSquadForMember` returns the squad only if the caller is a member; otherwise throws a "not found" style exception so existence isn't leaked. We map it to `IllegalArgumentException` for Plan 1's handler (400). A dedicated NotFound type will be added in a later plan when more endpoints need it.

- [ ] **Step 1: Add failing tests to `SquadServiceIT.java`**

```java
    @Test
    void listMySquads_returnsOnlySquadsImIn() {
        User me = userService.upsertFromGoogle("g-me", "me@x.y", "Me", null);
        User other = userService.upsertFromGoogle("g-o", "o@x.y", "O", null);
        Squad mine = squadService.createSquad(me.getId(), "Mine");
        squadService.createSquad(other.getId(), "Theirs");

        List<Squad> result = squadService.listMySquads(me.getId());

        assertThat(result).extracting(Squad::getId).containsExactly(mine.getId());
    }

    @Test
    void getSquadForMember_returnsSquad_whenMember() {
        User me = userService.upsertFromGoogle("g-gm", "gm@x.y", "GM", null);
        Squad s = squadService.createSquad(me.getId(), "S");

        Squad got = squadService.getSquadForMember(me.getId(), s.getId());

        assertThat(got.getId()).isEqualTo(s.getId());
    }

    @Test
    void getSquadForMember_throws_whenNotMember() {
        User owner = userService.upsertFromGoogle("g-own", "own@x.y", "Own", null);
        User stranger = userService.upsertFromGoogle("g-str", "str@x.y", "Str", null);
        Squad s = squadService.createSquad(owner.getId(), "S");

        assertThatThrownBy(() -> squadService.getSquadForMember(stranger.getId(), s.getId()))
            .isInstanceOf(IllegalArgumentException.class);
    }
```

Add `import java.util.List;` to `SquadServiceIT.java`.

- [ ] **Step 2: Run tests, expect failure**

```bash
./gradlew test --tests SquadServiceIT
```
Expected: compilation FAIL.

- [ ] **Step 3: Extend `SquadService.java`**

```java
    @Transactional(readOnly = true)
    public List<Squad> listMySquads(Long userId) {
        List<Long> squadIds = memberships.findAllByUserId(userId).stream()
            .map(Membership::getSquadId).toList();
        return squads.findAllById(squadIds);
    }

    @Transactional(readOnly = true)
    public Squad getSquadForMember(Long userId, Long squadId) {
        if (!memberships.existsByUserIdAndSquadId(userId, squadId)) {
            throw new IllegalArgumentException("squad not found");
        }
        return squads.findById(squadId)
            .orElseThrow(() -> new IllegalArgumentException("squad not found"));
    }
```

Add imports at the top of `SquadService.java`:
```java
import java.util.List;
```

- [ ] **Step 4: Run tests, expect pass**

```bash
./gradlew test --tests SquadServiceIT
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/animesquad/squad/SquadService.java \
        backend/src/test/java/com/animesquad/squad/SquadServiceIT.java
git commit -m "feat(squad): listMySquads + getSquadForMember (membership-gated)"
```

---

## Task 7: DTOs + `SquadController` + security update (TDD)

**Files:**
- Create: `backend/src/main/java/com/animesquad/squad/dto/CreateSquadRequest.java`
- Create: `backend/src/main/java/com/animesquad/squad/dto/JoinSquadRequest.java`
- Create: `backend/src/main/java/com/animesquad/squad/dto/SquadResponse.java`
- Create: `backend/src/main/java/com/animesquad/squad/SquadController.java`
- Modify: `backend/src/main/java/com/animesquad/auth/SecurityConfig.java` — require auth for `/api/squads/**`
- Test: `backend/src/test/java/com/animesquad/squad/SquadControllerIT.java`

Endpoints (all require an authenticated `CurrentUser`):
- `POST /api/squads` — body `{name}` → 201 + `SquadResponse`
- `GET  /api/squads` → `SquadResponse[]`
- `GET  /api/squads/{id}` → `SquadResponse` (400 if not member, via `IllegalArgumentException`)
- `POST /api/squads/join` — body `{inviteCode}` → 200 + `SquadResponse`

- [ ] **Step 1: Write the failing controller IT**

`SquadControllerIT.java`:
```java
package com.animesquad.squad;

import com.animesquad.auth.JwtAuthenticationFilter;
import com.animesquad.auth.JwtService;
import com.animesquad.support.AbstractIntegrationTest;
import com.animesquad.user.User;
import com.animesquad.user.UserService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.*;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class SquadControllerIT extends AbstractIntegrationTest {

    @Autowired UserService userService;
    @Autowired JwtService jwtService;
    @Autowired TestRestTemplate rest;
    @LocalServerPort int port;

    private HttpHeaders cookieFor(Long userId) {
        HttpHeaders h = new HttpHeaders();
        h.add(HttpHeaders.COOKIE,
            JwtAuthenticationFilter.COOKIE_NAME + "=" + jwtService.issue(userId));
        h.setContentType(MediaType.APPLICATION_JSON);
        return h;
    }

    private String url(String path) {
        return "http://localhost:" + port + path;
    }

    @Test
    void create_returns201AndOwnerCanList() {
        User me = userService.upsertFromGoogle("g-cc1", "cc1@x.y", "CC1", null);

        ResponseEntity<Map> created = rest.exchange(
            url("/api/squads"), HttpMethod.POST,
            new HttpEntity<>(Map.of("name", "Friday Crew"), cookieFor(me.getId())),
            Map.class);

        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat((String) created.getBody().get("name")).isEqualTo("Friday Crew");
        assertThat((String) created.getBody().get("inviteCode")).hasSize(10);

        ResponseEntity<Map[]> list = rest.exchange(
            url("/api/squads"), HttpMethod.GET,
            new HttpEntity<>(cookieFor(me.getId())), Map[].class);

        assertThat(list.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(list.getBody()).hasSize(1);
        assertThat((String) list.getBody()[0].get("name")).isEqualTo("Friday Crew");
    }

    @Test
    void join_addsMembership_andDetailReturnsSquad() {
        User owner = userService.upsertFromGoogle("g-cc2-o", "o2@x.y", "O", null);
        User joiner = userService.upsertFromGoogle("g-cc2-j", "j2@x.y", "J", null);

        ResponseEntity<Map> created = rest.exchange(
            url("/api/squads"), HttpMethod.POST,
            new HttpEntity<>(Map.of("name", "S"), cookieFor(owner.getId())),
            Map.class);
        String code = (String) created.getBody().get("inviteCode");
        Integer squadId = (Integer) created.getBody().get("id");

        ResponseEntity<Map> joined = rest.exchange(
            url("/api/squads/join"), HttpMethod.POST,
            new HttpEntity<>(Map.of("inviteCode", code), cookieFor(joiner.getId())),
            Map.class);

        assertThat(joined.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat((Integer) joined.getBody().get("id")).isEqualTo(squadId);

        ResponseEntity<Map> detail = rest.exchange(
            url("/api/squads/" + squadId), HttpMethod.GET,
            new HttpEntity<>(cookieFor(joiner.getId())), Map.class);
        assertThat(detail.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void unauthenticated_create_returns401() {
        ResponseEntity<String> res = rest.exchange(
            url("/api/squads"), HttpMethod.POST,
            new HttpEntity<>("{\"name\":\"x\"}", jsonHeaders()), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    private HttpHeaders jsonHeaders() {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        return h;
    }
}
```

- [ ] **Step 2: Run test, expect failure**

```bash
./gradlew test --tests SquadControllerIT
```
Expected: FAIL (controller missing and security still permits unauthenticated `/api/squads`).

- [ ] **Step 3: Create DTOs**

`CreateSquadRequest.java`:
```java
package com.animesquad.squad.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateSquadRequest(
    @NotBlank @Size(max = 80) String name
) {}
```

`JoinSquadRequest.java`:
```java
package com.animesquad.squad.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record JoinSquadRequest(
    @NotBlank @Size(max = 16) String inviteCode
) {}
```

`SquadResponse.java`:
```java
package com.animesquad.squad.dto;

import com.animesquad.squad.Squad;
import java.time.OffsetDateTime;

public record SquadResponse(
    Long id,
    String name,
    Long ownerId,
    String inviteCode,
    OffsetDateTime createdAt
) {
    public static SquadResponse from(Squad s) {
        return new SquadResponse(s.getId(), s.getName(), s.getOwnerId(),
            s.getInviteCode(), s.getCreatedAt());
    }
}
```

- [ ] **Step 4: Create `SquadController.java`**

```java
package com.animesquad.squad;

import com.animesquad.auth.CurrentUser;
import com.animesquad.squad.dto.CreateSquadRequest;
import com.animesquad.squad.dto.JoinSquadRequest;
import com.animesquad.squad.dto.SquadResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/squads")
public class SquadController {

    private final SquadService squadService;

    public SquadController(SquadService squadService) {
        this.squadService = squadService;
    }

    @PostMapping
    public ResponseEntity<SquadResponse> create(
        @AuthenticationPrincipal CurrentUser me,
        @Valid @RequestBody CreateSquadRequest req
    ) {
        Squad s = squadService.createSquad(me.userId(), req.name());
        return ResponseEntity.status(HttpStatus.CREATED).body(SquadResponse.from(s));
    }

    @GetMapping
    public List<SquadResponse> listMine(@AuthenticationPrincipal CurrentUser me) {
        return squadService.listMySquads(me.userId()).stream()
            .map(SquadResponse::from).toList();
    }

    @GetMapping("/{id}")
    public SquadResponse detail(
        @AuthenticationPrincipal CurrentUser me,
        @PathVariable Long id
    ) {
        return SquadResponse.from(squadService.getSquadForMember(me.userId(), id));
    }

    @PostMapping("/join")
    public SquadResponse join(
        @AuthenticationPrincipal CurrentUser me,
        @Valid @RequestBody JoinSquadRequest req
    ) {
        return SquadResponse.from(squadService.joinByInviteCode(me.userId(), req.inviteCode()));
    }
}
```

- [ ] **Step 5: Update `SecurityConfig.java`**

Replace the `authorizeHttpRequests` block. Find:
```java
            .authorizeHttpRequests(a -> a
                .requestMatchers("/api/me").authenticated()
                .anyRequest().permitAll())
```
Replace with:
```java
            .authorizeHttpRequests(a -> a
                .requestMatchers("/api/**").authenticated()
                .anyRequest().permitAll())
```

OAuth2 callback paths (`/login/oauth2/**`, `/oauth2/authorization/**`) are not under `/api`, so they remain public.

- [ ] **Step 6: Run test, expect pass**

```bash
./gradlew test --tests SquadControllerIT
```
Expected: PASS (all three tests in `SquadControllerIT`).

- [ ] **Step 7: Re-run full backend suite**

```bash
./gradlew test
```
Expected: PASS — including `UserServiceIT`, `JwtServiceTest`, `AuthControllerIT`, and the new squad tests.

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/com/animesquad/squad/ \
        backend/src/main/java/com/animesquad/auth/SecurityConfig.java \
        backend/src/test/java/com/animesquad/squad/SquadControllerIT.java
git commit -m "feat(squad): REST endpoints + require auth for /api/**"
```

---

## Task 8: Frontend `/squads` page

**Files:**
- Modify: `frontend/src/app/lib/api.ts` — add `apiPost`
- Create: `frontend/src/app/squads/page.tsx`

Single page: list my squads, "create new squad" form, "join with invite code" form. Server interactions go through `apiPost`. Errors surface in a tiny status line — full toast UX is out of scope for Plan 2.

- [ ] **Step 1: Extend `api.ts`**

Append to `frontend/src/app/lib/api.ts`:
```ts
export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export type Squad = {
  id: number;
  name: string;
  ownerId: number;
  inviteCode: string;
  createdAt: string;
};
```

- [ ] **Step 2: Create `frontend/src/app/squads/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost, type Squad } from "@/app/lib/api";

export default function SquadsPage() {
  const [squads, setSquads] = useState<Squad[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  async function refresh() {
    try {
      setSquads(await apiGet<Squad[]>("/api/squads"));
    } catch (e) {
      setStatus(String(e));
    }
  }

  useEffect(() => { refresh(); }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setStatus(null);
    try {
      await apiPost<Squad>("/api/squads", { name });
      setName("");
      await refresh();
    } catch (e) { setStatus(String(e)); }
  }

  async function onJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setStatus(null);
    try {
      await apiPost<Squad>("/api/squads/join", { inviteCode: code });
      setCode("");
      await refresh();
    } catch (e) { setStatus(String(e)); }
  }

  return (
    <main style={{ padding: 40, fontFamily: "sans-serif", maxWidth: 600 }}>
      <h1>내 스쿼드</h1>
      {status && <p style={{ color: "crimson" }}>{status}</p>}

      <ul>
        {squads.map((s) => (
          <li key={s.id}>
            <strong>{s.name}</strong>
            {" "}— 초대 코드: <code>{s.inviteCode}</code>
          </li>
        ))}
        {squads.length === 0 && <li style={{ color: "#666" }}>아직 가입한 스쿼드가 없어요.</li>}
      </ul>

      <section style={{ marginTop: 32 }}>
        <h2>새 스쿼드 만들기</h2>
        <form onSubmit={onCreate}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="스쿼드 이름" />
          <button type="submit" style={{ marginLeft: 8 }}>만들기</button>
        </form>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2>초대 코드로 참여</h2>
        <form onSubmit={onJoin}>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="초대 코드" />
          <button type="submit" style={{ marginLeft: 8 }}>참여</button>
        </form>
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Build to type-check**

```bash
cd frontend && pnpm build
```
Expected: BUILD SUCCESSFUL with `/squads` route in the output table.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/lib/api.ts frontend/src/app/squads/
git commit -m "feat(frontend): /squads page — list, create, join"
```

---

## Task 9: Manual smoke test

**No code — verification only.**

- [ ] **Step 1: Start backend + Postgres**

```bash
cd backend
set -a; source .env.local; set +a
docker compose up -d
./gradlew bootRun
```

- [ ] **Step 2: Start frontend in another terminal**

```bash
cd frontend && pnpm dev
```

- [ ] **Step 3: Sign in then exercise the page**

1. Visit `http://localhost:3000` → click "Sign in with Google" → land on `/me`.
2. Visit `http://localhost:3000/squads`:
   - List is empty.
   - Create "Test Squad" → row appears with a 10-char invite code.
3. Open a private window, sign in with a second Google account, visit `/squads`:
   - Paste the invite code → row appears.
4. In both windows, refresh `/squads`. Both list the squad.

- [ ] **Step 4: DB sanity check**

```bash
docker exec animesquad-db psql -U animesquad -d animesquad -c \
  "SELECT s.id, s.name, s.invite_code, count(m.*) AS members
   FROM squad s LEFT JOIN membership m ON m.squad_id = s.id
   GROUP BY s.id;"
```
Expected: one row, two members.

- [ ] **Step 5: Update changelog**

Append under the existing `Plan 1` heading (do not delete it):
```bash
cat >> CHANGELOG.md <<'EOF'

## Plan 2 — 2026-06-12
- Squad CRUD: create / list-mine / detail / join-by-code
- 10-char unambiguous invite codes
- Membership-gated detail (404-equivalent for non-members)
- `/api/**` now requires auth
- Frontend `/squads` page with create & join forms
EOF
git add CHANGELOG.md
git commit -m "docs: changelog for plan 2"
```

---

## Verification Checklist (Definition of Done)

- [ ] `cd backend && ./gradlew test` — green (UserServiceIT, JwtServiceTest, AuthControllerIT, InviteCodeGeneratorTest, SquadServiceIT, SquadControllerIT)
- [ ] `cd frontend && pnpm build` — green
- [ ] Manual smoke test (Task 9) executed
- [ ] CHANGELOG.md has a Plan 2 section

## Out of Scope for Plan 2 (covered later)

- Leaving / deleting a squad (Plan 6 or later, with activity events)
- `ActivityEvent: JOINED_SQUAD` publication (Plan 6 — activity module)
- Member listing endpoint (`/api/squads/{id}/members`) — Plan covering profiles
- Invite code rotation
- Email invites
- Squad rename / owner transfer

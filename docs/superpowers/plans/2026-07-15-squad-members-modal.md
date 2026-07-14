# 스쿼드 멤버 목록 모달 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스쿼드 상세 페이지의 "멤버 n명" 텍스트를 클릭하면 소속 멤버 전체 목록(프로필 사진, 닉네임, 관리자 배지)을 보여주는 모달을 띄운다.

**Architecture:** 백엔드에 `GET /api/squad/{id}/members` 엔드포인트를 새로 추가해 스쿼드 소속 멤버 목록(userId, displayName, avatarUrl, role)을 OWNER를 맨 앞에 두고 반환한다. 프론트엔드는 이 엔드포인트를 모달이 열릴 때만 호출하는 지연 로딩 방식으로 붙인다.

**Tech Stack:** Spring Boot(Java 21, Gradle), Next.js 14 App Router(TypeScript), Testcontainers PostgreSQL 통합 테스트.

**Design doc:** `docs/superpowers/specs/2026-07-15-squad-members-modal-design.md`

---

### Task 1: 백엔드 — `SquadMemberResponse` DTO 추가

**Files:**
- Create: `backend/src/main/java/com/animesquad/squad/dto/SquadMemberResponse.java`

- [ ] **Step 1: DTO 작성**

`backend/src/main/java/com/animesquad/squad/dto/SquadMemberResponse.java`:

```java
package com.animesquad.squad.dto;

import com.animesquad.squad.MembershipRole;
import com.animesquad.user.User;

public record SquadMemberResponse(Long userId, String displayName, String avatarUrl, MembershipRole role) {
    public static SquadMemberResponse from(User u, MembershipRole role) {
        return new SquadMemberResponse(u.getId(), u.getDisplayName(), u.getAvatarUrl(), role);
    }
}
```

- [ ] **Step 2: 컴파일 확인**

Run: `cd backend && ./gradlew compileJava`
Expected: BUILD SUCCESSFUL

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/com/animesquad/squad/dto/SquadMemberResponse.java
git commit -m "feat(squad): SquadMemberResponse DTO 추가"
```

---

### Task 2: 백엔드 — `SquadService.listMembers` 구현

**Files:**
- Modify: `backend/src/main/java/com/animesquad/squad/SquadService.java`
- Test: `backend/src/test/java/com/animesquad/squad/SquadServiceIT.java`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/src/test/java/com/animesquad/squad/SquadServiceIT.java` 맨 아래(마지막 `}` 앞)에 추가:

```java
    @Test
    void listMembers_returnsOwnerFirst_thenOtherMembers() {
        User owner = userService.upsertFromGoogle("g-lm-o", "lmo@x.y", "Owner", null);
        User member = userService.upsertFromGoogle("g-lm-m", "lmm@x.y", "Member", null);
        Squad s = squadService.createSquad(owner.getId(), "S");
        squadService.joinByInviteCode(member.getId(), s.getInviteCode());

        List<com.animesquad.squad.dto.SquadMemberResponse> result =
            squadService.listMembers(owner.getId(), s.getId());

        assertThat(result).hasSize(2);
        assertThat(result.get(0).userId()).isEqualTo(owner.getId());
        assertThat(result.get(0).role()).isEqualTo(MembershipRole.OWNER);
        assertThat(result.get(1).userId()).isEqualTo(member.getId());
        assertThat(result.get(1).role()).isEqualTo(MembershipRole.MEMBER);
    }

    @Test
    void listMembers_throws_whenCallerNotMember() {
        User owner = userService.upsertFromGoogle("g-lm-o2", "lmo2@x.y", "Owner2", null);
        User stranger = userService.upsertFromGoogle("g-lm-s", "lms@x.y", "Stranger", null);
        Squad s = squadService.createSquad(owner.getId(), "S");

        assertThatThrownBy(() -> squadService.listMembers(stranger.getId(), s.getId()))
            .isInstanceOf(IllegalArgumentException.class);
    }
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

Run: `cd backend && ./gradlew test --tests "com.animesquad.squad.SquadServiceIT"`
Expected: FAIL — `cannot find symbol: method listMembers`

- [ ] **Step 3: `SquadService`에 구현 추가**

`backend/src/main/java/com/animesquad/squad/SquadService.java` 상단 import 블록에 추가:

```java
import com.animesquad.squad.dto.SquadMemberResponse;
import com.animesquad.user.User;
import com.animesquad.user.UserRepository;

import java.util.Comparator;
import java.util.Map;
import java.util.stream.Collectors;
```

생성자와 필드에 `UserRepository` 추가 (기존 생성자를 아래처럼 수정):

```java
    private final SquadRepository squads;
    private final MembershipRepository memberships;
    private final UserRepository users;
    private final InviteCodeGenerator codes;
    private final ApplicationEventPublisher events;
    private final AvatarStorage storage;

    public SquadService(SquadRepository squads, MembershipRepository memberships,
                        UserRepository users, InviteCodeGenerator codes,
                        ApplicationEventPublisher events, AvatarStorage storage) {
        this.squads = squads;
        this.memberships = memberships;
        this.users = users;
        this.codes = codes;
        this.events = events;
        this.storage = storage;
    }
```

`toResponse` 메서드 바로 아래에 새 메서드 추가:

```java
    @Transactional(readOnly = true)
    public List<SquadMemberResponse> listMembers(Long userId, Long squadId) {
        if (!memberships.existsByUserIdAndSquadId(userId, squadId)) {
            throw new IllegalArgumentException("squad not found");
        }
        List<Membership> squadMemberships = memberships.findAllBySquadId(squadId);
        Map<Long, User> userById = users.findAllById(
                squadMemberships.stream().map(Membership::getUserId).distinct().toList()).stream()
            .collect(Collectors.toMap(User::getId, u -> u));

        return squadMemberships.stream()
            .map(m -> SquadMemberResponse.from(userById.get(m.getUserId()), m.getRole()))
            .sorted(Comparator.comparing(r -> r.role() == MembershipRole.OWNER ? 0 : 1))
            .toList();
    }
```

- [ ] **Step 4: 테스트 실행하여 통과 확인**

Run: `cd backend && ./gradlew test --tests "com.animesquad.squad.SquadServiceIT"`
Expected: BUILD SUCCESSFUL, 두 테스트 모두 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/animesquad/squad/SquadService.java \
        backend/src/test/java/com/animesquad/squad/SquadServiceIT.java
git commit -m "feat(squad): SquadService.listMembers 구현 — OWNER 우선 정렬"
```

---

### Task 3: 백엔드 — `GET /api/squad/{id}/members` 엔드포인트

**Files:**
- Modify: `backend/src/main/java/com/animesquad/squad/SquadController.java`
- Test: `backend/src/test/java/com/animesquad/squad/SquadControllerIT.java`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/src/test/java/com/animesquad/squad/SquadControllerIT.java` 맨 아래 헬퍼 메서드들 앞(마지막 `@Test` 뒤, `private Integer createSquad(...)` 앞)에 추가:

```java
    @Test
    void members_returnsOwnerFirst() {
        User owner = userService.upsertFromGoogle("g-mem-o", "memo@x.y", "Owner", null);
        User member = userService.upsertFromGoogle("g-mem-m", "memm@x.y", "Member", null);
        Integer squadId = createSquad(owner.getId());
        String code = inviteCodeOf(squadId, owner.getId());
        rest.exchange(url("/api/squad/join"), HttpMethod.POST,
            new HttpEntity<>(Map.of("inviteCode", code), cookieFor(member.getId())), Map.class);

        ResponseEntity<Map[]> res = rest.exchange(
            url("/api/squad/" + squadId + "/members"), HttpMethod.GET,
            new HttpEntity<>(cookieFor(owner.getId())), Map[].class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).hasSize(2);
        assertThat((String) res.getBody()[0].get("role")).isEqualTo("OWNER");
        assertThat((String) res.getBody()[1].get("role")).isEqualTo("MEMBER");
    }

    @Test
    void members_nonMember_returns400() {
        User owner = userService.upsertFromGoogle("g-mem-o2", "memo2@x.y", "Owner2", null);
        User stranger = userService.upsertFromGoogle("g-mem-s", "mems@x.y", "Stranger", null);
        Integer squadId = createSquad(owner.getId());

        ResponseEntity<String> res = rest.exchange(
            url("/api/squad/" + squadId + "/members"), HttpMethod.GET,
            new HttpEntity<>(cookieFor(stranger.getId())), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void members_unauthenticated_returns401() {
        Integer squadId = createSquad(userService.upsertFromGoogle("g-mem-o3", "memo3@x.y", "Owner3", null).getId());

        ResponseEntity<String> res = rest.exchange(
            url("/api/squad/" + squadId + "/members"), HttpMethod.GET,
            new HttpEntity<>(jsonHeaders()), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

Run: `cd backend && ./gradlew test --tests "com.animesquad.squad.SquadControllerIT"`
Expected: FAIL — 404 Not Found (엔드포인트 없음)

- [ ] **Step 3: 컨트롤러에 엔드포인트 추가**

`backend/src/main/java/com/animesquad/squad/SquadController.java` import에 추가:

```java
import com.animesquad.squad.dto.SquadMemberResponse;
```

`join` 메서드와 `uploadAvatar` 메서드 사이에 추가:

```java
    @GetMapping("/{id}/members")
    public List<SquadMemberResponse> members(
        @AuthenticationPrincipal CurrentUser me,
        @PathVariable Long id
    ) {
        return squadService.listMembers(me.userId(), id);
    }
```

- [ ] **Step 4: 테스트 실행하여 통과 확인**

Run: `cd backend && ./gradlew test --tests "com.animesquad.squad.SquadControllerIT"`
Expected: BUILD SUCCESSFUL, 세 테스트 모두 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/animesquad/squad/SquadController.java \
        backend/src/test/java/com/animesquad/squad/SquadControllerIT.java
git commit -m "feat(squad): GET /api/squad/{id}/members 엔드포인트 추가"
```

---

### Task 4: 프론트엔드 — `SquadMember` 타입 및 `SquadMembersModal` 컴포넌트

**Files:**
- Modify: `frontend/src/app/lib/api.ts`
- Create: `frontend/src/app/components/SquadMembersModal.tsx`

- [ ] **Step 1: `api.ts`에 타입 추가**

`frontend/src/app/lib/api.ts`의 `Squad` 타입 정의 바로 아래에 추가:

```ts
export type SquadMember = {
  userId: number;
  displayName: string;
  avatarUrl: string | null;
  role: "OWNER" | "MEMBER";
};
```

- [ ] **Step 2: 모달 컴포넌트 작성**

`frontend/src/app/components/SquadMembersModal.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, type SquadMember } from "@/app/lib/api";

type Props = {
  squadId: number;
  onClose: () => void;
};

export function SquadMembersModal({ squadId, onClose }: Props) {
  const [members, setMembers] = useState<SquadMember[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiGet<SquadMember[]>(`/api/squad/${squadId}/members`)
      .then(setMembers)
      .catch(() => setError(true));
  }, [squadId]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-neutral-800">멤버</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-neutral-500 hover:text-neutral-800"
          >
            닫기
          </button>
        </div>

        {error && (
          <p className="text-sm text-neutral-500">멤버 목록을 불러오지 못했어요.</p>
        )}
        {!error && members === null && (
          <p className="text-sm text-neutral-500">불러오는 중…</p>
        )}
        {!error && members !== null && (
          <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
            {members.map((m) => (
              <li key={m.userId}>
                <Link
                  href={`/users/${m.userId}`}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-neutral-50"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={m.avatarUrl ?? "/default-avatar.png"}
                    alt=""
                    className="h-9 w-9 rounded-full object-cover"
                  />
                  <span className="text-sm font-medium text-neutral-800">{m.displayName}</span>
                  {m.role === "OWNER" && (
                    <span className="ml-auto rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
                      관리자
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 타입체크 및 린트 확인**

Run: `cd frontend && npx tsc --noEmit`
Expected: 에러 없음

Run: `cd frontend && npx eslint src/app/lib/api.ts src/app/components/SquadMembersModal.tsx`
Expected: 에러 없음

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/lib/api.ts frontend/src/app/components/SquadMembersModal.tsx
git commit -m "feat(squad): SquadMembersModal 컴포넌트 추가"
```

---

### Task 5: 프론트엔드 — 스쿼드 상세 페이지에 모달 연결

**Files:**
- Modify: `frontend/src/app/squads/[id]/page.tsx`

- [ ] **Step 1: import 추가**

`frontend/src/app/squads/[id]/page.tsx` 6번째 줄(`import { SquadEditModal } ...`) 아래에 추가:

```tsx
import { SquadMembersModal } from "@/app/components/SquadMembersModal";
```

- [ ] **Step 2: `SquadHeader` 컴포넌트에 상태와 트리거 추가**

`SquadHeader` 함수 내부, 기존 `const [editing, setEditing] = useState(false);` 바로 아래에 추가:

```tsx
  const [showMembers, setShowMembers] = useState(false);
```

`{editing && squad && (...)}` 블록 바로 아래에 추가:

```tsx
    {showMembers && squad && (
      <SquadMembersModal
        squadId={squad.id}
        onClose={() => setShowMembers(false)}
      />
    )}
```

기존 "멤버 {count}명" `<p>` 태그:

```tsx
              <p className="mt-0.5 text-xs text-neutral-500">
                멤버 {squad.memberCount}명
              </p>
```

를 다음으로 교체:

```tsx
              <button
                type="button"
                onClick={() => setShowMembers(true)}
                className="mt-0.5 text-xs text-neutral-500 hover:text-neutral-800 hover:underline"
              >
                멤버 {squad.memberCount}명
              </button>
```

- [ ] **Step 3: 타입체크 및 린트 확인**

Run: `cd frontend && npx tsc --noEmit`
Expected: 에러 없음

Run: `cd frontend && npx eslint "src/app/squads/[id]/page.tsx"`
Expected: 에러 없음

- [ ] **Step 4: Commit**

```bash
git add "frontend/src/app/squads/[id]/page.tsx"
git commit -m "feat(squad): 멤버 수 클릭 시 멤버 목록 모달 표시"
```

---

### Task 6: 전체 백엔드 테스트 스위트 실행 (회귀 확인)

**Files:** 없음 (검증 전용)

- [ ] **Step 1: 백엔드 전체 테스트 실행**

Run: `cd backend && ./gradlew test`
Expected: BUILD SUCCESSFUL — 특히 `SquadServiceTest`, `SquadControllerIT` 등 `SquadService` 생성자 시그니처 변경(Task 2)의 영향을 받을 수 있는 기존 테스트가 모두 PASS해야 함.

- [ ] **Step 2: 실패하는 테스트가 있으면 수정**

`SquadService` 생성자에 `UserRepository users` 파라미터가 추가되었으므로, `new SquadService(...)`를 직접 호출하는 단위 테스트(예: `SquadServiceTest.java`, 존재한다면)가 있는지 확인하고 있다면 생성자 호출부에 mock `UserRepository`를 추가.

Run: `cd backend && ./gradlew test`
Expected: BUILD SUCCESSFUL

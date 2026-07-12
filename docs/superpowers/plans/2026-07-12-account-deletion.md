# Account Deletion (회원탈퇴) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 유저가 자신의 계정과 모든 데이터를 삭제할 수 있는 회원탈퇴 기능 구현

**Architecture:** 백엔드 `DELETE /api/me` 엔드포인트가 스쿼드 오너 여부를 체크한 뒤 membership → watch_entry → episode_rating → activity → users 순으로 삭제하고 JWT 쿠키를 비운다. 프론트엔드 프로필 페이지에 확인 다이얼로그를 거치는 탈퇴 버튼을 추가한다.

**Tech Stack:** Java 21, Spring Boot, Spring Data JPA, Next.js 14, TypeScript

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `backend/src/main/java/com/animesquad/squad/SquadRepository.java` | Modify | `existsByOwnerId` 메서드 추가 |
| `backend/src/main/java/com/animesquad/squad/MembershipRepository.java` | Modify | `deleteAllByUserId` 메서드 추가 |
| `backend/src/main/java/com/animesquad/watch/WatchEntryRepository.java` | Modify | `deleteAllByUserId` 메서드 추가 |
| `backend/src/main/java/com/animesquad/episode/EpisodeRatingRepository.java` | Modify | `deleteAllByUserId` 메서드 추가 |
| `backend/src/main/java/com/animesquad/activity/ActivityRepository.java` | Modify | `deleteAllByActorId` 메서드 추가 |
| `backend/src/main/java/com/animesquad/user/UserService.java` | Modify | `deleteAccount(Long userId)` 메서드 추가 |
| `backend/src/main/java/com/animesquad/auth/AuthController.java` | Modify | `DELETE /api/me` 엔드포인트 추가 |
| `backend/src/test/java/com/animesquad/auth/AuthControllerIT.java` | Modify | 탈퇴 통합 테스트 추가 |
| `frontend/src/app/profile/page.tsx` | Modify | 탈퇴 버튼 + 확인 다이얼로그 추가 |

---

### Task 1: Repository 메서드 추가

**Files:**
- Modify: `backend/src/main/java/com/animesquad/squad/SquadRepository.java`
- Modify: `backend/src/main/java/com/animesquad/squad/MembershipRepository.java`
- Modify: `backend/src/main/java/com/animesquad/watch/WatchEntryRepository.java`
- Modify: `backend/src/main/java/com/animesquad/episode/EpisodeRatingRepository.java`
- Modify: `backend/src/main/java/com/animesquad/activity/ActivityRepository.java`

- [ ] **Step 1: SquadRepository에 `existsByOwnerId` 추가**

`backend/src/main/java/com/animesquad/squad/SquadRepository.java`를 다음과 같이 수정:

```java
package com.animesquad.squad;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface SquadRepository extends JpaRepository<Squad, Long> {
    Optional<Squad> findByInviteCode(String inviteCode);
    boolean existsByInviteCode(String inviteCode);
    boolean existsByOwnerId(Long ownerId);
}
```

- [ ] **Step 2: MembershipRepository에 `deleteAllByUserId` 추가**

`backend/src/main/java/com/animesquad/squad/MembershipRepository.java`를 다음과 같이 수정:

```java
package com.animesquad.squad;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import java.util.List;
import java.util.Optional;

public interface MembershipRepository extends JpaRepository<Membership, Long> {
    List<Membership> findAllByUserId(Long userId);
    Optional<Membership> findByUserIdAndSquadId(Long userId, Long squadId);
    boolean existsByUserIdAndSquadId(Long userId, Long squadId);
    List<Membership> findAllBySquadId(Long squadId);
    long countBySquadId(Long squadId);

    @Modifying
    @Query("DELETE FROM Membership m WHERE m.userId = :userId")
    void deleteAllByUserId(Long userId);
}
```

- [ ] **Step 3: WatchEntryRepository에 `deleteAllByUserId` 추가**

`backend/src/main/java/com/animesquad/watch/WatchEntryRepository.java`를 다음과 같이 수정:

```java
package com.animesquad.watch;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface WatchEntryRepository extends JpaRepository<WatchEntry, Long> {
    List<WatchEntry> findAllByUserIdOrderByUpdatedAtDesc(Long userId);
    Optional<WatchEntry> findByUserIdAndAnimeId(Long userId, Long animeId);
    List<WatchEntry> findAllByUserIdInOrderByUpdatedAtDesc(Collection<Long> userIds, Limit limit);
    List<WatchEntry> findAllByUserIdInAndAnimeIdInOrderByUpdatedAtDesc(
        Collection<Long> userIds, Collection<Long> animeIds);
    List<WatchEntry> findAllByAnimeIdOrderByUpdatedAtDesc(Long animeId);
    boolean existsByAnimeId(Long animeId);

    @Modifying
    @Query("DELETE FROM WatchEntry w WHERE w.userId = :userId")
    void deleteAllByUserId(Long userId);
}
```

- [ ] **Step 4: EpisodeRatingRepository에 `deleteAllByUserId` 추가**

`backend/src/main/java/com/animesquad/episode/EpisodeRatingRepository.java`를 다음과 같이 수정:

```java
package com.animesquad.episode;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface EpisodeRatingRepository extends JpaRepository<EpisodeRating, Long> {
    Optional<EpisodeRating> findByUserIdAndAnimeIdAndEpisodeNumber(
        Long userId, Long animeId, int episodeNumber);

    List<EpisodeRating> findAllByUserIdAndAnimeIdOrderByEpisodeNumberAsc(
        Long userId, Long animeId);

    List<EpisodeRating> findAllByAnimeIdOrderByEpisodeNumberAscUpdatedAtDesc(Long animeId);

    boolean existsByAnimeId(Long animeId);

    List<EpisodeRating> findAllByUserIdAndCommentIsNotNullOrderByUpdatedAtDesc(
        Long userId, Limit limit);

    @Modifying
    @Query("DELETE FROM EpisodeRating r WHERE r.userId = :userId")
    void deleteAllByUserId(Long userId);
}
```

- [ ] **Step 5: ActivityRepository에 `deleteAllByActorId` 추가**

`backend/src/main/java/com/animesquad/activity/ActivityRepository.java`를 다음과 같이 수정:

```java
package com.animesquad.activity;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface ActivityRepository extends JpaRepository<Activity, Long> {

    List<Activity> findBySquadIdAndIdLessThanOrderByIdDesc(Long squadId, Long cursor, Limit limit);

    List<Activity> findBySquadIdOrderByIdDesc(Long squadId, Limit limit);

    List<Activity> findAllByActorIdAndAnimeIdAndType(Long actorId, Long animeId, ActivityType type);

    @Modifying
    @Query("DELETE FROM Activity a WHERE a.actorId = :actorId AND a.animeId = :animeId")
    void deleteAllByActorIdAndAnimeId(Long actorId, Long animeId);

    @Modifying
    @Query("DELETE FROM Activity a WHERE a.actorId = :actorId")
    void deleteAllByActorId(Long actorId);

    boolean existsByAnimeId(Long animeId);
}
```

- [ ] **Step 6: 컴파일 확인**

```bash
cd backend && ./gradlew compileJava
```

Expected: `BUILD SUCCESSFUL`

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/animesquad/squad/SquadRepository.java \
        backend/src/main/java/com/animesquad/squad/MembershipRepository.java \
        backend/src/main/java/com/animesquad/watch/WatchEntryRepository.java \
        backend/src/main/java/com/animesquad/episode/EpisodeRatingRepository.java \
        backend/src/main/java/com/animesquad/activity/ActivityRepository.java
git commit -m "feat(account-deletion): add bulk-delete repository methods for user data cleanup"
```

---

### Task 2: UserService.deleteAccount() 구현 + 백엔드 엔드포인트

**Files:**
- Modify: `backend/src/main/java/com/animesquad/user/UserService.java`
- Modify: `backend/src/main/java/com/animesquad/auth/AuthController.java`

- [ ] **Step 1: 테스트 먼저 작성**

`backend/src/test/java/com/animesquad/auth/AuthControllerIT.java`에 다음 테스트 3개 추가 (기존 테스트 마지막 `}` 앞에):

```java
@Test
void deleteAccount_returns401_whenNotLoggedIn() {
    ResponseEntity<Void> res = rest.exchange(
        url("/api/me"), HttpMethod.DELETE, HttpEntity.EMPTY, Void.class);
    assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
}

@Test
void deleteAccount_deletesUserAndExpiresCookie() {
    User u = userService.upsertFromGoogle("g-del-1", "del1@test.com", "Del", "url");
    Long userId = u.getId();

    ResponseEntity<Void> res = rest.exchange(
        url("/api/me"), HttpMethod.DELETE, new HttpEntity<>(cookieFor(userId)), Void.class);

    assertThat(res.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    String setCookie = res.getHeaders().getFirst(HttpHeaders.SET_COOKIE);
    assertThat(setCookie).contains(JwtAuthenticationFilter.COOKIE_NAME + "=");
    assertThat(setCookie).contains("Max-Age=0");
    assertThat(userRepository.existsById(userId)).isFalse();
}

@Test
void deleteAccount_returns409_whenUserOwnsSquad() {
    User u = userService.upsertFromGoogle("g-del-2", "del2@test.com", "Owner", "url");
    // 스쿼드 직접 생성 (SquadService 없이 Repository 사용)
    com.animesquad.squad.Squad squad = new com.animesquad.squad.Squad("테스트스쿼드", u.getId(), "TESTCODE1");
    squadRepository.save(squad);

    ResponseEntity<String> res = rest.exchange(
        url("/api/me"), HttpMethod.DELETE, new HttpEntity<>(cookieFor(u.getId())), String.class);

    assertThat(res.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
}
```

테스트 파일 상단 import에 다음 추가:

```java
import com.animesquad.squad.Squad;
import com.animesquad.squad.SquadRepository;
import com.animesquad.user.UserRepository;
```

클래스 필드에 추가:

```java
@Autowired UserRepository userRepository;
@Autowired SquadRepository squadRepository;
```

- [ ] **Step 2: Squad 생성자 확인**

`backend/src/main/java/com/animesquad/squad/Squad.java`를 읽어서 생성자 시그니처를 확인한다. `Squad(Long ownerId, String name, String inviteCode)` 형태가 없으면 Step 3 전에 Squad 파일을 먼저 읽어볼 것.

- [ ] **Step 3: 테스트 실행 — FAIL 확인**

```bash
cd backend && ./gradlew test --tests "com.animesquad.auth.AuthControllerIT.deleteAccount_*" 2>&1 | tail -20
```

Expected: 컴파일 에러 또는 테스트 실패 (엔드포인트 미구현)

- [ ] **Step 4: UserService에 deleteAccount() 추가**

`backend/src/main/java/com/animesquad/user/UserService.java`에 의존성과 메서드 추가:

```java
package com.animesquad.user;

import com.animesquad.activity.ActivityRepository;
import com.animesquad.episode.EpisodeRatingRepository;
import com.animesquad.squad.MembershipRepository;
import com.animesquad.squad.SquadRepository;
import com.animesquad.watch.WatchEntryRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class UserService {

    private final UserRepository repository;
    private final SquadRepository squadRepository;
    private final MembershipRepository membershipRepository;
    private final WatchEntryRepository watchEntryRepository;
    private final EpisodeRatingRepository episodeRatingRepository;
    private final ActivityRepository activityRepository;

    public UserService(
        UserRepository repository,
        SquadRepository squadRepository,
        MembershipRepository membershipRepository,
        WatchEntryRepository watchEntryRepository,
        EpisodeRatingRepository episodeRatingRepository,
        ActivityRepository activityRepository
    ) {
        this.repository = repository;
        this.squadRepository = squadRepository;
        this.membershipRepository = membershipRepository;
        this.watchEntryRepository = watchEntryRepository;
        this.episodeRatingRepository = episodeRatingRepository;
        this.activityRepository = activityRepository;
    }

    @Transactional
    public User upsertFromGoogle(String googleSub, String email, String displayName, String avatarUrl) {
        return repository.findByGoogleSub(googleSub)
            .orElseGet(() -> repository.save(new User(googleSub, email, displayName, avatarUrl)));
    }

    @Transactional(readOnly = true)
    public User getById(Long id) {
        return repository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("user not found: " + id));
    }

    @Transactional
    public User updateDisplayName(Long id, String displayName) {
        User user = getById(id);
        user.updateDisplayName(displayName);
        return user;
    }

    @Transactional
    public User updateAvatarUrl(Long id, String avatarUrl) {
        User user = getById(id);
        user.updateAvatarUrl(avatarUrl);
        return user;
    }

    @Transactional
    public void deleteAccount(Long userId) {
        if (squadRepository.existsByOwnerId(userId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "스쿼드를 먼저 삭제해주세요");
        }
        membershipRepository.deleteAllByUserId(userId);
        watchEntryRepository.deleteAllByUserId(userId);
        episodeRatingRepository.deleteAllByUserId(userId);
        activityRepository.deleteAllByActorId(userId);
        repository.deleteById(userId);
    }
}
```

- [ ] **Step 5: AuthController에 DELETE /api/me 추가**

`backend/src/main/java/com/animesquad/auth/AuthController.java`의 `logout()` 메서드 바로 뒤에 추가:

```java
@DeleteMapping("/me")
public ResponseEntity<Void> deleteAccount(@AuthenticationPrincipal CurrentUser current) {
    userService.deleteAccount(current.userId());
    return ResponseEntity.noContent()
        .header(HttpHeaders.SET_COOKIE, buildClearCookie())
        .build();
}
```

그리고 logout() 메서드의 쿠키 만료 문자열 생성 로직을 private 메서드로 추출:

```java
@PostMapping("/me/logout")
public ResponseEntity<Void> logout() {
    return ResponseEntity.noContent()
        .header(HttpHeaders.SET_COOKIE, buildClearCookie())
        .build();
}

private String buildClearCookie() {
    StringBuilder sb = new StringBuilder();
    sb.append(JwtAuthenticationFilter.COOKIE_NAME).append("=");
    sb.append("; Path=/");
    sb.append("; Max-Age=0");
    sb.append("; HttpOnly");
    if (cookieSecure) sb.append("; Secure");
    sb.append("; SameSite=").append(cookieSameSite);
    if (cookieDomain != null && !cookieDomain.isBlank()) {
        sb.append("; Domain=").append(cookieDomain);
    }
    return sb.toString();
}
```

- [ ] **Step 6: 테스트 실행 — PASS 확인**

```bash
cd backend && ./gradlew test --tests "com.animesquad.auth.AuthControllerIT" 2>&1 | tail -20
```

Expected: `BUILD SUCCESSFUL`, 모든 AuthControllerIT 테스트 PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/animesquad/user/UserService.java \
        backend/src/main/java/com/animesquad/auth/AuthController.java \
        backend/src/test/java/com/animesquad/auth/AuthControllerIT.java
git commit -m "feat(account-deletion): add DELETE /api/me endpoint with squad-owner guard"
```

---

### Task 3: 프론트엔드 탈퇴 버튼

**Files:**
- Modify: `frontend/src/app/profile/page.tsx`

- [ ] **Step 1: profile/page.tsx에 탈퇴 상태 및 함수 추가**

`MePage` 컴포넌트 안 `logout` 함수 바로 뒤에 다음 추가:

```typescript
const [deleteError, setDeleteError] = useState<string | null>(null);
const [deleting, setDeleting] = useState(false);

async function deleteAccount() {
  if (!confirm("정말 탈퇴할까요? 모든 기록이 삭제되며 복구할 수 없어요.")) return;
  setDeleting(true);
  setDeleteError(null);
  try {
    await apiDelete("/api/me");
    router.push("/");
  } catch (e) {
    setDeleteError(String(e));
  } finally {
    setDeleting(false);
  }
}
```

- [ ] **Step 2: 탈퇴 버튼 UI 추가**

`profile/page.tsx`의 "로그아웃" 버튼 바로 뒤에 추가:

```tsx
<button
  type="button"
  onClick={deleteAccount}
  disabled={deleting}
  className="rounded-md border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
>
  {deleting ? "탈퇴 중…" : "회원 탈퇴"}
</button>
{deleteError && (
  <p className="text-sm text-rose-600">{deleteError}</p>
)}
```

- [ ] **Step 3: TypeScript 검사**

```bash
cd frontend && npx tsc --noEmit 2>&1
```

Expected: 에러 없음

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/profile/page.tsx
git commit -m "feat(account-deletion): add 회원탈퇴 button to profile page"
```

# 다른 유저 프로필 보기 + 공개범위 설정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 다른 유저의 프로필(닉네임/아바타/최근 감상/최근 기록/소속 스쿼드)을 볼 수 있게 하고, 각 유저가 자신의 공개범위(전체공개/스쿼드멤버만/비공개)를 설정할 수 있게 한다.

**Architecture:** `User` 엔티티에 `profileVisibility` 필드를 추가하고 `PATCH /api/me`로 갱신 가능하게 한다. 신규 `GET /api/users/{id}`는 접근 가능 여부(본인/전체공개/같은 스쿼드)를 판정해 상세 데이터 또는 최소 정보만 반환한다. 프론트엔드는 신규 `/users/[id]` 페이지에서 기존 `profile/page.tsx`의 렌더링 컴포넌트를 export하여 재사용하고, 피드/스쿼드/애니 상세 페이지의 아바타·닉네임에 링크를 추가한다.

**Tech Stack:** Spring Boot 3 (Java 21) + JPA + Flyway, Next.js 14 App Router + TypeScript + Tailwind

**설계 문서 대비 보정 사항** (구현 세부 조사 중 발견):
- 스쿼드 목록을 공개 프로필에 노출할 때 `SquadResponse`를 그대로 쓰지 않는다 — `inviteCode`가 포함되어 있어 초대코드 유출로 이어지기 때문이다. 대신 `id/name/avatarUrl/memberCount`만 담은 신규 `PublicSquadRef`를 사용한다.
- `squads/[id]/page.tsx`의 `WatcherStack`(카드 우하단에 겹쳐 보이는 작은 아바타들)은 이미 다른 `<Link>`(애니 상세로 가는 카드 링크) 안에 중첩되어 있어 그 안에 또 `<Link>`를 넣으면 `<a>` 중첩이 되어 무효한 HTML이 된다. 이 아바타들은 링크 대상에서 제외하고, 같은 카드의 "N명 감상 중" / 단독 시청자 이름 텍스트(카드 링크 바깥의 별도 `<p>`)만 링크로 만든다.

---

### Task 1: 백엔드 — `profile_visibility` 마이그레이션 + `User` 엔티티

**Files:**
- Create: `backend/src/main/resources/db/migration/V16__profile_visibility.sql`
- Create: `backend/src/main/java/com/animesquad/user/ProfileVisibility.java`
- Modify: `backend/src/main/java/com/animesquad/user/User.java`

- [ ] **Step 1: 마이그레이션 작성**

`backend/src/main/resources/db/migration/V16__profile_visibility.sql` 신규 생성:

```sql
ALTER TABLE users ADD COLUMN profile_visibility VARCHAR(20) NOT NULL DEFAULT 'SQUAD_ONLY';
```

- [ ] **Step 2: `ProfileVisibility` enum 작성**

`backend/src/main/java/com/animesquad/user/ProfileVisibility.java` 신규 생성:

```java
package com.animesquad.user;

public enum ProfileVisibility {
    PUBLIC, SQUAD_ONLY, PRIVATE
}
```

- [ ] **Step 3: `User` 엔티티에 필드 추가**

`backend/src/main/java/com/animesquad/user/User.java`의 기존 필드 선언부:

```java
    @Column(name = "terms_agreed_at")
    private OffsetDateTime termsAgreedAt;

    protected User() {}
```

교체:

```java
    @Column(name = "terms_agreed_at")
    private OffsetDateTime termsAgreedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "profile_visibility", nullable = false, length = 20)
    private ProfileVisibility profileVisibility = ProfileVisibility.SQUAD_ONLY;

    protected User() {}
```

같은 파일의 `updateAvatarUrl` 메서드 바로 아래에 갱신 메서드 추가:

```java
    public void updateAvatarUrl(String avatarUrl) {
        this.avatarUrl = avatarUrl;
    }

    public void updateProfileVisibility(ProfileVisibility profileVisibility) {
        this.profileVisibility = profileVisibility;
    }
```

같은 파일의 getter 목록 마지막 줄:

```java
    public OffsetDateTime getTermsAgreedAt() { return termsAgreedAt; }
```

바로 아래에 추가:

```java
    public OffsetDateTime getTermsAgreedAt() { return termsAgreedAt; }
    public ProfileVisibility getProfileVisibility() { return profileVisibility; }
```

- [ ] **Step 4: 컴파일 확인**

Run: `cd backend && ./gradlew compileJava`
Expected: BUILD SUCCESSFUL

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/resources/db/migration/V16__profile_visibility.sql \
        backend/src/main/java/com/animesquad/user/ProfileVisibility.java \
        backend/src/main/java/com/animesquad/user/User.java
git commit -m "feat(user): profile_visibility 컬럼과 엔티티 필드 추가"
```

---

### Task 2: 백엔드 — `/api/me`에서 공개범위 조회/수정

**Files:**
- Modify: `backend/src/main/java/com/animesquad/user/UserService.java`
- Modify: `backend/src/main/java/com/animesquad/auth/AuthController.java`
- Test: `backend/src/test/java/com/animesquad/auth/AuthControllerIT.java`

- [ ] **Step 1: 실패하는 테스트 추가**

`backend/src/test/java/com/animesquad/auth/AuthControllerIT.java`의 마지막 테스트(`me_includesOnboardingComplete`) 바로 아래, 클래스 닫는 `}` 위에 추가:

```java
    @Test
    void me_defaultsToSquadOnlyVisibility() {
        User u = userService.upsertFromGoogle("g-vis-1", "vis1@test.com", "V1", null);

        ResponseEntity<String> res = rest.exchange(
            url("/api/me"), HttpMethod.GET, new HttpEntity<>(cookieFor(u.getId())), String.class);

        assertThat(res.getBody()).contains("\"profileVisibility\":\"SQUAD_ONLY\"");
    }

    @Test
    void updateProfile_changesVisibility() {
        User u = userService.upsertFromGoogle("g-vis-2", "vis2@test.com", "V2", null);

        HttpHeaders h = cookieFor(u.getId());
        h.setContentType(MediaType.APPLICATION_JSON);
        ResponseEntity<String> res = rest.exchange(
            url("/api/me"), HttpMethod.PATCH,
            new HttpEntity<>(Map.of("displayName", "V2", "profileVisibility", "PUBLIC"), h), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).contains("\"profileVisibility\":\"PUBLIC\"");
    }
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd backend && ./gradlew test --tests "com.animesquad.auth.AuthControllerIT"`
Expected: `me_defaultsToSquadOnlyVisibility`, `updateProfile_changesVisibility` 둘 다 FAIL (`MeResponse`에 `profileVisibility` 필드가 아직 없어서 JSON에 안 나옴)

- [ ] **Step 3: `UserService`에 갱신 메서드 추가**

`backend/src/main/java/com/animesquad/user/UserService.java`의 `updateAvatarUrl` 메서드 바로 아래에 추가:

```java
    @Transactional
    public User updateAvatarUrl(Long id, String avatarUrl) {
        User user = getById(id);
        user.updateAvatarUrl(avatarUrl);
        return user;
    }

    @Transactional
    public User updateProfileVisibility(Long id, ProfileVisibility visibility) {
        User user = getById(id);
        user.updateProfileVisibility(visibility);
        return user;
    }
```

- [ ] **Step 4: `AuthController` 확장**

`backend/src/main/java/com/animesquad/auth/AuthController.java`에서 import 블록에 추가:

```java
import com.animesquad.user.ProfileVisibility;
```

`MeResponse`와 `UpdateProfileRequest` 레코드:

```java
    public record MeResponse(Long id, String email, String displayName, String avatarUrl, boolean isAdmin, boolean onboardingComplete) {}

    public record UpdateProfileRequest(String displayName) {}
```

교체:

```java
    public record MeResponse(Long id, String email, String displayName, String avatarUrl, boolean isAdmin, boolean onboardingComplete, ProfileVisibility profileVisibility) {}

    public record UpdateProfileRequest(String displayName, ProfileVisibility profileVisibility) {}
```

`updateProfile` 메서드:

```java
    @PatchMapping("/me")
    public ResponseEntity<MeResponse> updateProfile(
        @AuthenticationPrincipal CurrentUser current,
        @RequestBody UpdateProfileRequest body
    ) {
        String name = body.displayName() == null ? "" : body.displayName().trim();
        if (name.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "닉네임을 입력해주세요");
        }
        if (name.length() > 50) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "닉네임은 50자 이하여야 해요");
        }
        return ResponseEntity.ok(toResponse(userService.updateDisplayName(current.userId(), name)));
    }
```

교체:

```java
    @PatchMapping("/me")
    public ResponseEntity<MeResponse> updateProfile(
        @AuthenticationPrincipal CurrentUser current,
        @RequestBody UpdateProfileRequest body
    ) {
        String name = body.displayName() == null ? "" : body.displayName().trim();
        if (name.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "닉네임을 입력해주세요");
        }
        if (name.length() > 50) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "닉네임은 50자 이하여야 해요");
        }
        User updated = userService.updateDisplayName(current.userId(), name);
        if (body.profileVisibility() != null) {
            updated = userService.updateProfileVisibility(current.userId(), body.profileVisibility());
        }
        return ResponseEntity.ok(toResponse(updated));
    }
```

`toResponse` 메서드:

```java
    private MeResponse toResponse(User u) {
        boolean isAdmin = adminProperties.isAdminEmail(u.getEmail());
        boolean onboardingComplete = u.getTermsAgreedAt() != null;
        return new MeResponse(u.getId(), u.getEmail(), u.getDisplayName(), u.getAvatarUrl(), isAdmin, onboardingComplete);
    }
```

교체:

```java
    private MeResponse toResponse(User u) {
        boolean isAdmin = adminProperties.isAdminEmail(u.getEmail());
        boolean onboardingComplete = u.getTermsAgreedAt() != null;
        return new MeResponse(u.getId(), u.getEmail(), u.getDisplayName(), u.getAvatarUrl(), isAdmin, onboardingComplete, u.getProfileVisibility());
    }
```

- [ ] **Step 5: 테스트 실행해서 통과 확인**

Run: `cd backend && ./gradlew test --tests "com.animesquad.auth.AuthControllerIT"`
Expected: PASS (전체)

- [ ] **Step 6: 커밋**

```bash
git add backend/src/main/java/com/animesquad/user/UserService.java \
        backend/src/main/java/com/animesquad/auth/AuthController.java \
        backend/src/test/java/com/animesquad/auth/AuthControllerIT.java
git commit -m "feat(auth): /api/me에서 공개범위 조회/수정 지원"
```

---

### Task 3: 백엔드 — `GET /api/users/{id}` (다른 유저 프로필 조회)

**Files:**
- Create: `backend/src/main/java/com/animesquad/user/dto/PublicSquadRef.java`
- Create: `backend/src/main/java/com/animesquad/user/dto/UserProfileResponse.java`
- Create: `backend/src/main/java/com/animesquad/user/UserProfileService.java`
- Create: `backend/src/main/java/com/animesquad/user/UserProfileController.java`
- Test: `backend/src/test/java/com/animesquad/user/UserProfileControllerIT.java`

- [ ] **Step 1: DTO 작성**

`backend/src/main/java/com/animesquad/user/dto/PublicSquadRef.java` 신규 생성:

```java
package com.animesquad.user.dto;

public record PublicSquadRef(
    Long id,
    String name,
    String avatarUrl,
    long memberCount
) {}
```

`backend/src/main/java/com/animesquad/user/dto/UserProfileResponse.java` 신규 생성:

```java
package com.animesquad.user.dto;

import com.animesquad.episode.MyEpisodeReviewController.MyEpisodeReview;
import com.animesquad.watch.dto.WatchEntryResponse;

import java.util.List;

public record UserProfileResponse(
    Long id,
    String displayName,
    String avatarUrl,
    boolean accessible,
    List<WatchEntryResponse> recentWatched,
    List<MyEpisodeReview> recentEpisodeReviews,
    List<PublicSquadRef> squads
) {}
```

- [ ] **Step 2: 실패하는 통합 테스트 작성**

`backend/src/test/java/com/animesquad/user/UserProfileControllerIT.java` 신규 생성:

```java
package com.animesquad.user;

import com.animesquad.anime.AniListClient;
import com.animesquad.anime.AniListMedia;
import com.animesquad.anime.Anime;
import com.animesquad.anime.AnimeService;
import com.animesquad.auth.JwtAuthenticationFilter;
import com.animesquad.auth.JwtService;
import com.animesquad.squad.Membership;
import com.animesquad.squad.MembershipRepository;
import com.animesquad.squad.MembershipRole;
import com.animesquad.squad.Squad;
import com.animesquad.squad.SquadRepository;
import com.animesquad.support.AbstractIntegrationTest;
import com.animesquad.watch.WatchService;
import com.animesquad.watch.WatchStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.*;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class UserProfileControllerIT extends AbstractIntegrationTest {

    @Autowired UserService userService;
    @Autowired AnimeService animeService;
    @Autowired WatchService watchService;
    @Autowired JwtService jwtService;
    @Autowired TestRestTemplate rest;
    @Autowired SquadRepository squadRepository;
    @Autowired MembershipRepository membershipRepository;
    @LocalServerPort int port;

    @MockBean AniListClient aniList;

    private HttpHeaders cookieFor(Long userId) {
        HttpHeaders h = new HttpHeaders();
        h.add(HttpHeaders.COOKIE,
            JwtAuthenticationFilter.COOKIE_NAME + "=" + jwtService.issue(userId));
        h.setContentType(MediaType.APPLICATION_JSON);
        return h;
    }

    private String url(String path) { return "http://localhost:" + port + path; }

    @Test
    void get_returns404_whenUserNotFound() {
        User viewer = userService.upsertFromGoogle("g-up1", "up1@x.y", "Viewer1", null);

        ResponseEntity<String> res = rest.exchange(
            url("/api/users/999999"), HttpMethod.GET,
            new HttpEntity<>(cookieFor(viewer.getId())), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void get_returns401_whenUnauthenticated() {
        User target = userService.upsertFromGoogle("g-up2", "up2@x.y", "Target2", null);

        ResponseEntity<String> res = rest.getForEntity(url("/api/users/" + target.getId()), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void get_isAccessible_whenSelf() {
        User u = userService.upsertFromGoogle("g-up3", "up3@x.y", "Self3", null);
        userService.updateProfileVisibility(u.getId(), ProfileVisibility.PRIVATE);

        ResponseEntity<String> res = rest.exchange(
            url("/api/users/" + u.getId()), HttpMethod.GET,
            new HttpEntity<>(cookieFor(u.getId())), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).contains("\"accessible\":true");
    }

    @Test
    void get_isAccessible_whenTargetIsPublic() {
        User viewer = userService.upsertFromGoogle("g-up4a", "up4a@x.y", "Viewer4", null);
        User target = userService.upsertFromGoogle("g-up4b", "up4b@x.y", "Target4", null);
        userService.updateProfileVisibility(target.getId(), ProfileVisibility.PUBLIC);

        ResponseEntity<String> res = rest.exchange(
            url("/api/users/" + target.getId()), HttpMethod.GET,
            new HttpEntity<>(cookieFor(viewer.getId())), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).contains("\"accessible\":true");
    }

    @Test
    void get_isNotAccessible_whenTargetIsPrivate() {
        User viewer = userService.upsertFromGoogle("g-up5a", "up5a@x.y", "Viewer5", null);
        User target = userService.upsertFromGoogle("g-up5b", "up5b@x.y", "Target5", null);
        userService.updateProfileVisibility(target.getId(), ProfileVisibility.PRIVATE);

        ResponseEntity<String> res = rest.exchange(
            url("/api/users/" + target.getId()), HttpMethod.GET,
            new HttpEntity<>(cookieFor(viewer.getId())), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).contains("\"accessible\":false");
        assertThat(res.getBody()).contains("\"recentWatched\":null");
        assertThat(res.getBody()).contains("\"squads\":null");
    }

    @Test
    void get_isAccessible_whenSquadOnlyAndSharesSquad() {
        User viewer = userService.upsertFromGoogle("g-up6a", "up6a@x.y", "Viewer6", null);
        User target = userService.upsertFromGoogle("g-up6b", "up6b@x.y", "Target6", null);
        userService.updateProfileVisibility(target.getId(), ProfileVisibility.SQUAD_ONLY);

        Squad squad = squadRepository.save(new Squad("공유스쿼드", viewer.getId(), "SHARE0001"));
        membershipRepository.save(new Membership(viewer.getId(), squad.getId(), MembershipRole.OWNER));
        membershipRepository.save(new Membership(target.getId(), squad.getId(), MembershipRole.MEMBER));

        ResponseEntity<String> res = rest.exchange(
            url("/api/users/" + target.getId()), HttpMethod.GET,
            new HttpEntity<>(cookieFor(viewer.getId())), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).contains("\"accessible\":true");
    }

    @Test
    void get_isNotAccessible_whenSquadOnlyAndNoSharedSquad() {
        User viewer = userService.upsertFromGoogle("g-up7a", "up7a@x.y", "Viewer7", null);
        User target = userService.upsertFromGoogle("g-up7b", "up7b@x.y", "Target7", null);
        userService.updateProfileVisibility(target.getId(), ProfileVisibility.SQUAD_ONLY);

        ResponseEntity<String> res = rest.exchange(
            url("/api/users/" + target.getId()), HttpMethod.GET,
            new HttpEntity<>(cookieFor(viewer.getId())), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).contains("\"accessible\":false");
    }

    @Test
    void get_includesRecentWatchedAndSquads_whenAccessible() {
        User viewer = userService.upsertFromGoogle("g-up8a", "up8a@x.y", "Viewer8", null);
        User target = userService.upsertFromGoogle("g-up8b", "up8b@x.y", "Target8", null);
        userService.updateProfileVisibility(target.getId(), ProfileVisibility.PUBLIC);

        Anime a = animeService.upsertFromAniList(new AniListMedia(
            8001, "R", "N", "E", "img", 12, "FINISHED", "TV", 2024, null, null));
        watchService.addToList(target.getId(), 8001, WatchStatus.COMPLETED);

        Squad squad = squadRepository.save(new Squad("타겟스쿼드", target.getId(), "TARGET001"));
        membershipRepository.save(new Membership(target.getId(), squad.getId(), MembershipRole.OWNER));

        ResponseEntity<String> res = rest.exchange(
            url("/api/users/" + target.getId()), HttpMethod.GET,
            new HttpEntity<>(cookieFor(viewer.getId())), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).contains("\"accessible\":true");
        assertThat(res.getBody()).contains("\"name\":\"타겟스쿼드\"");
        assertThat(res.getBody()).doesNotContain("TARGET001");
    }
}
```

- [ ] **Step 3: 테스트 실행해서 실패 확인**

Run: `cd backend && ./gradlew test --tests "com.animesquad.user.UserProfileControllerIT"`
Expected: 전부 FAIL (컴파일 에러 — `UserProfileService`/`UserProfileController`가 아직 없음)

- [ ] **Step 4: `UserProfileService` 작성**

`backend/src/main/java/com/animesquad/user/UserProfileService.java` 신규 생성:

```java
package com.animesquad.user;

import com.animesquad.activity.dto.AnimeRef;
import com.animesquad.anime.Anime;
import com.animesquad.anime.AnimeRepository;
import com.animesquad.episode.EpisodeRating;
import com.animesquad.episode.EpisodeRatingRepository;
import com.animesquad.episode.MyEpisodeReviewController.MyEpisodeReview;
import com.animesquad.squad.Membership;
import com.animesquad.squad.MembershipRepository;
import com.animesquad.squad.Squad;
import com.animesquad.squad.SquadRepository;
import com.animesquad.user.dto.PublicSquadRef;
import com.animesquad.user.dto.UserProfileResponse;
import com.animesquad.watch.WatchEntry;
import com.animesquad.watch.WatchEntryRepository;
import com.animesquad.watch.dto.WatchEntryResponse;
import org.springframework.data.domain.Limit;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class UserProfileService {

    private final UserRepository users;
    private final WatchEntryRepository watchEntries;
    private final AnimeRepository animes;
    private final EpisodeRatingRepository episodeRatings;
    private final MembershipRepository memberships;
    private final SquadRepository squads;

    public UserProfileService(
        UserRepository users,
        WatchEntryRepository watchEntries,
        AnimeRepository animes,
        EpisodeRatingRepository episodeRatings,
        MembershipRepository memberships,
        SquadRepository squads
    ) {
        this.users = users;
        this.watchEntries = watchEntries;
        this.animes = animes;
        this.episodeRatings = episodeRatings;
        this.memberships = memberships;
        this.squads = squads;
    }

    @Transactional(readOnly = true)
    public UserProfileResponse getProfile(Long viewerId, Long targetId) {
        User target = users.findById(targetId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "user not found"));

        boolean isSelf = viewerId.equals(targetId);
        boolean accessible = isSelf
            || target.getProfileVisibility() == ProfileVisibility.PUBLIC
            || (target.getProfileVisibility() == ProfileVisibility.SQUAD_ONLY && sharesSquad(viewerId, targetId));

        if (!accessible) {
            return new UserProfileResponse(
                target.getId(), target.getDisplayName(), target.getAvatarUrl(), false, null, null, null);
        }

        return new UserProfileResponse(
            target.getId(), target.getDisplayName(), target.getAvatarUrl(), true,
            buildRecentWatched(targetId), buildRecentEpisodeReviews(targetId), buildSquads(targetId));
    }

    private boolean sharesSquad(Long viewerId, Long targetId) {
        Set<Long> viewerSquadIds = memberships.findAllByUserId(viewerId).stream()
            .map(Membership::getSquadId).collect(Collectors.toSet());
        return memberships.findAllByUserId(targetId).stream()
            .anyMatch(m -> viewerSquadIds.contains(m.getSquadId()));
    }

    private List<WatchEntryResponse> buildRecentWatched(Long userId) {
        List<WatchEntry> entries = watchEntries.findAllByUserIdOrderByUpdatedAtDesc(userId);
        Map<Long, Anime> animeById = animes.findAllById(
            entries.stream().map(WatchEntry::getAnimeId).distinct().toList()
        ).stream().collect(Collectors.toMap(Anime::getId, a -> a));
        return entries.stream()
            .map(e -> WatchEntryResponse.from(e, animeById.get(e.getAnimeId())))
            .toList();
    }

    private List<MyEpisodeReview> buildRecentEpisodeReviews(Long userId) {
        List<EpisodeRating> rows = episodeRatings.findAllByUserIdOrderByUpdatedAtDesc(userId, Limit.of(500));
        if (rows.isEmpty()) return List.of();
        Map<Long, Anime> animeById = animes.findAllById(
            rows.stream().map(EpisodeRating::getAnimeId).distinct().toList()
        ).stream().collect(Collectors.toMap(Anime::getId, a -> a));
        return rows.stream().map(r -> {
            Anime a = animeById.get(r.getAnimeId());
            return new MyEpisodeReview(
                r.getId(),
                a == null ? null : AnimeRef.from(a),
                r.getEpisodeNumber(),
                r.getScore(),
                r.getComment(),
                r.getUpdatedAt()
            );
        }).toList();
    }

    private List<PublicSquadRef> buildSquads(Long userId) {
        List<Long> squadIds = memberships.findAllByUserId(userId).stream()
            .map(Membership::getSquadId).toList();
        return squads.findAllById(squadIds).stream()
            .map(s -> new PublicSquadRef(s.getId(), s.getName(), s.getAvatarUrl(), memberships.countBySquadId(s.getId())))
            .toList();
    }
}
```

- [ ] **Step 5: `UserProfileController` 작성**

`backend/src/main/java/com/animesquad/user/UserProfileController.java` 신규 생성:

```java
package com.animesquad.user;

import com.animesquad.auth.CurrentUser;
import com.animesquad.user.dto.UserProfileResponse;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users")
public class UserProfileController {

    private final UserProfileService service;

    public UserProfileController(UserProfileService service) {
        this.service = service;
    }

    @GetMapping("/{id}")
    public UserProfileResponse get(
        @AuthenticationPrincipal CurrentUser me,
        @PathVariable Long id
    ) {
        return service.getProfile(me.userId(), id);
    }
}
```

- [ ] **Step 6: 테스트 실행해서 통과 확인**

Run: `cd backend && ./gradlew test --tests "com.animesquad.user.UserProfileControllerIT"`
Expected: PASS (8 tests)

- [ ] **Step 7: 커밋**

```bash
git add backend/src/main/java/com/animesquad/user/dto/PublicSquadRef.java \
        backend/src/main/java/com/animesquad/user/dto/UserProfileResponse.java \
        backend/src/main/java/com/animesquad/user/UserProfileService.java \
        backend/src/main/java/com/animesquad/user/UserProfileController.java \
        backend/src/test/java/com/animesquad/user/UserProfileControllerIT.java
git commit -m "feat(user): GET /api/users/{id} 다른 유저 프로필 조회 엔드포인트 추가"
```

---

### Task 4: 프론트엔드 — API 타입 추가

**Files:**
- Modify: `frontend/src/app/lib/api.ts`

- [ ] **Step 1: `Me` 타입에 `profileVisibility` 추가**

`frontend/src/app/lib/api.ts`의 `Me` 타입:

```ts
export type Me = {
  id: number;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  onboardingComplete: boolean;
};
```

교체:

```ts
export type Me = {
  id: number;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  onboardingComplete: boolean;
  profileVisibility: "PUBLIC" | "SQUAD_ONLY" | "PRIVATE";
};
```

- [ ] **Step 2: `PublicSquadRef`, `UserProfile` 타입 추가**

`frontend/src/app/lib/api.ts`의 `AnimeStats` 타입 바로 아래에 추가:

```ts
export type AnimeStats = {
  averageScore: number | null;
  watcherCount: number;
};

export type PublicSquadRef = {
  id: number;
  name: string;
  avatarUrl: string | null;
  memberCount: number;
};

export type UserProfile = {
  id: number;
  displayName: string;
  avatarUrl: string | null;
  accessible: boolean;
  recentWatched: WatchEntry[] | null;
  recentEpisodeReviews: MyEpisodeReview[] | null;
  squads: PublicSquadRef[] | null;
};
```

- [ ] **Step 3: 타입체크**

Run: `cd frontend && npx tsc --noEmit -p .`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/app/lib/api.ts
git commit -m "feat(api): Me.profileVisibility, UserProfile, PublicSquadRef 타입 추가"
```

---

### Task 5: 프론트엔드 — `profile/page.tsx`의 렌더링 컴포넌트를 재사용 가능하게 export

**Files:**
- Modify: `frontend/src/app/profile/page.tsx`

- [ ] **Step 1: `RecentWatchedGrid`, `RecentComment`, `RecentCommentList`에 `export` 추가**

`frontend/src/app/profile/page.tsx`에서:

```ts
function RecentWatchedGrid({ entries }: { entries: WatchEntry[] | null }) {
```

교체:

```ts
export function RecentWatchedGrid({ entries }: { entries: WatchEntry[] | null }) {
```

같은 파일에서:

```ts
type RecentComment = {
  key: string;
  animeId: number;
  title: string;
  episodeNumber: number | null;
  score: number | null;
  comment: string;
  updatedAt: string;
};

function RecentCommentList({ items }: { items: RecentComment[] | null }) {
```

교체:

```ts
export type RecentComment = {
  key: string;
  animeId: number;
  title: string;
  episodeNumber: number | null;
  score: number | null;
  comment: string;
  updatedAt: string;
};

export function RecentCommentList({ items }: { items: RecentComment[] | null }) {
```

- [ ] **Step 2: `MySquadList`를 export하고 invite code가 없는 데이터도 받을 수 있게 프롭 타입 완화**

`frontend/src/app/profile/page.tsx`에서:

```ts
function MySquadList({ squads }: { squads: Squad[] | null }) {
```

교체:

```ts
type SquadCardData = {
  id: number;
  name: string;
  avatarUrl: string | null;
  memberCount: number;
  inviteCode?: string;
};

export function MySquadList({ squads }: { squads: SquadCardData[] | null }) {
```

같은 함수 안, 초대코드를 보여주는 부분:

```tsx
            <p className="mt-0.5 text-xs text-neutral-500">멤버 {s.memberCount}명</p>
            <p className="mt-0.5 text-xs text-neutral-500">
              스쿼드 코드 <code className="font-mono text-neutral-700">{s.inviteCode}</code>
            </p>
```

교체:

```tsx
            <p className="mt-0.5 text-xs text-neutral-500">멤버 {s.memberCount}명</p>
            {s.inviteCode && (
              <p className="mt-0.5 text-xs text-neutral-500">
                스쿼드 코드 <code className="font-mono text-neutral-700">{s.inviteCode}</code>
              </p>
            )}
```

- [ ] **Step 3: 타입체크**

Run: `cd frontend && npx tsc --noEmit -p .`
Expected: 에러 없음 (본인 프로필 페이지에서 `squads={squads}`로 넘기던 `Squad[] | null`이 `SquadCardData[] | null`에 구조적으로 호환됨 — `inviteCode: string`은 `inviteCode?: string`을 만족)

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/app/profile/page.tsx
git commit -m "refactor(profile): 최근 감상/최근 기록/소속 스쿼드 컴포넌트를 export하여 재사용 가능하게 함"
```

---

### Task 6: 프론트엔드 — 다른 유저 프로필 페이지 (`/users/[id]`)

**Files:**
- Create: `frontend/src/app/users/[id]/page.tsx`

- [ ] **Step 1: 페이지 작성**

`frontend/src/app/users/[id]/page.tsx` 신규 생성:

```tsx
"use client";

import { useEffect, useState } from "react";
import { apiGet, type UserProfile } from "@/app/lib/api";
import { displayTitle } from "@/app/lib/anilist-labels";
import {
  RecentWatchedGrid, RecentCommentList, MySquadList, type RecentComment,
} from "@/app/profile/page";

export default function UserProfilePage({ params }: { params: { id: string } }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<UserProfile>(`/api/users/${params.id}`).then(setProfile).catch((e) => setError(String(e)));
  }, [params.id]);

  if (error) {
    return (
      <p className="text-sm text-neutral-600">
        로그인이 필요해요.{" "}
        <a className="underline underline-offset-2 hover:text-neutral-900" href="/">
          홈으로
        </a>
      </p>
    );
  }
  if (!profile) return <p className="text-sm text-neutral-500">불러오는 중…</p>;

  if (!profile.accessible) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-neutral-200 p-10 text-center">
        {profile.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <div className="h-16 w-16 rounded-full bg-neutral-200" />
        )}
        <h1 className="text-lg font-semibold">{profile.displayName}</h1>
        <p className="text-sm text-neutral-500">비공개 프로필이에요.</p>
      </div>
    );
  }

  const recentWatched = (profile.recentWatched ?? [])
    .filter((e) => e.status !== "PLAN_TO_WATCH")
    .slice(0, 6);

  const recentComments: RecentComment[] = [
    ...(profile.recentWatched ?? [])
      .filter((e) => e.comment)
      .map((e) => ({
        key: `w${e.id}`,
        animeId: e.anime.id,
        title: displayTitle(e.anime),
        episodeNumber: null as number | null,
        score: e.score,
        comment: e.comment!,
        updatedAt: e.updatedAt,
      })),
    ...(profile.recentEpisodeReviews ?? [])
      .filter((r) => r.anime && r.comment)
      .map((r) => ({
        key: `e${r.id}`,
        animeId: r.anime!.id,
        title: displayTitle(r.anime!),
        episodeNumber: r.episodeNumber as number | null,
        score: r.score as number | null,
        comment: r.comment!,
        updatedAt: r.updatedAt,
      })),
  ]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 4);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 rounded-xl border border-neutral-200 p-6">
        {profile.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <div className="h-16 w-16 rounded-full bg-neutral-200" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">{profile.displayName}</h1>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-8">
          <section className="min-w-0">
            <h2 className="mb-3 text-sm font-semibold text-neutral-700">최근 감상</h2>
            <RecentWatchedGrid entries={recentWatched} />
          </section>

          <section className="min-w-0">
            <h2 className="mb-3 text-sm font-semibold text-neutral-700">최근 기록</h2>
            <RecentCommentList items={recentComments} />
          </section>
        </div>

        <section className="min-w-0">
          <h2 className="mb-3 text-sm font-semibold text-neutral-700">소속 스쿼드</h2>
          <MySquadList squads={profile.squads} />
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `cd frontend && npx tsc --noEmit -p .`
Expected: 에러 없음

- [ ] **Step 3: 브라우저로 확인**

`http://localhost:3000/users/1` 접속해서 로그인 안 된 상태면 "로그인이 필요해요"가 뜨는지, 로그인된 상태에서 존재하지 않는 id(`/users/999999`)면 에러 처리가 깨지지 않는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/app/users/\[id\]/page.tsx
git commit -m "feat(users): 다른 유저 프로필 조회 페이지 추가"
```

---

### Task 7: 프론트엔드 — 아바타/닉네임에 프로필 링크 추가

**Files:**
- Modify: `frontend/src/app/components/Timeline.tsx`
- Modify: `frontend/src/app/anime/[id]/page.tsx`
- Modify: `frontend/src/app/squads/[id]/page.tsx`

- [ ] **Step 1: `Timeline.tsx` — 피드 아이템 아바타/이름 링크화**

`frontend/src/app/components/Timeline.tsx`에서:

```tsx
    <li className="flex gap-3 px-4 py-4 transition hover:bg-neutral-50">
      <Avatar name={name} url={item.actor?.avatarUrl ?? null} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
          {showSquad && item.squad && (
            <Link
              href={`/squads/${item.squad.id}`}
              className="rounded-full bg-neutral-700 px-2 py-0.5 text-xs text-white hover:bg-neutral-600"
            >
              {item.squad.name}
            </Link>
          )}
          <span className="font-semibold text-neutral-900">{name}</span>
          <span className="text-xs text-neutral-500">{relativeTime(item.createdAt)}</span>
        </div>
```

교체:

```tsx
    <li className="flex gap-3 px-4 py-4 transition hover:bg-neutral-50">
      {item.actor ? (
        <Link href={`/users/${item.actor.id}`} className="flex-none">
          <Avatar name={name} url={item.actor.avatarUrl} />
        </Link>
      ) : (
        <Avatar name={name} url={null} />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
          {showSquad && item.squad && (
            <Link
              href={`/squads/${item.squad.id}`}
              className="rounded-full bg-neutral-700 px-2 py-0.5 text-xs text-white hover:bg-neutral-600"
            >
              {item.squad.name}
            </Link>
          )}
          {item.actor ? (
            <Link href={`/users/${item.actor.id}`} className="font-semibold text-neutral-900 hover:underline">
              {name}
            </Link>
          ) : (
            <span className="font-semibold text-neutral-900">{name}</span>
          )}
          <span className="text-xs text-neutral-500">{relativeTime(item.createdAt)}</span>
        </div>
```

- [ ] **Step 2: `anime/[id]/page.tsx` — 시리즈 리뷰 목록 아바타/이름 링크화**

`frontend/src/app/anime/[id]/page.tsx`에서 (시리즈 리뷰 `<ul>` 안):

```tsx
            <li key={i} className="flex items-start gap-3 rounded-lg border border-neutral-200 p-3">
              <Avatar name={r.actor?.displayName ?? "?"} url={r.actor?.avatarUrl ?? null} size={8} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{r.actor?.displayName ?? "알 수 없음"}</span>
```

교체:

```tsx
            <li key={i} className="flex items-start gap-3 rounded-lg border border-neutral-200 p-3">
              {r.actor ? (
                <Link href={`/users/${r.actor.id}`} className="flex-none">
                  <Avatar name={r.actor.displayName} url={r.actor.avatarUrl} size={8} />
                </Link>
              ) : (
                <Avatar name="?" url={null} size={8} />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm">
                  {r.actor ? (
                    <Link href={`/users/${r.actor.id}`} className="font-medium hover:underline">
                      {r.actor.displayName}
                    </Link>
                  ) : (
                    <span className="font-medium">알 수 없음</span>
                  )}
```

- [ ] **Step 3: `anime/[id]/page.tsx` — 회차 리뷰 카드 아바타/이름 링크화**

같은 파일, 회차 리뷰 카드 부분:

```tsx
    <li className="flex items-start gap-3 rounded-lg border border-neutral-200 p-3">
      <Avatar name={review.actor?.displayName ?? "?"} url={review.actor?.avatarUrl ?? null} size={8} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">{review.actor?.displayName ?? "알 수 없음"}</span>
```

교체:

```tsx
    <li className="flex items-start gap-3 rounded-lg border border-neutral-200 p-3">
      {review.actor ? (
        <Link href={`/users/${review.actor.id}`} className="flex-none">
          <Avatar name={review.actor.displayName} url={review.actor.avatarUrl} size={8} />
        </Link>
      ) : (
        <Avatar name="?" url={null} size={8} />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm">
          {review.actor ? (
            <Link href={`/users/${review.actor.id}`} className="font-medium hover:underline">
              {review.actor.displayName}
            </Link>
          ) : (
            <span className="font-medium">알 수 없음</span>
          )}
```

- [ ] **Step 4: `squads/[id]/page.tsx` — 단독 시청자 이름 링크화**

`frontend/src/app/squads/[id]/page.tsx`에서 (`WatcherStack` 자체는 이미 다른 `<Link>` 안에 중첩되어 있어 건드리지 않는다 — 카드 하단의 별도 텍스트만 수정):

```tsx
      <p className="mt-0.5 truncate text-xs text-neutral-400">
        {watchers.length > 1
          ? `${watchers.length}명 감상 중`
          : lead.actor?.displayName}
      </p>
```

교체:

```tsx
      <p className="mt-0.5 truncate text-xs text-neutral-400">
        {watchers.length > 1 ? (
          `${watchers.length}명 감상 중`
        ) : lead.actor ? (
          <Link href={`/users/${lead.actor.id}`} className="hover:underline">
            {lead.actor.displayName}
          </Link>
        ) : null}
      </p>
```

- [ ] **Step 5: 타입체크**

Run: `cd frontend && npx tsc --noEmit -p .`
Expected: 에러 없음

- [ ] **Step 6: 브라우저로 확인**

홈 피드, 애니 상세 페이지의 리뷰 목록, 스쿼드 상세 페이지의 최근 감상 카드에서 이름/아바타 클릭 시 `/users/{id}`로 이동하는지 확인. 클릭 시 페이지 이동만 되고 콘솔 에러가 없는지 확인.

- [ ] **Step 7: 커밋**

```bash
git add frontend/src/app/components/Timeline.tsx \
        frontend/src/app/anime/\[id\]/page.tsx \
        frontend/src/app/squads/\[id\]/page.tsx
git commit -m "feat(users): 피드/애니 상세/스쿼드 상세의 아바타·닉네임에 프로필 링크 추가"
```

---

### Task 8: 프론트엔드 — 프로필 수정 화면에 공개범위 설정 추가

**Files:**
- Modify: `frontend/src/app/profile/page.tsx`

- [ ] **Step 1: `ProfileEditor`에 공개범위 상태 추가**

`frontend/src/app/profile/page.tsx`의 `ProfileEditor` 함수 상단:

```tsx
  const [displayName, setDisplayName] = useState(me.displayName);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
```

교체:

```tsx
  const [displayName, setDisplayName] = useState(me.displayName);
  const [visibility, setVisibility] = useState<Me["profileVisibility"]>(me.profileVisibility);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
```

- [ ] **Step 2: `save()`에서 공개범위도 함께 전송**

같은 파일의 `save` 함수:

```tsx
  async function save() {
    const name = displayName.trim();
    if (!name) {
      setError("닉네임을 입력해주세요");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let updated: Me | null = null;
      if (name !== me.displayName) {
        updated = await apiPatch<Me>("/api/me", { displayName: name });
      }
      if (file) {
        updated = await apiUpload<Me>("/api/me/avatar", file);
      }
      onSaved(updated ?? me);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }
```

교체:

```tsx
  async function save() {
    const name = displayName.trim();
    if (!name) {
      setError("닉네임을 입력해주세요");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let updated: Me | null = null;
      if (name !== me.displayName || visibility !== me.profileVisibility) {
        updated = await apiPatch<Me>("/api/me", { displayName: name, profileVisibility: visibility });
      }
      if (file) {
        updated = await apiUpload<Me>("/api/me/avatar", file);
      }
      onSaved(updated ?? me);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }
```

- [ ] **Step 3: 공개범위 라디오 UI 추가**

같은 파일, 닉네임 입력 필드 바로 아래:

```tsx
      <label className="block">
        <span className="text-xs font-medium text-neutral-600">닉네임</span>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={50}
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
        />
      </label>

      {error && (
```

교체:

```tsx
      <label className="block">
        <span className="text-xs font-medium text-neutral-600">닉네임</span>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={50}
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
        />
      </label>

      <div>
        <span className="text-xs font-medium text-neutral-600">공개범위</span>
        <div className="mt-1.5 space-y-1.5">
          {(
            [
              { value: "PUBLIC", label: "전체공개" },
              { value: "SQUAD_ONLY", label: "스쿼드 멤버만 공개" },
              { value: "PRIVATE", label: "비공개" },
            ] as const
          ).map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="radio"
                name="profileVisibility"
                checked={visibility === opt.value}
                onChange={() => setVisibility(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      {error && (
```

- [ ] **Step 4: 타입체크**

Run: `cd frontend && npx tsc --noEmit -p .`
Expected: 에러 없음

- [ ] **Step 5: 브라우저로 확인**

프로필 페이지 → "프로필 수정" → 공개범위 라디오 선택 → 저장 → 다시 "프로필 수정" 눌렀을 때 선택했던 값이 유지되는지 확인.

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/app/profile/page.tsx
git commit -m "feat(profile): 프로필 수정 화면에 공개범위 설정 추가"
```

---

### Task 9: 전체 회귀 테스트

**Files:** 없음 (검증 전용)

- [ ] **Step 1: 백엔드 전체 테스트 실행**

Run: `cd backend && ./gradlew test`
Expected: BUILD SUCCESSFUL, 모든 테스트 통과 (Task 2, 3에서 추가한 테스트 포함)

- [ ] **Step 2: 프론트엔드 전체 타입체크 + lint**

Run: `cd frontend && npx tsc --noEmit -p . && npx eslint src`
Expected: 둘 다 에러 없음 (기존에 알려진 `NavBar.tsx`의 `react-hooks/exhaustive-deps` 경고 1개는 이번 작업과 무관하므로 무시)

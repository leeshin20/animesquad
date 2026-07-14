# Invite-Code Signup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 Google 사용자는 그대로 로그인시키고 신규 Google 사용자만 공용 초대코드 확인 후 계정을 생성한다.

**Architecture:** OAuth 성공 시 기존 사용자와 신규 사용자를 분기한다. 신규 사용자의 Google 프로필은 10분짜리 용도 제한 JWT로 서명해 HttpOnly 쿠키에 보관하고, 공개 가입 완료 API가 환경변수의 초대코드와 임시 토큰을 검증한 뒤에만 사용자와 정식 세션을 만든다. 코드 실패 횟수는 인스턴스 메모리에서 IP별로 제한한다.

**Tech Stack:** Java 21, Spring Boot 3, Spring Security OAuth2, JJWT, JUnit 5, AssertJ, Mockito, Next.js 14, React, TypeScript, Tailwind CSS

## Global Constraints

- 공용 코드는 백엔드의 `INVITE_CODE` 환경변수로만 관리하고 프론트엔드·URL·로그에 노출하지 않는다.
- `INVITE_CODE`가 없거나 공백이면 기존 사용자의 로그인은 유지하고 신규 가입 완료만 `503`으로 차단한다.
- 신규 사용자는 코드 확인 전 `users` 테이블에 저장하지 않는다.
- 임시 가입 토큰 수명은 10분이며 쿠키 이름은 `invite_signup`이다.
- 임시 가입 토큰은 정식 `ASQ_SESSION` 인증으로 사용할 수 없다.
- IP별 10분 동안 실패 5회까지 허용하고 여섯 번째 요청부터 `429`를 반환한다.
- 성공하면 해당 IP의 실패 기록과 임시 가입 쿠키를 제거한다.
- 별도 DB 테이블이나 외부 요청 제한 라이브러리를 추가하지 않는다.
- 관련 없는 기존 코드, 미추적 문서, 기존 `NavBar` 린트 경고는 수정하지 않는다.

---

## File Structure

- `backend/src/main/java/com/animesquad/auth/InviteSignupTokenService.java`: 신규 Google 프로필용 10분 JWT 발급·검증만 담당한다.
- `backend/src/main/java/com/animesquad/auth/AuthCookieFactory.java`: 정식 세션과 임시 가입 쿠키의 발급·삭제 문자열을 한곳에서 만든다.
- `backend/src/main/java/com/animesquad/auth/InviteAttemptLimiter.java`: IP별 초대코드 실패 횟수와 10분 구간을 관리한다.
- `backend/src/main/java/com/animesquad/auth/InviteSignupController.java`: 초대코드 검증, 사용자 생성, 정식 쿠키 응답을 조정한다.
- `backend/src/main/java/com/animesquad/auth/OAuth2LoginSuccessHandler.java`: 기존 로그인과 신규 임시 가입 리다이렉트를 분기한다.
- `backend/src/main/java/com/animesquad/user/UserService.java`: Google 사용자 조회와 중복 안전 생성 인터페이스를 제공한다.
- `backend/src/main/java/com/animesquad/auth/SecurityConfig.java`: 가입 완료 API만 익명 접근을 허용한다.
- `backend/src/main/resources/application.yml`: 초대코드 설정 키를 환경변수에 연결한다.
- `frontend/src/app/invite/page.tsx`: 초대코드 입력, 오류 안내, 온보딩 이동을 담당한다.
- 각 백엔드 단위·통합 테스트는 같은 패키지의 대응 테스트 파일에 둔다.

---

### Task 1: 임시 가입 토큰과 인증 쿠키 경계

**Files:**
- Create: `backend/src/main/java/com/animesquad/auth/InviteSignupTokenService.java`
- Create: `backend/src/main/java/com/animesquad/auth/AuthCookieFactory.java`
- Create: `backend/src/test/java/com/animesquad/auth/InviteSignupTokenServiceTest.java`
- Create: `backend/src/test/java/com/animesquad/auth/AuthCookieFactoryTest.java`
- Modify: `backend/src/main/java/com/animesquad/auth/OAuth2LoginSuccessHandler.java`
- Modify: `backend/src/main/java/com/animesquad/auth/AuthController.java`

**Interfaces:**
- Produces: `InviteSignupTokenService.issue(String googleSub, String email, String displayName)` and `parse(String token)` returning `InviteProfile`.
- Produces: `AuthCookieFactory.session(String token, long maxAgeSeconds)`, `invite(String token)`, `clearSession()`, and `clearInvite()`.
- Consumes: existing `app.jwt.secret`, `app.cookie.*`, and `app.jwt.ttl-minutes` properties.

- [ ] **Step 1: Write failing token tests**

Create tests that assert profile round-trip, a fixed `purpose=invite-signup` claim, rejection of a normal session JWT, rejection of tampering, and expiration. Use a package-private constructor accepting `Clock` so expiration can be tested without sleeping:

```java
class InviteSignupTokenServiceTest {
    private static final String SECRET = "test-secret-test-secret-test-secret-32!!";
    private final Instant now = Instant.parse("2026-07-15T00:00:00Z");

    @Test
    void issueAndParseRoundTrip() {
        var service = new InviteSignupTokenService(SECRET, Clock.fixed(now, ZoneOffset.UTC));
        String token = service.issue("google-1", "one@example.com", "One");
        assertThat(service.parse(token)).isEqualTo(
            new InviteSignupTokenService.InviteProfile("google-1", "one@example.com", "One"));
    }

    @Test
    void parseRejectsSessionTokenAndExpiredInviteToken() {
        var issued = new InviteSignupTokenService(SECRET, Clock.fixed(now, ZoneOffset.UTC));
        String invite = issued.issue("google-1", "one@example.com", "One");
        String session = new JwtService(SECRET, 60).issue(1L);
        var later = new InviteSignupTokenService(
            SECRET, Clock.fixed(now.plus(11, ChronoUnit.MINUTES), ZoneOffset.UTC));
        assertThatThrownBy(() -> issued.parse(session)).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> later.parse(invite)).isInstanceOf(RuntimeException.class);
    }
}
```

- [ ] **Step 2: Run token tests and verify RED**

Run: `cd backend && ./gradlew test --tests '*InviteSignupTokenServiceTest'`

Expected: compilation fails because `InviteSignupTokenService` does not exist.

- [ ] **Step 3: Implement the token service minimally**

Implement a 10-minute JWT whose subject is the Google `sub`, with `purpose`, `email`, and `name` claims. `parse` must require `purpose` to equal `invite-signup` before returning the record:

```java
@Service
public class InviteSignupTokenService {
    static final String PURPOSE = "invite-signup";
    private final SecretKey key;
    private final Clock clock;

    public record InviteProfile(String googleSub, String email, String displayName) {}

    public InviteSignupTokenService(@Value("${app.jwt.secret}") String secret) {
        this(secret, Clock.systemUTC());
    }

    InviteSignupTokenService(String secret, Clock clock) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.clock = clock;
    }

    public String issue(String googleSub, String email, String displayName) {
        Instant now = clock.instant();
        return Jwts.builder().subject(googleSub)
            .claim("purpose", PURPOSE).claim("email", email).claim("name", displayName)
            .issuedAt(Date.from(now)).expiration(Date.from(now.plus(10, ChronoUnit.MINUTES)))
            .signWith(key).compact();
    }

    public InviteProfile parse(String token) {
        Claims claims = Jwts.parser().verifyWith(key).clock(() -> Date.from(clock.instant()))
            .build().parseSignedClaims(token).getPayload();
        if (!PURPOSE.equals(claims.get("purpose", String.class))) {
            throw new JwtException("wrong token purpose");
        }
        return new InviteProfile(claims.getSubject(), claims.get("email", String.class),
            claims.get("name", String.class));
    }
}
```

- [ ] **Step 4: Write failing cookie tests**

Test that the session cookie uses `ASQ_SESSION`, the invite cookie uses `invite_signup` with `Max-Age=600`, both inherit Secure/SameSite/Domain, and clear methods use `Max-Age=0`.

- [ ] **Step 5: Run cookie tests and verify RED**

Run: `cd backend && ./gradlew test --tests '*AuthCookieFactoryTest'`

Expected: compilation fails because `AuthCookieFactory` does not exist.

- [ ] **Step 6: Implement and adopt the cookie factory**

Create `AuthCookieFactory` with one private builder and replace duplicated cookie string construction in `OAuth2LoginSuccessHandler` and `AuthController`. Preserve all existing cookie attributes exactly.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run: `cd backend && ./gradlew test --tests '*InviteSignupTokenServiceTest' --tests '*AuthCookieFactoryTest' --tests '*AuthControllerIT'`

Expected: all selected tests pass.

- [ ] **Step 8: Commit Task 1**

```bash
git add backend/src/main/java/com/animesquad/auth backend/src/test/java/com/animesquad/auth
git commit -m "refactor(auth): 가입 토큰과 쿠키 경계 분리"
```

---

### Task 2: OAuth 성공 시 기존 사용자와 신규 사용자 분기

**Files:**
- Modify: `backend/src/main/java/com/animesquad/user/UserService.java`
- Modify: `backend/src/main/java/com/animesquad/auth/OAuth2LoginSuccessHandler.java`
- Create: `backend/src/test/java/com/animesquad/auth/OAuth2LoginSuccessHandlerTest.java`

**Interfaces:**
- Consumes: Task 1의 `InviteSignupTokenService`와 `AuthCookieFactory`.
- Produces: `UserService.findByGoogleSub(String)` returning `Optional<User>` and `createFromGoogleIfAbsent(InviteProfile)` returning `User` for Task 4.

- [ ] **Step 1: Write failing success-handler tests**

Mock `OAuth2User`, request, response, redirect strategy, services. Cover both branches:

```java
@Test
void existingUserGetsSessionAndNormalRedirect() throws Exception {
    when(principal.getAttribute("sub")).thenReturn("known");
    when(users.findByGoogleSub("known")).thenReturn(Optional.of(existing));
    when(jwt.issue(existing.getId())).thenReturn("session-token");

    handler.onAuthenticationSuccess(request, response, authentication);

    verify(response).addHeader("Set-Cookie", cookies.session("session-token", 2592000));
    verify(redirect).sendRedirect(request, response, "https://app.example/");
    verifyNoInteractions(inviteTokens);
}

@Test
void newUserGetsInviteCookieWithoutBeingCreated() throws Exception {
    when(principal.getAttribute("sub")).thenReturn("new-google");
    when(principal.getAttribute("email")).thenReturn("new@example.com");
    when(principal.getAttribute("name")).thenReturn("New");
    when(users.findByGoogleSub("new-google")).thenReturn(Optional.empty());
    when(inviteTokens.issue("new-google", "new@example.com", "New")).thenReturn("invite-token");

    handler.onAuthenticationSuccess(request, response, authentication);

    verify(response).addHeader("Set-Cookie", cookies.invite("invite-token"));
    verify(redirect).sendRedirect(request, response, "https://app.example/invite");
    verify(users, never()).upsertFromGoogle(any(), any(), any(), any());
    verifyNoInteractions(jwt);
}
```

- [ ] **Step 2: Run handler tests and verify RED**

Run: `cd backend && ./gradlew test --tests '*OAuth2LoginSuccessHandlerTest'`

Expected: failure because the handler still calls `upsertFromGoogle` unconditionally.

- [ ] **Step 3: Add explicit user lookup and concurrent-safe creation**

Add:

```java
@Transactional(readOnly = true)
public Optional<User> findByGoogleSub(String googleSub) {
    return repository.findByGoogleSub(googleSub);
}

@Transactional
public User createFromGoogleIfAbsent(InviteProfile profile) {
    return repository.findByGoogleSub(profile.googleSub()).orElseGet(() -> {
        try {
            return repository.saveAndFlush(new User(
                profile.googleSub(), profile.email(), profile.displayName(), null));
        } catch (DataIntegrityViolationException conflict) {
            return repository.findByGoogleSub(profile.googleSub()).orElseThrow(() -> conflict);
        }
    });
}
```

- [ ] **Step 4: Change OAuth success branching**

For an existing user, issue the normal cookie and preserve onboarding redirect behavior. For a new user, issue only the invite cookie and redirect to normalized `successRedirect + "/invite"`. Do not call a user creation method in the new-user branch.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `cd backend && ./gradlew test --tests '*OAuth2LoginSuccessHandlerTest' --tests '*AuthControllerIT'`

Expected: all selected tests pass.

- [ ] **Step 6: Commit Task 2**

```bash
git add backend/src/main/java/com/animesquad/auth/OAuth2LoginSuccessHandler.java backend/src/main/java/com/animesquad/user/UserService.java backend/src/test/java/com/animesquad/auth/OAuth2LoginSuccessHandlerTest.java
git commit -m "feat(auth): 신규 Google 사용자를 초대 흐름으로 분기"
```

---

### Task 3: IP별 초대코드 실패 제한

**Files:**
- Create: `backend/src/main/java/com/animesquad/auth/InviteAttemptLimiter.java`
- Create: `backend/src/test/java/com/animesquad/auth/InviteAttemptLimiterTest.java`

**Interfaces:**
- Produces: `boolean isBlocked(String clientIp)`, `void recordFailure(String clientIp)`, and `void clear(String clientIp)`.
- Uses a package-private constructor accepting `Clock` for deterministic tests.

- [ ] **Step 1: Write failing limiter tests**

```java
@Test
void blocksSixthAttemptWithinTenMinutesAndResetsAfterWindow() {
    MutableClock clock = new MutableClock(Instant.parse("2026-07-15T00:00:00Z"));
    InviteAttemptLimiter limiter = new InviteAttemptLimiter(clock);
    for (int i = 0; i < 5; i++) {
        assertThat(limiter.isBlocked("203.0.113.1")).isFalse();
        limiter.recordFailure("203.0.113.1");
    }
    assertThat(limiter.isBlocked("203.0.113.1")).isTrue();
    clock.advance(Duration.ofMinutes(10));
    assertThat(limiter.isBlocked("203.0.113.1")).isFalse();
}

@Test
void clearRemovesFailuresForOnlyThatIp() {
    InviteAttemptLimiter limiter = new InviteAttemptLimiter(Clock.systemUTC());
    for (int i = 0; i < 5; i++) limiter.recordFailure("a");
    limiter.recordFailure("b");
    limiter.clear("a");
    assertThat(limiter.isBlocked("a")).isFalse();
    assertThat(limiter.isBlocked("b")).isFalse();
}
```

- [ ] **Step 2: Run limiter tests and verify RED**

Run: `cd backend && ./gradlew test --tests '*InviteAttemptLimiterTest'`

Expected: compilation fails because `InviteAttemptLimiter` does not exist.

- [ ] **Step 3: Implement the minimal in-memory limiter**

Use `ConcurrentHashMap<String, AttemptWindow>` and atomic `compute` operations. A window starts on the first failure, expires at `startedAt + 10 minutes`, and blocks when `failures >= 5`. `isBlocked` removes an expired entry. Do not store request bodies or invite codes.

- [ ] **Step 4: Run limiter tests and verify GREEN**

Run: `cd backend && ./gradlew test --tests '*InviteAttemptLimiterTest'`

Expected: all limiter tests pass.

- [ ] **Step 5: Commit Task 3**

```bash
git add backend/src/main/java/com/animesquad/auth/InviteAttemptLimiter.java backend/src/test/java/com/animesquad/auth/InviteAttemptLimiterTest.java
git commit -m "feat(auth): 초대코드 실패 횟수 제한 추가"
```

---

### Task 4: 초대코드 가입 완료 API

**Files:**
- Create: `backend/src/main/java/com/animesquad/auth/InviteSignupController.java`
- Create: `backend/src/test/java/com/animesquad/auth/InviteSignupControllerIT.java`
- Modify: `backend/src/main/java/com/animesquad/auth/SecurityConfig.java`
- Modify: `backend/src/main/resources/application.yml`

**Interfaces:**
- Consumes: `InviteSignupTokenService.parse`, `InviteAttemptLimiter`, `UserService.createFromGoogleIfAbsent`, `JwtService.issue`, and `AuthCookieFactory`.
- Produces: anonymous `POST /api/auth/invite/complete` accepting `{ "code": string }` and returning `204` with cookies.

- [ ] **Step 1: Write failing integration tests for authorization and failure states**

Use `@SpringBootTest(properties = "app.invite.code=TEST-INVITE")`. Test no cookie=`401`, malformed/expired cookie=`401`, blank/wrong code=`403`, missing configured code in a nested property-specific test context=`503`, and six failed requests=`429`. Assert `userRepository.findByGoogleSub(...)` stays empty in every failure.

- [ ] **Step 2: Write failing success integration tests**

Send `invite_signup=<issued token>` plus `{ "code": "TEST-INVITE" }`. Assert:

```java
assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
assertThat(userRepository.findByGoogleSub("new-google")).isPresent();
assertThat(response.getHeaders().get(HttpHeaders.SET_COOKIE))
    .anySatisfy(value -> assertThat(value).contains("ASQ_SESSION="))
    .anySatisfy(value -> assertThat(value).contains("invite_signup=").contains("Max-Age=0"));
```

Repeat the request with the same profile and assert only one user exists. Add a test that a normal `ASQ_SESSION` token placed in `invite_signup` returns `401`.

- [ ] **Step 3: Run controller tests and verify RED**

Run: `cd backend && ./gradlew test --tests '*InviteSignupControllerIT'`

Expected: `404` or Spring context failure because the endpoint and property do not exist.

- [ ] **Step 4: Add fail-closed configuration and public security rule**

Add to `application.yml`:

```yaml
app:
  invite:
    code: ${INVITE_CODE:}
```

Permit only `POST /api/auth/invite/complete` before the general authenticated `/api/**` matcher.

- [ ] **Step 5: Implement constant-time code comparison**

In the controller, encode both strings as UTF-8, hash them with SHA-256, then call `MessageDigest.isEqual`. Reject a null/blank configured code with `503` before comparing. Never include either value in an exception or log.

- [ ] **Step 6: Implement endpoint orchestration**

Read `invite_signup` from request cookies; derive the client IP from `request.getRemoteAddr()` because Render's forwarded-header handling normalizes the peer address. Apply limiter check before code comparison, record only wrong/blank code failures, parse the token, create-or-find the user, issue the session cookie, clear the limiter, and return `204` with both session and clear-invite `Set-Cookie` headers.

- [ ] **Step 7: Run controller and auth regression tests**

Run: `cd backend && ./gradlew test --tests '*InviteSignupControllerIT' --tests '*AuthControllerIT' --tests '*OAuth2LoginSuccessHandlerTest' --tests '*JwtServiceTest'`

Expected: all selected tests pass.

- [ ] **Step 8: Commit Task 4**

```bash
git add backend/src/main/java/com/animesquad/auth backend/src/main/resources/application.yml backend/src/test/java/com/animesquad/auth/InviteSignupControllerIT.java
git commit -m "feat(auth): 초대코드 가입 완료 API 추가"
```

---

### Task 5: 초대코드 입력 화면

**Files:**
- Create: `frontend/src/app/invite/page.tsx`
- Modify: `frontend/src/app/lib/api.ts`

**Interfaces:**
- Consumes: `POST /api/auth/invite/complete` with `{ code }`, credentials included, empty `204` response.
- Produces: `/invite` page that redirects successful users to `/onboarding`.

- [ ] **Step 1: Add an empty-response API helper**

Add:

```ts
export async function apiPostJsonEmpty(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
}
```

- [ ] **Step 2: Create the invite page**

Build a client page with one password-style input, submit button, disabled submitting state, and `aria-live` error block. On success call `router.replace("/onboarding")`. Map errors exactly:

- `API 401`: “가입 정보가 만료됐어요. Google 로그인을 다시 진행해주세요.” plus a Google login link.
- `API 403`: “초대코드가 올바르지 않아요.”
- `API 429`: “시도 횟수가 너무 많아요. 잠시 후 다시 시도해주세요.”
- `API 503`: “현재 신규 가입을 받을 수 없어요.”
- otherwise: “가입 처리 중 오류가 발생했어요.”

Do not store the code outside component state and do not place it in query parameters.

- [ ] **Step 3: Run frontend static verification**

Run: `cd frontend && pnpm exec tsc --noEmit && pnpm lint`

Expected: exit 0; the pre-existing `NavBar.tsx` exhaustive-deps warning may remain, with no new warnings in `/invite`.

- [ ] **Step 4: Commit Task 5**

```bash
git add frontend/src/app/invite/page.tsx frontend/src/app/lib/api.ts
git commit -m "feat(auth): 신규 가입 초대코드 화면 추가"
```

---

### Task 6: 전체 회귀 검증과 운영 인계

**Files:**
- Modify only if verification exposes a defect directly caused by Tasks 1-5.

**Interfaces:**
- Verifies the complete Google OAuth → invite → onboarding flow and the unaffected existing-user login flow.

- [ ] **Step 1: Run the complete backend suite freshly**

Run: `cd backend && ./gradlew test --rerun-tasks`

Expected: `BUILD SUCCESSFUL`, zero failing tests.

- [ ] **Step 2: Run the complete frontend checks freshly**

Run: `cd frontend && pnpm exec tsc --noEmit && pnpm lint`

Expected: exit 0; no new lint warnings.

- [ ] **Step 3: Review the final diff for scope and secrets**

Run:

```bash
git diff main...HEAD --check
git diff main...HEAD --stat
git grep -n "TEST-INVITE" -- ':!backend/src/test/**'
git status --short
```

Expected: no whitespace errors, no production occurrence of the test code, and only the known unrelated untracked files remain.

- [ ] **Step 4: Manual local smoke test**

Start backend with `INVITE_CODE` set and frontend normally. Verify an existing Google user reaches the app without `/invite`; use a new Google account to verify wrong code stays on `/invite`, correct code creates one user and reaches `/onboarding`, and refreshing after success uses the normal session.

- [ ] **Step 5: Record Render configuration requirement**

Before production deployment, set backend environment variable `INVITE_CODE` to the agreed shared secret. Do not add it to Git, frontend environment variables, screenshots, or deployment notes containing its literal value.

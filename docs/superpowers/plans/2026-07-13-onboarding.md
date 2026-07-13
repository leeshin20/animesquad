# Onboarding Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 신규 가입자가 Google 로그인 직후 닉네임·프로필 사진 설정과 약관 동의를 완료해야 서비스에 입장할 수 있는 온보딩 플로우 구현

**Architecture:** DB에 `terms_agreed_at` 컬럼을 추가해 동의 여부를 추적한다. Google OAuth 성공 시 백엔드가 해당 컬럼이 null이면 `/onboarding`으로 리다이렉트한다. 프론트엔드 NavBar도 `onboardingComplete === false`면 강제 리다이렉트해 우회를 막는다. Google 프로필 사진은 더 이상 저장하지 않고 `avatarUrl`이 null이면 `/default-avatar.png`를 표시한다.

**Tech Stack:** Java 21, Spring Boot, Flyway, Next.js 14, TypeScript

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `backend/src/main/resources/db/migration/V15__onboarding.sql` | Create | `terms_agreed_at` 컬럼 추가 |
| `backend/src/main/java/com/animesquad/user/User.java` | Modify | `termsAgreedAt` 필드·메서드 추가 |
| `backend/src/main/java/com/animesquad/user/UserService.java` | Modify | `agreeTerms()` 추가 |
| `backend/src/main/java/com/animesquad/auth/OAuth2LoginSuccessHandler.java` | Modify | Google picture 저장 중단, 온보딩 리다이렉트 |
| `backend/src/main/java/com/animesquad/auth/AuthController.java` | Modify | `onboardingComplete` 응답 필드 + `POST /api/me/agree-terms` |
| `backend/src/test/java/com/animesquad/auth/AuthControllerIT.java` | Modify | agree-terms 통합 테스트 추가 |
| `frontend/src/app/lib/api.ts` | Modify | `Me` 타입에 `onboardingComplete` 추가 |
| `frontend/src/app/components/NavBar.tsx` | Modify | default avatar + 온보딩 리다이렉트 강제 |
| `frontend/src/app/onboarding/page.tsx` | Create | 온보딩 페이지 |

---

### Task 1: DB Migration + User 엔티티

**Files:**
- Create: `backend/src/main/resources/db/migration/V15__onboarding.sql`
- Modify: `backend/src/main/java/com/animesquad/user/User.java`

- [ ] **Step 1: Flyway 마이그레이션 파일 생성**

`backend/src/main/resources/db/migration/V15__onboarding.sql`:

```sql
ALTER TABLE users ADD COLUMN terms_agreed_at TIMESTAMPTZ NULL;
```

- [ ] **Step 2: User 엔티티에 termsAgreedAt 추가**

`backend/src/main/java/com/animesquad/user/User.java` 전체 교체:

```java
package com.animesquad.user;

import jakarta.persistence.*;
import java.time.OffsetDateTime;

@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "google_sub", nullable = false, unique = true)
    private String googleSub;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(name = "display_name", nullable = false)
    private String displayName;

    @Column(name = "avatar_url")
    private String avatarUrl;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    @Column(name = "terms_agreed_at")
    private OffsetDateTime termsAgreedAt;

    protected User() {}

    public User(String googleSub, String email, String displayName, String avatarUrl) {
        this.googleSub = googleSub;
        this.email = email;
        this.displayName = displayName;
        this.avatarUrl = avatarUrl;
    }

    public void updateDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public void updateAvatarUrl(String avatarUrl) {
        this.avatarUrl = avatarUrl;
    }

    public void agreeTerms() {
        this.termsAgreedAt = OffsetDateTime.now();
    }

    public Long getId() { return id; }
    public String getGoogleSub() { return googleSub; }
    public String getEmail() { return email; }
    public String getDisplayName() { return displayName; }
    public String getAvatarUrl() { return avatarUrl; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getTermsAgreedAt() { return termsAgreedAt; }
}
```

- [ ] **Step 3: 컴파일 확인**

```bash
cd /Users/yubeen/animesquad/backend && ./gradlew compileJava
```

Expected: `BUILD SUCCESSFUL`

- [ ] **Step 4: Commit**

```bash
cd /Users/yubeen/animesquad
git add backend/src/main/resources/db/migration/V15__onboarding.sql \
        backend/src/main/java/com/animesquad/user/User.java
git commit -m "feat(onboarding): add terms_agreed_at column and User.agreeTerms()"
```

---

### Task 2: 백엔드 서비스 + 컨트롤러 + OAuth 핸들러

**Files:**
- Modify: `backend/src/main/java/com/animesquad/user/UserService.java`
- Modify: `backend/src/main/java/com/animesquad/auth/AuthController.java`
- Modify: `backend/src/main/java/com/animesquad/auth/OAuth2LoginSuccessHandler.java`
- Test: `backend/src/test/java/com/animesquad/auth/AuthControllerIT.java`

- [ ] **Step 1: 테스트 먼저 작성**

`backend/src/test/java/com/animesquad/auth/AuthControllerIT.java`의 마지막 `}` 앞에 추가:

```java
@Test
void agreeTerms_returns401_whenNotLoggedIn() {
    ResponseEntity<Void> res = rest.exchange(
        url("/api/me/agree-terms"), HttpMethod.POST, HttpEntity.EMPTY, Void.class);
    assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
}

@Test
void agreeTerms_setsTermsAgreedAt() {
    User u = userService.upsertFromGoogle("g-terms-1", "terms1@test.com", "T", null);
    assertThat(u.getTermsAgreedAt()).isNull();

    ResponseEntity<Void> res = rest.exchange(
        url("/api/me/agree-terms"), HttpMethod.POST,
        new HttpEntity<>(cookieFor(u.getId())), Void.class);

    assertThat(res.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    assertThat(userRepository.findById(u.getId()).get().getTermsAgreedAt()).isNotNull();
}

@Test
void me_includesOnboardingComplete() {
    User u = userService.upsertFromGoogle("g-oc-1", "oc1@test.com", "OC", null);

    ResponseEntity<String> before = rest.exchange(
        url("/api/me"), HttpMethod.GET, new HttpEntity<>(cookieFor(u.getId())), String.class);
    assertThat(before.getBody()).contains("\"onboardingComplete\":false");

    rest.exchange(url("/api/me/agree-terms"), HttpMethod.POST,
        new HttpEntity<>(cookieFor(u.getId())), Void.class);

    ResponseEntity<String> after = rest.exchange(
        url("/api/me"), HttpMethod.GET, new HttpEntity<>(cookieFor(u.getId())), String.class);
    assertThat(after.getBody()).contains("\"onboardingComplete\":true");
}
```

- [ ] **Step 2: 테스트 실행 — FAIL 확인**

```bash
cd /Users/yubeen/animesquad/backend && ./gradlew test --tests "com.animesquad.auth.AuthControllerIT.agreeTerms_*" --tests "com.animesquad.auth.AuthControllerIT.me_includesOnboardingComplete" 2>&1 | tail -20
```

Expected: 컴파일 에러 또는 테스트 실패 (엔드포인트 미구현)

- [ ] **Step 3: UserService에 agreeTerms() 추가**

`backend/src/main/java/com/animesquad/user/UserService.java`에 메서드 추가 (`updateAvatarUrl` 뒤에):

```java
@Transactional
public void agreeTerms(Long userId) {
    User user = getById(userId);
    user.agreeTerms();
}
```

- [ ] **Step 4: AuthController 업데이트**

`backend/src/main/java/com/animesquad/auth/AuthController.java`에서 두 가지 수정:

**4a. MeResponse에 onboardingComplete 추가:**

```java
public record MeResponse(Long id, String email, String displayName, String avatarUrl, boolean isAdmin, boolean onboardingComplete) {}
```

**4b. toResponse() 수정:**

```java
private MeResponse toResponse(User u) {
    boolean isAdmin = adminProperties.isAdminEmail(u.getEmail());
    boolean onboardingComplete = u.getTermsAgreedAt() != null;
    return new MeResponse(u.getId(), u.getEmail(), u.getDisplayName(), u.getAvatarUrl(), isAdmin, onboardingComplete);
}
```

**4c. POST /api/me/agree-terms 엔드포인트 추가** (`deleteAccount` 메서드 뒤에):

```java
@PostMapping("/me/agree-terms")
public ResponseEntity<Void> agreeTerms(@AuthenticationPrincipal CurrentUser current) {
    userService.agreeTerms(current.userId());
    return ResponseEntity.noContent().build();
}
```

- [ ] **Step 5: OAuth2LoginSuccessHandler 수정**

`backend/src/main/java/com/animesquad/auth/OAuth2LoginSuccessHandler.java` 전체 교체:

```java
package com.animesquad.auth;

import com.animesquad.user.User;
import com.animesquad.user.UserService;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;

@Component
public class OAuth2LoginSuccessHandler extends SimpleUrlAuthenticationSuccessHandler {

    private final UserService userService;
    private final JwtService jwtService;

    @Value("${app.oauth.success-redirect}")
    private String successRedirect;

    @Value("${app.cookie.secure}")
    private boolean cookieSecure;

    @Value("${app.cookie.same-site}")
    private String cookieSameSite;

    @Value("${app.cookie.domain:}")
    private String cookieDomain;

    @Value("${app.jwt.ttl-minutes}")
    private long ttlMinutes;

    public OAuth2LoginSuccessHandler(UserService userService, JwtService jwtService) {
        this.userService = userService;
        this.jwtService = jwtService;
    }

    @Override
    public void onAuthenticationSuccess(HttpServletRequest req, HttpServletResponse res, Authentication auth)
        throws IOException, ServletException {
        OAuth2User principal = (OAuth2User) auth.getPrincipal();
        String sub = principal.getAttribute("sub");
        String email = principal.getAttribute("email");
        String name = principal.getAttribute("name");

        // Google 프로필 사진은 저장하지 않음 — 앱 기본 이미지 사용
        User user = userService.upsertFromGoogle(sub, email, name, null);
        String token = jwtService.issue(user.getId());

        StringBuilder sb = new StringBuilder();
        sb.append(JwtAuthenticationFilter.COOKIE_NAME).append("=").append(token);
        sb.append("; Path=/");
        sb.append("; Max-Age=").append(ttlMinutes * 60);
        sb.append("; HttpOnly");
        if (cookieSecure) sb.append("; Secure");
        sb.append("; SameSite=").append(cookieSameSite);
        if (cookieDomain != null && !cookieDomain.isBlank()) {
            sb.append("; Domain=").append(cookieDomain);
        }
        res.addHeader("Set-Cookie", sb.toString());

        // 온보딩 미완료 유저는 /onboarding으로 리다이렉트
        String base = successRedirect.endsWith("/")
            ? successRedirect.substring(0, successRedirect.length() - 1)
            : successRedirect;
        String redirectUrl = user.getTermsAgreedAt() == null
            ? base + "/onboarding"
            : successRedirect;
        getRedirectStrategy().sendRedirect(req, res, redirectUrl);
    }
}
```

- [ ] **Step 6: 테스트 실행 — PASS 확인**

```bash
cd /Users/yubeen/animesquad/backend && ./gradlew test --tests "com.animesquad.auth.AuthControllerIT" 2>&1 | tail -20
```

Expected: `BUILD SUCCESSFUL`, 모든 AuthControllerIT 테스트 PASS

- [ ] **Step 7: Commit**

```bash
cd /Users/yubeen/animesquad
git add backend/src/main/java/com/animesquad/user/UserService.java \
        backend/src/main/java/com/animesquad/auth/AuthController.java \
        backend/src/main/java/com/animesquad/auth/OAuth2LoginSuccessHandler.java \
        backend/src/test/java/com/animesquad/auth/AuthControllerIT.java
git commit -m "feat(onboarding): add agree-terms endpoint and onboarding redirect on OAuth login"
```

---

### Task 3: 프론트엔드 — Me 타입 + NavBar + default avatar

**Files:**
- Modify: `frontend/src/app/lib/api.ts`
- Modify: `frontend/src/app/components/NavBar.tsx`

- [ ] **Step 1: Me 타입에 onboardingComplete 추가**

`frontend/src/app/lib/api.ts`에서 `Me` 타입 수정:

```typescript
export type Me = {
  id: number;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  onboardingComplete: boolean;
};
```

- [ ] **Step 2: NavBar Avatar 컴포넌트 — default avatar 이미지 사용**

`frontend/src/app/components/NavBar.tsx` 하단의 `Avatar` 함수 전체 교체:

```typescript
function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="h-7 w-7 flex-none rounded-full object-cover" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/default-avatar.png" alt="" className="h-7 w-7 flex-none rounded-full object-cover" />
  );
}
```

- [ ] **Step 3: NavBar — 온보딩 미완료 시 강제 리다이렉트**

`frontend/src/app/components/NavBar.tsx`에서 `/api/me` fetch 부분 수정:

현재 코드:
```typescript
  useEffect(() => {
    apiGet<Me>("/api/me").then(setMe).catch(() => {});
  }, []);
```

교체할 코드:
```typescript
  useEffect(() => {
    apiGet<Me>("/api/me").then((m) => {
      setMe(m);
      if (!m.onboardingComplete && pathname !== "/onboarding") {
        router.push("/onboarding");
      }
    }).catch(() => {});
  }, []);
```

- [ ] **Step 4: TypeScript 검사**

```bash
cd /Users/yubeen/animesquad/frontend && npx tsc --noEmit 2>&1
```

Expected: 에러 없음

- [ ] **Step 5: Commit**

```bash
cd /Users/yubeen/animesquad
git add frontend/src/app/lib/api.ts \
        frontend/src/app/components/NavBar.tsx
git commit -m "feat(onboarding): update Me type, use default avatar, enforce onboarding redirect in NavBar"
```

---

### Task 4: 프론트엔드 — 온보딩 페이지

**Files:**
- Create: `frontend/src/app/onboarding/page.tsx`

- [ ] **Step 1: 온보딩 페이지 생성**

`frontend/src/app/onboarding/page.tsx` 생성:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiGet, apiPatch, apiUpload, apiPostEmpty, type Me } from "@/app/lib/api";

export default function OnboardingPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [termsChecked, setTermsChecked] = useState(false);
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiGet<Me>("/api/me")
      .then((m) => {
        if (m.onboardingComplete) {
          router.replace("/");
          return;
        }
        setMe(m);
        setDisplayName(m.displayName);
      })
      .catch(() => router.replace("/"));
  }, [router]);

  function pickFile(f: File | null) {
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function submit() {
    const name = displayName.trim();
    if (!name) {
      setError("닉네임을 입력해주세요");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (name !== me!.displayName) {
        await apiPatch<Me>("/api/me", { displayName: name });
      }
      if (file) {
        await apiUpload<Me>("/api/me/avatar", file);
      }
      await apiPostEmpty("/api/me/agree-terms");
      router.push("/");
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  if (!me) return <p className="text-sm text-neutral-500">불러오는 중…</p>;

  const avatarSrc = preview ?? me.avatarUrl ?? "/default-avatar.png";

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">환영해요!</h1>
        <p className="mt-1 text-sm text-neutral-500">시작하기 전에 프로필을 설정해주세요.</p>
      </div>

      {/* 프로필 사진 */}
      <div className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatarSrc} alt="" className="h-20 w-20 rounded-full object-cover" />
        <div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            사진 선택
          </button>
          {file && <p className="mt-1 text-xs text-neutral-500">{file.name}</p>}
        </div>
      </div>

      {/* 닉네임 */}
      <label className="block">
        <span className="text-xs font-medium text-neutral-600">닉네임</span>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={50}
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
        />
      </label>

      {/* 약관 동의 */}
      <div className="space-y-2 rounded-xl border border-neutral-200 p-4">
        <p className="text-xs font-medium text-neutral-600">필수 동의</p>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={termsChecked}
            onChange={(e) => setTermsChecked(e.target.checked)}
            className="mt-0.5 shrink-0"
          />
          <span>
            <Link href="/terms" target="_blank" className="underline underline-offset-2 hover:text-neutral-900">
              이용약관
            </Link>
            에 동의합니다
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={privacyChecked}
            onChange={(e) => setPrivacyChecked(e.target.checked)}
            className="mt-0.5 shrink-0"
          />
          <span>
            <Link href="/privacy" target="_blank" className="underline underline-offset-2 hover:text-neutral-900">
              개인정보처리방침
            </Link>
            에 동의합니다
          </span>
        </label>
      </div>

      {error && (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={saving || !termsChecked || !privacyChecked}
        className="w-full rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
      >
        {saving ? "저장 중…" : "시작하기"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript 검사**

```bash
cd /Users/yubeen/animesquad/frontend && npx tsc --noEmit 2>&1
```

Expected: 에러 없음

- [ ] **Step 3: 빌드 확인**

```bash
npm run build 2>&1 | tail -15
```

Expected: `Compiled successfully`

- [ ] **Step 4: Commit**

```bash
cd /Users/yubeen/animesquad
git add frontend/src/app/onboarding/page.tsx frontend/public/default-avatar.png
git commit -m "feat(onboarding): add onboarding page with nickname, avatar, and terms agreement"
```

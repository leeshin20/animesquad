# Plan 1 — Scaffolding & Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a monorepo with Spring Boot backend and Next.js frontend, working Google OAuth login that issues a JWT cookie, and a "/me" page that proves the round trip works.

**Architecture:** Monorepo with `backend/` (Spring Boot 3, Java 21, Gradle) and `frontend/` (Next.js 14 App Router, TypeScript, pnpm). Postgres via docker-compose for local. Spring Security OAuth2 Client handles Google, issues internal JWT as HttpOnly cookie. Next.js calls backend with `credentials: 'include'`.

**Tech Stack:** Spring Boot 3.3, Java 21, Spring Security, Spring Data JPA, PostgreSQL 16, Flyway, JWT (jjwt), Testcontainers, JUnit 5. Next.js 14, TypeScript, pnpm.

**Out of scope:** Squads, anime, watch entries, AniList. Those are later plans.

**Done = success criteria:**
- `docker compose up -d db` 후 백엔드 `./gradlew bootRun` 정상 기동
- `pnpm dev` 후 `http://localhost:3000` 접속 → "Sign in with Google" → 로그인 성공 → `/me` 페이지에 내 email/displayName 표시
- `./gradlew test` 전부 통과 (Testcontainers 사용)

---

## File Structure

**Repo layout (monorepo):**
```
/
├── backend/
│   ├── build.gradle.kts
│   ├── settings.gradle.kts
│   ├── docker-compose.yml
│   └── src/main/java/com/animesquad/
│       ├── AnimesquadApplication.java
│       ├── auth/
│       │   ├── AuthController.java          # OAuth 콜백 후 처리, /api/me
│       │   ├── SecurityConfig.java
│       │   ├── JwtService.java              # 발급/검증
│       │   ├── JwtAuthenticationFilter.java
│       │   └── CurrentUser.java             # @AuthenticationPrincipal 대체용
│       ├── user/
│       │   ├── User.java                    # JPA Entity
│       │   ├── UserRepository.java
│       │   └── UserService.java             # upsert by google_sub
│       └── common/
│           ├── ApiErrorResponse.java
│           └── GlobalExceptionHandler.java
│   ├── src/main/resources/
│   │   ├── application.yml
│   │   ├── application-local.yml
│   │   └── db/migration/V1__init_users.sql
│   └── src/test/java/com/animesquad/
│       ├── auth/JwtServiceTest.java
│       ├── auth/AuthControllerIT.java       # @SpringBootTest + Testcontainers
│       └── support/AbstractIntegrationTest.java
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.mjs
│   └── src/app/
│       ├── layout.tsx
│       ├── page.tsx                         # 랜딩 + 로그인 버튼
│       ├── me/page.tsx
│       └── lib/api.ts                       # fetch wrapper (credentials:'include')
├── .gitignore
└── README.md
```

---

## Task 1: Repo skeleton & gitignore

**Files:**
- Create: `.gitignore`
- Create: `README.md`
- Create: `backend/` and `frontend/` directories (empty for now)

- [ ] **Step 1: Create .gitignore**

```gitignore
# Java/Gradle
backend/.gradle/
backend/build/
backend/bin/
*.class

# Node
frontend/node_modules/
frontend/.next/
frontend/out/

# IDE
.idea/
.vscode/
*.iml

# OS
.DS_Store

# Env
.env
.env.local
*.local
```

- [ ] **Step 2: Create README.md**

```markdown
# AnimeSquad

Anime watching tracker for small friend "squads".

## Layout
- `backend/` — Spring Boot 3 (Java 21)
- `frontend/` — Next.js 14 (TypeScript)
- `docs/` — design specs and plans

## Local development
See `backend/README.md` and `frontend/README.md`.
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore README.md
git commit -m "chore: add gitignore and root README"
```

---

## Task 2: Backend Gradle project init

**Files:**
- Create: `backend/settings.gradle.kts`
- Create: `backend/build.gradle.kts`
- Create: `backend/gradle/wrapper/gradle-wrapper.properties`
- Create: `backend/gradlew`, `backend/gradlew.bat` (via `gradle wrapper`)

- [ ] **Step 1: Generate Gradle wrapper**

Run from `backend/`:
```bash
cd backend
gradle wrapper --gradle-version 8.10
```
(If `gradle` not installed: `brew install gradle` first.)
Expected: `gradlew`, `gradle/wrapper/` created.

- [ ] **Step 2: Write `backend/settings.gradle.kts`**

```kotlin
rootProject.name = "animesquad-backend"
```

- [ ] **Step 3: Write `backend/build.gradle.kts`**

```kotlin
plugins {
    java
    id("org.springframework.boot") version "3.3.5"
    id("io.spring.dependency-management") version "1.1.6"
}

group = "com.animesquad"
version = "0.0.1-SNAPSHOT"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

repositories { mavenCentral() }

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.boot:spring-boot-starter-oauth2-client")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.flywaydb:flyway-core")
    implementation("org.flywaydb:flyway-database-postgresql")
    runtimeOnly("org.postgresql:postgresql")

    implementation("io.jsonwebtoken:jjwt-api:0.12.6")
    runtimeOnly("io.jsonwebtoken:jjwt-impl:0.12.6")
    runtimeOnly("io.jsonwebtoken:jjwt-jackson:0.12.6")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.springframework.security:spring-security-test")
    testImplementation("org.testcontainers:junit-jupiter:1.20.3")
    testImplementation("org.testcontainers:postgresql:1.20.3")
}

tasks.test { useJUnitPlatform() }
```

- [ ] **Step 4: Create the main application class `backend/src/main/java/com/animesquad/AnimesquadApplication.java`**

```java
package com.animesquad;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class AnimesquadApplication {
    public static void main(String[] args) {
        SpringApplication.run(AnimesquadApplication.class, args);
    }
}
```

- [ ] **Step 5: Verify build**

Run:
```bash
cd backend && ./gradlew build -x test
```
Expected: BUILD SUCCESSFUL.

- [ ] **Step 6: Commit**

```bash
git add backend/
git commit -m "chore(backend): initialize Spring Boot 3 project"
```

---

## Task 3: Postgres docker-compose & application config

**Files:**
- Create: `backend/docker-compose.yml`
- Create: `backend/src/main/resources/application.yml`
- Create: `backend/src/main/resources/application-local.yml`
- Create: `backend/src/main/resources/db/migration/V1__init_users.sql`

- [ ] **Step 1: Write docker-compose.yml**

```yaml
services:
  db:
    image: postgres:16-alpine
    container_name: animesquad-db
    environment:
      POSTGRES_DB: animesquad
      POSTGRES_USER: animesquad
      POSTGRES_PASSWORD: animesquad
    ports:
      - "5432:5432"
    volumes:
      - animesquad-pgdata:/var/lib/postgresql/data

volumes:
  animesquad-pgdata:
```

- [ ] **Step 2: Write `application.yml`**

```yaml
spring:
  application:
    name: animesquad
  profiles:
    active: local
  jpa:
    hibernate:
      ddl-auto: validate
    properties:
      hibernate.jdbc.time_zone: UTC
  flyway:
    enabled: true

server:
  port: 8080

app:
  jwt:
    secret: ${JWT_SECRET:dev-secret-change-me-please-at-least-32-bytes!!}
    ttl-minutes: 1440
  oauth:
    success-redirect: ${OAUTH_SUCCESS_REDIRECT:http://localhost:3000/me}
  cookie:
    domain: ${COOKIE_DOMAIN:}
    secure: ${COOKIE_SECURE:false}
    same-site: ${COOKIE_SAME_SITE:Lax}
```

- [ ] **Step 3: Write `application-local.yml`**

```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/animesquad
    username: animesquad
    password: animesquad
  security:
    oauth2:
      client:
        registration:
          google:
            client-id: ${GOOGLE_CLIENT_ID:dummy}
            client-secret: ${GOOGLE_CLIENT_SECRET:dummy}
            scope: openid,email,profile
            redirect-uri: "{baseUrl}/login/oauth2/code/{registrationId}"
```

- [ ] **Step 4: Write Flyway migration `V1__init_users.sql`**

```sql
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    google_sub VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    avatar_url VARCHAR(1024),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

- [ ] **Step 5: Start DB and verify migration would run**

```bash
docker compose -f backend/docker-compose.yml up -d
```
Expected: container `animesquad-db` running. Verify:
```bash
docker exec animesquad-db psql -U animesquad -d animesquad -c "\dt"
```
Expected: no tables yet (Flyway runs on app boot).

- [ ] **Step 6: Commit**

```bash
git add backend/docker-compose.yml backend/src/main/resources/
git commit -m "feat(backend): add postgres compose, app config, users migration"
```

---

## Task 4: User entity, repository, service

**Files:**
- Create: `backend/src/main/java/com/animesquad/user/User.java`
- Create: `backend/src/main/java/com/animesquad/user/UserRepository.java`
- Create: `backend/src/main/java/com/animesquad/user/UserService.java`
- Test: `backend/src/test/java/com/animesquad/user/UserServiceIT.java`
- Test: `backend/src/test/java/com/animesquad/support/AbstractIntegrationTest.java`

- [ ] **Step 1: Write the test base class**

`AbstractIntegrationTest.java`:
```java
package com.animesquad.support;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest
@Testcontainers
public abstract class AbstractIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres =
        new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("animesquad_test")
            .withUsername("test")
            .withPassword("test");

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", postgres::getJdbcUrl);
        r.add("spring.datasource.username", postgres::getUsername);
        r.add("spring.datasource.password", postgres::getPassword);
    }
}
```

- [ ] **Step 2: Write the failing service test**

`UserServiceIT.java`:
```java
package com.animesquad.user;

import com.animesquad.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import static org.assertj.core.api.Assertions.assertThat;

class UserServiceIT extends AbstractIntegrationTest {

    @Autowired UserService userService;
    @Autowired UserRepository userRepository;

    @Test
    void upsertByGoogleSub_createsNewUser_whenAbsent() {
        User u = userService.upsertFromGoogle(
            "google-sub-1", "alice@example.com", "Alice", "http://avatar/1");

        assertThat(u.getId()).isNotNull();
        assertThat(userRepository.findByGoogleSub("google-sub-1")).isPresent();
    }

    @Test
    void upsertByGoogleSub_updatesProfile_whenExists() {
        userService.upsertFromGoogle("sub-2", "bob@x.com", "Bob", "url1");
        User updated = userService.upsertFromGoogle("sub-2", "bob@x.com", "Bob Renamed", "url2");

        assertThat(updated.getDisplayName()).isEqualTo("Bob Renamed");
        assertThat(updated.getAvatarUrl()).isEqualTo("url2");
        assertThat(userRepository.count()).isEqualTo(1);
    }
}
```

- [ ] **Step 3: Run the test, expect failure**

```bash
cd backend && ./gradlew test --tests UserServiceIT
```
Expected: FAIL (classes don't exist yet).

- [ ] **Step 4: Write `User.java`**

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

    protected User() {}

    public User(String googleSub, String email, String displayName, String avatarUrl) {
        this.googleSub = googleSub;
        this.email = email;
        this.displayName = displayName;
        this.avatarUrl = avatarUrl;
    }

    public void updateProfile(String displayName, String avatarUrl) {
        this.displayName = displayName;
        this.avatarUrl = avatarUrl;
    }

    public Long getId() { return id; }
    public String getGoogleSub() { return googleSub; }
    public String getEmail() { return email; }
    public String getDisplayName() { return displayName; }
    public String getAvatarUrl() { return avatarUrl; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
}
```

- [ ] **Step 5: Write `UserRepository.java`**

```java
package com.animesquad.user;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByGoogleSub(String googleSub);
}
```

- [ ] **Step 6: Write `UserService.java`**

```java
package com.animesquad.user;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserService {

    private final UserRepository repository;

    public UserService(UserRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public User upsertFromGoogle(String googleSub, String email, String displayName, String avatarUrl) {
        return repository.findByGoogleSub(googleSub)
            .map(existing -> { existing.updateProfile(displayName, avatarUrl); return existing; })
            .orElseGet(() -> repository.save(new User(googleSub, email, displayName, avatarUrl)));
    }

    @Transactional(readOnly = true)
    public User getById(Long id) {
        return repository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("user not found: " + id));
    }
}
```

- [ ] **Step 7: Run tests, expect pass**

```bash
./gradlew test --tests UserServiceIT
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/com/animesquad/user backend/src/test
git commit -m "feat(user): add User entity, repo, service with upsert"
```

---

## Task 5: JwtService — issue and verify JWTs

**Files:**
- Create: `backend/src/main/java/com/animesquad/auth/JwtService.java`
- Test: `backend/src/test/java/com/animesquad/auth/JwtServiceTest.java`

- [ ] **Step 1: Write the failing unit test**

```java
package com.animesquad.auth;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JwtServiceTest {

    private final JwtService jwt = new JwtService(
        "test-secret-test-secret-test-secret-32!!", 60);

    @Test
    void issue_andParse_roundTrip() {
        String token = jwt.issue(42L);
        Long uid = jwt.parseUserId(token);
        assertThat(uid).isEqualTo(42L);
    }

    @Test
    void parseUserId_rejectsTamperedToken() {
        String token = jwt.issue(1L);
        String bad = token.substring(0, token.length() - 2) + "xx";
        assertThatThrownBy(() -> jwt.parseUserId(bad)).isInstanceOf(RuntimeException.class);
    }
}
```

- [ ] **Step 2: Run test, expect failure**

```bash
./gradlew test --tests JwtServiceTest
```
Expected: FAIL (`JwtService` not found).

- [ ] **Step 3: Implement `JwtService`**

```java
package com.animesquad.auth;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;

@Service
public class JwtService {

    private final SecretKey key;
    private final long ttlMinutes;

    public JwtService(
        @Value("${app.jwt.secret}") String secret,
        @Value("${app.jwt.ttl-minutes}") long ttlMinutes
    ) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.ttlMinutes = ttlMinutes;
    }

    public String issue(Long userId) {
        Instant now = Instant.now();
        return Jwts.builder()
            .subject(userId.toString())
            .issuedAt(Date.from(now))
            .expiration(Date.from(now.plus(ttlMinutes, ChronoUnit.MINUTES)))
            .signWith(key)
            .compact();
    }

    public Long parseUserId(String token) {
        String sub = Jwts.parser()
            .verifyWith(key)
            .build()
            .parseSignedClaims(token)
            .getPayload()
            .getSubject();
        return Long.valueOf(sub);
    }
}
```

- [ ] **Step 4: Run test, expect pass**

```bash
./gradlew test --tests JwtServiceTest
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/animesquad/auth/JwtService.java backend/src/test/java/com/animesquad/auth/JwtServiceTest.java
git commit -m "feat(auth): add JwtService for issue/verify HS256 tokens"
```

---

## Task 6: JwtAuthenticationFilter & SecurityConfig

**Files:**
- Create: `backend/src/main/java/com/animesquad/auth/JwtAuthenticationFilter.java`
- Create: `backend/src/main/java/com/animesquad/auth/CurrentUser.java`
- Create: `backend/src/main/java/com/animesquad/auth/SecurityConfig.java`

- [ ] **Step 1: Create `CurrentUser.java`** — request-scoped principal

```java
package com.animesquad.auth;

public record CurrentUser(Long userId) {}
```

- [ ] **Step 2: Create `JwtAuthenticationFilter.java`**

```java
package com.animesquad.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Collections;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    public static final String COOKIE_NAME = "ASQ_SESSION";
    private final JwtService jwtService;

    public JwtAuthenticationFilter(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
        throws ServletException, IOException {
        String token = readCookie(req);
        if (token != null) {
            try {
                Long userId = jwtService.parseUserId(token);
                CurrentUser principal = new CurrentUser(userId);
                var auth = new UsernamePasswordAuthenticationToken(
                    principal, null, Collections.emptyList());
                SecurityContextHolder.getContext().setAuthentication(auth);
            } catch (Exception ignored) {
                // invalid token → treat as anonymous
            }
        }
        chain.doFilter(req, res);
    }

    private String readCookie(HttpServletRequest req) {
        Cookie[] cookies = req.getCookies();
        if (cookies == null) return null;
        for (Cookie c : cookies) {
            if (COOKIE_NAME.equals(c.getName())) return c.getValue();
        }
        return null;
    }
}
```

- [ ] **Step 3: Create `SecurityConfig.java`**

```java
package com.animesquad.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.util.matcher.AntPathRequestMatcher;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtFilter;
    private final OAuth2LoginSuccessHandler oauthSuccess;

    @Value("${app.cors.allowed-origins:http://localhost:3000}")
    private String allowedOrigins;

    public SecurityConfig(JwtAuthenticationFilter jwtFilter, OAuth2LoginSuccessHandler oauthSuccess) {
        this.jwtFilter = jwtFilter;
        this.oauthSuccess = oauthSuccess;
    }

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .cors(c -> c.configurationSource(corsSource()))
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(a -> a
                .requestMatchers("/api/me").authenticated()
                .anyRequest().permitAll())
            .exceptionHandling(e -> e.defaultAuthenticationEntryPointFor(
                new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED),
                new AntPathRequestMatcher("/api/**")))
            .oauth2Login(o -> o.successHandler(oauthSuccess))
            .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    CorsConfigurationSource corsSource() {
        CorsConfiguration cfg = new CorsConfiguration();
        cfg.setAllowedOrigins(List.of(allowedOrigins.split(",")));
        cfg.setAllowedMethods(List.of("GET", "POST", "PATCH", "PUT", "DELETE"));
        cfg.setAllowedHeaders(List.of("*"));
        cfg.setAllowCredentials(true);
        UrlBasedCorsConfigurationSource src = new UrlBasedCorsConfigurationSource();
        src.registerCorsConfiguration("/**", cfg);
        return src;
    }
}
```

- [ ] **Step 4: Compile (will fail — OAuth2LoginSuccessHandler missing)**

```bash
./gradlew compileJava
```
Expected: FAIL (`OAuth2LoginSuccessHandler` not found). That bean comes next task.

- [ ] **Step 5: Commit (partial — compiles after Task 7)**

Skip commit until Task 7 done; commit happens at end of Task 7.

---

## Task 7: OAuth2 success handler — upsert user, set JWT cookie, redirect

**Files:**
- Create: `backend/src/main/java/com/animesquad/auth/OAuth2LoginSuccessHandler.java`

- [ ] **Step 1: Write the handler**

```java
package com.animesquad.auth;

import com.animesquad.user.User;
import com.animesquad.user.UserService;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
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
        String picture = principal.getAttribute("picture");

        User user = userService.upsertFromGoogle(sub, email, name, picture);
        String token = jwtService.issue(user.getId());

        // Build cookie manually for SameSite support (Servlet Cookie doesn't expose it)
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

        getRedirectStrategy().sendRedirect(req, res, successRedirect);
    }
}
```

- [ ] **Step 2: Compile**

```bash
./gradlew compileJava
```
Expected: BUILD SUCCESSFUL.

- [ ] **Step 3: Commit security stack**

```bash
git add backend/src/main/java/com/animesquad/auth/
git commit -m "feat(auth): JWT cookie filter, security config, OAuth success handler"
```

---

## Task 8: `/api/me` endpoint

**Files:**
- Create: `backend/src/main/java/com/animesquad/auth/AuthController.java`
- Test: `backend/src/test/java/com/animesquad/auth/AuthControllerIT.java`

- [ ] **Step 1: Write the failing integration test**

```java
package com.animesquad.auth;

import com.animesquad.support.AbstractIntegrationTest;
import com.animesquad.user.User;
import com.animesquad.user.UserService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.*;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AuthControllerIT extends AbstractIntegrationTest {

    @Autowired UserService userService;
    @Autowired JwtService jwtService;
    @Autowired TestRestTemplate rest;
    @LocalServerPort int port;

    @Test
    void me_returns401_whenNoCookie() {
        ResponseEntity<String> res = rest.getForEntity("http://localhost:" + port + "/api/me", String.class);
        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void me_returnsUser_whenCookiePresent() {
        User u = userService.upsertFromGoogle("g-1", "x@y.z", "X", "url");
        String token = jwtService.issue(u.getId());

        HttpHeaders h = new HttpHeaders();
        h.add(HttpHeaders.COOKIE, JwtAuthenticationFilter.COOKIE_NAME + "=" + token);
        ResponseEntity<String> res = rest.exchange(
            "http://localhost:" + port + "/api/me",
            HttpMethod.GET, new HttpEntity<>(h), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).contains("\"email\":\"x@y.z\"");
        assertThat(res.getBody()).contains("\"displayName\":\"X\"");
    }
}
```

- [ ] **Step 2: Run test, expect failure**

```bash
./gradlew test --tests AuthControllerIT
```
Expected: FAIL (controller and `/api/me` not yet present → 404 instead of 200/401).

- [ ] **Step 3: Write `AuthController.java`**

```java
package com.animesquad.auth;

import com.animesquad.user.User;
import com.animesquad.user.UserService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class AuthController {

    private final UserService userService;

    public AuthController(UserService userService) {
        this.userService = userService;
    }

    public record MeResponse(Long id, String email, String displayName, String avatarUrl) {}

    @GetMapping("/me")
    public ResponseEntity<MeResponse> me(@AuthenticationPrincipal CurrentUser current) {
        User u = userService.getById(current.userId());
        return ResponseEntity.ok(new MeResponse(u.getId(), u.getEmail(), u.getDisplayName(), u.getAvatarUrl()));
    }
}
```

- [ ] **Step 4: Run test, expect pass**

```bash
./gradlew test --tests AuthControllerIT
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/animesquad/auth/AuthController.java backend/src/test/java/com/animesquad/auth/AuthControllerIT.java
git commit -m "feat(auth): /api/me endpoint returning current user"
```

---

## Task 9: Global error handler

**Files:**
- Create: `backend/src/main/java/com/animesquad/common/ApiErrorResponse.java`
- Create: `backend/src/main/java/com/animesquad/common/GlobalExceptionHandler.java`

- [ ] **Step 1: Write `ApiErrorResponse.java`**

```java
package com.animesquad.common;

import java.util.Map;

public record ApiErrorResponse(String code, String message, Map<String, Object> details) {
    public static ApiErrorResponse of(String code, String message) {
        return new ApiErrorResponse(code, message, null);
    }
}
```

- [ ] **Step 2: Write `GlobalExceptionHandler.java`**

```java
package com.animesquad.common;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.HashMap;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiErrorResponse> badRequest(IllegalArgumentException e) {
        return ResponseEntity.badRequest().body(ApiErrorResponse.of("BAD_REQUEST", e.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiErrorResponse> validation(MethodArgumentNotValidException e) {
        Map<String, Object> fields = new HashMap<>();
        e.getBindingResult().getFieldErrors().forEach(f -> fields.put(f.getField(), f.getDefaultMessage()));
        return ResponseEntity.badRequest()
            .body(new ApiErrorResponse("VALIDATION_FAILED", "invalid input", fields));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiErrorResponse> generic(Exception e) {
        log.error("unhandled exception", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(ApiErrorResponse.of("INTERNAL_ERROR", "문제가 발생했어요"));
    }
}
```

- [ ] **Step 3: Run all backend tests**

```bash
./gradlew test
```
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/animesquad/common/
git commit -m "feat(common): add global exception handler with ApiErrorResponse"
```

---

## Task 10: Frontend Next.js project init

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/next.config.mjs`
- Create: `frontend/.env.local.example`
- Create: `frontend/src/app/layout.tsx`
- Create: `frontend/src/app/page.tsx`

- [ ] **Step 1: Scaffold with `create-next-app`**

```bash
cd frontend
pnpm dlx create-next-app@14 . --ts --eslint --app --src-dir --import-alias "@/*" --no-tailwind
```
When prompted "directory not empty": choose **Yes** to continue.

- [ ] **Step 2: Replace `src/app/page.tsx` with landing page**

```tsx
export default function HomePage() {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080";
  return (
    <main style={{ padding: 40, fontFamily: "sans-serif" }}>
      <h1>AnimeSquad</h1>
      <p>친구들과 애니메이션 시청 현황을 공유하세요.</p>
      <a
        href={`${apiBase}/oauth2/authorization/google`}
        style={{
          display: "inline-block",
          padding: "10px 16px",
          background: "#1a73e8",
          color: "white",
          borderRadius: 6,
          textDecoration: "none",
        }}
      >
        Sign in with Google
      </a>
    </main>
  );
}
```

- [ ] **Step 3: Add `.env.local.example`**

```
NEXT_PUBLIC_API_BASE=http://localhost:8080
```

- [ ] **Step 4: Verify dev server boots**

```bash
pnpm dev
```
Expected: `http://localhost:3000` shows landing page with button. Stop server (Ctrl+C).

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): scaffold Next.js app with login landing"
```

---

## Task 11: Frontend `/me` page & API helper

**Files:**
- Create: `frontend/src/app/lib/api.ts`
- Create: `frontend/src/app/me/page.tsx`

- [ ] **Step 1: Create `api.ts`**

```ts
const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080";

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export type Me = {
  id: number;
  email: string;
  displayName: string;
  avatarUrl: string | null;
};
```

- [ ] **Step 2: Create `/me/page.tsx`** (client component for session-dependent data)

```tsx
"use client";

import { useEffect, useState } from "react";
import { apiGet, type Me } from "@/app/lib/api";

export default function MePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Me>("/api/me").then(setMe).catch((e) => setError(String(e)));
  }, []);

  if (error) return <main style={{ padding: 40 }}>로그인이 필요해요. <a href="/">홈으로</a></main>;
  if (!me) return <main style={{ padding: 40 }}>불러오는 중…</main>;

  return (
    <main style={{ padding: 40, fontFamily: "sans-serif" }}>
      <h1>안녕하세요, {me.displayName}님</h1>
      <p>{me.email}</p>
      {me.avatarUrl && <img src={me.avatarUrl} alt="" width={64} height={64} style={{ borderRadius: 32 }} />}
    </main>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/lib frontend/src/app/me
git commit -m "feat(frontend): add /me page with API helper"
```

---

## Task 12: Manual end-to-end smoke test

**No code — verification only.**

- [ ] **Step 1: Get Google OAuth credentials**

  1. Visit https://console.cloud.google.com/apis/credentials
  2. Create OAuth 2.0 Client ID (type: Web application)
  3. Authorized redirect URI: `http://localhost:8080/login/oauth2/code/google`
  4. Copy Client ID and Client Secret

- [ ] **Step 2: Create `backend/.env.local` (not committed) and load**

```bash
cd backend
cat > .env.local <<'EOF'
GOOGLE_CLIENT_ID=<your-id>
GOOGLE_CLIENT_SECRET=<your-secret>
JWT_SECRET=local-development-secret-at-least-32-chars-long!
EOF
```

Then run with env loaded:
```bash
set -a; source .env.local; set +a
docker compose up -d
./gradlew bootRun
```
Expected: backend starts on :8080.

- [ ] **Step 3: Start frontend in another terminal**

```bash
cd frontend
pnpm dev
```
Expected: :3000 up.

- [ ] **Step 4: Verify the full flow in a browser**

  1. Open http://localhost:3000
  2. Click "Sign in with Google" → Google consent → redirected to http://localhost:3000/me
  3. `/me` shows your name, email, avatar
  4. Verify DB: `docker exec animesquad-db psql -U animesquad -d animesquad -c "SELECT id, email, display_name FROM users;"` → your row present

- [ ] **Step 5: Commit a CHANGELOG note**

```bash
cat > CHANGELOG.md <<'EOF'
# Changelog

## Plan 1 — 2026-06-10
- Monorepo skeleton (backend / frontend)
- Spring Boot 3 + Postgres + Flyway + JPA
- Google OAuth → JWT cookie → `/api/me`
- Next.js landing + `/me` page
EOF
git add CHANGELOG.md
git commit -m "docs: changelog for plan 1"
```

---

## Verification Checklist (Definition of Done)

- [ ] `cd backend && ./gradlew test` → all green
- [ ] `cd backend && ./gradlew bootRun` boots cleanly
- [ ] `cd frontend && pnpm build` succeeds
- [ ] Manual smoke test (Task 12) passes
- [ ] All commits on `main` (or feature branch); working tree clean

## Out of Scope for Plan 1 (covered later)

- Squads, anime, watch entries, episode ratings, activity feed (Plans 2-5)
- Profile page for other users (Plan 6)
- GitHub Actions, Vercel/Fly deploy (Plan 7)

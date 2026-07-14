package com.animesquad.auth;

import com.animesquad.support.AbstractIntegrationTest;
import com.animesquad.user.UserRepository;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "app.invite.code=TEST-INVITE")
class InviteSignupControllerIT extends AbstractIntegrationTest {

    private static final String JWT_SECRET = "dev-secret-change-me-please-at-least-32-bytes!!";

    @Autowired InviteSignupTokenService inviteTokens;
    @Autowired InviteAttemptLimiter limiter;
    @Autowired JwtService jwtService;
    @Autowired UserRepository userRepository;
    @Autowired TestRestTemplate rest;
    @LocalServerPort int port;

    @BeforeEach
    void clearLimiter() {
        limiter.clear("127.0.0.1");
        limiter.clear("0:0:0:0:0:0:0:1");
        limiter.clear("::1");
    }

    @Test
    void returns401WithoutInviteCookie() {
        ResponseEntity<Void> response = complete("TEST-INVITE", null);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertNoUser();
    }

    @Test
    void returns401ForMalformedOrExpiredInviteCookie() {
        assertThat(complete("TEST-INVITE", "malformed").getStatusCode())
            .isEqualTo(HttpStatus.UNAUTHORIZED);

        String expired = Jwts.builder()
            .subject("expired-google")
            .claim("purpose", InviteSignupTokenService.PURPOSE)
            .claim("email", "expired@example.com")
            .claim("name", "Expired")
            .issuedAt(Date.from(Instant.now().minusSeconds(120)))
            .expiration(Date.from(Instant.now().minusSeconds(60)))
            .signWith(Keys.hmacShaKeyFor(JWT_SECRET.getBytes(StandardCharsets.UTF_8)))
            .compact();

        assertThat(complete("TEST-INVITE", expired).getStatusCode())
            .isEqualTo(HttpStatus.UNAUTHORIZED);
        assertNoUser();
    }

    @Test
    void returns401ForTamperedInviteCookie() {
        String issued = inviteToken("tampered-google");
        String tampered = issued.substring(0, issued.length() - 1)
            + (issued.endsWith("a") ? "b" : "a");

        assertThat(complete("TEST-INVITE", tampered).getStatusCode())
            .isEqualTo(HttpStatus.UNAUTHORIZED);
        assertNoUser();
    }

    @Test
    void returns403ForBlankOrWrongCode() {
        String token = inviteToken("wrong-code-google");

        assertThat(complete("", token).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(complete("WRONG", token).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertNoUser();
    }

    @Test
    void firstFiveFailuresReturn403AndSixthRequestReturns429() {
        String token = inviteToken("limited-google");

        for (int attempt = 1; attempt <= 5; attempt++) {
            assertThat(complete("WRONG", token).getStatusCode())
                .as("attempt %s", attempt)
                .isEqualTo(HttpStatus.FORBIDDEN);
        }
        assertThat(complete("WRONG", token).getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        assertNoUser();
    }

    @Test
    void completesSignupAndReturnsSessionAndClearedInviteCookies() {
        ResponseEntity<Void> response = complete("TEST-INVITE", inviteToken("new-google"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(userRepository.findByGoogleSub("new-google")).isPresent();
        assertThat(response.getHeaders().get(HttpHeaders.SET_COOKIE))
            .anySatisfy(value -> assertThat(value).contains("ASQ_SESSION="))
            .anySatisfy(value -> assertThat(value).contains("invite_signup=").contains("Max-Age=0"));
    }

    @Test
    void repeatedSignupForSameProfileKeepsSingleUser() {
        String token = inviteToken("same-google");

        assertThat(complete("TEST-INVITE", token).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(complete("TEST-INVITE", token).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);

        assertThat(userRepository.findAll()).hasSize(1);
    }

    @Test
    void returns401WhenSessionTokenIsPlacedInInviteCookie() {
        assertThat(complete("TEST-INVITE", jwtService.issue(1L)).getStatusCode())
            .isEqualTo(HttpStatus.UNAUTHORIZED);
        assertNoUser();
    }

    private String inviteToken(String googleSub) {
        return inviteTokens.issue(googleSub, googleSub + "@example.com", "Invitee");
    }

    private ResponseEntity<Void> complete(String code, String cookieToken) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (cookieToken != null) {
            headers.add(HttpHeaders.COOKIE, "invite_signup=" + cookieToken);
        }
        return rest.exchange(url(), HttpMethod.POST,
            new HttpEntity<>(Map.of("code", code), headers), Void.class);
    }

    private String url() {
        return "http://localhost:" + port + "/api/auth/invite/complete";
    }

    private void assertNoUser() {
        assertThat(userRepository.findAll()).isEmpty();
    }
}

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "app.invite.code=   ")
class InviteSignupBlankCodeIT extends AbstractIntegrationTest {

    @Autowired InviteSignupTokenService inviteTokens;
    @Autowired UserRepository userRepository;
    @Autowired TestRestTemplate rest;
    @LocalServerPort int port;

    @Test
    void returns503WhenInviteCodeIsBlank() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.add(HttpHeaders.COOKIE, "invite_signup="
            + inviteTokens.issue("unconfigured-google", "unconfigured@example.com", "Invitee"));

        ResponseEntity<Void> response = rest.exchange(
            "http://localhost:" + port + "/api/auth/invite/complete",
            HttpMethod.POST,
            new HttpEntity<>(Map.of("code", "ANYTHING"), headers),
            Void.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(userRepository.findByGoogleSub("unconfigured-google")).isEmpty();
    }
}

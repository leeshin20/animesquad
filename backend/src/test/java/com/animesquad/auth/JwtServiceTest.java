package com.animesquad.auth;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JwtServiceTest {

    private static final String SECRET = "test-secret-test-secret-test-secret-32!!";
    private final JwtService jwt = new JwtService(
        SECRET, 60);

    @Test
    void issue_andParse_roundTrip() {
        String token = jwt.issue(42L);
        Long uid = jwt.parseUserId(token);
        assertThat(uid).isEqualTo(42L);
    }

    @Test
    void issue_setsSessionPurpose() {
        String token = jwt.issue(42L);

        String purpose = Jwts.parser()
            .verifyWith(Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8)))
            .build()
            .parseSignedClaims(token)
            .getPayload()
            .get("purpose", String.class);

        assertThat(purpose).isEqualTo("session");
    }

    @Test
    void parseUserId_acceptsLegacySessionWithoutPurpose() {
        Instant now = Instant.now();
        String legacySession = Jwts.builder()
            .subject("42")
            .issuedAt(Date.from(now))
            .expiration(Date.from(now.plus(60, ChronoUnit.MINUTES)))
            .signWith(Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8)))
            .compact();

        assertThat(jwt.parseUserId(legacySession)).isEqualTo(42L);
    }

    @Test
    void parseUserId_rejectsTamperedToken() {
        String token = jwt.issue(1L);
        String bad = token.substring(0, token.length() - 2) + "xx";
        assertThatThrownBy(() -> jwt.parseUserId(bad)).isInstanceOf(RuntimeException.class);
    }

    @Test
    void parseUserId_rejectsInviteTokenWithNumericGoogleSub() {
        var inviteTokens = new InviteSignupTokenService(SECRET);
        String invite = inviteTokens.issue("12345", "one@example.com", "One");

        assertThatThrownBy(() -> jwt.parseUserId(invite)).isInstanceOf(RuntimeException.class);
    }
}

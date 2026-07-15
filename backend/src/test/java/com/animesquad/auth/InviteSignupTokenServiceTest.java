package com.animesquad.auth;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.Date;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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
    void issuedTokenHasInviteSignupPurpose() {
        var service = new InviteSignupTokenService(SECRET, Clock.fixed(now, ZoneOffset.UTC));

        String token = service.issue("google-1", "one@example.com", "One");

        String purpose = Jwts.parser()
            .verifyWith(Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8)))
            .clock(() -> Date.from(now))
            .build()
            .parseSignedClaims(token)
            .getPayload()
            .get("purpose", String.class);

        assertThat(purpose).isEqualTo("invite-signup");
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

    @Test
    void parseRejectsTamperedInviteToken() {
        var service = new InviteSignupTokenService(SECRET, Clock.fixed(now, ZoneOffset.UTC));
        String token = service.issue("google-1", "one@example.com", "One");
        String tampered = token.substring(0, token.length() - 2) + "xx";

        assertThatThrownBy(() -> service.parse(tampered)).isInstanceOf(RuntimeException.class);
    }
}

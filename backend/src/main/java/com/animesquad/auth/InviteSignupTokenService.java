package com.animesquad.auth;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;

@Service
public class InviteSignupTokenService {

    static final String PURPOSE = "invite-signup";

    private final SecretKey key;
    private final Clock clock;

    public record InviteProfile(String googleSub, String email, String displayName) {}

    @Autowired
    public InviteSignupTokenService(@Value("${app.jwt.secret}") String secret) {
        this(secret, Clock.systemUTC());
    }

    InviteSignupTokenService(String secret, Clock clock) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.clock = clock;
    }

    public String issue(String googleSub, String email, String displayName) {
        Instant now = clock.instant();
        return Jwts.builder()
            .subject(googleSub)
            .claim("purpose", PURPOSE)
            .claim("email", email)
            .claim("name", displayName)
            .issuedAt(Date.from(now))
            .expiration(Date.from(now.plus(10, ChronoUnit.MINUTES)))
            .signWith(key)
            .compact();
    }

    public InviteProfile parse(String token) {
        Claims claims = Jwts.parser()
            .verifyWith(key)
            .clock(() -> Date.from(clock.instant()))
            .build()
            .parseSignedClaims(token)
            .getPayload();
        if (!PURPOSE.equals(claims.get("purpose", String.class))) {
            throw new JwtException("wrong token purpose");
        }
        return new InviteProfile(
            claims.getSubject(),
            claims.get("email", String.class),
            claims.get("name", String.class));
    }
}

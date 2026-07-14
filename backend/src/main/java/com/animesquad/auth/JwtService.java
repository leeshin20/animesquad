package com.animesquad.auth;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
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

    private static final String PURPOSE = "session";

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
            .claim("purpose", PURPOSE)
            .issuedAt(Date.from(now))
            .expiration(Date.from(now.plus(ttlMinutes, ChronoUnit.MINUTES)))
            .signWith(key)
            .compact();
    }

    public Long parseUserId(String token) {
        Claims claims = Jwts.parser()
            .verifyWith(key)
            .build()
            .parseSignedClaims(token)
            .getPayload();
        String purpose = claims.get("purpose", String.class);
        if (purpose != null && !PURPOSE.equals(purpose)) {
            throw new JwtException("wrong token purpose");
        }
        return Long.valueOf(claims.getSubject());
    }
}

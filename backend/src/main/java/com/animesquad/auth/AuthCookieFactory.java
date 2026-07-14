package com.animesquad.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class AuthCookieFactory {

    private static final String INVITE_COOKIE_NAME = "invite_signup";
    private static final long INVITE_MAX_AGE_SECONDS = 600;

    private final boolean secure;
    private final String sameSite;
    private final String domain;

    public AuthCookieFactory(
        @Value("${app.cookie.secure}") boolean secure,
        @Value("${app.cookie.same-site}") String sameSite,
        @Value("${app.cookie.domain:}") String domain
    ) {
        this.secure = secure;
        this.sameSite = sameSite;
        this.domain = domain;
    }

    public String session(String token, long maxAgeSeconds) {
        return build(JwtAuthenticationFilter.COOKIE_NAME, token, maxAgeSeconds);
    }

    public String invite(String token) {
        return build(INVITE_COOKIE_NAME, token, INVITE_MAX_AGE_SECONDS);
    }

    public String clearSession() {
        return build(JwtAuthenticationFilter.COOKIE_NAME, "", 0);
    }

    public String clearInvite() {
        return build(INVITE_COOKIE_NAME, "", 0);
    }

    private String build(String name, String value, long maxAgeSeconds) {
        StringBuilder sb = new StringBuilder();
        sb.append(name).append("=").append(value);
        sb.append("; Path=/");
        sb.append("; Max-Age=").append(maxAgeSeconds);
        sb.append("; HttpOnly");
        if (secure) sb.append("; Secure");
        sb.append("; SameSite=").append(sameSite);
        if (domain != null && !domain.isBlank()) {
            sb.append("; Domain=").append(domain);
        }
        return sb.toString();
    }
}

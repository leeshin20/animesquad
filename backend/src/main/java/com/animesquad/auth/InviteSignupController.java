package com.animesquad.auth;

import com.animesquad.user.User;
import com.animesquad.user.UserService;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/auth/invite")
public class InviteSignupController {

    private final String configuredCode;
    private final long sessionMaxAgeSeconds;
    private final InviteSignupTokenService inviteTokens;
    private final InviteAttemptLimiter limiter;
    private final UserService users;
    private final JwtService jwtService;
    private final AuthCookieFactory cookies;

    public InviteSignupController(
        @Value("${app.invite.code:}") String configuredCode,
        @Value("${app.jwt.ttl-minutes}") long ttlMinutes,
        InviteSignupTokenService inviteTokens,
        InviteAttemptLimiter limiter,
        UserService users,
        JwtService jwtService,
        AuthCookieFactory cookies
    ) {
        this.configuredCode = configuredCode;
        this.sessionMaxAgeSeconds = ttlMinutes * 60;
        this.inviteTokens = inviteTokens;
        this.limiter = limiter;
        this.users = users;
        this.jwtService = jwtService;
        this.cookies = cookies;
    }

    public record CompleteRequest(String code) {}

    @PostMapping("/complete")
    public ResponseEntity<Void> complete(
        @RequestBody CompleteRequest body,
        HttpServletRequest request
    ) {
        if (configuredCode == null || configuredCode.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
        }

        InviteSignupTokenService.InviteProfile profile;
        try {
            profile = inviteTokens.parse(inviteCookie(request));
        } catch (JwtException | IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }

        String clientIp = request.getRemoteAddr();
        if (limiter.isBlocked(clientIp)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS);
        }
        String suppliedCode = body == null ? null : body.code();
        if (suppliedCode == null || suppliedCode.isBlank() || !matchesCode(suppliedCode)) {
            boolean blocked = limiter.recordFailureAndIsBlocked(clientIp);
            throw new ResponseStatusException(
                blocked ? HttpStatus.TOO_MANY_REQUESTS : HttpStatus.FORBIDDEN);
        }

        User user = users.createFromGoogleIfAbsent(profile);
        String sessionToken = jwtService.issue(user.getId());
        limiter.clear(clientIp);

        return ResponseEntity.noContent()
            .header(HttpHeaders.SET_COOKIE,
                cookies.session(sessionToken, sessionMaxAgeSeconds),
                cookies.clearInvite())
            .build();
    }

    private boolean matchesCode(String suppliedCode) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] expected = digest.digest(configuredCode.getBytes(StandardCharsets.UTF_8));
            byte[] supplied = digest.digest(suppliedCode.getBytes(StandardCharsets.UTF_8));
            return MessageDigest.isEqual(expected, supplied);
        } catch (java.security.NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private String inviteCookie(HttpServletRequest request) {
        Cookie[] requestCookies = request.getCookies();
        if (requestCookies != null) {
            for (Cookie cookie : requestCookies) {
                if ("invite_signup".equals(cookie.getName())) {
                    return cookie.getValue();
                }
            }
        }
        throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
    }
}

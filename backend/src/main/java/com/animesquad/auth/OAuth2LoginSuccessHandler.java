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
        String onboardingRedirect = (successRedirect.endsWith("/")
            ? successRedirect.substring(0, successRedirect.length() - 1)
            : successRedirect) + "/onboarding";
        String redirectUrl = user.getTermsAgreedAt() == null ? onboardingRedirect : successRedirect;
        getRedirectStrategy().sendRedirect(req, res, redirectUrl);
    }
}

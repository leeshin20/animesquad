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
    private final AuthCookieFactory authCookieFactory;

    @Value("${app.oauth.success-redirect}")
    private String successRedirect;

    @Value("${app.jwt.ttl-minutes}")
    private long ttlMinutes;

    public OAuth2LoginSuccessHandler(
        UserService userService,
        JwtService jwtService,
        AuthCookieFactory authCookieFactory
    ) {
        this.userService = userService;
        this.jwtService = jwtService;
        this.authCookieFactory = authCookieFactory;
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

        res.addHeader("Set-Cookie", authCookieFactory.session(token, ttlMinutes * 60));

        // 온보딩 미완료 유저는 /onboarding으로 리다이렉트
        String onboardingRedirect = (successRedirect.endsWith("/")
            ? successRedirect.substring(0, successRedirect.length() - 1)
            : successRedirect) + "/onboarding";
        String redirectUrl = user.getTermsAgreedAt() == null ? onboardingRedirect : successRedirect;
        getRedirectStrategy().sendRedirect(req, res, redirectUrl);
    }
}

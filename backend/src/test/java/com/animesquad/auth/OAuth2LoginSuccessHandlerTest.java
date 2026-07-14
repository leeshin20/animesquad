package com.animesquad.auth;

import com.animesquad.user.User;
import com.animesquad.user.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.RedirectStrategy;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class OAuth2LoginSuccessHandlerTest {

    private final UserService users = mock(UserService.class);
    private final JwtService jwt = mock(JwtService.class);
    private final InviteSignupTokenService inviteTokens = mock(InviteSignupTokenService.class);
    private final AuthCookieFactory cookies = mock(AuthCookieFactory.class);
    private final RedirectStrategy redirect = mock(RedirectStrategy.class);
    private final HttpServletRequest request = mock(HttpServletRequest.class);
    private final HttpServletResponse response = mock(HttpServletResponse.class);
    private final Authentication authentication = mock(Authentication.class);
    private final OAuth2User principal = mock(OAuth2User.class);

    private OAuth2LoginSuccessHandler handler;

    @BeforeEach
    void setUp() {
        handler = new OAuth2LoginSuccessHandler(users, jwt, inviteTokens, cookies);
        handler.setRedirectStrategy(redirect);
        ReflectionTestUtils.setField(handler, "successRedirect", "https://app.example/");
        ReflectionTestUtils.setField(handler, "ttlMinutes", 43200L);
        when(authentication.getPrincipal()).thenReturn(principal);
    }

    @Test
    void existingUserGetsSessionAndNormalRedirect() throws Exception {
        User existing = new User("known", "known@example.com", "Known", null);
        existing.agreeTerms();
        when(principal.getAttribute("sub")).thenReturn("known");
        when(users.findByGoogleSub("known")).thenReturn(Optional.of(existing));
        when(jwt.issue(existing.getId())).thenReturn("session-token");
        when(cookies.session("session-token", 2592000)).thenReturn("session-cookie");
        when(cookies.clearInvite()).thenReturn("clear-invite-cookie");

        handler.onAuthenticationSuccess(request, response, authentication);

        verify(response).addHeader("Set-Cookie", "session-cookie");
        verify(response).addHeader("Set-Cookie", "clear-invite-cookie");
        verify(response, times(2)).addHeader(eq("Set-Cookie"), anyString());
        verify(redirect).sendRedirect(request, response, "https://app.example/");
        verifyNoInteractions(inviteTokens);
    }

    @Test
    void existingUserWithoutTermsGetsOnboardingRedirect() throws Exception {
        User existing = new User("known", "known@example.com", "Known", null);
        when(principal.getAttribute("sub")).thenReturn("known");
        when(users.findByGoogleSub("known")).thenReturn(Optional.of(existing));
        when(jwt.issue(existing.getId())).thenReturn("session-token");
        when(cookies.session("session-token", 2592000)).thenReturn("session-cookie");
        when(cookies.clearInvite()).thenReturn("clear-invite-cookie");

        handler.onAuthenticationSuccess(request, response, authentication);

        verify(response).addHeader("Set-Cookie", "session-cookie");
        verify(response).addHeader("Set-Cookie", "clear-invite-cookie");
        verify(response, times(2)).addHeader(eq("Set-Cookie"), anyString());
        verify(redirect).sendRedirect(request, response, "https://app.example/onboarding");
        verifyNoInteractions(inviteTokens);
    }

    @Test
    void newUserGetsInviteCookieWithoutBeingCreated() throws Exception {
        when(principal.getAttribute("sub")).thenReturn("new-google");
        when(principal.getAttribute("email")).thenReturn("new@example.com");
        when(principal.getAttribute("name")).thenReturn("New");
        when(users.findByGoogleSub("new-google")).thenReturn(Optional.empty());
        when(inviteTokens.issue("new-google", "new@example.com", "New")).thenReturn("invite-token");
        when(cookies.invite("invite-token")).thenReturn("invite-cookie");

        handler.onAuthenticationSuccess(request, response, authentication);

        verify(response, times(1)).addHeader(eq("Set-Cookie"), anyString());
        verify(response).addHeader("Set-Cookie", "invite-cookie");
        verify(redirect).sendRedirect(request, response, "https://app.example/invite");
        verify(users, never()).upsertFromGoogle(any(), any(), any(), any());
        verify(users, never()).createFromGoogleIfAbsent(any());
        verifyNoInteractions(jwt);
    }
}

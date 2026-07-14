package com.animesquad.auth;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class AuthCookieFactoryTest {

    private final AuthCookieFactory cookies = new AuthCookieFactory(true, "Strict", "example.com");

    @Test
    void sessionUsesSessionNameAndConfiguredAttributes() {
        assertThat(cookies.session("session-token", 3600)).isEqualTo(
            "ASQ_SESSION=session-token; Path=/; Max-Age=3600; HttpOnly; Secure; SameSite=Strict; Domain=example.com");
    }

    @Test
    void inviteUsesInviteNameAndTenMinuteLifetime() {
        assertThat(cookies.invite("invite-token")).isEqualTo(
            "invite_signup=invite-token; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Strict; Domain=example.com");
    }

    @Test
    void clearMethodsExpireTheirCookies() {
        assertThat(cookies.clearSession()).isEqualTo(
            "ASQ_SESSION=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict; Domain=example.com");
        assertThat(cookies.clearInvite()).isEqualTo(
            "invite_signup=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict; Domain=example.com");
    }

    @Test
    void cookiesOmitOptionalSecureAndBlankDomain() {
        var insecureCookies = new AuthCookieFactory(false, "Lax", " ");

        assertThat(insecureCookies.invite("invite-token")).isEqualTo(
            "invite_signup=invite-token; Path=/; Max-Age=600; HttpOnly; SameSite=Lax");
    }
}

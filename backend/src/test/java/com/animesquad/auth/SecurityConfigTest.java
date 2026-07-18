package com.animesquad.auth;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class SecurityConfigTest {

    @Test
    void corsAllowsChromeExtensionsWithoutOpeningOtherOrigins() {
        SecurityConfig config = new SecurityConfig(
            mock(JwtAuthenticationFilter.class),
            mock(OAuth2LoginSuccessHandler.class));
        ReflectionTestUtils.setField(config, "allowedOrigins", "https://animesquad.me");

        UrlBasedCorsConfigurationSource source =
            (UrlBasedCorsConfigurationSource) config.corsSource();
        CorsConfiguration cors = source.getCorsConfigurations().get("/**");

        assertThat(cors.checkOrigin("chrome-extension://abcdefghijklmnopabcdefghijklmnop"))
            .isEqualTo("chrome-extension://abcdefghijklmnopabcdefghijklmnop");
        assertThat(cors.checkOrigin("https://animesquad.me"))
            .isEqualTo("https://animesquad.me");
        assertThat(cors.checkOrigin("https://attacker.example"))
            .isNull();
    }
}

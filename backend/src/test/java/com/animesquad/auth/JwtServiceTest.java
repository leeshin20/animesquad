package com.animesquad.auth;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JwtServiceTest {

    private final JwtService jwt = new JwtService(
        "test-secret-test-secret-test-secret-32!!", 60);

    @Test
    void issue_andParse_roundTrip() {
        String token = jwt.issue(42L);
        Long uid = jwt.parseUserId(token);
        assertThat(uid).isEqualTo(42L);
    }

    @Test
    void parseUserId_rejectsTamperedToken() {
        String token = jwt.issue(1L);
        String bad = token.substring(0, token.length() - 2) + "xx";
        assertThatThrownBy(() -> jwt.parseUserId(bad)).isInstanceOf(RuntimeException.class);
    }
}

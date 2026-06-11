package com.animesquad.auth;

import com.animesquad.support.AbstractIntegrationTest;
import com.animesquad.user.User;
import com.animesquad.user.UserService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.*;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AuthControllerIT extends AbstractIntegrationTest {

    @Autowired UserService userService;
    @Autowired JwtService jwtService;
    @Autowired TestRestTemplate rest;
    @LocalServerPort int port;

    @Test
    void me_returns401_whenNoCookie() {
        ResponseEntity<String> res = rest.getForEntity("http://localhost:" + port + "/api/me", String.class);
        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void me_returnsUser_whenCookiePresent() {
        User u = userService.upsertFromGoogle("g-1", "x@y.z", "X", "url");
        String token = jwtService.issue(u.getId());

        HttpHeaders h = new HttpHeaders();
        h.add(HttpHeaders.COOKIE, JwtAuthenticationFilter.COOKIE_NAME + "=" + token);
        ResponseEntity<String> res = rest.exchange(
            "http://localhost:" + port + "/api/me",
            HttpMethod.GET, new HttpEntity<>(h), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).contains("\"email\":\"x@y.z\"");
        assertThat(res.getBody()).contains("\"displayName\":\"X\"");
    }
}

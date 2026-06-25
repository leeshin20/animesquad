package com.animesquad.squad;

import com.animesquad.auth.JwtAuthenticationFilter;
import com.animesquad.auth.JwtService;
import com.animesquad.support.AbstractIntegrationTest;
import com.animesquad.user.User;
import com.animesquad.user.UserService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.*;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class SquadControllerIT extends AbstractIntegrationTest {

    @Autowired UserService userService;
    @Autowired JwtService jwtService;
    @Autowired TestRestTemplate rest;
    @LocalServerPort int port;

    private HttpHeaders cookieFor(Long userId) {
        HttpHeaders h = new HttpHeaders();
        h.add(HttpHeaders.COOKIE,
            JwtAuthenticationFilter.COOKIE_NAME + "=" + jwtService.issue(userId));
        h.setContentType(MediaType.APPLICATION_JSON);
        return h;
    }

    private String url(String path) {
        return "http://localhost:" + port + path;
    }

    @Test
    void create_returns201AndOwnerCanList() {
        User me = userService.upsertFromGoogle("g-cc1", "cc1@x.y", "CC1", null);

        ResponseEntity<Map> created = rest.exchange(
            url("/api/squad"), HttpMethod.POST,
            new HttpEntity<>(Map.of("name", "Friday Crew"), cookieFor(me.getId())),
            Map.class);

        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat((String) created.getBody().get("name")).isEqualTo("Friday Crew");
        assertThat((String) created.getBody().get("inviteCode")).hasSize(10);

        ResponseEntity<Map[]> list = rest.exchange(
            url("/api/squad"), HttpMethod.GET,
            new HttpEntity<>(cookieFor(me.getId())), Map[].class);

        assertThat(list.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(list.getBody()).hasSize(1);
        assertThat((String) list.getBody()[0].get("name")).isEqualTo("Friday Crew");
    }

    @Test
    void join_addsMembership_andDetailReturnsSquad() {
        User owner = userService.upsertFromGoogle("g-cc2-o", "o2@x.y", "O", null);
        User joiner = userService.upsertFromGoogle("g-cc2-j", "j2@x.y", "J", null);

        ResponseEntity<Map> created = rest.exchange(
            url("/api/squad"), HttpMethod.POST,
            new HttpEntity<>(Map.of("name", "S"), cookieFor(owner.getId())),
            Map.class);
        String code = (String) created.getBody().get("inviteCode");
        Integer squadId = (Integer) created.getBody().get("id");

        ResponseEntity<Map> joined = rest.exchange(
            url("/api/squad/join"), HttpMethod.POST,
            new HttpEntity<>(Map.of("inviteCode", code), cookieFor(joiner.getId())),
            Map.class);

        assertThat(joined.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat((Integer) joined.getBody().get("id")).isEqualTo(squadId);

        ResponseEntity<Map> detail = rest.exchange(
            url("/api/squad/" + squadId), HttpMethod.GET,
            new HttpEntity<>(cookieFor(joiner.getId())), Map.class);
        assertThat(detail.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void unauthenticated_create_returns401() {
        ResponseEntity<String> res = rest.exchange(
            url("/api/squad"), HttpMethod.POST,
            new HttpEntity<>("{\"name\":\"x\"}", jsonHeaders()), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    private HttpHeaders jsonHeaders() {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        return h;
    }
}

package com.animesquad.anime;

import com.animesquad.auth.JwtAuthenticationFilter;
import com.animesquad.auth.JwtService;
import com.animesquad.support.AbstractIntegrationTest;
import com.animesquad.user.User;
import com.animesquad.user.UserService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.*;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AnimeControllerIT extends AbstractIntegrationTest {

    @Autowired UserService userService;
    @Autowired JwtService jwtService;
    @Autowired TestRestTemplate rest;
    @LocalServerPort int port;

    @MockBean AniListClient aniList;

    private HttpHeaders cookieFor(Long userId) {
        HttpHeaders h = new HttpHeaders();
        h.add(HttpHeaders.COOKIE,
            JwtAuthenticationFilter.COOKIE_NAME + "=" + jwtService.issue(userId));
        return h;
    }

    @Test
    void search_returnsClientResults() {
        User me = userService.upsertFromGoogle("g-as", "as@x.y", "AS", null);
        when(aniList.search(eq("frieren"))).thenReturn(List.of(
            new AniListMedia(1, "Frieren", "葬送のフリーレン", "Frieren", "img", 28, "FINISHED", "TV", 2023)
        ));

        ResponseEntity<AniListMedia[]> res = rest.exchange(
            "http://localhost:" + port + "/api/anime/search?q=frieren",
            HttpMethod.GET, new HttpEntity<>(cookieFor(me.getId())), AniListMedia[].class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).hasSize(1);
        assertThat(res.getBody()[0].anilistId()).isEqualTo(1);
        assertThat(res.getBody()[0].titleRomaji()).isEqualTo("Frieren");
    }

    @Test
    void search_returns400_whenQueryBlank() {
        User me = userService.upsertFromGoogle("g-bl", "bl@x.y", "BL", null);

        ResponseEntity<String> res = rest.exchange(
            "http://localhost:" + port + "/api/anime/search?q=",
            HttpMethod.GET, new HttpEntity<>(cookieFor(me.getId())), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void search_returns401_whenUnauthenticated() {
        ResponseEntity<String> res = rest.exchange(
            "http://localhost:" + port + "/api/anime/search?q=x",
            HttpMethod.GET, HttpEntity.EMPTY, String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }
}

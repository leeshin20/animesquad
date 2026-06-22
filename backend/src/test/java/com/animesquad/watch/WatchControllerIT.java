package com.animesquad.watch;

import com.animesquad.anime.AniListClient;
import com.animesquad.anime.AniListMedia;
import com.animesquad.anime.AnimeService;
import com.animesquad.auth.JwtAuthenticationFilter;
import com.animesquad.auth.JwtService;
import com.animesquad.support.AbstractIntegrationTest;
import com.animesquad.user.User;
import com.animesquad.user.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.*;
import org.springframework.http.client.JdkClientHttpRequestFactory;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class WatchControllerIT extends AbstractIntegrationTest {

    @Autowired UserService userService;
    @Autowired JwtService jwtService;
    @Autowired AnimeService animeService;
    @Autowired TestRestTemplate rest;
    @LocalServerPort int port;

    @MockBean AniListClient aniList;

    @BeforeEach
    void usePatchCapableClient() {
        // Default TestRestTemplate uses SimpleClientHttpRequestFactory which rejects PATCH.
        rest.getRestTemplate().setRequestFactory(new JdkClientHttpRequestFactory());
    }

    private HttpHeaders cookieFor(Long userId) {
        HttpHeaders h = new HttpHeaders();
        h.add(HttpHeaders.COOKIE,
            JwtAuthenticationFilter.COOKIE_NAME + "=" + jwtService.issue(userId));
        h.setContentType(MediaType.APPLICATION_JSON);
        return h;
    }

    private String url(String path) { return "http://localhost:" + port + path; }

    private void seedAnime(int anilistId) {
        animeService.upsertFromAniList(new AniListMedia(
            anilistId, "Romaji" + anilistId, "Native", "Eng",
            "img", 12, "FINISHED", "TV", 2024));
    }

    @Test
    void postCreatesEntry_andGetReturnsIt() {
        User me = userService.upsertFromGoogle("g-wc1", "wc1@x.y", "WC1", null);
        seedAnime(100);

        ResponseEntity<Map> created = rest.exchange(
            url("/api/watch"), HttpMethod.POST,
            new HttpEntity<>(Map.of("anilistId", 100, "status", "WATCHING"), cookieFor(me.getId())),
            Map.class);

        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat((String) created.getBody().get("status")).isEqualTo("WATCHING");
        assertThat(((Map<?, ?>) created.getBody().get("anime")).get("titleRomaji")).isEqualTo("Romaji100");
        Integer animeId = (Integer) ((Map<?, ?>) created.getBody().get("anime")).get("id");

        ResponseEntity<Map[]> list = rest.exchange(
            url("/api/watch"), HttpMethod.GET,
            new HttpEntity<>(cookieFor(me.getId())), Map[].class);
        assertThat(list.getBody()).hasSize(1);
        assertThat(((Map<?, ?>) list.getBody()[0].get("anime")).get("id")).isEqualTo(animeId);
    }

    @Test
    void patchUpdatesProgressAndScore() {
        User me = userService.upsertFromGoogle("g-wc2", "wc2@x.y", "WC2", null);
        seedAnime(200);
        ResponseEntity<Map> created = rest.exchange(
            url("/api/watch"), HttpMethod.POST,
            new HttpEntity<>(Map.of("anilistId", 200, "status", "WATCHING"), cookieFor(me.getId())),
            Map.class);
        Integer animeId = (Integer) ((Map<?, ?>) created.getBody().get("anime")).get("id");

        ResponseEntity<Map> patched = rest.exchange(
            url("/api/watch/" + animeId), HttpMethod.PATCH,
            new HttpEntity<>(Map.of("progress", 7, "score", 4), cookieFor(me.getId())),
            Map.class);

        assertThat(patched.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(patched.getBody().get("progress")).isEqualTo(7);
        assertThat(patched.getBody().get("score")).isEqualTo(4);
        assertThat(patched.getBody().get("status")).isEqualTo("WATCHING"); // unchanged
    }

    @Test
    void post_returns400_whenScoreOutOfRange_onPatch() {
        User me = userService.upsertFromGoogle("g-wc3", "wc3@x.y", "WC3", null);
        seedAnime(300);
        ResponseEntity<Map> created = rest.exchange(
            url("/api/watch"), HttpMethod.POST,
            new HttpEntity<>(Map.of("anilistId", 300, "status", "WATCHING"), cookieFor(me.getId())),
            Map.class);
        Integer animeId = (Integer) ((Map<?, ?>) created.getBody().get("anime")).get("id");

        ResponseEntity<String> bad = rest.exchange(
            url("/api/watch/" + animeId), HttpMethod.PATCH,
            new HttpEntity<>(Map.of("score", 99), cookieFor(me.getId())), String.class);

        assertThat(bad.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void post_returns401_whenUnauthenticated() {
        ResponseEntity<String> res = rest.exchange(
            url("/api/watch"), HttpMethod.POST,
            new HttpEntity<>("{\"anilistId\":1,\"status\":\"WATCHING\"}", jsonHeaders()), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    private HttpHeaders jsonHeaders() {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        return h;
    }
}

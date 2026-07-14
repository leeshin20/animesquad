package com.animesquad.episode;

import com.animesquad.anime.AniListClient;
import com.animesquad.anime.AniListMedia;
import com.animesquad.anime.Anime;
import com.animesquad.anime.AnimeService;
import com.animesquad.auth.JwtAuthenticationFilter;
import com.animesquad.auth.JwtService;
import com.animesquad.support.AbstractIntegrationTest;
import com.animesquad.user.User;
import com.animesquad.user.UserService;
import com.animesquad.watch.WatchService;
import com.animesquad.watch.WatchStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.*;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class MyEpisodeReviewControllerIT extends AbstractIntegrationTest {

    @Autowired UserService userService;
    @Autowired AnimeService animeService;
    @Autowired WatchService watchService;
    @Autowired JwtService jwtService;
    @Autowired TestRestTemplate rest;
    @LocalServerPort int port;

    @MockBean AniListClient aniList;

    private HttpHeaders cookieFor(Long userId) {
        HttpHeaders h = new HttpHeaders();
        h.add(HttpHeaders.COOKIE,
            JwtAuthenticationFilter.COOKIE_NAME + "=" + jwtService.issue(userId));
        h.setContentType(MediaType.APPLICATION_JSON);
        return h;
    }

    private String url(String path) { return "http://localhost:" + port + path; }

    @Test
    void byDefault_onlyReturnsRatingsWithComment() {
        User u = userService.upsertFromGoogle("g-mer1", "mer1@x.y", "MER1", null);
        Anime a = animeService.upsertFromAniList(new AniListMedia(
            5001, "R", "N", "E", "img", 24, "FINISHED", "TV", 2024, null, null));
        watchService.addToList(u.getId(), 5001, WatchStatus.WATCHING);

        rest.exchange(url("/api/watch/" + a.getId() + "/episodes/1"), HttpMethod.PUT,
            new HttpEntity<>(Map.of("score", 5, "comment", "재밌다"), cookieFor(u.getId())), Map.class);
        rest.exchange(url("/api/watch/" + a.getId() + "/episodes/2"), HttpMethod.PUT,
            new HttpEntity<>(Map.of("score", 3), cookieFor(u.getId())), Map.class);

        ResponseEntity<Map[]> res = rest.exchange(
            url("/api/me/episode-reviews"), HttpMethod.GET,
            new HttpEntity<>(cookieFor(u.getId())), Map[].class);

        assertThat(res.getBody()).hasSize(1);
        assertThat(res.getBody()[0].get("episodeNumber")).isEqualTo(1);
    }

    @Test
    void commentOnlyFalse_returnsAllRatings() {
        User u = userService.upsertFromGoogle("g-mer2", "mer2@x.y", "MER2", null);
        Anime a = animeService.upsertFromAniList(new AniListMedia(
            5002, "R", "N", "E", "img", 24, "FINISHED", "TV", 2024, null, null));
        watchService.addToList(u.getId(), 5002, WatchStatus.WATCHING);

        rest.exchange(url("/api/watch/" + a.getId() + "/episodes/1"), HttpMethod.PUT,
            new HttpEntity<>(Map.of("score", 5, "comment", "재밌다"), cookieFor(u.getId())), Map.class);
        rest.exchange(url("/api/watch/" + a.getId() + "/episodes/2"), HttpMethod.PUT,
            new HttpEntity<>(Map.of("score", 3), cookieFor(u.getId())), Map.class);

        ResponseEntity<Map[]> res = rest.exchange(
            url("/api/me/episode-reviews?commentOnly=false"), HttpMethod.GET,
            new HttpEntity<>(cookieFor(u.getId())), Map[].class);

        assertThat(res.getBody()).hasSize(2);
    }

    @Test
    void limit_isRespected_whenBelowMax() {
        User u = userService.upsertFromGoogle("g-mer3", "mer3@x.y", "MER3", null);
        Anime a = animeService.upsertFromAniList(new AniListMedia(
            5003, "R", "N", "E", "img", 999, "FINISHED", "TV", 2024, null, null));
        watchService.addToList(u.getId(), 5003, WatchStatus.WATCHING);
        for (int ep = 1; ep <= 3; ep++) {
            rest.exchange(url("/api/watch/" + a.getId() + "/episodes/" + ep), HttpMethod.PUT,
                new HttpEntity<>(Map.of("score", 4, "comment", "c" + ep), cookieFor(u.getId())), Map.class);
        }

        ResponseEntity<Map[]> uncapped = rest.exchange(
            url("/api/me/episode-reviews?limit=999&commentOnly=false"), HttpMethod.GET,
            new HttpEntity<>(cookieFor(u.getId())), Map[].class);
        assertThat(uncapped.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(uncapped.getBody()).hasSize(3);

        ResponseEntity<Map[]> capped = rest.exchange(
            url("/api/me/episode-reviews?limit=1&commentOnly=false"), HttpMethod.GET,
            new HttpEntity<>(cookieFor(u.getId())), Map[].class);
        assertThat(capped.getBody()).hasSize(1);
    }
}

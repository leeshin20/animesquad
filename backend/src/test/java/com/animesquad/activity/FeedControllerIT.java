package com.animesquad.activity;

import com.animesquad.anime.AniListClient;
import com.animesquad.anime.AniListMedia;
import com.animesquad.anime.AnimeService;
import com.animesquad.auth.JwtAuthenticationFilter;
import com.animesquad.auth.JwtService;
import com.animesquad.squad.Squad;
import com.animesquad.squad.SquadService;
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
class FeedControllerIT extends AbstractIntegrationTest {

    @Autowired UserService userService;
    @Autowired AnimeService animeService;
    @Autowired WatchService watchService;
    @Autowired SquadService squadService;
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

    private String url(String path) { return "http://localhost:" + port + path; }

    @Test
    void feed_returnsEventsForSquad_inDescendingOrder_withActorAndAnime() {
        User me = userService.upsertFromGoogle("g-feed", "feed@x.y", "Feeder", "avatar");
        Squad s = squadService.createSquad(me.getId(), "S");
        var anime = animeService.upsertFromAniList(new AniListMedia(
            7001, "Frieren", "葬送", "FrierenE", "img", 28, "FINISHED", "TV", 2023));
        watchService.addToList(me.getId(), 7001, WatchStatus.WATCHING);
        watchService.updateEntry(me.getId(), anime.getId(), null, 5, null, null);

        ResponseEntity<Map[]> res = rest.exchange(
            url("/api/squad/" + s.getId() + "/feed"), HttpMethod.GET,
            new HttpEntity<>(cookieFor(me.getId())), Map[].class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody().length).isGreaterThanOrEqualTo(2);
        assertThat((String) res.getBody()[0].get("type")).isEqualTo("PROGRESS_UPDATED");
        assertThat(((Map<?, ?>) res.getBody()[0].get("actor")).get("displayName")).isEqualTo("Feeder");
        assertThat(((Map<?, ?>) res.getBody()[0].get("anime")).get("titleRomaji")).isEqualTo("Frieren");
    }

    @Test
    void feed_respectsCursor() {
        User me = userService.upsertFromGoogle("g-cur", "cur@x.y", "Cur", null);
        Squad s = squadService.createSquad(me.getId(), "S");
        var anime = animeService.upsertFromAniList(new AniListMedia(
            7002, "R", "N", "E", "img", 12, "FINISHED", "TV", 2024));
        watchService.addToList(me.getId(), 7002, WatchStatus.WATCHING);
        watchService.updateEntry(me.getId(), anime.getId(), null, 1, null, null);
        watchService.updateEntry(me.getId(), anime.getId(), null, 2, null, null);

        ResponseEntity<Map[]> first = rest.exchange(
            url("/api/squad/" + s.getId() + "/feed?limit=1"), HttpMethod.GET,
            new HttpEntity<>(cookieFor(me.getId())), Map[].class);
        assertThat(first.getBody()).hasSize(1);
        Integer firstId = (Integer) first.getBody()[0].get("id");

        ResponseEntity<Map[]> second = rest.exchange(
            url("/api/squad/" + s.getId() + "/feed?limit=1&cursor=" + firstId),
            HttpMethod.GET,
            new HttpEntity<>(cookieFor(me.getId())), Map[].class);
        assertThat(second.getBody()).hasSize(1);
        assertThat((Integer) second.getBody()[0].get("id")).isLessThan(firstId);
    }

    @Test
    void feed_returns400_whenViewerNotMember() {
        User owner = userService.upsertFromGoogle("g-fo", "fo@x.y", "FO", null);
        User stranger = userService.upsertFromGoogle("g-fs", "fs@x.y", "FS", null);
        Squad s = squadService.createSquad(owner.getId(), "S");

        ResponseEntity<String> res = rest.exchange(
            url("/api/squad/" + s.getId() + "/feed"), HttpMethod.GET,
            new HttpEntity<>(cookieFor(stranger.getId())), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void feed_returns401_whenUnauthenticated() {
        ResponseEntity<String> res = rest.exchange(
            url("/api/squad/1/feed"), HttpMethod.GET,
            HttpEntity.EMPTY, String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }
}

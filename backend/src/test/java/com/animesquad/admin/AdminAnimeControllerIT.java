package com.animesquad.admin;

import com.animesquad.anime.AniListClient;
import com.animesquad.anime.AniListMedia;
import com.animesquad.anime.Anime;
import com.animesquad.anime.AnimeRepository;
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

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "app.admin.emails=admin@x.y")
class AdminAnimeControllerIT extends AbstractIntegrationTest {

    @Autowired UserService userService;
    @Autowired JwtService jwtService;
    @Autowired AnimeService animeService;
    @Autowired AnimeRepository animes;
    @Autowired WatchService watchService;
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

    private Long adminId() {
        return userService.upsertFromGoogle("g-admin", "admin@x.y", "Admin", null).getId();
    }

    private Anime seedAnime(int anilistId, String korean) {
        Anime a = animeService.upsertFromAniList(new AniListMedia(
            anilistId, "Romaji" + anilistId, "Native", "Eng", "img", 12, "FINISHED", "TV", 2024, null, null));
        if (korean != null) {
            a.setTitleKorean(korean);
            animes.save(a);
        }
        return a;
    }

    @SuppressWarnings("unchecked")
    @Test
    void list_withoutQuery_returnsOnlyAnimeMissingKoreanTitle() {
        Long admin = adminId();
        seedAnime(101, null);     // missing korean — should appear
        seedAnime(102, "코난");    // has korean — should be hidden

        ResponseEntity<List> res = rest.exchange(
            url("/api/admin/anime"), HttpMethod.GET,
            new HttpEntity<>(cookieFor(admin)), List.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        List<Map<String, Object>> body = res.getBody();
        assertThat(body).hasSize(1);
        assertThat(body.get(0).get("titleRomaji")).isEqualTo("Romaji101");
    }

    @SuppressWarnings("unchecked")
    @Test
    void list_withQuery_searchesAll_includingKoreanTitled() {
        Long admin = adminId();
        seedAnime(101, null);     // missing korean, title won't match "코난"
        seedAnime(102, "코난");    // has korean — should be found by search

        ResponseEntity<List> res = rest.exchange(
            url("/api/admin/anime?q=코난"), HttpMethod.GET,
            new HttpEntity<>(cookieFor(admin)), List.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        List<Map<String, Object>> body = res.getBody();
        assertThat(body).hasSize(1);
        assertThat(body.get(0).get("titleKorean")).isEqualTo("코난");
    }

    @SuppressWarnings("unchecked")
    @Test
    void patch_updatesTitleKoreanAndSearchKeywords() {
        Long admin = adminId();
        Anime a = seedAnime(103, null);

        ResponseEntity<Map> res = rest.exchange(
            url("/api/admin/anime/" + a.getId()), HttpMethod.PATCH,
            new HttpEntity<>(Map.of("titleKorean", "BanG Dream!", "searchKeywords", "뱅드림, 방드림"),
                cookieFor(admin)), Map.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody().get("titleKorean")).isEqualTo("BanG Dream!");
        assertThat(res.getBody().get("searchKeywords")).isEqualTo("뱅드림, 방드림");
        Anime saved = animes.findById(a.getId()).orElseThrow();
        assertThat(saved.getTitleKorean()).isEqualTo("BanG Dream!");
        assertThat(saved.getSearchKeywords()).isEqualTo("뱅드림, 방드림");
    }

    @SuppressWarnings("unchecked")
    @Test
    void patch_clearsSearchKeywords_whenBlank() {
        Long admin = adminId();
        Anime a = seedAnime(104, "코난");
        a.setSearchKeywords("명탐정");
        animes.save(a);

        ResponseEntity<Map> res = rest.exchange(
            url("/api/admin/anime/" + a.getId()), HttpMethod.PATCH,
            new HttpEntity<>(Map.of("titleKorean", "코난", "searchKeywords", "  "),
                cookieFor(admin)), Map.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody().get("searchKeywords")).isNull();
        assertThat(animes.findById(a.getId()).orElseThrow().getSearchKeywords()).isNull();
    }

    @Test
    void delete_removesAnime_whenNoReferences() {
        Long admin = adminId();
        Anime a = seedAnime(201, null);

        ResponseEntity<Void> res = rest.exchange(
            url("/api/admin/anime/" + a.getId()), HttpMethod.DELETE,
            new HttpEntity<>(cookieFor(admin)), Void.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(animes.findById(a.getId())).isEmpty();
    }

    @SuppressWarnings("unchecked")
    @Test
    void bulkDelete_deletesUnreferenced_andSkipsReferenced() {
        Long admin = adminId();
        Anime free1 = seedAnime(301, null);
        Anime referenced = seedAnime(302, null);
        Anime free2 = seedAnime(303, null);
        User viewer = userService.upsertFromGoogle("g-viewer2", "viewer2@x.y", "V", null);
        watchService.addToList(viewer.getId(), 302, WatchStatus.WATCHING);

        ResponseEntity<Map> res = rest.exchange(
            url("/api/admin/anime/bulk-delete"), HttpMethod.POST,
            new HttpEntity<>(Map.of("ids", List.of(free1.getId(), referenced.getId(), free2.getId())),
                cookieFor(admin)), Map.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody().get("deleted")).isEqualTo(2);
        assertThat(res.getBody().get("skipped")).isEqualTo(1);
        assertThat(animes.findById(free1.getId())).isEmpty();
        assertThat(animes.findById(free2.getId())).isEmpty();
        assertThat(animes.findById(referenced.getId())).isPresent();
    }

    @Test
    void bulkDelete_returns403_forNonAdmin() {
        User viewer = userService.upsertFromGoogle("g-viewer3", "viewer3@x.y", "V", null);
        Anime a = seedAnime(304, null);

        ResponseEntity<String> res = rest.exchange(
            url("/api/admin/anime/bulk-delete"), HttpMethod.POST,
            new HttpEntity<>(Map.of("ids", List.of(a.getId())), cookieFor(viewer.getId())), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(animes.findById(a.getId())).isPresent();
    }

    @Test
    void delete_returns409_whenReferencedByWatchEntry() {
        Long admin = adminId();
        Anime a = seedAnime(202, null);
        User viewer = userService.upsertFromGoogle("g-viewer", "viewer@x.y", "V", null);
        watchService.addToList(viewer.getId(), 202, WatchStatus.WATCHING);

        ResponseEntity<String> res = rest.exchange(
            url("/api/admin/anime/" + a.getId()), HttpMethod.DELETE,
            new HttpEntity<>(cookieFor(admin)), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(animes.findById(a.getId())).isPresent();
    }
}

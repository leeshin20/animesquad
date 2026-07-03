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
class EpisodeRatingControllerIT extends AbstractIntegrationTest {

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

    private record Setup(Long userId, Long animeId) {}

    private Setup seed(String suffix, int anilistId) {
        User u = userService.upsertFromGoogle("g-" + suffix, suffix + "@x.y", suffix.toUpperCase(), null);
        Anime a = animeService.upsertFromAniList(new AniListMedia(
            anilistId, "Romaji", "Native", "Eng", "img", 24, "FINISHED", "TV", 2024, null));
        watchService.addToList(u.getId(), anilistId, WatchStatus.WATCHING);
        return new Setup(u.getId(), a.getId());
    }

    @Test
    void put_createsRating_andGetReturnsIt() {
        Setup s = seed("ec1", 2001);

        ResponseEntity<Map> put = rest.exchange(
            url("/api/watch/" + s.animeId() + "/episodes/3"), HttpMethod.PUT,
            new HttpEntity<>(Map.of("score", 4, "comment", "굿"), cookieFor(s.userId())),
            Map.class);

        assertThat(put.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(put.getBody().get("episodeNumber")).isEqualTo(3);
        assertThat(put.getBody().get("score")).isEqualTo(4);

        ResponseEntity<Map[]> list = rest.exchange(
            url("/api/watch/" + s.animeId() + "/episodes"), HttpMethod.GET,
            new HttpEntity<>(cookieFor(s.userId())), Map[].class);

        assertThat(list.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(list.getBody()).hasSize(1);
        assertThat(list.getBody()[0].get("episodeNumber")).isEqualTo(3);
    }

    @Test
    void put_returns400_whenScoreOutOfRange() {
        Setup s = seed("ec2", 2002);

        ResponseEntity<String> res = rest.exchange(
            url("/api/watch/" + s.animeId() + "/episodes/1"), HttpMethod.PUT,
            new HttpEntity<>(Map.of("score", 6), cookieFor(s.userId())), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void put_returns400_whenUserHasNoWatchEntry() {
        User stranger = userService.upsertFromGoogle("g-ec3", "ec3@x.y", "EC3", null);
        Anime a = animeService.upsertFromAniList(new AniListMedia(
            2003, "R", "N", "E", "img", 12, "FINISHED", "TV", 2024, null));

        ResponseEntity<String> res = rest.exchange(
            url("/api/watch/" + a.getId() + "/episodes/1"), HttpMethod.PUT,
            new HttpEntity<>(Map.of("score", 4), cookieFor(stranger.getId())), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void delete_removesRating() {
        Setup s = seed("ec4", 2004);
        rest.exchange(url("/api/watch/" + s.animeId() + "/episodes/2"), HttpMethod.PUT,
            new HttpEntity<>(Map.of("score", 5, "comment", "좋음"), cookieFor(s.userId())), Map.class);

        ResponseEntity<Void> del = rest.exchange(
            url("/api/watch/" + s.animeId() + "/episodes/2"), HttpMethod.DELETE,
            new HttpEntity<>(cookieFor(s.userId())), Void.class);
        assertThat(del.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);

        ResponseEntity<Map[]> list = rest.exchange(
            url("/api/watch/" + s.animeId() + "/episodes"), HttpMethod.GET,
            new HttpEntity<>(cookieFor(s.userId())), Map[].class);
        assertThat(list.getBody()).isEmpty();
    }

    @Test
    void delete_returns404_whenRatingAbsent() {
        Setup s = seed("ec5", 2005);

        ResponseEntity<String> res = rest.exchange(
            url("/api/watch/" + s.animeId() + "/episodes/9"), HttpMethod.DELETE,
            new HttpEntity<>(cookieFor(s.userId())), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void put_returns401_whenUnauthenticated() {
        ResponseEntity<String> res = rest.exchange(
            url("/api/watch/1/episodes/1"), HttpMethod.PUT,
            new HttpEntity<>("{\"score\":3}", jsonHeaders()), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    private HttpHeaders jsonHeaders() {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        return h;
    }
}

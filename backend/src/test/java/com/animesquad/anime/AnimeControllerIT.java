package com.animesquad.anime;

import com.animesquad.anime.dto.AnimeResponse;
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

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AnimeControllerIT extends AbstractIntegrationTest {

    @Autowired UserService userService;
    @Autowired AnimeService animeService;
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
    void search_returnsCachedResults() {
        User me = userService.upsertFromGoogle("g-as", "as@x.y", "AS", null);
        animeService.upsertFromAniList(new AniListMedia(
            1, "Frieren", "葬送のフリーレン", "Frieren", "img", 28, "FINISHED", "TV", 2023));

        ResponseEntity<AnimeResponse[]> res = rest.exchange(
            "http://localhost:" + port + "/api/anime/search?q=frieren",
            HttpMethod.GET, new HttpEntity<>(cookieFor(me.getId())), AnimeResponse[].class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).hasSize(1);
        assertThat(res.getBody()[0].anilistId()).isEqualTo(1);
        assertThat(res.getBody()[0].titleRomaji()).isEqualTo("Frieren");
    }

    @Test
    void search_returnsEmpty_whenNoCacheMatch() {
        User me = userService.upsertFromGoogle("g-nm", "nm@x.y", "NM", null);

        ResponseEntity<AnimeResponse[]> res = rest.exchange(
            "http://localhost:" + port + "/api/anime/search?q=neverexists",
            HttpMethod.GET, new HttpEntity<>(cookieFor(me.getId())), AnimeResponse[].class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).isEmpty();
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

    @Test
    void getById_returnsAnime_and404WhenMissing() {
        User me = userService.upsertFromGoogle("g-gbi", "gbi@x.y", "GBI", null);
        Anime a = animeService.upsertFromAniList(new AniListMedia(
            101, "Romaji101", "Native", "Eng", "img", 12, "FINISHED", "TV", 2024));

        ResponseEntity<AnimeResponse> ok = rest.exchange(
            "http://localhost:" + port + "/api/anime/" + a.getId(), HttpMethod.GET,
            new HttpEntity<>(cookieFor(me.getId())), AnimeResponse.class);
        assertThat(ok.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(ok.getBody().id()).isEqualTo(a.getId());
        assertThat(ok.getBody().anilistId()).isEqualTo(101);
        assertThat(ok.getBody().titleRomaji()).isEqualTo("Romaji101");

        ResponseEntity<String> missing = rest.exchange(
            "http://localhost:" + port + "/api/anime/999999", HttpMethod.GET,
            new HttpEntity<>(cookieFor(me.getId())), String.class);
        assertThat(missing.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }
}

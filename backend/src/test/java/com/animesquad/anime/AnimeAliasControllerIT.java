package com.animesquad.anime;

import com.animesquad.anime.dto.AnimeResponse;
import com.animesquad.auth.JwtAuthenticationFilter;
import com.animesquad.auth.JwtService;
import com.animesquad.support.AbstractIntegrationTest;
import com.animesquad.user.UserService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AnimeAliasControllerIT extends AbstractIntegrationTest {

    @Autowired UserService userService;
    @Autowired AnimeService animeService;
    @Autowired AnimeRepository animes;
    @Autowired JwtService jwtService;
    @Autowired TestRestTemplate rest;
    @LocalServerPort int port;

    @MockBean AniListClient aniList;

    private HttpHeaders cookieFor(Long userId) {
        HttpHeaders headers = new HttpHeaders();
        headers.add(HttpHeaders.COOKIE,
            JwtAuthenticationFilter.COOKIE_NAME + "=" + jwtService.issue(userId));
        headers.setContentType(MediaType.APPLICATION_JSON);
        return headers;
    }

    private String url(String path) {
        return "http://localhost:" + port + path;
    }

    private Anime seedAnime() {
        Anime anime = animeService.upsertFromAniList(new AniListMedia(
            701, "Tomb Raider King", "도굴왕", null,
            "img", 12, "FINISHED", "TV", 2026, null, null));
        anime.setTitleKorean("도굴왕");
        anime.setSearchKeywords("툼 레이더 킹");
        return animes.save(anime);
    }

    @Test
    void addAlias_appendsOnceAndMakesAliasSearchable() {
        Long userId = userService.upsertFromGoogle("g-alias", "alias@x.y", "Alias", null).getId();
        Anime anime = seedAnime();
        HttpEntity<Map<String, String>> request = new HttpEntity<>(
            Map.of("alias", "(자막) 도굴왕"), cookieFor(userId));

        ResponseEntity<Void> first = rest.exchange(
            url("/api/anime/" + anime.getId() + "/aliases"), HttpMethod.POST, request, Void.class);
        ResponseEntity<Void> duplicate = rest.exchange(
            url("/api/anime/" + anime.getId() + "/aliases"), HttpMethod.POST, request, Void.class);

        assertThat(first.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(duplicate.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(animes.findById(anime.getId()).orElseThrow().getSearchKeywords())
            .isEqualTo("툼 레이더 킹, (자막) 도굴왕");

        String query = URLEncoder.encode("(자막) 도굴왕", StandardCharsets.UTF_8);
        ResponseEntity<AnimeResponse[]> search = rest.getForEntity(
            URI.create(url("/api/anime/search?q=" + query)), AnimeResponse[].class);
        assertThat(search.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(search.getBody()).extracting(AnimeResponse::id).containsExactly(anime.getId());
    }

    @Test
    void addAlias_requiresAuthentication() {
        Anime anime = seedAnime();

        ResponseEntity<String> response = rest.postForEntity(
            url("/api/anime/" + anime.getId() + "/aliases"),
            Map.of("alias", "(자막) 도굴왕"), String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(animes.findById(anime.getId()).orElseThrow().getSearchKeywords())
            .isEqualTo("툼 레이더 킹");
    }

    @Test
    void addAlias_rejectsBlankAndOver200Characters() {
        Long userId = userService.upsertFromGoogle("g-invalid", "invalid@x.y", "Invalid", null).getId();
        Anime anime = seedAnime();

        ResponseEntity<String> blank = rest.exchange(
            url("/api/anime/" + anime.getId() + "/aliases"), HttpMethod.POST,
            new HttpEntity<>(Map.of("alias", "   "), cookieFor(userId)), String.class);
        ResponseEntity<String> tooLong = rest.exchange(
            url("/api/anime/" + anime.getId() + "/aliases"), HttpMethod.POST,
            new HttpEntity<>(Map.of("alias", "x".repeat(201)), cookieFor(userId)), String.class);

        assertThat(blank.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(tooLong.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void addAlias_returns404WhenAnimeDoesNotExist() {
        Long userId = userService.upsertFromGoogle("g-missing", "missing@x.y", "Missing", null).getId();

        ResponseEntity<String> response = rest.exchange(
            url("/api/anime/999999/aliases"), HttpMethod.POST,
            new HttpEntity<>(Map.of("alias", "별칭"), cookieFor(userId)), String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }
}

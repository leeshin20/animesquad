package com.animesquad.anime;

import com.animesquad.auth.JwtAuthenticationFilter;
import com.animesquad.auth.JwtService;
import com.animesquad.support.AbstractIntegrationTest;
import com.animesquad.user.UserService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.*;

import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AnimePlatformLinkControllerIT extends AbstractIntegrationTest {
    @Autowired AnimeRepository animes;
    @Autowired UserService users;
    @Autowired JwtService jwt;
    @Autowired TestRestTemplate rest;
    @LocalServerPort int port;

    private String url(String path) { return "http://localhost:" + port + path; }
    private HttpHeaders cookie(String name) {
        var user = users.upsertFromGoogle("g-" + name, name + "@x.y", name, null);
        HttpHeaders headers = new HttpHeaders();
        headers.add(HttpHeaders.COOKIE, JwtAuthenticationFilter.COOKIE_NAME + "=" + jwt.issue(user.getId()));
        headers.setContentType(MediaType.APPLICATION_JSON);
        return headers;
    }
    private Anime seed(int id) {
        Anime anime = new Anime(id, "Frieren" + id, "葬送のフリーレン", null,
            "img", 28, "FINISHED", "TV", 2023, "FALL", null);
        anime.setTitleKorean("장송의 프리렌" + id);
        return animes.save(anime);
    }
    private ResponseEntity<String> register(Long animeId, String platform, String workId, HttpHeaders auth) {
        return rest.exchange(url("/api/anime/" + animeId + "/platform-links"), HttpMethod.POST,
            new HttpEntity<>(Map.of("platform", platform, "platformAnimeId", workId), auth), String.class);
    }
    private ResponseEntity<Map> resolve(String workId) {
        return rest.getForEntity(url("/api/anime/platform-links/LAFTEL/" + workId), Map.class);
    }

    @Test
    void firstViewerLinkIsPubliclyReusable_andIdempotentForAnotherViewer() {
        Anime anime = seed(701);
        assertThat(register(anime.getId(), "LAFTEL", "41666", cookie("first")).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(register(anime.getId(), "LAFTEL", "41666", cookie("second")).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        var response = resolve("41666");
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(((Number) response.getBody().get("id")).longValue()).isEqualTo(anime.getId());
        assertThat(response.getBody().get("titleKorean")).isEqualTo("장송의 프리렌701");
    }
    @Test
    void differentPlatformIdsCanPointToSameAnime() {
        Anime anime = seed(702);
        HttpHeaders auth = cookie("editions");
        assertThat(register(anime.getId(), "LAFTEL", "41666", auth).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(register(anime.getId(), "LAFTEL", "41667", auth).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(resolve("41666").getBody().get("id")).isEqualTo(resolve("41667").getBody().get("id"));
    }
    @Test
    void conflictingSelectionDoesNotOverwriteExistingLink() {
        Anime first = seed(703);
        Anime other = seed(704);
        assertThat(register(first.getId(), "LAFTEL", "41666", cookie("correct")).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(register(other.getId(), "LAFTEL", "41666", cookie("conflict")).getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(((Number) resolve("41666").getBody().get("id")).longValue()).isEqualTo(first.getId());
    }
    @Test
    void registrationRequiresAuthentication() {
        Anime anime = seed(705);
        assertThat(register(anime.getId(), "LAFTEL", "41666", new HttpHeaders()).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(resolve("41666").getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }
    @Test
    void missingAnimeAndUnknownLinkReturn404() {
        assertThat(resolve("41666").getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(register(999999L, "LAFTEL", "41666", cookie("missing")).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }
    @Test
    void invalidPlatformAndIdsReturn400() {
        Anime anime = seed(706);
        HttpHeaders auth = cookie("invalid");
        for (String workId : new String[]{"", "0", "-1", "041666", "abc", "123456789012345678901"}) {
            assertThat(register(anime.getId(), "LAFTEL", workId, auth).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        }
        assertThat(register(anime.getId(), "NETFLIX", "41666", auth).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(rest.getForEntity(url("/api/anime/platform-links/NETFLIX/41666"), String.class).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(resolve("abc").getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }
    @Test
    void deletingAnimeRemovesLink() {
        Anime anime = seed(707);
        assertThat(register(anime.getId(), "LAFTEL", "41666", cookie("delete")).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        animes.deleteById(anime.getId());
        assertThat(resolve("41666").getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }
    @Test
    void concurrentDifferentSelectionsKeepExactlyOneWinner() throws Exception {
        Anime first = seed(708);
        Anime second = seed(709);
        HttpHeaders auth = cookie("race");
        try (var pool = Executors.newFixedThreadPool(2)) {
            var a = pool.submit(() -> register(first.getId(), "LAFTEL", "41666", auth));
            var b = pool.submit(() -> register(second.getId(), "LAFTEL", "41666", auth));
            HttpStatusCode left = a.get(15, TimeUnit.SECONDS).getStatusCode();
            HttpStatusCode right = b.get(15, TimeUnit.SECONDS).getStatusCode();
            assertThat(java.util.List.of(left, right)).containsExactlyInAnyOrder(HttpStatus.NO_CONTENT, HttpStatus.CONFLICT);
            long winner = ((Number) resolve("41666").getBody().get("id")).longValue();
            assertThat(winner).isEqualTo(left.equals(HttpStatus.NO_CONTENT) ? first.getId() : second.getId());
        }
    }
}

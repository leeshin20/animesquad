package com.animesquad.anime;

import com.animesquad.auth.JwtAuthenticationFilter;
import com.animesquad.auth.JwtService;
import com.animesquad.support.AbstractIntegrationTest;
import com.animesquad.user.User;
import com.animesquad.user.UserService;
import com.animesquad.watch.WatchEntry;
import com.animesquad.watch.WatchService;
import com.animesquad.watch.WatchStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.*;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AnimeReviewsControllerIT extends AbstractIntegrationTest {

    @Autowired UserService userService;
    @Autowired WatchService watchService;
    @Autowired AnimeService animeService;
    @Autowired JwtService jwtService;
    @Autowired TestRestTemplate rest;
    @LocalServerPort int port;

    private HttpHeaders cookieFor(Long userId) {
        HttpHeaders h = new HttpHeaders();
        h.add(HttpHeaders.COOKIE, JwtAuthenticationFilter.COOKIE_NAME + "=" + jwtService.issue(userId));
        h.setContentType(MediaType.APPLICATION_JSON);
        return h;
    }
    private String url(String p) { return "http://localhost:" + port + p; }
    private AniListMedia media(int id) {
        return new AniListMedia(id, "Romaji" + id, "Native", "Eng", "img", 12, "FINISHED", "TV", 2024);
    }

    private ResponseEntity<List<Map<String, Object>>> getReviews(Long animeId, Long asUserId) {
        return rest.exchange(
            url("/api/anime/" + animeId + "/reviews"), HttpMethod.GET,
            new HttpEntity<>(cookieFor(asUserId)),
            new ParameterizedTypeReference<List<Map<String, Object>>>() {});
    }

    @Test
    void listsAllUsersFlat_includingSelf_regardlessOfSquad() {
        User me = userService.upsertFromGoogle("g-rev-me", "me@x.y", "Me", null);
        User other = userService.upsertFromGoogle("g-rev-other", "other@x.y", "Other", null);
        // me and other share NO squad — still both must appear.

        animeService.upsertFromAniList(media(401));
        WatchEntry mineEntry = watchService.addToList(me.getId(), 401, WatchStatus.WATCHING);
        Long animeId = mineEntry.getAnimeId();
        watchService.addToList(other.getId(), 401, WatchStatus.COMPLETED);
        watchService.updateEntry(other.getId(), animeId, null, 12, 5, "최고");

        ResponseEntity<List<Map<String, Object>>> res = getReviews(animeId, me.getId());

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        List<Map<String, Object>> reviews = res.getBody();
        assertThat(reviews).hasSize(2); // self included, other included

        // self is present
        assertThat(reviews).anySatisfy(r -> {
            @SuppressWarnings("unchecked")
            Map<String, Object> actor = (Map<String, Object>) r.get("actor");
            assertThat(actor.get("displayName")).isEqualTo("Me");
        });

        // other's score/comment surfaced
        Map<String, Object> otherReview = reviews.stream()
            .filter(r -> "Other".equals(((Map<?, ?>) r.get("actor")).get("displayName")))
            .findFirst().orElseThrow();
        assertThat(otherReview.get("score")).isEqualTo(5);
        assertThat(otherReview.get("comment")).isEqualTo("최고");
        assertThat(otherReview.get("status")).isEqualTo("COMPLETED");
        assertThat(otherReview.get("progress")).isEqualTo(12);
    }

    @Test
    void ordersByUpdatedAtDesc() {
        User a = userService.upsertFromGoogle("g-rev-a", "a@x.y", "Aaa", null);
        User b = userService.upsertFromGoogle("g-rev-b", "b@x.y", "Bbb", null);

        animeService.upsertFromAniList(media(402));
        WatchEntry first = watchService.addToList(a.getId(), 402, WatchStatus.WATCHING);
        Long animeId = first.getAnimeId();
        watchService.addToList(b.getId(), 402, WatchStatus.WATCHING);
        // b updated most recently → b should be first.
        watchService.updateEntry(b.getId(), animeId, null, 3, null, null);

        List<Map<String, Object>> reviews = getReviews(animeId, a.getId()).getBody();
        assertThat(reviews).hasSize(2);
        Map<String, Object> firstActor = (Map<String, Object>) reviews.get(0).get("actor");
        assertThat(firstActor.get("displayName")).isEqualTo("Bbb");
    }

    @Test
    void emptyWhenNoEntries() {
        User me = userService.upsertFromGoogle("g-rev-empty", "empty@x.y", "Me", null);
        Anime anime = animeService.upsertFromAniList(media(403));

        ResponseEntity<List<Map<String, Object>>> res = getReviews(anime.getId(), me.getId());

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).isEmpty();
    }
}

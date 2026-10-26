package com.animesquad.watch;

import com.animesquad.activity.ActivityRepository;
import com.animesquad.activity.ActivityType;
import com.animesquad.anime.Anime;
import com.animesquad.anime.AnimeRepository;
import com.animesquad.auth.JwtAuthenticationFilter;
import com.animesquad.auth.JwtService;
import com.animesquad.episode.EpisodeRatingService;
import com.animesquad.squad.SquadService;
import com.animesquad.support.AbstractIntegrationTest;
import com.animesquad.user.UserService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class EpisodeWatchControllerIT extends AbstractIntegrationTest {
    @Autowired AnimeRepository animes;
    @Autowired UserService users;
    @Autowired JwtService jwt;
    @Autowired WatchService watches;
    @Autowired EpisodeRatingService ratings;
    @Autowired ActivityRepository activities;
    @Autowired SquadService squads;
    @Autowired TestRestTemplate rest;
    @Autowired JdbcTemplate jdbc;
    @LocalServerPort int port;

    private Long user(String name) {
        return users.upsertFromGoogle(name, name + "@x.y", name, null).getId();
    }
    private Long anime() {
        return animes.save(new Anime(88002, "Frieren", "葬送のフリーレン", null,
            "img", 28, "FINISHED", "TV", 2023, "FALL", null)).getId();
    }
    private ResponseEntity<List> history(Long user, String query) {
        return request(user, HttpMethod.GET, "/api/me/episode-watches" + query, null, List.class);
    }
    private <T> ResponseEntity<T> request(Long user, HttpMethod method, String path, Object body, Class<T> type) {
        var headers = new HttpHeaders();
        if (user != null) headers.add(HttpHeaders.COOKIE, JwtAuthenticationFilter.COOKIE_NAME + "=" + jwt.issue(user));
        headers.setContentType(MediaType.APPLICATION_JSON);
        return rest.exchange("http://localhost:" + port + path, method, new HttpEntity<>(body, headers), type);
    }
    private ResponseEntity<Map> record(Long user, Long anime, int episode) {
        return request(user, HttpMethod.POST, "/api/watch/" + anime + "/progress",
            Map.of("progress", episode, "source", "EXTENSION"), Map.class);
    }

    @Test void recordsWithoutSquadAndKeepsOnlyObservedEpisodesAndFirstTimestamp() {
        var u = user("solo"); var a = anime();
        assertThat(record(u, a, 5).getStatusCode()).isEqualTo(HttpStatus.OK);
        var first = history(u, "").getBody();
        assertThat(first).hasSize(1);
        assertThat((Map) first.getFirst()).containsEntry("episodeNumber", 5).containsEntry("source", "EXTENSION");
        record(u, a, 5);
        assertThat(history(u, "").getBody()).isEqualTo(first);
        record(u, a, 2);
        assertThat(history(u, "").getBody()).hasSize(2);
        assertThat(watches.findEntry(u, a).orElseThrow().getProgress()).isEqualTo(5);
        assertThat(activities.findAll()).isEmpty();
    }

    @Test void reviewsPreserveWatchTimeAndWatchActivityAndDeletionRevealsIt() {
        var u = user("review"); var a = anime();
        squads.createSquad(u, "A"); squads.createSquad(u, "B");
        record(u, a, 1);
        var original = history(u, "").getBody();
        ratings.upsertRating(u, a, 1, 4, "좋았어요");
        ratings.upsertRating(u, a, 1, null, "수정");
        assertThat(history(u, "").getBody()).isEqualTo(original);
        assertThat(activities.findAllByActorIdAndAnimeIdAndType(u, a, ActivityType.PROGRESS_UPDATED)).hasSize(2);
        ratings.deleteRating(u, a, 1);
        assertThat(activities.findAllByActorIdAndAnimeIdAndType(u, a, ActivityType.PROGRESS_UPDATED)).hasSize(2);
        assertThat(history(u, "").getBody()).isEqualTo(original);
    }

    @Test void reviewFirstCreatesOneHistoryAndConcurrentRequestsKeepUniqueEpisodes() throws Exception {
        var u = user("parallel"); var a = anime();
        watches.addToListById(u, a, WatchStatus.COMPLETED);
        try (var pool = Executors.newFixedThreadPool(3)) {
            var first = pool.submit(() -> record(u, a, 3));
            var duplicate = pool.submit(() -> record(u, a, 3));
            var review = pool.submit(() -> ratings.upsertRating(u, a, 8, null, "감상"));
            assertThat(first.get(15, TimeUnit.SECONDS).getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(duplicate.get(15, TimeUnit.SECONDS).getStatusCode()).isEqualTo(HttpStatus.OK);
            review.get(15, TimeUnit.SECONDS);
        }
        assertThat(history(u, "").getBody()).hasSize(2);
        assertThat(watches.findEntry(u, a).orElseThrow().getProgress()).isEqualTo(8);
        assertThat(watches.findEntry(u, a).orElseThrow().getStatus()).isEqualTo(WatchStatus.COMPLETED);
    }

    @Test void paginatesRawIdsAndEnforcesOwnershipAndReviewDeletionOrder() {
        var u = user("owner"); var other = user("other"); var a = anime();
        record(u, a, 1); record(u, a, 2); record(u, a, 3);
        var first = (Map) history(u, "?limit=1").getBody().getFirst();
        var id = ((Number) first.get("id")).longValue();
        assertThat(history(u, "?cursor=" + id + "&limit=1").getBody()).hasSize(1);
        assertThat(request(other, HttpMethod.DELETE, "/api/me/episode-watches/" + id, null, Map.class).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        ratings.upsertRating(u, a, 3, 5, null);
        assertThat(request(u, HttpMethod.DELETE, "/api/me/episode-watches/" + id, null, Map.class).getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        ratings.deleteRating(u, a, 3);
        assertThat(request(u, HttpMethod.DELETE, "/api/me/episode-watches/" + id, null, Void.class).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(watches.findEntry(u, a).orElseThrow().getProgress()).isEqualTo(2);
        var oldest = (Map) history(u, "").getBody().getLast();
        request(u, HttpMethod.DELETE, "/api/me/episode-watches/" + oldest.get("id"), null, Void.class);
        assertThat(watches.findEntry(u, a).orElseThrow().getProgress()).isEqualTo(2);
    }

    @Test void validatesSourcesAndAuthenticationAndKeepsPatchAsCorrectionOnly() {
        var u = user("validation"); var a = anime();
        assertThat(history(null, "").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(request(u, HttpMethod.POST, "/api/watch/" + a + "/progress", Map.of("progress", 1, "source", "LEGACY"), Map.class).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        request(u, HttpMethod.POST, "/api/watch/" + a + "/progress", Map.of("progress", 1), Map.class);
        assertThat((Map) history(u, "").getBody().getFirst()).containsEntry("source", "UNKNOWN");
        assertThat(request(u, HttpMethod.PUT, "/api/watch/" + a + "/episodes/0", Map.of("score", 4), Map.class).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        watches.updateEntry(u, a, null, 10, null, null);
        assertThat(history(u, "").getBody()).hasSize(1);
        request(u, HttpMethod.PUT, "/api/watch/" + a + "/episodes/2", Map.of("score", 4, "source", "EXTENSION"), Map.class);
        assertThat((Map) history(u, "").getBody().getFirst()).containsEntry("source", "EXTENSION");
        watches.removeFromList(u, a);
        assertThat(history(u, "").getBody()).isEmpty();
    }
}

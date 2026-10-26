package com.animesquad.watch;

import com.animesquad.anime.Anime;
import com.animesquad.anime.AnimeRepository;
import com.animesquad.auth.JwtAuthenticationFilter;
import com.animesquad.auth.JwtService;
import com.animesquad.episode.EpisodeRatingService;
import com.animesquad.support.AbstractIntegrationTest;
import com.animesquad.user.UserService;
import com.animesquad.activity.ActivityRepository;
import com.animesquad.activity.ActivityType;
import com.animesquad.squad.SquadService;
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
class WatchProgressControllerIT extends AbstractIntegrationTest {
    @Autowired AnimeRepository animes;
    @Autowired UserService users;
    @Autowired JwtService jwt;
    @Autowired WatchService watches;
    @Autowired EpisodeRatingService ratings;
    @Autowired WatchEntryRepository entries;
    @Autowired TestRestTemplate rest;
    @Autowired ActivityRepository activities;
    @Autowired SquadService squads;
    @LocalServerPort int port;

    private Anime seed() {
        return animes.save(new Anime(88001, "Frieren", "葬送のフリーレン", null,
            "img", 28, "FINISHED", "TV", 2023, "FALL", null));
    }
    private HttpHeaders cookie(Long userId) {
        var headers = new HttpHeaders();
        headers.add(HttpHeaders.COOKIE, JwtAuthenticationFilter.COOKIE_NAME + "=" + jwt.issue(userId));
        headers.setContentType(MediaType.APPLICATION_JSON);
        return headers;
    }
    private ResponseEntity<Map> advance(Long animeId, int progress, HttpHeaders headers) {
        return rest.exchange("http://localhost:" + port + "/api/watch/" + animeId + "/progress",
            HttpMethod.POST, new HttpEntity<>(Map.of("progress", progress), headers), Map.class);
    }
    @Test
    void createsWatchEntryAndDoesNotDuplicateOrRegressOnReplay() {
        var user = users.upsertFromGoogle("auto1", "auto1@x.y", "Auto", null);
        var anime = seed();
        var headers = cookie(user.getId());
        squads.createSquad(user.getId(), "자동 기록 검증");
        var created = advance(anime.getId(), 3, headers);
        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(created.getBody().get("progress")).isEqualTo(3);
        assertThat(created.getBody().get("status")).isEqualTo("WATCHING");
        assertThat(advance(anime.getId(), 3, headers).getBody().get("progress")).isEqualTo(3);
        assertThat(advance(anime.getId(), 1, headers).getBody().get("progress")).isEqualTo(3);
        assertThat(entries.findAll()).hasSize(1);
        assertThat(activities.findAllByActorIdAndAnimeIdAndType(user.getId(), anime.getId(), ActivityType.PROGRESS_UPDATED)).hasSize(1);
    }
    @Test
    void advancesProgressWithoutChangingStatusOrExistingReviews() {
        var user = users.upsertFromGoogle("auto2", "auto2@x.y", "Auto", null);
        var anime = seed();
        watches.addToListById(user.getId(), anime.getId(), WatchStatus.COMPLETED);
        watches.updateEntry(user.getId(), anime.getId(), null, 1, 4, "시리즈 감상");
        ratings.upsertRating(user.getId(), anime.getId(), 2, 5, "2화 감상");
        var response = advance(anime.getId(), 3, cookie(user.getId()));
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().get("progress")).isEqualTo(3);
        assertThat(response.getBody().get("status")).isEqualTo("COMPLETED");
        assertThat(response.getBody().get("score")).isEqualTo(4);
        assertThat(response.getBody().get("comment")).isEqualTo("시리즈 감상");
        var rating = ratings.listForUserAnime(user.getId(), anime.getId()).getFirst();
        assertThat(rating.getScore()).isEqualTo(5);
        assertThat(rating.getComment()).isEqualTo("2화 감상");
    }
    @Test
    void requiresAuthenticationAndValidatesAnimeAndProgress() {
        var anime = seed();
        assertThat(advance(anime.getId(), 1, new HttpHeaders()).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        var user = users.upsertFromGoogle("auto3", "auto3@x.y", "Auto", null);
        var headers = cookie(user.getId());
        assertThat(advance(999999L, 1, headers).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(advance(anime.getId(), 0, headers).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(advance(anime.getId(), -1, headers).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(entries.findAll()).isEmpty();
    }
    @Test
    void concurrentFirstWritesKeepOneEntryWithLargestProgress() throws Exception {
        var user = users.upsertFromGoogle("auto4", "auto4@x.y", "Auto", null);
        var anime = seed();
        var headers = cookie(user.getId());
        try (var pool = Executors.newFixedThreadPool(2)) {
            var first = pool.submit(() -> advance(anime.getId(), 3, headers));
            var second = pool.submit(() -> advance(anime.getId(), 8, headers));
            assertThat(first.get(15, TimeUnit.SECONDS).getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(second.get(15, TimeUnit.SECONDS).getStatusCode()).isEqualTo(HttpStatus.OK);
        }
        assertThat(entries.findAll()).hasSize(1);
        assertThat(watches.findEntry(user.getId(), anime.getId()).orElseThrow().getProgress()).isEqualTo(8);
    }
}

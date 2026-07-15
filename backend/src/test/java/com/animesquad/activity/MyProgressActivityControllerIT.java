package com.animesquad.activity;

import com.animesquad.anime.AniListClient;
import com.animesquad.anime.AniListMedia;
import com.animesquad.anime.Anime;
import com.animesquad.anime.AnimeService;
import com.animesquad.auth.JwtAuthenticationFilter;
import com.animesquad.auth.JwtService;
import com.animesquad.squad.SquadService;
import com.animesquad.support.AbstractIntegrationTest;
import com.animesquad.user.User;
import com.animesquad.user.UserService;
import com.animesquad.watch.WatchEntry;
import com.animesquad.watch.WatchEntryRepository;
import com.animesquad.watch.WatchService;
import com.animesquad.watch.WatchStatus;
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
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class MyProgressActivityControllerIT extends AbstractIntegrationTest {

    @Autowired UserService users;
    @Autowired AnimeService animes;
    @Autowired SquadService squads;
    @Autowired WatchService watches;
    @Autowired WatchEntryRepository watchEntries;
    @Autowired ActivityRepository activities;
    @Autowired JwtService jwt;
    @Autowired TestRestTemplate rest;
    @LocalServerPort int port;
    @MockBean AniListClient aniList;

    private record Seed(User user, Anime anime, WatchEntry entry) {}

    private Seed seed(String suffix, int anilistId, int progress) {
        User user = users.upsertFromGoogle("g-" + suffix, suffix + "@x.y", suffix, null);
        squads.createSquad(user.getId(), suffix + "-A");
        squads.createSquad(user.getId(), suffix + "-B");
        Anime anime = animes.upsertFromAniList(new AniListMedia(
            anilistId, "Romaji" + anilistId, "Native", "English",
            "img", 12, "FINISHED", "TV", 2026, null, null));
        WatchEntry entry = watches.addToList(user.getId(), anilistId, WatchStatus.WATCHING);
        watches.updateEntry(user.getId(), anime.getId(), null, progress, null, null);
        return new Seed(user, anime, entry);
    }

    private HttpHeaders cookie(Long userId) {
        HttpHeaders headers = new HttpHeaders();
        headers.add(HttpHeaders.COOKIE,
            JwtAuthenticationFilter.COOKIE_NAME + "=" + jwt.issue(userId));
        return headers;
    }

    private String url(String path) {
        return "http://localhost:" + port + path;
    }

    @Test
    void get_deduplicatesFanOutRowsForMyProgress() {
        Seed mine = seed("mine", 7101, 7);
        seed("other", 7102, 4);

        ResponseEntity<Map[]> response = rest.exchange(
            url("/api/me/progress-activities?limit=500"), HttpMethod.GET,
            new HttpEntity<>(cookie(mine.user().getId())), Map[].class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).singleElement().satisfies(item -> {
            assertThat(item.get("progress")).isEqualTo(7);
            assertThat(((Map<?, ?>) item.get("anime")).get("id"))
                .isEqualTo(mine.anime().getId().intValue());
        });
    }

    @Test
    void delete_removesEveryFanOutCopyAndRestoresProgressWithoutReplacement() {
        Seed mine = seed("delete", 7103, 7);
        Map[] items = rest.exchange(
            url("/api/me/progress-activities"), HttpMethod.GET,
            new HttpEntity<>(cookie(mine.user().getId())), Map[].class).getBody();
        Number activityId = (Number) items[0].get("id");

        ResponseEntity<Void> response = rest.exchange(
            url("/api/me/progress-activities/" + activityId.longValue()), HttpMethod.DELETE,
            new HttpEntity<>(cookie(mine.user().getId())), Void.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        WatchEntry reloaded = watchEntries.findById(mine.entry().getId()).orElseThrow();
        assertThat(reloaded.getProgress()).isEqualTo(6);
        assertThat(activities.findAll()).noneMatch(a ->
            a.getActorId().equals(mine.user().getId()) &&
            a.getType() == ActivityType.PROGRESS_UPDATED);
    }

    @Test
    void delete_firstEpisodeRestoresZeroAndCreatesNoReplacement() {
        Seed mine = seed("first", 7104, 1);
        Map[] items = rest.exchange(
            url("/api/me/progress-activities"), HttpMethod.GET,
            new HttpEntity<>(cookie(mine.user().getId())), Map[].class).getBody();

        rest.exchange(url("/api/me/progress-activities/" + items[0].get("id")),
            HttpMethod.DELETE, new HttpEntity<>(cookie(mine.user().getId())), Void.class);

        assertThat(watchEntries.findById(mine.entry().getId()).orElseThrow().getProgress()).isZero();
        assertThat(activities.findAll()).isEmpty();
    }

    @Test
    void delete_pastProgressSetsCurrentProgressFromDeletedRecord() {
        Seed mine = seed("past", 7106, 2);
        watches.updateEntry(mine.user().getId(), mine.anime().getId(),
            null, 7, null, null);
        Map[] items = rest.exchange(
            url("/api/me/progress-activities"), HttpMethod.GET,
            new HttpEntity<>(cookie(mine.user().getId())), Map[].class).getBody();
        Map<?, ?> past = List.of(items).stream()
            .filter(item -> item.get("progress").equals(2))
            .findFirst().orElseThrow();

        rest.exchange(url("/api/me/progress-activities/" + past.get("id")),
            HttpMethod.DELETE, new HttpEntity<>(cookie(mine.user().getId())), Void.class);

        assertThat(watchEntries.findById(mine.entry().getId()).orElseThrow().getProgress())
            .isEqualTo(1);
        assertThat(activities.findAll()).allMatch(a ->
            !Integer.valueOf(2).equals(a.getPayload().get("progress")));
    }

    @Test
    void delete_otherUsersActivityReturns404AndPreservesData() {
        Seed owner = seed("owner", 7105, 5);
        User attacker = users.upsertFromGoogle("g-attacker", "attacker@x.y", "attacker", null);
        Long targetId = activities.findAll().stream()
            .filter(a -> a.getActorId().equals(owner.user().getId()))
            .findFirst().orElseThrow().getId();

        ResponseEntity<String> response = rest.exchange(
            url("/api/me/progress-activities/" + targetId), HttpMethod.DELETE,
            new HttpEntity<>(cookie(attacker.getId())), String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(watchEntries.findById(owner.entry().getId()).orElseThrow().getProgress())
            .isEqualTo(5);
        assertThat(activities.findAll()).hasSize(2);
    }

    @Test
    void delete_missingOrNonProgressActivityReturns404() {
        Seed mine = seed("invalid", 7107, 3);
        Activity progress = activities.findAll().stream().findFirst().orElseThrow();
        Activity rated = activities.save(new Activity(
            progress.getSquadId(), mine.user().getId(), ActivityType.RATED,
            mine.anime().getId(), Map.of("score", 5)));

        ResponseEntity<String> missing = rest.exchange(
            url("/api/me/progress-activities/999999"), HttpMethod.DELETE,
            new HttpEntity<>(cookie(mine.user().getId())), String.class);
        ResponseEntity<String> nonProgress = rest.exchange(
            url("/api/me/progress-activities/" + rated.getId()), HttpMethod.DELETE,
            new HttpEntity<>(cookie(mine.user().getId())), String.class);

        assertThat(missing.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(nonProgress.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(watchEntries.findById(mine.entry().getId()).orElseThrow().getProgress())
            .isEqualTo(3);
    }
}

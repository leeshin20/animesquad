package com.animesquad.admin.watchimport;

import com.animesquad.activity.ActivityRepository;
import com.animesquad.anime.AniListMedia;
import com.animesquad.anime.Anime;
import com.animesquad.anime.AnimeService;
import com.animesquad.auth.JwtAuthenticationFilter;
import com.animesquad.auth.JwtService;
import com.animesquad.episode.EpisodeRating;
import com.animesquad.episode.EpisodeRatingRepository;
import com.animesquad.squad.Membership;
import com.animesquad.squad.MembershipRepository;
import com.animesquad.squad.MembershipRole;
import com.animesquad.squad.Squad;
import com.animesquad.squad.SquadRepository;
import com.animesquad.support.AbstractIntegrationTest;
import com.animesquad.user.User;
import com.animesquad.user.UserService;
import com.animesquad.watch.WatchEntry;
import com.animesquad.watch.WatchEntryRepository;
import com.animesquad.watch.WatchStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "app.admin.emails=admin@x.y")
class AdminWatchImportControllerIT extends AbstractIntegrationTest {

    @Autowired UserService userService;
    @Autowired JwtService jwtService;
    @Autowired AnimeService animeService;
    @Autowired WatchEntryRepository entries;
    @Autowired SquadRepository squads;
    @Autowired MembershipRepository memberships;
    @Autowired ActivityRepository activities;
    @Autowired EpisodeRatingRepository episodeRatings;
    @Autowired TestRestTemplate rest;
    @LocalServerPort int port;

    private HttpHeaders jsonHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        return headers;
    }

    private HttpHeaders cookieFor(Long userId) {
        HttpHeaders headers = jsonHeaders();
        headers.add(HttpHeaders.COOKIE,
            JwtAuthenticationFilter.COOKIE_NAME + "=" + jwtService.issue(userId));
        return headers;
    }

    private String url(String path) {
        return "http://localhost:" + port + path;
    }

    private User user(String sub, String email) {
        return userService.upsertFromGoogle(sub, email, email, null);
    }

    private User admin() {
        return user("g-admin", "admin@x.y");
    }

    private Anime anime(int anilistId) {
        return animeService.upsertFromAniList(new AniListMedia(
            anilistId, "Romaji" + anilistId, "Native" + anilistId, "English" + anilistId,
            "img", 12, "FINISHED", "TV", 2024, null, null));
    }

    @Test
    void preview_returns401_withoutAuthentication() {
        ResponseEntity<String> response = rest.exchange(
            url("/api/admin/watch-import/preview"), HttpMethod.POST,
            new HttpEntity<>(Map.of("email", "target@x.y", "text", "Anime 1화"), jsonHeaders()),
            String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void preview_returns403_forNonAdmin() {
        User viewer = user("g-viewer", "viewer@x.y");

        ResponseEntity<String> response = rest.exchange(
            url("/api/admin/watch-import/preview"), HttpMethod.POST,
            new HttpEntity<>(Map.of("email", "target@x.y", "text", "Anime 1화"), cookieFor(viewer.getId())),
            String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void preview_returns404_forUnknownEmail() {
        ResponseEntity<String> response = rest.exchange(
            url("/api/admin/watch-import/preview"), HttpMethod.POST,
            new HttpEntity<>(Map.of("email", "missing@x.y", "text", "Anime 1화"), cookieFor(admin().getId())),
            String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void commit_returns401_withoutAuthentication_beforeReadingMalformedBody() {
        ResponseEntity<String> response = rest.exchange(
            url("/api/admin/watch-import/commit"), HttpMethod.POST,
            new HttpEntity<>("null", jsonHeaders()), String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void commit_returns403_forNonAdmin_beforeValidatingEmptyBody() {
        User viewer = user("g-viewer", "viewer@x.y");

        ResponseEntity<String> response = rest.exchange(
            url("/api/admin/watch-import/commit"), HttpMethod.POST,
            new HttpEntity<>(Map.of(), cookieFor(viewer.getId())), String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @SuppressWarnings("unchecked")
    @Test
    void commit_createsAndOverwritesSilently_whilePreservingReview() {
        User target = user("g-target", "target@x.y");
        Anime existingAnime = anime(101);
        Anime newAnime = anime(102);
        WatchEntry existing = new WatchEntry(target.getId(), existingAnime.getId(), WatchStatus.COMPLETED);
        existing.apply(null, 8, 5, "keep me");
        entries.save(existing);
        EpisodeRating episodeRating = episodeRatings.save(
            new EpisodeRating(target.getId(), existingAnime.getId(), 8, 4, "episode stays"));
        Squad squad = squads.save(new Squad("Import observers", target.getId(), "IMPORTCODE"));
        memberships.save(new Membership(target.getId(), squad.getId(), MembershipRole.OWNER));

        ResponseEntity<Map> response = rest.exchange(
            url("/api/admin/watch-import/commit"), HttpMethod.POST,
            new HttpEntity<>(Map.of(
                "targetUserId", target.getId(),
                "items", List.of(
                    Map.of("animeId", existingAnime.getId(), "progress", 2),
                    Map.of("animeId", newAnime.getId(), "progress", 3))),
                cookieFor(admin().getId())),
            Map.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).containsEntry("created", 1).containsEntry("updated", 1);
        WatchEntry updated = entries.findByUserIdAndAnimeId(target.getId(), existingAnime.getId()).orElseThrow();
        WatchEntry created = entries.findByUserIdAndAnimeId(target.getId(), newAnime.getId()).orElseThrow();
        assertThat(updated.getStatus()).isEqualTo(WatchStatus.WATCHING);
        assertThat(updated.getProgress()).isEqualTo(2);
        assertThat(updated.getScore()).isEqualTo(5);
        assertThat(updated.getComment()).isEqualTo("keep me");
        assertThat(created.getStatus()).isEqualTo(WatchStatus.WATCHING);
        assertThat(created.getProgress()).isEqualTo(3);
        EpisodeRating preservedEpisode = episodeRatings.findById(episodeRating.getId()).orElseThrow();
        assertThat(preservedEpisode.getScore()).isEqualTo(4);
        assertThat(preservedEpisode.getComment()).isEqualTo("episode stays");
        assertThat(activities.findAll()).isEmpty();
    }

    @Test
    void commit_rejectsDuplicateAnimeIds_andWritesNothing() {
        User target = user("g-target", "target@x.y");
        Anime anime = anime(201);

        ResponseEntity<String> response = rest.exchange(
            url("/api/admin/watch-import/commit"), HttpMethod.POST,
            new HttpEntity<>(Map.of(
                "targetUserId", target.getId(),
                "items", List.of(
                    Map.of("animeId", anime.getId(), "progress", 1),
                    Map.of("animeId", anime.getId(), "progress", 2))),
                cookieFor(admin().getId())),
            String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(entries.findAll()).isEmpty();
    }

    @Test
    void commit_rejectsMissingAnime_andRollsBackAllItems() {
        User target = user("g-target", "target@x.y");
        Anime valid = anime(301);

        ResponseEntity<String> response = rest.exchange(
            url("/api/admin/watch-import/commit"), HttpMethod.POST,
            new HttpEntity<>(Map.of(
                "targetUserId", target.getId(),
                "items", List.of(
                    Map.of("animeId", valid.getId(), "progress", 1),
                    Map.of("animeId", 999999L, "progress", 2))),
                cookieFor(admin().getId())),
            String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(entries.findByUserIdAndAnimeId(target.getId(), valid.getId())).isEmpty();
    }
}

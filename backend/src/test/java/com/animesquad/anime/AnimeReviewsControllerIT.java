package com.animesquad.anime;

import com.animesquad.auth.JwtAuthenticationFilter;
import com.animesquad.auth.JwtService;
import com.animesquad.episode.EpisodeRatingService;
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
    @Autowired EpisodeRatingService episodeRatingService;
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
        return new AniListMedia(id, "Romaji" + id, "Native", "Eng", "img", 12, "FINISHED", "TV", 2024, null);
    }

    private ResponseEntity<List<Map<String, Object>>> getReviews(Long animeId, Long asUserId) {
        return rest.exchange(
            url("/api/anime/" + animeId + "/reviews"), HttpMethod.GET,
            new HttpEntity<>(cookieFor(asUserId)),
            new ParameterizedTypeReference<List<Map<String, Object>>>() {});
    }

    private ResponseEntity<List<Map<String, Object>>> getEpisodeReviews(Long animeId, Long asUserId) {
        return rest.exchange(
            url("/api/anime/" + animeId + "/episode-reviews"), HttpMethod.GET,
            new HttpEntity<>(cookieFor(asUserId)),
            new ParameterizedTypeReference<List<Map<String, Object>>>() {});
    }

    private ResponseEntity<Map<String, Object>> getStats(Long animeId, Long asUserId) {
        return rest.exchange(
            url("/api/anime/" + animeId + "/stats"), HttpMethod.GET,
            new HttpEntity<>(cookieFor(asUserId)),
            new ParameterizedTypeReference<Map<String, Object>>() {});
    }

    @Test
    void onlyShowsUsersWithComment_includingSelf_regardlessOfSquad() {
        User me = userService.upsertFromGoogle("g-rev-me", "me@x.y", "Me", null);
        User other = userService.upsertFromGoogle("g-rev-other", "other@x.y", "Other", null);
        User watcher = userService.upsertFromGoogle("g-rev-watch", "watch@x.y", "Watcher", null);
        User scorer = userService.upsertFromGoogle("g-rev-score", "score@x.y", "Scorer", null);
        // nobody shares a squad — still anyone with a comment must appear.

        animeService.upsertFromAniList(media(401));
        WatchEntry mineEntry = watchService.addToList(me.getId(), 401, WatchStatus.WATCHING);
        Long animeId = mineEntry.getAnimeId();
        watchService.updateEntry(me.getId(), animeId, null, 3, null, "나도 한마디");      // self, has comment → shown
        watchService.addToList(other.getId(), 401, WatchStatus.COMPLETED);
        watchService.updateEntry(other.getId(), animeId, null, 12, 5, "최고");            // comment → shown
        watchService.addToList(watcher.getId(), 401, WatchStatus.WATCHING);              // watch only, no comment → hidden
        watchService.addToList(scorer.getId(), 401, WatchStatus.COMPLETED);
        watchService.updateEntry(scorer.getId(), animeId, null, 12, 4, null);            // score but no comment → hidden

        ResponseEntity<List<Map<String, Object>>> res = getReviews(animeId, me.getId());

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        List<Map<String, Object>> reviews = res.getBody();
        assertThat(reviews).hasSize(2); // me + other (watcher & scorer excluded)

        var names = reviews.stream()
            .map(r -> (String) ((Map<?, ?>) r.get("actor")).get("displayName")).toList();
        assertThat(names).containsExactlyInAnyOrder("Me", "Other");

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
    void excludesBlankComments() {
        User me = userService.upsertFromGoogle("g-rev-blank-me", "bme@x.y", "Me", null);
        User blank = userService.upsertFromGoogle("g-rev-blank", "blank@x.y", "Blank", null);

        animeService.upsertFromAniList(media(404));
        WatchEntry mineEntry = watchService.addToList(me.getId(), 404, WatchStatus.WATCHING);
        Long animeId = mineEntry.getAnimeId();
        watchService.updateEntry(me.getId(), animeId, null, 1, null, "있음");
        watchService.addToList(blank.getId(), 404, WatchStatus.WATCHING);
        watchService.updateEntry(blank.getId(), animeId, null, 1, null, "   ");          // whitespace-only → hidden

        List<Map<String, Object>> reviews = getReviews(animeId, me.getId()).getBody();
        assertThat(reviews).hasSize(1);
        assertThat(((Map<?, ?>) reviews.get(0).get("actor")).get("displayName")).isEqualTo("Me");
    }

    @Test
    void ordersByUpdatedAtDesc() {
        User a = userService.upsertFromGoogle("g-rev-a", "a@x.y", "Aaa", null);
        User b = userService.upsertFromGoogle("g-rev-b", "b@x.y", "Bbb", null);

        animeService.upsertFromAniList(media(402));
        WatchEntry first = watchService.addToList(a.getId(), 402, WatchStatus.WATCHING);
        Long animeId = first.getAnimeId();
        watchService.updateEntry(a.getId(), animeId, null, 1, null, "먼저");
        watchService.addToList(b.getId(), 402, WatchStatus.WATCHING);
        // b updated most recently → b should be first.
        watchService.updateEntry(b.getId(), animeId, null, 3, null, "나중");

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

    @Test
    void episodeReviews_allUsersWithComment_orderedByEpisode() {
        User me = userService.upsertFromGoogle("g-ep-me", "epme@x.y", "Me", null);
        User other = userService.upsertFromGoogle("g-ep-other", "epother@x.y", "Other", null);
        // no shared squad — all users' episode reviews should still appear.

        WatchEntry mineEntry = watchService.addToList(me.getId(), 501, WatchStatus.WATCHING);
        Long animeId = mineEntry.getAnimeId();
        watchService.addToList(other.getId(), 501, WatchStatus.WATCHING);

        episodeRatingService.upsertRating(me.getId(), animeId, 1, 4, "1화 좋다");
        episodeRatingService.upsertRating(me.getId(), animeId, 2, 5, null);   // no comment → hidden
        episodeRatingService.upsertRating(other.getId(), animeId, 1, 3, "별로");
        episodeRatingService.upsertRating(other.getId(), animeId, 3, 5, "3화 미쳤다");

        List<Map<String, Object>> reviews = getEpisodeReviews(animeId, me.getId()).getBody();

        // ep2 (no comment) excluded → 3 reviews across episodes 1,1,3.
        assertThat(reviews).hasSize(3);
        assertThat(reviews).extracting(r -> r.get("episodeNumber"))
            .containsExactly(1, 1, 3); // episodeNumber ascending

        Map<String, Object> ep3 = reviews.get(2);
        assertThat(((Map<?, ?>) ep3.get("actor")).get("displayName")).isEqualTo("Other");
        assertThat(ep3.get("score")).isEqualTo(5);
        assertThat(ep3.get("comment")).isEqualTo("3화 미쳤다");
    }

    @Test
    void episodeReviews_emptyWhenNoCommentedEpisodes() {
        User me = userService.upsertFromGoogle("g-ep-empty", "epempty@x.y", "Me", null);
        WatchEntry mineEntry = watchService.addToList(me.getId(), 502, WatchStatus.WATCHING);
        Long animeId = mineEntry.getAnimeId();
        episodeRatingService.upsertRating(me.getId(), animeId, 1, 4, null); // score only, no comment

        ResponseEntity<List<Map<String, Object>>> res = getEpisodeReviews(animeId, me.getId());

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).isEmpty();
    }

    @Test
    void stats_averageScoreOverSeriesScores_andWatcherCount() {
        User me = userService.upsertFromGoogle("g-st-me", "stme@x.y", "Me", null);
        User other = userService.upsertFromGoogle("g-st-other", "stother@x.y", "Other", null);
        User planner = userService.upsertFromGoogle("g-st-plan", "stplan@x.y", "Plan", null);

        WatchEntry mineEntry = watchService.addToList(me.getId(), 601, WatchStatus.COMPLETED);
        Long animeId = mineEntry.getAnimeId();
        watchService.updateEntry(me.getId(), animeId, null, 12, 5, null);    // score 5
        watchService.addToList(other.getId(), 601, WatchStatus.WATCHING);
        watchService.updateEntry(other.getId(), animeId, null, 6, 4, null);  // score 4
        watchService.addToList(planner.getId(), 601, WatchStatus.PLAN_TO_WATCH); // no score, still a watcher

        Map<String, Object> stats = getStats(animeId, me.getId()).getBody();

        assertThat(((Number) stats.get("averageScore")).doubleValue()).isEqualTo(4.5); // (5+4)/2
        assertThat(((Number) stats.get("watcherCount")).intValue()).isEqualTo(3);      // all 3 on list
    }

    @Test
    void stats_nullAverageWhenNoScores() {
        User me = userService.upsertFromGoogle("g-st-noscore", "stns@x.y", "Me", null);
        WatchEntry mineEntry = watchService.addToList(me.getId(), 602, WatchStatus.WATCHING);

        Map<String, Object> stats = getStats(mineEntry.getAnimeId(), me.getId()).getBody();

        assertThat(stats.get("averageScore")).isNull();
        assertThat(((Number) stats.get("watcherCount")).intValue()).isEqualTo(1);
    }
}

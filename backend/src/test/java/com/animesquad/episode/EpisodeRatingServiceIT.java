package com.animesquad.episode;

import com.animesquad.anime.AniListClient;
import com.animesquad.anime.AniListMedia;
import com.animesquad.anime.Anime;
import com.animesquad.anime.AnimeService;
import com.animesquad.support.AbstractIntegrationTest;
import com.animesquad.user.User;
import com.animesquad.user.UserService;
import com.animesquad.watch.WatchEntry;
import com.animesquad.watch.WatchEntryRepository;
import com.animesquad.watch.WatchService;
import com.animesquad.watch.WatchStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.mock.mockito.MockBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class EpisodeRatingServiceIT extends AbstractIntegrationTest {

    @Autowired EpisodeRatingService service;
    @Autowired EpisodeRatingRepository ratings;
    @Autowired AnimeService animeService;
    @Autowired WatchService watchService;
    @Autowired WatchEntryRepository watches;
    @Autowired UserService userService;
    @MockBean AniListClient aniList;

    private record Seeded(User user, Anime anime, WatchEntry entry) {}

    private Seeded seed(String suffix, int anilistId) {
        User u = userService.upsertFromGoogle("g-" + suffix, suffix + "@x.y", suffix.toUpperCase(), null);
        Anime a = animeService.upsertFromAniList(new AniListMedia(
            anilistId, "Romaji", "Native", "Eng", "img", 24, "FINISHED", "TV", 2024));
        WatchEntry e = watchService.addToList(u.getId(), anilistId, WatchStatus.WATCHING);
        return new Seeded(u, a, e);
    }

    @Test
    void upsert_insertsNewRating() {
        Seeded s = seed("e1", 1001);

        EpisodeRating r = service.upsertRating(s.user().getId(), s.anime().getId(), 3, 8, "good");

        assertThat(r.getId()).isNotNull();
        assertThat(r.getScore()).isEqualTo(8);
        assertThat(r.getComment()).isEqualTo("good");
        assertThat(ratings.findByUserIdAndAnimeIdAndEpisodeNumber(
            s.user().getId(), s.anime().getId(), 3)).isPresent();
    }

    @Test
    void upsert_replacesExisting() {
        Seeded s = seed("e2", 1002);
        service.upsertRating(s.user().getId(), s.anime().getId(), 5, 6, "ok");

        EpisodeRating updated = service.upsertRating(
            s.user().getId(), s.anime().getId(), 5, 9, null);

        assertThat(updated.getScore()).isEqualTo(9);
        assertThat(updated.getComment()).isNull();
        assertThat(ratings.count()).isEqualTo(1);
    }

    @Test
    void upsert_bumpsProgress_whenRatingPastCurrent() {
        Seeded s = seed("e3", 1003);
        // current progress = 0 (just added)

        service.upsertRating(s.user().getId(), s.anime().getId(), 4, 7, null);

        WatchEntry refreshed = watches.findById(s.entry().getId()).orElseThrow();
        assertThat(refreshed.getProgress()).isEqualTo(4);
    }

    @Test
    void upsert_keepsProgress_whenRatingBehindCurrent() {
        Seeded s = seed("e4", 1004);
        watchService.updateEntry(
            s.user().getId(), s.anime().getId(), null, 10, null, null);

        service.upsertRating(s.user().getId(), s.anime().getId(), 3, 7, null);

        WatchEntry refreshed = watches.findById(s.entry().getId()).orElseThrow();
        assertThat(refreshed.getProgress()).isEqualTo(10);
    }

    @Test
    void upsert_throws_whenUserHasNoWatchEntry() {
        User stranger = userService.upsertFromGoogle("g-stranger", "s@x.y", "S", null);
        Anime a = animeService.upsertFromAniList(new AniListMedia(
            1005, "R", "N", "E", "img", 12, "FINISHED", "TV", 2024));

        assertThatThrownBy(() -> service.upsertRating(stranger.getId(), a.getId(), 1, 5, null))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void listForUserAnime_returnsRatings_inEpisodeOrder() {
        Seeded s = seed("e6", 1006);
        service.upsertRating(s.user().getId(), s.anime().getId(), 2, 7, null);
        service.upsertRating(s.user().getId(), s.anime().getId(), 1, 8, null);

        var all = service.listForUserAnime(s.user().getId(), s.anime().getId());

        assertThat(all).extracting(EpisodeRating::getEpisodeNumber).containsExactly(1, 2);
    }
}

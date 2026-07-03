package com.animesquad.watch;

import com.animesquad.anime.AniListClient;
import com.animesquad.anime.AniListMedia;
import com.animesquad.anime.AnimeService;
import com.animesquad.support.AbstractIntegrationTest;
import com.animesquad.user.User;
import com.animesquad.user.UserService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.mock.mockito.MockBean;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

class WatchServiceIT extends AbstractIntegrationTest {

    @Autowired WatchService watchService;
    @Autowired WatchEntryRepository watches;
    @Autowired AnimeService animeService;
    @Autowired UserService userService;
    @MockBean AniListClient aniList;

    private AniListMedia media(int id) {
        return new AniListMedia(id, "Romaji" + id, "Native", "Eng", "img", 12, "FINISHED", "TV", 2024, null);
    }

    @Test
    void addToList_resolvesAnimeFromCache_andCreatesEntry() {
        User me = userService.upsertFromGoogle("g-w1", "w1@x.y", "W1", null);
        animeService.upsertFromAniList(media(10));

        WatchEntry e = watchService.addToList(me.getId(), 10, WatchStatus.PLAN_TO_WATCH);

        assertThat(e.getId()).isNotNull();
        assertThat(e.getStatus()).isEqualTo(WatchStatus.PLAN_TO_WATCH);
        assertThat(e.getProgress()).isZero();
    }

    @Test
    void addToList_fetchesFromAniList_whenNotCached() {
        User me = userService.upsertFromGoogle("g-w2", "w2@x.y", "W2", null);
        when(aniList.fetchById(eq(20))).thenReturn(media(20));

        WatchEntry e = watchService.addToList(me.getId(), 20, WatchStatus.WATCHING);

        assertThat(e.getStatus()).isEqualTo(WatchStatus.WATCHING);
        assertThat(watches.findAllByUserIdOrderByUpdatedAtDesc(me.getId())).hasSize(1);
    }

    @Test
    void addToList_isIdempotent_perUserAnime() {
        User me = userService.upsertFromGoogle("g-w3", "w3@x.y", "W3", null);
        animeService.upsertFromAniList(media(30));

        WatchEntry first = watchService.addToList(me.getId(), 30, WatchStatus.WATCHING);
        WatchEntry second = watchService.addToList(me.getId(), 30, WatchStatus.PLAN_TO_WATCH);

        assertThat(second.getId()).isEqualTo(first.getId());
        // second add does NOT overwrite an existing status — explicit PATCH does that
        assertThat(second.getStatus()).isEqualTo(WatchStatus.WATCHING);
    }

    @Test
    void updateEntry_appliesOnlyProvidedFields() {
        User me = userService.upsertFromGoogle("g-w4", "w4@x.y", "W4", null);
        animeService.upsertFromAniList(media(40));
        WatchEntry created = watchService.addToList(me.getId(), 40, WatchStatus.WATCHING);

        WatchEntry updated = watchService.updateEntry(
            me.getId(), created.getAnimeId(),
            WatchStatus.COMPLETED, 12, 5, "재밌었어요");

        assertThat(updated.getStatus()).isEqualTo(WatchStatus.COMPLETED);
        assertThat(updated.getProgress()).isEqualTo(12);
        assertThat(updated.getScore()).isEqualTo(5);
        assertThat(updated.getComment()).isEqualTo("재밌었어요");
    }

    @Test
    void updateEntry_ignoresNullFields() {
        User me = userService.upsertFromGoogle("g-w5", "w5@x.y", "W5", null);
        animeService.upsertFromAniList(media(50));
        WatchEntry created = watchService.addToList(me.getId(), 50, WatchStatus.WATCHING);
        watchService.updateEntry(me.getId(), created.getAnimeId(), null, 5, null, null);

        WatchEntry after = watches.findByUserIdAndAnimeId(me.getId(), created.getAnimeId()).orElseThrow();
        assertThat(after.getStatus()).isEqualTo(WatchStatus.WATCHING); // unchanged
        assertThat(after.getProgress()).isEqualTo(5);
        assertThat(after.getScore()).isNull();
    }

    @Test
    void updateEntry_throws_whenEntryMissing() {
        User me = userService.upsertFromGoogle("g-w6", "w6@x.y", "W6", null);
        animeService.upsertFromAniList(media(60));

        assertThatThrownBy(() -> watchService.updateEntry(
            me.getId(), 999L, WatchStatus.COMPLETED, null, null, null))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void listMine_returnsOnlyMyEntries() {
        User me = userService.upsertFromGoogle("g-w7", "w7@x.y", "W7", null);
        User other = userService.upsertFromGoogle("g-w7b", "w7b@x.y", "W7B", null);
        animeService.upsertFromAniList(media(70));
        animeService.upsertFromAniList(media(71));
        watchService.addToList(me.getId(), 70, WatchStatus.WATCHING);
        watchService.addToList(other.getId(), 71, WatchStatus.COMPLETED);

        List<WatchEntry> mine = watchService.listMine(me.getId());

        assertThat(mine).hasSize(1);
        assertThat(mine.get(0).getUserId()).isEqualTo(me.getId());
    }

    @org.springframework.beans.factory.annotation.Autowired
    com.animesquad.activity.ActivityRepository activityRepo2;
    @org.springframework.beans.factory.annotation.Autowired
    com.animesquad.squad.SquadService squadServiceForEvents;

    @Test
    void addThenUpdate_writesActivityRows_whenActorInSquad() {
        User me = userService.upsertFromGoogle("g-evt", "evt@x.y", "Evt", null);
        squadServiceForEvents.createSquad(me.getId(), "S");
        animeService.upsertFromAniList(media(80));

        WatchEntry added = watchService.addToList(me.getId(), 80, WatchStatus.WATCHING);
        watchService.updateEntry(me.getId(), added.getAnimeId(),
            WatchStatus.COMPLETED, 12, 5, null);

        assertThat(activityRepo2.findAll())
            .extracting(a -> a.getType().name())
            .containsExactlyInAnyOrder("STATUS_CHANGED", "PROGRESS_UPDATED", "RATED");
    }

    @Test
    void clearReview_removesSeriesActivity_keepsProgressAndStatus() {
        User me = userService.upsertFromGoogle("g-clr", "clr@x.y", "Clr", null);
        squadServiceForEvents.createSquad(me.getId(), "S");
        animeService.upsertFromAniList(media(90));
        WatchEntry added = watchService.addToList(me.getId(), 90, WatchStatus.WATCHING);
        watchService.updateEntry(me.getId(), added.getAnimeId(),
            WatchStatus.COMPLETED, 12, 5, "good");

        watchService.clearReview(me.getId(), added.getAnimeId());

        assertThat(activityRepo2.findAll())
            .extracting(a -> a.getType().name())
            .containsExactlyInAnyOrder("STATUS_CHANGED", "PROGRESS_UPDATED");
    }

    @Test
    void updateEntry_reEmitsRated_whenOnlyCommentChanges() {
        User me = userService.upsertFromGoogle("g-cmt", "cmt@x.y", "Cmt", null);
        squadServiceForEvents.createSquad(me.getId(), "S");
        animeService.upsertFromAniList(media(91));
        WatchEntry added = watchService.addToList(me.getId(), 91, WatchStatus.WATCHING);
        watchService.updateEntry(me.getId(), added.getAnimeId(),
            WatchStatus.COMPLETED, 12, 5, "first");

        // edit only the comment — score unchanged
        watchService.updateEntry(me.getId(), added.getAnimeId(), null, null, 5, "edited");

        var rated = activityRepo2.findAll().stream()
            .filter(a -> a.getType().name().equals("RATED")).toList();
        assertThat(rated).hasSize(1);
        assertThat(rated.get(0).getPayload().get("comment")).isEqualTo("edited");
    }
}

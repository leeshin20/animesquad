package com.animesquad.activity;

import com.animesquad.anime.AniListClient;
import com.animesquad.anime.AniListMedia;
import com.animesquad.anime.Anime;
import com.animesquad.anime.AnimeService;
import com.animesquad.episode.events.EpisodeRatedEvent;
import com.animesquad.squad.Squad;
import com.animesquad.squad.SquadService;
import com.animesquad.squad.events.SquadJoinedEvent;
import com.animesquad.support.AbstractIntegrationTest;
import com.animesquad.user.User;
import com.animesquad.user.UserService;
import com.animesquad.watch.WatchStatus;
import com.animesquad.watch.events.AnimeAddedEvent;
import com.animesquad.watch.events.ProgressUpdatedEvent;
import com.animesquad.watch.events.WatchRatedEvent;
import com.animesquad.watch.events.WatchStatusChangedEvent;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Limit;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ActivityListenerIT extends AbstractIntegrationTest {

    @Autowired ApplicationEventPublisher events;
    @Autowired ActivityRepository activities;
    @Autowired SquadService squadService;
    @Autowired UserService userService;
    @Autowired AnimeService animeService;
    @MockBean AniListClient aniList;

    private record Setup(User actor, Squad squadA, Squad squadB, Anime anime) {}

    private Setup seedTwoSquadsWithMember() {
        User actor = userService.upsertFromGoogle("g-actor", "a@x.y", "Actor", null);
        Squad a = squadService.createSquad(actor.getId(), "A");
        Squad b = squadService.createSquad(actor.getId(), "B");
        Anime anime = animeService.upsertFromAniList(new AniListMedia(
            5001, "Romaji", "Native", "Eng", "img", 12, "FINISHED", "TV", 2024));
        return new Setup(actor, a, b, anime);
    }

    @Test
    void animeAdded_fansOutToAllSquadsTheActorIsIn() {
        Setup s = seedTwoSquadsWithMember();

        events.publishEvent(new AnimeAddedEvent(s.actor().getId(), s.anime().getId(), WatchStatus.WATCHING));

        List<Activity> all = activities.findAll();
        assertThat(all).hasSize(2);
        assertThat(all).extracting(Activity::getSquadId)
            .containsExactlyInAnyOrder(s.squadA().getId(), s.squadB().getId());
        assertThat(all).allSatisfy(a -> {
            assertThat(a.getType()).isEqualTo(ActivityType.ANIME_ADDED);
            assertThat(a.getActorId()).isEqualTo(s.actor().getId());
            assertThat(a.getAnimeId()).isEqualTo(s.anime().getId());
            assertThat(a.getPayload()).containsEntry("status", "WATCHING");
        });
    }

    @Test
    void animeAdded_emitsNothing_whenActorHasNoSquads() {
        User loner = userService.upsertFromGoogle("g-loner", "l@x.y", "L", null);
        Anime anime = animeService.upsertFromAniList(new AniListMedia(
            5002, "R", "N", "E", "img", 12, "FINISHED", "TV", 2024));

        events.publishEvent(new AnimeAddedEvent(loner.getId(), anime.getId(), WatchStatus.WATCHING));

        assertThat(activities.count()).isZero();
    }

    @Test
    void statusChanged_emitsWithFromTo() {
        Setup s = seedTwoSquadsWithMember();

        events.publishEvent(new WatchStatusChangedEvent(
            s.actor().getId(), s.anime().getId(), WatchStatus.WATCHING, WatchStatus.COMPLETED));

        Activity row = activities.findBySquadIdOrderByIdDesc(s.squadA().getId(), Limit.of(1)).get(0);
        assertThat(row.getType()).isEqualTo(ActivityType.STATUS_CHANGED);
        assertThat(row.getPayload()).containsEntry("from", "WATCHING");
        assertThat(row.getPayload()).containsEntry("to", "COMPLETED");
    }

    @Test
    void progressUpdated_emitsWithProgressNumber() {
        Setup s = seedTwoSquadsWithMember();

        events.publishEvent(new ProgressUpdatedEvent(s.actor().getId(), s.anime().getId(), 7));

        Activity row = activities.findBySquadIdOrderByIdDesc(s.squadA().getId(), Limit.of(1)).get(0);
        assertThat(row.getType()).isEqualTo(ActivityType.PROGRESS_UPDATED);
        assertThat(((Number) row.getPayload().get("progress")).intValue()).isEqualTo(7);
    }

    @Test
    void watchRated_emitsWithScore() {
        Setup s = seedTwoSquadsWithMember();

        events.publishEvent(new WatchRatedEvent(s.actor().getId(), s.anime().getId(), 9));

        Activity row = activities.findBySquadIdOrderByIdDesc(s.squadA().getId(), Limit.of(1)).get(0);
        assertThat(row.getType()).isEqualTo(ActivityType.RATED);
        assertThat(((Number) row.getPayload().get("score")).intValue()).isEqualTo(9);
    }

    @Test
    void episodeRated_emitsWithEpisodeAndScore() {
        Setup s = seedTwoSquadsWithMember();

        events.publishEvent(new EpisodeRatedEvent(s.actor().getId(), s.anime().getId(), 4, 8));

        Activity row = activities.findBySquadIdOrderByIdDesc(s.squadA().getId(), Limit.of(1)).get(0);
        assertThat(row.getType()).isEqualTo(ActivityType.EPISODE_RATED);
        assertThat(((Number) row.getPayload().get("episode")).intValue()).isEqualTo(4);
        assertThat(((Number) row.getPayload().get("score")).intValue()).isEqualTo(8);
    }

    @Test
    void squadJoined_emitsOnlyForThatSquad_animeIdNull() {
        User actor = userService.upsertFromGoogle("g-j", "j@x.y", "J", null);
        Squad target = squadService.createSquad(actor.getId(), "Target");
        // creating squad does NOT emit JOINED_SQUAD; emulate the join explicitly:
        events.publishEvent(new SquadJoinedEvent(actor.getId(), target.getId()));

        List<Activity> all = activities.findAll();
        assertThat(all).hasSize(1);
        assertThat(all.get(0).getType()).isEqualTo(ActivityType.JOINED_SQUAD);
        assertThat(all.get(0).getSquadId()).isEqualTo(target.getId());
        assertThat(all.get(0).getAnimeId()).isNull();
    }
}

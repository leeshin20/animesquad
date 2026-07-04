package com.animesquad.activity;

import com.animesquad.episode.events.EpisodeRatedEvent;
import com.animesquad.episode.events.EpisodeRatingDeletedEvent;
import com.animesquad.squad.MembershipRepository;
import com.animesquad.squad.events.SquadJoinedEvent;
import com.animesquad.watch.events.AnimeAddedEvent;
import com.animesquad.watch.events.ProgressUpdatedEvent;
import com.animesquad.watch.events.WatchRatedEvent;
import com.animesquad.watch.events.WatchEntryRemovedEvent;
import com.animesquad.watch.events.WatchReviewClearedEvent;
import com.animesquad.watch.events.WatchStatusChangedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Component
public class ActivityListener {

    private final ActivityRepository activities;
    private final MembershipRepository memberships;

    public ActivityListener(ActivityRepository activities, MembershipRepository memberships) {
        this.activities = activities;
        this.memberships = memberships;
    }

    @EventListener
    public void on(AnimeAddedEvent e) {
        fanOut(e.actorId(), ActivityType.ANIME_ADDED, e.animeId(),
            Map.of("status", e.status().name()));
    }

    @EventListener
    public void on(WatchStatusChangedEvent e) {
        fanOut(e.actorId(), ActivityType.STATUS_CHANGED, e.animeId(),
            Map.of("from", e.from().name(), "to", e.to().name()));
    }

    @EventListener
    public void on(ProgressUpdatedEvent e) {
        fanOut(e.actorId(), ActivityType.PROGRESS_UPDATED, e.animeId(),
            Map.of("progress", e.progress()));
    }

    @EventListener
    public void on(WatchRatedEvent e) {
        // An edit replaces the prior series-review entry so the feed shows it once, freshly.
        deleteSeriesActivities(e.actorId(), e.animeId());
        Map<String, Object> payload = new HashMap<>();
        payload.put("score", e.score());
        payload.put("progress", e.progress());
        if (e.comment() != null && !e.comment().isBlank()) {
            payload.put("comment", e.comment());
        }
        payload.put("status", e.status());
        fanOut(e.actorId(), ActivityType.RATED, e.animeId(), payload);
    }

    @EventListener
    public void on(WatchReviewClearedEvent e) {
        deleteSeriesActivities(e.actorId(), e.animeId());
    }

    @EventListener
    public void on(EpisodeRatedEvent e) {
        // An edit replaces the prior entry for this episode so the feed shows it once, freshly.
        deleteEpisodeActivities(e.actorId(), e.animeId(), e.episodeNumber());
        Map<String, Object> payload = new HashMap<>();
        payload.put("episode", e.episodeNumber());
        payload.put("score", e.score());
        if (e.comment() != null && !e.comment().isBlank()) {
            payload.put("comment", e.comment());
        }
        fanOut(e.actorId(), ActivityType.EPISODE_RATED, e.animeId(), payload);
    }

    @EventListener
    public void on(EpisodeRatingDeletedEvent e) {
        deleteEpisodeActivities(e.actorId(), e.animeId(), e.episodeNumber());
    }

    @EventListener
    public void on(WatchEntryRemovedEvent e) {
        activities.deleteAllByActorIdAndAnimeId(e.actorId(), e.animeId());
    }

    private void deleteSeriesActivities(Long actorId, Long animeId) {
        activities.deleteAll(
            activities.findAllByActorIdAndAnimeIdAndType(actorId, animeId, ActivityType.RATED));
    }

    private void deleteEpisodeActivities(Long actorId, Long animeId, int episodeNumber) {
        activities.deleteAll(
            activities.findAllByActorIdAndAnimeIdAndType(actorId, animeId, ActivityType.EPISODE_RATED).stream()
                .filter(a -> {
                    Object ep = a.getPayload().get("episode");
                    return ep instanceof Number n && n.intValue() == episodeNumber;
                })
                .toList());
    }

    @EventListener
    public void on(SquadJoinedEvent e) {
        activities.save(new Activity(
            e.squadId(), e.actorId(), ActivityType.JOINED_SQUAD, null, Map.of()));
    }

    private void fanOut(Long actorId, ActivityType type, Long animeId, Map<String, Object> payload) {
        List<Long> squadIds = memberships.findAllByUserId(actorId).stream()
            .map(m -> m.getSquadId()).toList();
        if (squadIds.isEmpty()) return;
        activities.saveAll(squadIds.stream()
            .map(sid -> new Activity(sid, actorId, type, animeId, payload))
            .toList());
    }
}

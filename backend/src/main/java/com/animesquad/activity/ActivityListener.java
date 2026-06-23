package com.animesquad.activity;

import com.animesquad.episode.events.EpisodeRatedEvent;
import com.animesquad.squad.MembershipRepository;
import com.animesquad.squad.events.SquadJoinedEvent;
import com.animesquad.watch.events.AnimeAddedEvent;
import com.animesquad.watch.events.ProgressUpdatedEvent;
import com.animesquad.watch.events.WatchRatedEvent;
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
        Map<String, Object> payload = new HashMap<>();
        payload.put("score", e.score());
        payload.put("progress", e.progress());
        if (e.comment() != null && !e.comment().isBlank()) {
            payload.put("comment", e.comment());
        }
        fanOut(e.actorId(), ActivityType.RATED, e.animeId(), payload);
    }

    @EventListener
    public void on(EpisodeRatedEvent e) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("episode", e.episodeNumber());
        payload.put("score", e.score());
        if (e.comment() != null && !e.comment().isBlank()) {
            payload.put("comment", e.comment());
        }
        fanOut(e.actorId(), ActivityType.EPISODE_RATED, e.animeId(), payload);
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

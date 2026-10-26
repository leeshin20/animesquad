package com.animesquad.watch;

import com.animesquad.anime.Anime;
import com.animesquad.anime.AnimeService;
import com.animesquad.watch.events.ProgressUpdatedEvent;
import com.animesquad.watch.events.WatchRatedEvent;
import com.animesquad.watch.events.WatchEntryRemovedEvent;
import com.animesquad.watch.events.WatchReviewClearedEvent;
import com.animesquad.watch.events.WatchStatusChangedEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class WatchService {

    private final WatchEntryRepository entries;
    private final EpisodeWatchService episodeWatches;
    private final EpisodeWatchRepository history;
    private final com.animesquad.episode.EpisodeRatingRepository ratings;
    private final AnimeService animeService;
    private final ApplicationEventPublisher events;

    public WatchService(WatchEntryRepository entries, AnimeService animeService,
                        ApplicationEventPublisher events, EpisodeWatchService episodeWatches,
                        EpisodeWatchRepository history, com.animesquad.episode.EpisodeRatingRepository ratings) {
        this.entries = entries;
        this.episodeWatches = episodeWatches; this.history = history; this.ratings = ratings;
        this.animeService = animeService;
        this.events = events;
    }

    @Transactional
    public WatchEntry addToList(Long userId, int anilistId, WatchStatus status) {
        Anime anime = animeService.findOrFetchByAnilistId(anilistId);
        return entries.findByUserIdAndAnimeId(userId, anime.getId())
            .orElseGet(() -> entries.save(new WatchEntry(userId, anime.getId(), status)));
    }

    @Transactional
    public WatchEntry addToListById(Long userId, Long animeId, WatchStatus status) {
        return entries.findByUserIdAndAnimeId(userId, animeId)
            .orElseGet(() -> entries.save(new WatchEntry(userId, animeId, status)));
    }

    @Transactional
    public WatchEntry updateEntry(Long userId, Long animeId,
                                  WatchStatus status, Integer progress,
                                  Integer score, String comment) {
        episodeWatches.lockUser(userId);
        WatchEntry e = entries.findByUserIdAndAnimeId(userId, animeId)
            .orElseThrow(() -> new IllegalArgumentException("watch entry not found"));

        WatchStatus oldStatus = e.getStatus();
        int oldProgress = e.getProgress();
        Integer oldScore = e.getScore();
        String oldComment = e.getComment();

        e.apply(status, progress, score, comment);

        if (status != null && status != oldStatus) {
            events.publishEvent(new WatchStatusChangedEvent(userId, animeId, oldStatus, status));
        }
        if (progress != null && progress != oldProgress) {
            events.publishEvent(new ProgressUpdatedEvent(userId, animeId, progress));
        }
        boolean scoreChanged = score != null && !score.equals(oldScore);
        boolean commentChanged = comment != null && !comment.equals(oldComment);
        if (scoreChanged || commentChanged) {
            events.publishEvent(new WatchRatedEvent(userId, animeId, e.getScore(), e.getProgress(), e.getComment(), e.getStatus().name()));
        }
        return e;
    }

    @Transactional
    public WatchEntry advanceProgress(Long userId, Long animeId, int progress) {
        return episodeWatches.record(userId, animeId, progress, null);
    }

    @Transactional
    public WatchEntry advanceProgress(Long userId, Long animeId, int progress, String source) {
        return episodeWatches.record(userId, animeId, progress, source);
    }

    @Transactional(readOnly = true)
    public List<WatchEntry> listMine(Long userId) {
        return entries.findAllByUserIdOrderByUpdatedAtDesc(userId);
    }

    @Transactional(readOnly = true)
    public java.util.Optional<WatchEntry> findEntry(Long userId, Long animeId) {
        return entries.findByUserIdAndAnimeId(userId, animeId);
    }

    @Transactional
    public void removeFromList(Long userId, Long animeId) {
        episodeWatches.lockUser(userId);
        WatchEntry e = entries.findByUserIdAndAnimeId(userId, animeId)
            .orElseThrow(() -> new IllegalArgumentException("watch entry not found"));
        history.deleteAllByUserIdAndAnimeId(userId, animeId);
        ratings.deleteAllByUserIdAndAnimeId(userId, animeId);
        entries.delete(e);
        events.publishEvent(new WatchEntryRemovedEvent(userId, animeId));
    }

    @Transactional
    public WatchEntry clearReview(Long userId, Long animeId) {
        episodeWatches.lockUser(userId);
        WatchEntry e = entries.findByUserIdAndAnimeId(userId, animeId)
            .orElseThrow(() -> new IllegalArgumentException("watch entry not found"));
        e.clearReview();
        events.publishEvent(new WatchReviewClearedEvent(userId, animeId));
        return e;
    }
}

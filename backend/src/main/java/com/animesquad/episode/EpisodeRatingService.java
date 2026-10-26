package com.animesquad.episode;

import com.animesquad.episode.events.EpisodeRatedEvent;
import com.animesquad.episode.events.EpisodeRatingDeletedEvent;
import com.animesquad.watch.WatchEntry;
import com.animesquad.watch.WatchEntryRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
public class EpisodeRatingService {

    private final EpisodeRatingRepository ratings;
    private final com.animesquad.watch.EpisodeWatchService history;
    private final WatchEntryRepository watches;
    private final ApplicationEventPublisher events;

    public EpisodeRatingService(EpisodeRatingRepository ratings,
                                WatchEntryRepository watches,
                                ApplicationEventPublisher events, com.animesquad.watch.EpisodeWatchService history) {
        this.ratings = ratings;
        this.history = history;
        this.watches = watches;
        this.events = events;
    }

    @Transactional
    public EpisodeRating upsertRating(Long userId, Long animeId,
                                      int episodeNumber, Integer score, String comment) {
        history.lockUser(userId);
        WatchEntry entry = watches.findByUserIdAndAnimeId(userId, animeId)
            .orElseThrow(() -> new IllegalArgumentException(
                "watch entry not found — add the anime to your list first"));

        history.record(userId, animeId, episodeNumber, "MANUAL");
        EpisodeRating rating = ratings.findByUserIdAndAnimeIdAndEpisodeNumber(
                userId, animeId, episodeNumber)
            .map(existing -> {
                existing.replace(score != null ? score : existing.getScore(), comment);
                return existing;
            })
            .orElseGet(() -> ratings.save(
                new EpisodeRating(userId, animeId, episodeNumber, score, comment)));

        if (entry.getProgress() < episodeNumber) {
            // Keep the managed entry in sync with the native progress upsert.
            entry.apply(null, episodeNumber, null, null);
        }

        events.publishEvent(new EpisodeRatedEvent(userId, animeId, episodeNumber, rating.getScore(), rating.getComment()));
        return rating;
    }

    @Transactional(readOnly = true)
    public List<EpisodeRating> listForUserAnime(Long userId, Long animeId) {
        return ratings.findAllByUserIdAndAnimeIdOrderByEpisodeNumberAsc(userId, animeId);
    }

    @Transactional
    public void deleteRating(Long userId, Long animeId, int episodeNumber) {
        history.lockUser(userId);
        EpisodeRating rating = ratings.findByUserIdAndAnimeIdAndEpisodeNumber(
                userId, animeId, episodeNumber)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "감상평이 없어요"));
        ratings.delete(rating);
        events.publishEvent(new EpisodeRatingDeletedEvent(userId, animeId, episodeNumber));
    }
}

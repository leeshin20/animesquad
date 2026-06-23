package com.animesquad.episode;

import com.animesquad.episode.events.EpisodeRatedEvent;
import com.animesquad.watch.WatchEntry;
import com.animesquad.watch.WatchEntryRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class EpisodeRatingService {

    private final EpisodeRatingRepository ratings;
    private final WatchEntryRepository watches;
    private final ApplicationEventPublisher events;

    public EpisodeRatingService(EpisodeRatingRepository ratings,
                                WatchEntryRepository watches,
                                ApplicationEventPublisher events) {
        this.ratings = ratings;
        this.watches = watches;
        this.events = events;
    }

    @Transactional
    public EpisodeRating upsertRating(Long userId, Long animeId,
                                      int episodeNumber, int score, String comment) {
        WatchEntry entry = watches.findByUserIdAndAnimeId(userId, animeId)
            .orElseThrow(() -> new IllegalArgumentException(
                "watch entry not found — add the anime to your list first"));

        EpisodeRating rating = ratings.findByUserIdAndAnimeIdAndEpisodeNumber(
                userId, animeId, episodeNumber)
            .map(existing -> { existing.replace(score, comment); return existing; })
            .orElseGet(() -> ratings.save(
                new EpisodeRating(userId, animeId, episodeNumber, score, comment)));

        if (entry.getProgress() < episodeNumber) {
            // bump progress silently — the EpisodeRatedEvent below already
            // represents this episode, so we skip the separate ProgressUpdatedEvent
            entry.apply(null, episodeNumber, null, null);
        }

        events.publishEvent(new EpisodeRatedEvent(userId, animeId, episodeNumber, score, comment));
        return rating;
    }

    @Transactional(readOnly = true)
    public List<EpisodeRating> listForUserAnime(Long userId, Long animeId) {
        return ratings.findAllByUserIdAndAnimeIdOrderByEpisodeNumberAsc(userId, animeId);
    }
}

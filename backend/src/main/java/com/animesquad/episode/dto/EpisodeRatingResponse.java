package com.animesquad.episode.dto;

import com.animesquad.episode.EpisodeRating;

import java.time.OffsetDateTime;

public record EpisodeRatingResponse(
    Long id,
    Long animeId,
    int episodeNumber,
    int score,
    String comment,
    OffsetDateTime createdAt,
    OffsetDateTime updatedAt
) {
    public static EpisodeRatingResponse from(EpisodeRating r) {
        return new EpisodeRatingResponse(
            r.getId(), r.getAnimeId(), r.getEpisodeNumber(),
            r.getScore(), r.getComment(),
            r.getCreatedAt(), r.getUpdatedAt());
    }
}

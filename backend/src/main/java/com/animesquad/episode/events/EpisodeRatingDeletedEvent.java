package com.animesquad.episode.events;

public record EpisodeRatingDeletedEvent(Long actorId, Long animeId, int episodeNumber) {}

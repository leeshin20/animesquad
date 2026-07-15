package com.animesquad.episode.events;

public record EpisodeRatedEvent(Long actorId, Long animeId, int episodeNumber, Integer score, String comment) {}

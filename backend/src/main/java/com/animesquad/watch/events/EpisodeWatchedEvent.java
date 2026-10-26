package com.animesquad.watch.events;

public record EpisodeWatchedEvent(Long actorId, Long animeId, int episode, Long episodeWatchId) {}

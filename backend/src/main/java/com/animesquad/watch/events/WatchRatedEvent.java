package com.animesquad.watch.events;

public record WatchRatedEvent(Long actorId, Long animeId, int score, int progress, String comment, String status) {}

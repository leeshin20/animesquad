package com.animesquad.watch.events;

public record ProgressUpdatedEvent(Long actorId, Long animeId, int progress) {}

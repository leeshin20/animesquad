package com.animesquad.watch.events;

import com.animesquad.watch.WatchStatus;

public record AnimeAddedEvent(Long actorId, Long animeId, WatchStatus status) {}

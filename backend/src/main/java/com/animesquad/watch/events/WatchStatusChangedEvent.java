package com.animesquad.watch.events;

import com.animesquad.watch.WatchStatus;

public record WatchStatusChangedEvent(
    Long actorId, Long animeId, WatchStatus from, WatchStatus to
) {}

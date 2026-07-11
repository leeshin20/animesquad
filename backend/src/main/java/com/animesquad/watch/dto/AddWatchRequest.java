package com.animesquad.watch.dto;

import com.animesquad.watch.WatchStatus;
import jakarta.validation.constraints.NotNull;

public record AddWatchRequest(
    Integer anilistId,
    Long animeId,
    @NotNull WatchStatus status
) {}

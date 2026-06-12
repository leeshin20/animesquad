package com.animesquad.watch.dto;

import com.animesquad.watch.WatchStatus;
import jakarta.validation.constraints.NotNull;

public record AddWatchRequest(
    @NotNull Integer anilistId,
    @NotNull WatchStatus status
) {}

package com.animesquad.watch.dto;

import com.animesquad.watch.WatchStatus;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

public record UpdateWatchRequest(
    WatchStatus status,
    @PositiveOrZero Integer progress,
    @Min(1) @Max(5) Integer score,
    @Size(max = 280) String comment
) {}

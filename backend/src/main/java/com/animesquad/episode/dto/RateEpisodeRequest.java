package com.animesquad.episode.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record RateEpisodeRequest(
    @NotNull @Min(1) @Max(10) Integer score,
    @Size(max = 280) String comment
) {}

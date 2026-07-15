package com.animesquad.episode.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Size;

public record RateEpisodeRequest(
    @Min(1) @Max(5) Integer score,
    @Size(max = 280) String comment
) {
    @AssertTrue(message = "별점 또는 감상평이 필요해요")
    public boolean isNotEmpty() {
        return score != null || (comment != null && !comment.isBlank());
    }
}

package com.animesquad.user.dto;

import com.animesquad.episode.MyEpisodeReviewController.MyEpisodeReview;
import com.animesquad.watch.dto.WatchEntryResponse;

import java.util.List;

public record UserProfileResponse(
    Long id,
    String displayName,
    String avatarUrl,
    boolean accessible,
    List<WatchEntryResponse> recentWatched,
    List<MyEpisodeReview> recentEpisodeReviews,
    List<PublicSquadRef> squads
) {}

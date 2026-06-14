package com.animesquad.activity.dto;

import com.animesquad.activity.Activity;
import com.animesquad.activity.ActivityType;

import java.time.OffsetDateTime;
import java.util.Map;

public record FeedItemResponse(
    Long id,
    ActivityType type,
    ActorRef actor,
    AnimeRef anime,
    Map<String, Object> payload,
    OffsetDateTime createdAt
) {
    public static FeedItemResponse from(Activity a, ActorRef actor, AnimeRef anime) {
        return new FeedItemResponse(
            a.getId(), a.getType(), actor, anime, a.getPayload(), a.getCreatedAt());
    }
}

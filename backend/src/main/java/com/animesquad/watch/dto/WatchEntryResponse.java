package com.animesquad.watch.dto;

import com.animesquad.anime.Anime;
import com.animesquad.anime.dto.AnimeResponse;
import com.animesquad.watch.WatchEntry;
import com.animesquad.watch.WatchStatus;

import java.time.OffsetDateTime;

public record WatchEntryResponse(
    Long id,
    AnimeResponse anime,
    WatchStatus status,
    int progress,
    Integer score,
    String comment,
    OffsetDateTime createdAt,
    OffsetDateTime updatedAt
) {
    public static WatchEntryResponse from(WatchEntry e, Anime a) {
        return new WatchEntryResponse(
            e.getId(), AnimeResponse.from(a),
            e.getStatus(), e.getProgress(), e.getScore(), e.getComment(),
            e.getCreatedAt(), e.getUpdatedAt()
        );
    }
}

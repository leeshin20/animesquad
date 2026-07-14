package com.animesquad.admin.watchimport;

import java.util.List;

public final class AdminWatchImportDtos {
    private AdminWatchImportDtos() {}

    public enum LineStatus { MATCHED, UNMATCHED, INVALID, DUPLICATE }

    public record TargetUser(Long id, String email, String displayName) {}
    public record AnimeRef(Long id, String titleKorean, String titleRomaji,
                           String coverImageUrl) {}
    public record PreviewLine(int lineNumber, String rawLine, String title,
                              Integer progress, LineStatus status,
                              AnimeRef anime, String message) {}
    public record PreviewResponse(TargetUser targetUser, List<PreviewLine> lines) {}
    public record PreviewRequest(String email, String text) {}
    public record CommitItem(Long animeId, Integer progress) {}
    public record CommitRequest(Long targetUserId, List<CommitItem> items) {}
    public record CommitResponse(int created, int updated) {}
}

package com.animesquad.squad.dto;

import com.animesquad.squad.Squad;
import java.time.OffsetDateTime;

public record SquadResponse(
    Long id,
    String name,
    Long ownerId,
    String inviteCode,
    OffsetDateTime createdAt,
    String announcement,
    String avatarUrl,
    String bannerUrl,
    long memberCount
) {
    public static SquadResponse from(Squad s, long memberCount) {
        return new SquadResponse(s.getId(), s.getName(), s.getOwnerId(),
            s.getInviteCode(), s.getCreatedAt(), s.getAnnouncement(),
            s.getAvatarUrl(), s.getBannerUrl(), memberCount);
    }
}

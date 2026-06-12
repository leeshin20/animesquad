package com.animesquad.squad.dto;

import com.animesquad.squad.Squad;
import java.time.OffsetDateTime;

public record SquadResponse(
    Long id,
    String name,
    Long ownerId,
    String inviteCode,
    OffsetDateTime createdAt
) {
    public static SquadResponse from(Squad s) {
        return new SquadResponse(s.getId(), s.getName(), s.getOwnerId(),
            s.getInviteCode(), s.getCreatedAt());
    }
}

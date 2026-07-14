package com.animesquad.squad.dto;

import com.animesquad.squad.MembershipRole;
import com.animesquad.user.User;

public record SquadMemberResponse(Long userId, String displayName, String avatarUrl, MembershipRole role) {
    public static SquadMemberResponse from(User u, MembershipRole role) {
        return new SquadMemberResponse(u.getId(), u.getDisplayName(), u.getAvatarUrl(), role);
    }
}

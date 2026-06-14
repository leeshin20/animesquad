package com.animesquad.activity.dto;

import com.animesquad.user.User;

public record ActorRef(Long id, String displayName, String avatarUrl) {
    public static ActorRef from(User u) {
        return new ActorRef(u.getId(), u.getDisplayName(), u.getAvatarUrl());
    }
}

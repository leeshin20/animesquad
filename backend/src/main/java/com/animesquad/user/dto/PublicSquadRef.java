package com.animesquad.user.dto;

public record PublicSquadRef(
    Long id,
    String name,
    String avatarUrl,
    long memberCount
) {}

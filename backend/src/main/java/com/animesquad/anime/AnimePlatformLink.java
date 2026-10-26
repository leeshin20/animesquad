package com.animesquad.anime;

import jakarta.persistence.*;

@Entity
@Table(name = "anime_platform_link")
public class AnimePlatformLink {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 16)
    private String platform;

    @Column(name = "platform_anime_id", nullable = false, length = 20)
    private String platformAnimeId;

    @Column(name = "anime_id", nullable = false)
    private Long animeId;

    protected AnimePlatformLink() {}

    public Long getAnimeId() { return animeId; }
}

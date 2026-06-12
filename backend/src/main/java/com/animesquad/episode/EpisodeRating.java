package com.animesquad.episode;

import jakarta.persistence.*;
import java.time.OffsetDateTime;

@Entity
@Table(name = "episode_rating")
public class EpisodeRating {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "anime_id", nullable = false)
    private Long animeId;

    @Column(name = "episode_number", nullable = false)
    private int episodeNumber;

    @Column(nullable = false)
    private int score;

    @Column(columnDefinition = "TEXT")
    private String comment;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt = OffsetDateTime.now();

    protected EpisodeRating() {}

    public EpisodeRating(Long userId, Long animeId, int episodeNumber, int score, String comment) {
        this.userId = userId;
        this.animeId = animeId;
        this.episodeNumber = episodeNumber;
        this.score = score;
        this.comment = comment;
    }

    public void replace(int score, String comment) {
        this.score = score;
        this.comment = comment;
        this.updatedAt = OffsetDateTime.now();
    }

    public Long getId() { return id; }
    public Long getUserId() { return userId; }
    public Long getAnimeId() { return animeId; }
    public int getEpisodeNumber() { return episodeNumber; }
    public int getScore() { return score; }
    public String getComment() { return comment; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
}

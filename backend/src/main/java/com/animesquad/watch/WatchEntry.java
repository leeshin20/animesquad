package com.animesquad.watch;

import jakarta.persistence.*;
import java.time.OffsetDateTime;

@Entity
@Table(name = "watch_entry")
public class WatchEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "anime_id", nullable = false)
    private Long animeId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private WatchStatus status;

    @Column(nullable = false)
    private int progress = 0;

    @Column
    private Integer score;

    @Column(columnDefinition = "TEXT")
    private String comment;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt = OffsetDateTime.now();

    protected WatchEntry() {}

    public WatchEntry(Long userId, Long animeId, WatchStatus status) {
        this.userId = userId;
        this.animeId = animeId;
        this.status = status;
    }

    public void apply(WatchStatus status, Integer progress, Integer score, String comment) {
        if (status != null) this.status = status;
        if (progress != null) this.progress = progress;
        if (score != null) this.score = score;
        if (comment != null) this.comment = comment;
        this.updatedAt = OffsetDateTime.now();
    }

    /** Clears the series review (score + comment) while keeping status/progress. */
    public void clearReview() {
        this.score = null;
        this.comment = null;
        this.updatedAt = OffsetDateTime.now();
    }

    public Long getId() { return id; }
    public Long getUserId() { return userId; }
    public Long getAnimeId() { return animeId; }
    public WatchStatus getStatus() { return status; }
    public int getProgress() { return progress; }
    public Integer getScore() { return score; }
    public String getComment() { return comment; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
}

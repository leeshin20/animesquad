package com.animesquad.watch;

import jakarta.persistence.*;
import java.time.OffsetDateTime;

@Entity
@Table(name = "episode_watch")
public class EpisodeWatch {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "user_id", nullable = false) private Long userId;
    @Column(name = "anime_id", nullable = false) private Long animeId;
    @Column(name = "episode_number", nullable = false) private int episodeNumber;
    @Column(name = "recorded_at", nullable = false) private OffsetDateTime recordedAt;
    @Column(nullable = false) private String source;

    protected EpisodeWatch() {}
    public Long getId() { return id; }
    public Long getUserId() { return userId; }
    public Long getAnimeId() { return animeId; }
    public int getEpisodeNumber() { return episodeNumber; }
    public OffsetDateTime getRecordedAt() { return recordedAt; }
    public String getSource() { return source; }
}

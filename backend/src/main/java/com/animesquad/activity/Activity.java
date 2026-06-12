package com.animesquad.activity;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.Map;

@Entity
@Table(name = "activity")
public class Activity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "squad_id", nullable = false)
    private Long squadId;

    @Column(name = "actor_id", nullable = false)
    private Long actorId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private ActivityType type;

    @Column(name = "anime_id")
    private Long animeId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private Map<String, Object> payload;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    protected Activity() {}

    public Activity(Long squadId, Long actorId, ActivityType type, Long animeId, Map<String, Object> payload) {
        this.squadId = squadId;
        this.actorId = actorId;
        this.type = type;
        this.animeId = animeId;
        this.payload = payload == null ? Map.of() : payload;
    }

    public Long getId() { return id; }
    public Long getSquadId() { return squadId; }
    public Long getActorId() { return actorId; }
    public ActivityType getType() { return type; }
    public Long getAnimeId() { return animeId; }
    public Map<String, Object> getPayload() { return payload; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
}

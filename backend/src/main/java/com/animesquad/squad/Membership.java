package com.animesquad.squad;

import jakarta.persistence.*;
import java.time.OffsetDateTime;

@Entity
@Table(name = "membership")
public class Membership {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "squad_id", nullable = false)
    private Long squadId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private MembershipRole role;

    @Column(name = "joined_at", nullable = false)
    private OffsetDateTime joinedAt = OffsetDateTime.now();

    protected Membership() {}

    public Membership(Long userId, Long squadId, MembershipRole role) {
        this.userId = userId;
        this.squadId = squadId;
        this.role = role;
    }

    public Long getId() { return id; }
    public Long getUserId() { return userId; }
    public Long getSquadId() { return squadId; }
    public MembershipRole getRole() { return role; }
    public OffsetDateTime getJoinedAt() { return joinedAt; }
}

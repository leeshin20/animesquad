package com.animesquad.squad;

import jakarta.persistence.*;
import java.time.OffsetDateTime;

@Entity
@Table(name = "squad")
public class Squad {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 80)
    private String name;

    @Column(name = "owner_id", nullable = false)
    private Long ownerId;

    @Column(name = "invite_code", nullable = false, unique = true, length = 16)
    private String inviteCode;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    @Column(columnDefinition = "text")
    private String announcement;

    @Column(name = "avatar_url", columnDefinition = "text")
    private String avatarUrl;

    @Column(name = "banner_url", columnDefinition = "text")
    private String bannerUrl;

    protected Squad() {}

    public Squad(String name, Long ownerId, String inviteCode) {
        this.name = name;
        this.ownerId = ownerId;
        this.inviteCode = inviteCode;
    }

    public Long getId() { return id; }
    public String getName() { return name; }
    public Long getOwnerId() { return ownerId; }
    public String getInviteCode() { return inviteCode; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public String getAnnouncement() { return announcement; }
    public String getAvatarUrl() { return avatarUrl; }
    public String getBannerUrl() { return bannerUrl; }

    public void updateAnnouncement(String text) {
        this.announcement = (text == null || text.isBlank()) ? null : text.trim();
    }

    public void updateName(String name) { this.name = name.trim(); }
    public void updateAvatarUrl(String url) { this.avatarUrl = url; }
    public void updateBannerUrl(String url) { this.bannerUrl = url; }
}

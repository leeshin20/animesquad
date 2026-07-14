package com.animesquad.user;

import jakarta.persistence.*;
import java.time.OffsetDateTime;

@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "google_sub", nullable = false, unique = true)
    private String googleSub;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(name = "display_name", nullable = false)
    private String displayName;

    @Column(name = "avatar_url")
    private String avatarUrl;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    @Column(name = "terms_agreed_at")
    private OffsetDateTime termsAgreedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "profile_visibility", nullable = false, length = 20)
    private ProfileVisibility profileVisibility = ProfileVisibility.SQUAD_ONLY;

    protected User() {}

    public User(String googleSub, String email, String displayName, String avatarUrl) {
        this.googleSub = googleSub;
        this.email = email;
        this.displayName = displayName;
        this.avatarUrl = avatarUrl;
    }

    public void updateDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public void updateAvatarUrl(String avatarUrl) {
        this.avatarUrl = avatarUrl;
    }

    public void updateProfileVisibility(ProfileVisibility profileVisibility) {
        this.profileVisibility = profileVisibility;
    }

    public void agreeTerms() {
        if (this.termsAgreedAt == null) {
            this.termsAgreedAt = OffsetDateTime.now();
        }
    }

    public Long getId() { return id; }
    public String getGoogleSub() { return googleSub; }
    public String getEmail() { return email; }
    public String getDisplayName() { return displayName; }
    public String getAvatarUrl() { return avatarUrl; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getTermsAgreedAt() { return termsAgreedAt; }
    public ProfileVisibility getProfileVisibility() { return profileVisibility; }
}

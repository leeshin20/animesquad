package com.animesquad.anime;

import jakarta.persistence.*;
import java.time.OffsetDateTime;

@Entity
@Table(name = "anime")
public class Anime {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "anilist_id", unique = true)
    private Integer anilistId;

    @Column(name = "title_romaji", nullable = false)
    private String titleRomaji;

    @Column(name = "title_native", nullable = false)
    private String titleNative;

    @Column(name = "title_english")
    private String titleEnglish;

    @Column(name = "title_korean")
    private String titleKorean;

    @Column(name = "cover_image_url")
    private String coverImageUrl;

    @Column(name = "episodes")
    private Integer episodes;

    @Column(nullable = false, length = 32)
    private String status;

    @Column(nullable = false, length = 32)
    private String format;

    @Column(name = "season_year")
    private Integer seasonYear;

    @Column(name = "cached_at", nullable = false)
    private OffsetDateTime cachedAt = OffsetDateTime.now();

    protected Anime() {}

    public Anime(Integer anilistId, String titleRomaji, String titleNative, String titleEnglish,
                 String coverImageUrl, Integer episodes, String status, String format, Integer seasonYear) {
        this.anilistId = anilistId;
        this.titleRomaji = titleRomaji;
        this.titleNative = titleNative;
        this.titleEnglish = titleEnglish;
        this.coverImageUrl = coverImageUrl;
        this.episodes = episodes;
        this.status = status;
        this.format = format;
        this.seasonYear = seasonYear;
    }

    public void refreshFrom(String titleRomaji, String titleNative, String titleEnglish,
                            String coverImageUrl, Integer episodes, String status,
                            String format, Integer seasonYear) {
        this.titleRomaji = titleRomaji;
        this.titleNative = titleNative;
        this.titleEnglish = titleEnglish;
        this.coverImageUrl = coverImageUrl;
        this.episodes = episodes;
        this.status = status;
        this.format = format;
        this.seasonYear = seasonYear;
        this.cachedAt = OffsetDateTime.now();
    }

    public Long getId() { return id; }
    public Integer getAnilistId() { return anilistId; }
    public String getTitleRomaji() { return titleRomaji; }
    public String getTitleNative() { return titleNative; }
    public String getTitleEnglish() { return titleEnglish; }
    public String getTitleKorean() { return titleKorean; }
    public String getCoverImageUrl() { return coverImageUrl; }
    public Integer getEpisodes() { return episodes; }
    public String getStatus() { return status; }
    public String getFormat() { return format; }
    public Integer getSeasonYear() { return seasonYear; }
    public OffsetDateTime getCachedAt() { return cachedAt; }
}

package com.animesquad.anime;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.OffsetDateTime;

@Entity
@Table(name = "excluded_anime")
public class ExcludedAnime {

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

    @Column(name = "search_keywords")
    private String searchKeywords;

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

    @Column(length = 10)
    private String season;

    @Column(name = "start_date")
    private LocalDate startDate;

    @Column(name = "excluded_at", nullable = false)
    private OffsetDateTime excludedAt = OffsetDateTime.now();

    protected ExcludedAnime() {}

    private ExcludedAnime(Integer anilistId, String titleRomaji, String titleNative, String titleEnglish,
                 String coverImageUrl, Integer episodes, String status, String format, Integer seasonYear,
                 String season, LocalDate startDate) {
        this.anilistId = anilistId;
        this.titleRomaji = titleRomaji;
        this.titleNative = titleNative;
        this.titleEnglish = titleEnglish;
        this.coverImageUrl = coverImageUrl;
        this.episodes = episodes;
        this.status = status;
        this.format = format;
        this.seasonYear = seasonYear;
        this.season = season;
        this.startDate = startDate;
    }

    public static ExcludedAnime from(Anime anime) {
        ExcludedAnime excluded = new ExcludedAnime(
            anime.getAnilistId(), anime.getTitleRomaji(), anime.getTitleNative(), anime.getTitleEnglish(),
            anime.getCoverImageUrl(), anime.getEpisodes(), anime.getStatus(), anime.getFormat(),
            anime.getSeasonYear(), anime.getSeason(), anime.getStartDate());
        excluded.titleKorean = anime.getTitleKorean();
        excluded.searchKeywords = anime.getSearchKeywords();
        return excluded;
    }

    public Anime restore() {
        Anime anime = new Anime(anilistId, titleRomaji, titleNative, titleEnglish, coverImageUrl,
            episodes, status, format, seasonYear, season, startDate);
        anime.setTitleKorean(titleKorean);
        anime.setSearchKeywords(searchKeywords);
        return anime;
    }

    public Long getId() { return id; }
    public Integer getAnilistId() { return anilistId; }
    public String getTitleRomaji() { return titleRomaji; }
    public String getTitleNative() { return titleNative; }
    public String getTitleEnglish() { return titleEnglish; }
    public String getTitleKorean() { return titleKorean; }
    public String getSearchKeywords() { return searchKeywords; }
    public String getCoverImageUrl() { return coverImageUrl; }
    public Integer getEpisodes() { return episodes; }
    public String getStatus() { return status; }
    public String getFormat() { return format; }
    public Integer getSeasonYear() { return seasonYear; }
    public String getSeason() { return season; }
    public LocalDate getStartDate() { return startDate; }
    public OffsetDateTime getExcludedAt() { return excludedAt; }
}

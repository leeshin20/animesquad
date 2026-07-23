package com.animesquad.anime;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface AnimeRepository extends JpaRepository<Anime, Long> {
    Optional<Anime> findByAnilistId(Integer anilistId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT a FROM Anime a WHERE a.id = :id")
    Optional<Anime> findByIdForUpdate(@Param("id") Long id);

    List<Anime> findByTitleKoreanIsNullOrderByIdDesc();

    @Query(value = """
        SELECT * FROM anime a
        WHERE LOWER(a.title_romaji) LIKE :q
           OR LOWER(COALESCE(a.title_english, '')) LIKE :q
           OR LOWER(COALESCE(a.title_korean, '')) LIKE :q
           OR LOWER(COALESCE(a.search_keywords, '')) LIKE :q
           OR a.title_native LIKE :raw
           OR REPLACE(LOWER(a.title_romaji), ' ', '') LIKE :qs
           OR REPLACE(LOWER(COALESCE(a.title_english, '')), ' ', '') LIKE :qs
           OR REPLACE(LOWER(COALESCE(a.title_korean, '')), ' ', '') LIKE :qs
           OR REPLACE(LOWER(COALESCE(a.search_keywords, '')), ' ', '') LIKE :qs
           OR REPLACE(a.title_native, ' ', '') LIKE :raws
        ORDER BY a.id DESC
        LIMIT 20
        """, nativeQuery = true)
    List<Anime> searchByTitle(
        @Param("q") String lowered, @Param("raw") String raw,
        @Param("qs") String loweredStripped, @Param("raws") String rawStripped);

    List<Anime> findBySeasonYearAndSeasonOrderByTitleRomajiAsc(Integer seasonYear, String season);

    List<Anime> findBySeasonYearAndSeasonAndTitleKoreanIsNotNullOrderByTitleKoreanAscIdAsc(
        Integer seasonYear, String season);
}

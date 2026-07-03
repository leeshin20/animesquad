package com.animesquad.anime;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface AnimeRepository extends JpaRepository<Anime, Long> {
    Optional<Anime> findByAnilistId(Integer anilistId);

    List<Anime> findByTitleKoreanIsNullOrderByIdDesc();

    @Query("""
        SELECT a FROM Anime a
        WHERE LOWER(a.titleRomaji)   LIKE :q
           OR LOWER(COALESCE(a.titleEnglish, '')) LIKE :q
           OR LOWER(COALESCE(a.titleKorean, '')) LIKE :q
           OR a.titleNative LIKE :raw
        ORDER BY a.id DESC
        """)
    List<Anime> searchByTitle(@Param("q") String lowered, @Param("raw") String raw, Limit limit);

    List<Anime> findBySeasonYearAndSeasonOrderByTitleRomajiAsc(Integer seasonYear, String season);
}

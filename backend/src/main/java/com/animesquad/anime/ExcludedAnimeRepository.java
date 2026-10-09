package com.animesquad.anime;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.List;

public interface ExcludedAnimeRepository extends JpaRepository<ExcludedAnime, Long> {
    // Share one transaction lock across catalog imports, exclusions, and restores.
    @Query(value = "SELECT 1 FROM pg_advisory_xact_lock(19019)", nativeQuery = true)
    int lockCatalog();

    boolean existsByAnilistId(Integer anilistId);
    List<ExcludedAnime> findAllByOrderByExcludedAtDescIdDesc();
}

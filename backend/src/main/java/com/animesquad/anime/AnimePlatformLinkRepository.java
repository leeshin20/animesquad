package com.animesquad.anime;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Optional;

public interface AnimePlatformLinkRepository extends JpaRepository<AnimePlatformLink, Long> {
    Optional<AnimePlatformLink> findByPlatformAndPlatformAnimeId(String platform, String platformAnimeId);

    @Modifying
    @Query(value = """
        INSERT INTO anime_platform_link (platform, platform_anime_id, anime_id)
        VALUES (:platform, :platformAnimeId, :animeId)
        ON CONFLICT (platform, platform_anime_id) DO NOTHING
        """, nativeQuery = true)
    int insertIfAbsent(@Param("platform") String platform,
                       @Param("platformAnimeId") String platformAnimeId,
                       @Param("animeId") Long animeId);
}

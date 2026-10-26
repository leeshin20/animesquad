package com.animesquad.watch;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.*;
import java.util.List;
import java.util.Optional;

public interface EpisodeWatchRepository extends JpaRepository<EpisodeWatch, Long> {
    List<EpisodeWatch> findByUserIdOrderByIdDesc(Long userId, Limit limit);
    List<EpisodeWatch> findByUserIdAndIdLessThanOrderByIdDesc(Long userId, Long cursor, Limit limit);
    Optional<EpisodeWatch> findByUserIdAndAnimeIdAndEpisodeNumber(Long userId, Long animeId, int episodeNumber);
    boolean existsByAnimeId(Long animeId);
    void deleteAllByUserIdAndAnimeId(Long userId, Long animeId);

    @Modifying
    @Query(value = """
        INSERT INTO episode_watch (user_id, anime_id, episode_number, source)
        VALUES (:userId, :animeId, :episode, :source)
        ON CONFLICT (user_id, anime_id, episode_number) DO NOTHING
        """, nativeQuery = true)
    int insertOnce(Long userId, Long animeId, int episode, String source);
}

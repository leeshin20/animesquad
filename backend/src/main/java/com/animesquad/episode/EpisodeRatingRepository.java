package com.animesquad.episode;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface EpisodeRatingRepository extends JpaRepository<EpisodeRating, Long> {
    Optional<EpisodeRating> findByUserIdAndAnimeIdAndEpisodeNumber(
        Long userId, Long animeId, int episodeNumber);

    List<EpisodeRating> findAllByUserIdAndAnimeIdOrderByEpisodeNumberAsc(
        Long userId, Long animeId);

    List<EpisodeRating> findAllByAnimeIdOrderByEpisodeNumberAscUpdatedAtDesc(Long animeId);

    boolean existsByAnimeId(Long animeId);

    List<EpisodeRating> findAllByUserIdAndCommentIsNotNullOrderByUpdatedAtDesc(
        Long userId, Limit limit);

    List<EpisodeRating> findAllByUserIdOrderByUpdatedAtDesc(
        Long userId, Limit limit);

    @Modifying
    @Query("DELETE FROM EpisodeRating r WHERE r.userId = :userId")
    void deleteAllByUserId(Long userId);
}

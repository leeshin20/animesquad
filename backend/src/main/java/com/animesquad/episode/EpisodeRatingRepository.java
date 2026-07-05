package com.animesquad.episode;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;

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
}

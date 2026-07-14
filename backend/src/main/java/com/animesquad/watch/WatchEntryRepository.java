package com.animesquad.watch;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface WatchEntryRepository extends JpaRepository<WatchEntry, Long> {
    List<WatchEntry> findAllByUserIdOrderByUpdatedAtDesc(Long userId);
    Optional<WatchEntry> findByUserIdAndAnimeId(Long userId, Long animeId);
    List<WatchEntry> findAllByUserIdAndAnimeIdIn(Long userId, Collection<Long> animeIds);
    List<WatchEntry> findAllByUserIdInOrderByUpdatedAtDesc(Collection<Long> userIds, Limit limit);
    List<WatchEntry> findAllByUserIdInAndAnimeIdInOrderByUpdatedAtDesc(
        Collection<Long> userIds, Collection<Long> animeIds);
    List<WatchEntry> findAllByAnimeIdOrderByUpdatedAtDesc(Long animeId);
    boolean existsByAnimeId(Long animeId);

    @Modifying
    @Query("DELETE FROM WatchEntry w WHERE w.userId = :userId")
    void deleteAllByUserId(Long userId);
}

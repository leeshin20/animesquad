package com.animesquad.watch;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface WatchEntryRepository extends JpaRepository<WatchEntry, Long> {
    List<WatchEntry> findAllByUserIdOrderByUpdatedAtDesc(Long userId);
    Optional<WatchEntry> findByUserIdAndAnimeId(Long userId, Long animeId);
    List<WatchEntry> findAllByUserIdInOrderByUpdatedAtDesc(Collection<Long> userIds, Limit limit);
}

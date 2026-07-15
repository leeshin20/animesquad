package com.animesquad.activity;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface ActivityRepository extends JpaRepository<Activity, Long> {

    List<Activity> findBySquadIdAndIdLessThanOrderByIdDesc(Long squadId, Long cursor, Limit limit);

    List<Activity> findBySquadIdOrderByIdDesc(Long squadId, Limit limit);

    List<Activity> findByActorIdAndTypeOrderByCreatedAtDesc(
        Long actorId, ActivityType type, Limit limit);

    List<Activity> findAllByActorIdAndAnimeIdAndType(Long actorId, Long animeId, ActivityType type);

    @Modifying
    @Query("DELETE FROM Activity a WHERE a.actorId = :actorId AND a.animeId = :animeId")
    void deleteAllByActorIdAndAnimeId(Long actorId, Long animeId);

    @Modifying
    @Query("DELETE FROM Activity a WHERE a.actorId = :actorId")
    void deleteAllByActorId(Long actorId);

    boolean existsByAnimeId(Long animeId);
}

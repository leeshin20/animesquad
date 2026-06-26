package com.animesquad.activity;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ActivityRepository extends JpaRepository<Activity, Long> {

    List<Activity> findBySquadIdAndIdLessThanOrderByIdDesc(Long squadId, Long cursor, Limit limit);

    List<Activity> findBySquadIdOrderByIdDesc(Long squadId, Limit limit);

    List<Activity> findAllByActorIdAndAnimeIdAndType(Long actorId, Long animeId, ActivityType type);
}

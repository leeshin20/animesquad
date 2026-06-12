package com.animesquad.anime;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface AnimeRepository extends JpaRepository<Anime, Long> {
    Optional<Anime> findByAnilistId(Integer anilistId);
}

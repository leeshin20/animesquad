package com.animesquad.squad;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface SquadRepository extends JpaRepository<Squad, Long> {
    Optional<Squad> findByInviteCode(String inviteCode);
    boolean existsByInviteCode(String inviteCode);
    boolean existsByOwnerId(Long ownerId);
}

package com.animesquad.squad;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface MembershipRepository extends JpaRepository<Membership, Long> {
    List<Membership> findAllByUserId(Long userId);
    Optional<Membership> findByUserIdAndSquadId(Long userId, Long squadId);
    boolean existsByUserIdAndSquadId(Long userId, Long squadId);
    List<Membership> findAllBySquadId(Long squadId);
    long countBySquadId(Long squadId);
}

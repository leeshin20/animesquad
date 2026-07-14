package com.animesquad.squad;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;

public interface MembershipRepository extends JpaRepository<Membership, Long> {
    interface SquadMemberCount {
        Long getSquadId();
        long getMemberCount();
    }

    List<Membership> findAllByUserId(Long userId);
    Optional<Membership> findByUserIdAndSquadId(Long userId, Long squadId);
    boolean existsByUserIdAndSquadId(Long userId, Long squadId);
    List<Membership> findAllBySquadId(Long squadId);
    long countBySquadId(Long squadId);

    @Query("""
        SELECT m.squadId AS squadId, COUNT(m) AS memberCount
        FROM Membership m
        WHERE m.squadId IN :squadIds
        GROUP BY m.squadId
        """)
    List<SquadMemberCount> countBySquadIdIn(@Param("squadIds") List<Long> squadIds);

    @Modifying
    @Query("DELETE FROM Membership m WHERE m.userId = :userId")
    void deleteAllByUserId(Long userId);
}

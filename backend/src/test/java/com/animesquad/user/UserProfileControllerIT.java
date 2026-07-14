package com.animesquad.user;

import com.animesquad.anime.AniListClient;
import com.animesquad.anime.AniListMedia;
import com.animesquad.anime.Anime;
import com.animesquad.anime.AnimeService;
import com.animesquad.auth.JwtAuthenticationFilter;
import com.animesquad.auth.JwtService;
import com.animesquad.squad.Membership;
import com.animesquad.squad.MembershipRepository;
import com.animesquad.squad.MembershipRole;
import com.animesquad.squad.Squad;
import com.animesquad.squad.SquadRepository;
import com.animesquad.support.AbstractIntegrationTest;
import com.animesquad.watch.WatchService;
import com.animesquad.watch.WatchStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.*;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class UserProfileControllerIT extends AbstractIntegrationTest {

    @Autowired UserService userService;
    @Autowired AnimeService animeService;
    @Autowired WatchService watchService;
    @Autowired JwtService jwtService;
    @Autowired TestRestTemplate rest;
    @Autowired SquadRepository squadRepository;
    @Autowired MembershipRepository membershipRepository;
    @LocalServerPort int port;

    @MockBean AniListClient aniList;

    private HttpHeaders cookieFor(Long userId) {
        HttpHeaders h = new HttpHeaders();
        h.add(HttpHeaders.COOKIE,
            JwtAuthenticationFilter.COOKIE_NAME + "=" + jwtService.issue(userId));
        h.setContentType(MediaType.APPLICATION_JSON);
        return h;
    }

    private String url(String path) { return "http://localhost:" + port + path; }

    @Test
    void get_returns404_whenUserNotFound() {
        User viewer = userService.upsertFromGoogle("g-up1", "up1@x.y", "Viewer1", null);

        ResponseEntity<String> res = rest.exchange(
            url("/api/users/999999"), HttpMethod.GET,
            new HttpEntity<>(cookieFor(viewer.getId())), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void get_returns401_whenUnauthenticated() {
        User target = userService.upsertFromGoogle("g-up2", "up2@x.y", "Target2", null);

        ResponseEntity<String> res = rest.getForEntity(url("/api/users/" + target.getId()), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void get_isAccessible_whenSelf() {
        User u = userService.upsertFromGoogle("g-up3", "up3@x.y", "Self3", null);
        userService.updateProfileVisibility(u.getId(), ProfileVisibility.PRIVATE);

        ResponseEntity<String> res = rest.exchange(
            url("/api/users/" + u.getId()), HttpMethod.GET,
            new HttpEntity<>(cookieFor(u.getId())), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).contains("\"accessible\":true");
    }

    @Test
    void get_isAccessible_whenTargetIsPublic() {
        User viewer = userService.upsertFromGoogle("g-up4a", "up4a@x.y", "Viewer4", null);
        User target = userService.upsertFromGoogle("g-up4b", "up4b@x.y", "Target4", null);
        userService.updateProfileVisibility(target.getId(), ProfileVisibility.PUBLIC);

        ResponseEntity<String> res = rest.exchange(
            url("/api/users/" + target.getId()), HttpMethod.GET,
            new HttpEntity<>(cookieFor(viewer.getId())), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).contains("\"accessible\":true");
    }

    @Test
    void get_isNotAccessible_whenTargetIsPrivate() {
        User viewer = userService.upsertFromGoogle("g-up5a", "up5a@x.y", "Viewer5", null);
        User target = userService.upsertFromGoogle("g-up5b", "up5b@x.y", "Target5", null);
        userService.updateProfileVisibility(target.getId(), ProfileVisibility.PRIVATE);

        ResponseEntity<String> res = rest.exchange(
            url("/api/users/" + target.getId()), HttpMethod.GET,
            new HttpEntity<>(cookieFor(viewer.getId())), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).contains("\"id\":" + target.getId());
        assertThat(res.getBody()).contains("\"displayName\":\"Target5\"");
        assertThat(res.getBody()).contains("\"accessible\":false");
        assertThat(res.getBody()).contains("\"recentWatched\":null");
        assertThat(res.getBody()).contains("\"recentEpisodeReviews\":null");
        assertThat(res.getBody()).contains("\"squads\":null");
    }

    @Test
    void get_isAccessible_whenSquadOnlyAndSharesSquad() {
        User viewer = userService.upsertFromGoogle("g-up6a", "up6a@x.y", "Viewer6", null);
        User target = userService.upsertFromGoogle("g-up6b", "up6b@x.y", "Target6", null);
        userService.updateProfileVisibility(target.getId(), ProfileVisibility.SQUAD_ONLY);

        Squad squad = squadRepository.save(new Squad("공유스쿼드", viewer.getId(), "SHARE0001"));
        membershipRepository.save(new Membership(viewer.getId(), squad.getId(), MembershipRole.OWNER));
        membershipRepository.save(new Membership(target.getId(), squad.getId(), MembershipRole.MEMBER));

        ResponseEntity<String> res = rest.exchange(
            url("/api/users/" + target.getId()), HttpMethod.GET,
            new HttpEntity<>(cookieFor(viewer.getId())), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).contains("\"accessible\":true");
    }

    @Test
    void get_isNotAccessible_whenSquadOnlyAndNoSharedSquad() {
        User viewer = userService.upsertFromGoogle("g-up7a", "up7a@x.y", "Viewer7", null);
        User target = userService.upsertFromGoogle("g-up7b", "up7b@x.y", "Target7", null);
        userService.updateProfileVisibility(target.getId(), ProfileVisibility.SQUAD_ONLY);

        ResponseEntity<String> res = rest.exchange(
            url("/api/users/" + target.getId()), HttpMethod.GET,
            new HttpEntity<>(cookieFor(viewer.getId())), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).contains("\"accessible\":false");
        assertThat(res.getBody()).contains("\"recentWatched\":null");
        assertThat(res.getBody()).contains("\"recentEpisodeReviews\":null");
        assertThat(res.getBody()).contains("\"squads\":null");
    }

    @Test
    void get_includesRecentWatchedAndSquads_whenAccessible() {
        User viewer = userService.upsertFromGoogle("g-up8a", "up8a@x.y", "Viewer8", null);
        User target = userService.upsertFromGoogle("g-up8b", "up8b@x.y", "Target8", null);
        userService.updateProfileVisibility(target.getId(), ProfileVisibility.PUBLIC);

        Anime a = animeService.upsertFromAniList(new AniListMedia(
            8001, "R", "N", "E", "img", 12, "FINISHED", "TV", 2024, null, null));
        watchService.addToList(target.getId(), 8001, WatchStatus.COMPLETED);

        Squad squad = squadRepository.save(new Squad("타겟스쿼드", target.getId(), "TARGET001"));
        membershipRepository.save(new Membership(target.getId(), squad.getId(), MembershipRole.OWNER));

        ResponseEntity<String> res = rest.exchange(
            url("/api/users/" + target.getId()), HttpMethod.GET,
            new HttpEntity<>(cookieFor(viewer.getId())), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).contains("\"accessible\":true");
        assertThat(res.getBody()).contains("\"name\":\"타겟스쿼드\"");
        assertThat(res.getBody()).contains("\"memberCount\":1");
        assertThat(res.getBody()).doesNotContain("TARGET001");
        assertThat(res.getBody()).doesNotContain("inviteCode");
    }
}

package com.animesquad.anime;

import com.animesquad.auth.JwtAuthenticationFilter;
import com.animesquad.auth.JwtService;
import com.animesquad.squad.Squad;
import com.animesquad.squad.SquadService;
import com.animesquad.support.AbstractIntegrationTest;
import com.animesquad.user.User;
import com.animesquad.user.UserService;
import com.animesquad.watch.WatchEntry;
import com.animesquad.watch.WatchService;
import com.animesquad.watch.WatchStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.*;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AnimeSquadWatchControllerIT extends AbstractIntegrationTest {

    @Autowired UserService userService;
    @Autowired SquadService squadService;
    @Autowired WatchService watchService;
    @Autowired AnimeService animeService;
    @Autowired JwtService jwtService;
    @Autowired TestRestTemplate rest;
    @LocalServerPort int port;

    private HttpHeaders cookieFor(Long userId) {
        HttpHeaders h = new HttpHeaders();
        h.add(HttpHeaders.COOKIE, JwtAuthenticationFilter.COOKIE_NAME + "=" + jwtService.issue(userId));
        h.setContentType(MediaType.APPLICATION_JSON);
        return h;
    }
    private String url(String p) { return "http://localhost:" + port + p; }
    private AniListMedia media(int id) {
        return new AniListMedia(id, "Romaji" + id, "Native", "Eng", "img", 12, "FINISHED", "TV", 2024);
    }

    @Test
    void groupsCoMembersBySquad_excludesSelf_andNonCoMembers() {
        User me = userService.upsertFromGoogle("g-sw-me", "me@x.y", "Me", null);
        User mate = userService.upsertFromGoogle("g-sw-mate", "mate@x.y", "Mate", null);
        User stranger = userService.upsertFromGoogle("g-sw-str", "str@x.y", "Str", null);

        Squad squad = squadService.createSquad(me.getId(), "Crew");
        squadService.joinByInviteCode(mate.getId(), squad.getInviteCode());
        // stranger does NOT join

        animeService.upsertFromAniList(media(301));
        WatchEntry mineEntry = watchService.addToList(me.getId(), 301, WatchStatus.WATCHING);
        Long animeId = mineEntry.getAnimeId();
        watchService.addToList(mate.getId(), 301, WatchStatus.COMPLETED);
        watchService.updateEntry(mate.getId(), animeId, null, 12, 5, "최고");
        watchService.addToList(stranger.getId(), 301, WatchStatus.WATCHING);

        ResponseEntity<List<Map<String, Object>>> res = rest.exchange(
            url("/api/anime/" + animeId + "/squad-watch"), HttpMethod.GET,
            new HttpEntity<>(cookieFor(me.getId())),
            new ParameterizedTypeReference<List<Map<String, Object>>>() {});

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        List<Map<String, Object>> groups = res.getBody();
        assertThat(groups).hasSize(1);
        assertThat(groups.get(0).get("squadName")).isEqualTo("Crew");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> members = (List<Map<String, Object>>) groups.get(0).get("members");
        assertThat(members).hasSize(1); // mate only (me excluded, stranger excluded)
        @SuppressWarnings("unchecked")
        Map<String, Object> actor = (Map<String, Object>) members.get(0).get("actor");
        assertThat(actor.get("displayName")).isEqualTo("Mate");
        assertThat(members.get(0).get("score")).isEqualTo(5);
        assertThat(members.get(0).get("comment")).isEqualTo("최고");
    }

    @Test
    void omitsSquadsWithNoEvaluations() {
        User me = userService.upsertFromGoogle("g-sw2-me", "me2@x.y", "Me", null);
        User mate = userService.upsertFromGoogle("g-sw2-mate", "mate2@x.y", "Mate", null);
        Squad squad = squadService.createSquad(me.getId(), "Empty");
        squadService.joinByInviteCode(mate.getId(), squad.getInviteCode());

        animeService.upsertFromAniList(media(302));
        WatchEntry mineEntry = watchService.addToList(me.getId(), 302, WatchStatus.WATCHING);
        // mate has no entry for this anime → group empty → omitted

        ResponseEntity<List<Map<String, Object>>> res = rest.exchange(
            url("/api/anime/" + mineEntry.getAnimeId() + "/squad-watch"), HttpMethod.GET,
            new HttpEntity<>(cookieFor(me.getId())),
            new ParameterizedTypeReference<List<Map<String, Object>>>() {});

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).isEmpty();
    }
}

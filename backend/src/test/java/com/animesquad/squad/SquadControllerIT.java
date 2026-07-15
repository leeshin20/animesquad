package com.animesquad.squad;

import com.animesquad.auth.JwtAuthenticationFilter;
import com.animesquad.auth.JwtService;
import com.animesquad.support.AbstractIntegrationTest;
import com.animesquad.user.AvatarStorage;
import com.animesquad.user.User;
import com.animesquad.user.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.*;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verifyNoInteractions;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class SquadControllerIT extends AbstractIntegrationTest {

    @Autowired UserService userService;
    @Autowired JwtService jwtService;
    @Autowired TestRestTemplate rest;
    @MockBean AvatarStorage storage;
    @LocalServerPort int port;

    @BeforeEach
    void enablePatch() {
        // TestRestTemplate's default factory can't send PATCH bodies.
        rest.getRestTemplate().setRequestFactory(new JdkClientHttpRequestFactory());
    }

    private HttpHeaders cookieFor(Long userId) {
        HttpHeaders h = new HttpHeaders();
        h.add(HttpHeaders.COOKIE,
            JwtAuthenticationFilter.COOKIE_NAME + "=" + jwtService.issue(userId));
        h.setContentType(MediaType.APPLICATION_JSON);
        return h;
    }

    private String url(String path) {
        return "http://localhost:" + port + path;
    }

    @Test
    void create_returns201AndOwnerCanList() {
        User me = userService.upsertFromGoogle("g-cc1", "cc1@x.y", "CC1", null);

        ResponseEntity<Map> created = rest.exchange(
            url("/api/squad"), HttpMethod.POST,
            new HttpEntity<>(Map.of("name", "Friday Crew"), cookieFor(me.getId())),
            Map.class);

        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat((String) created.getBody().get("name")).isEqualTo("Friday Crew");
        assertThat((String) created.getBody().get("inviteCode")).hasSize(10);

        ResponseEntity<Map[]> list = rest.exchange(
            url("/api/squad"), HttpMethod.GET,
            new HttpEntity<>(cookieFor(me.getId())), Map[].class);

        assertThat(list.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(list.getBody()).hasSize(1);
        assertThat((String) list.getBody()[0].get("name")).isEqualTo("Friday Crew");
    }

    @Test
    void join_addsMembership_andDetailReturnsSquad() {
        User owner = userService.upsertFromGoogle("g-cc2-o", "o2@x.y", "O", null);
        User joiner = userService.upsertFromGoogle("g-cc2-j", "j2@x.y", "J", null);

        ResponseEntity<Map> created = rest.exchange(
            url("/api/squad"), HttpMethod.POST,
            new HttpEntity<>(Map.of("name", "S"), cookieFor(owner.getId())),
            Map.class);
        String code = (String) created.getBody().get("inviteCode");
        Integer squadId = (Integer) created.getBody().get("id");

        ResponseEntity<Map> joined = rest.exchange(
            url("/api/squad/join"), HttpMethod.POST,
            new HttpEntity<>(Map.of("inviteCode", code), cookieFor(joiner.getId())),
            Map.class);

        assertThat(joined.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat((Integer) joined.getBody().get("id")).isEqualTo(squadId);

        ResponseEntity<Map> detail = rest.exchange(
            url("/api/squad/" + squadId), HttpMethod.GET,
            new HttpEntity<>(cookieFor(joiner.getId())), Map.class);
        assertThat(detail.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void unauthenticated_create_returns401() {
        ResponseEntity<String> res = rest.exchange(
            url("/api/squad"), HttpMethod.POST,
            new HttpEntity<>("{\"name\":\"x\"}", jsonHeaders()), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void owner_setsAnnouncement_andDetailReturnsIt() {
        User owner = userService.upsertFromGoogle("g-an-o", "ano@x.y", "O", null);
        Integer squadId = createSquad(owner.getId());

        ResponseEntity<Map> patched = rest.exchange(
            url("/api/squad/" + squadId + "/announcement"), HttpMethod.PATCH,
            new HttpEntity<>(Map.of("announcement", "이번 주 정주행 모임!"), cookieFor(owner.getId())),
            Map.class);

        assertThat(patched.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat((String) patched.getBody().get("announcement")).isEqualTo("이번 주 정주행 모임!");

        ResponseEntity<Map> detail = rest.exchange(
            url("/api/squad/" + squadId), HttpMethod.GET,
            new HttpEntity<>(cookieFor(owner.getId())), Map.class);
        assertThat((String) detail.getBody().get("announcement")).isEqualTo("이번 주 정주행 모임!");
    }

    @Test
    void nonOwnerMember_cannotSetAnnouncement_returns403() {
        User owner = userService.upsertFromGoogle("g-an-o2", "ano2@x.y", "O", null);
        User member = userService.upsertFromGoogle("g-an-m", "anm@x.y", "M", null);
        Integer squadId = createSquad(owner.getId());
        String code = inviteCodeOf(squadId, owner.getId());
        rest.exchange(url("/api/squad/join"), HttpMethod.POST,
            new HttpEntity<>(Map.of("inviteCode", code), cookieFor(member.getId())), Map.class);

        ResponseEntity<String> res = rest.exchange(
            url("/api/squad/" + squadId + "/announcement"), HttpMethod.PATCH,
            new HttpEntity<>(Map.of("announcement", "몰래 수정"), cookieFor(member.getId())),
            String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void nonOwner_cannotStoreSquadAvatar() {
        User owner = userService.upsertFromGoogle("g-avatar-o", "avatar-o@x.y", "Owner", null);
        User member = userService.upsertFromGoogle("g-avatar-m", "avatar-m@x.y", "Member", null);
        Integer squadId = createSquad(owner.getId());
        String code = inviteCodeOf(squadId, owner.getId());
        rest.exchange(url("/api/squad/join"), HttpMethod.POST,
            new HttpEntity<>(Map.of("inviteCode", code), cookieFor(member.getId())), Map.class);

        HttpHeaders headers = cookieFor(member.getId());
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);
        ByteArrayResource image = new ByteArrayResource(new byte[] {1, 2, 3, 4}) {
            @Override public String getFilename() { return "avatar.png"; }
        };
        HttpHeaders partHeaders = new HttpHeaders();
        partHeaders.setContentType(MediaType.IMAGE_PNG);
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("file", new HttpEntity<>(image, partHeaders));

        ResponseEntity<String> res = rest.exchange(
            url("/api/squad/" + squadId + "/avatar"), HttpMethod.POST,
            new HttpEntity<>(body, headers), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        verifyNoInteractions(storage);
    }

    @Test
    void nonOwner_cannotStoreSquadBanner() {
        User owner = userService.upsertFromGoogle("g-banner-o", "banner-o@x.y", "Owner", null);
        User member = userService.upsertFromGoogle("g-banner-m", "banner-m@x.y", "Member", null);
        Integer squadId = createSquad(owner.getId());
        String code = inviteCodeOf(squadId, owner.getId());
        rest.exchange(url("/api/squad/join"), HttpMethod.POST,
            new HttpEntity<>(Map.of("inviteCode", code), cookieFor(member.getId())), Map.class);

        HttpHeaders headers = cookieFor(member.getId());
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);
        ByteArrayResource image = new ByteArrayResource(new byte[] {1, 2, 3, 4}) {
            @Override public String getFilename() { return "banner.png"; }
        };
        HttpHeaders partHeaders = new HttpHeaders();
        partHeaders.setContentType(MediaType.IMAGE_PNG);
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("file", new HttpEntity<>(image, partHeaders));

        ResponseEntity<String> res = rest.exchange(
            url("/api/squad/" + squadId + "/banner"), HttpMethod.POST,
            new HttpEntity<>(body, headers), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        verifyNoInteractions(storage);
    }

    @Test
    void blankAnnouncement_clearsIt() {
        User owner = userService.upsertFromGoogle("g-an-o3", "ano3@x.y", "O", null);
        Integer squadId = createSquad(owner.getId());
        rest.exchange(url("/api/squad/" + squadId + "/announcement"), HttpMethod.PATCH,
            new HttpEntity<>(Map.of("announcement", "처음 공지"), cookieFor(owner.getId())), Map.class);

        ResponseEntity<Map> cleared = rest.exchange(
            url("/api/squad/" + squadId + "/announcement"), HttpMethod.PATCH,
            new HttpEntity<>(Map.of("announcement", "  "), cookieFor(owner.getId())),
            Map.class);

        assertThat(cleared.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(cleared.getBody().get("announcement")).isNull();
    }

    @Test
    void members_returnsOwnerFirst() {
        User owner = userService.upsertFromGoogle("g-mem-o", "memo@x.y", "Owner", null);
        User member = userService.upsertFromGoogle("g-mem-m", "memm@x.y", "Member", null);
        Integer squadId = createSquad(owner.getId());
        String code = inviteCodeOf(squadId, owner.getId());
        rest.exchange(url("/api/squad/join"), HttpMethod.POST,
            new HttpEntity<>(Map.of("inviteCode", code), cookieFor(member.getId())), Map.class);

        ResponseEntity<Map[]> res = rest.exchange(
            url("/api/squad/" + squadId + "/members"), HttpMethod.GET,
            new HttpEntity<>(cookieFor(owner.getId())), Map[].class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).hasSize(2);
        assertThat((String) res.getBody()[0].get("role")).isEqualTo("OWNER");
        assertThat((String) res.getBody()[1].get("role")).isEqualTo("MEMBER");
    }

    @Test
    void members_nonMember_returns400() {
        User owner = userService.upsertFromGoogle("g-mem-o2", "memo2@x.y", "Owner2", null);
        User stranger = userService.upsertFromGoogle("g-mem-s", "mems@x.y", "Stranger", null);
        Integer squadId = createSquad(owner.getId());

        ResponseEntity<String> res = rest.exchange(
            url("/api/squad/" + squadId + "/members"), HttpMethod.GET,
            new HttpEntity<>(cookieFor(stranger.getId())), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void members_unauthenticated_returns401() {
        Integer squadId = createSquad(userService.upsertFromGoogle("g-mem-o3", "memo3@x.y", "Owner3", null).getId());

        ResponseEntity<String> res = rest.exchange(
            url("/api/squad/" + squadId + "/members"), HttpMethod.GET,
            new HttpEntity<>(jsonHeaders()), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void create_returns409_whenUserAlreadyHas3Squads() {
        User owner = userService.upsertFromGoogle("g-ctrl-limit", "ctrllimit@x.y", "CtrlLimit", null);
        createSquad(owner.getId());
        createSquad(owner.getId());
        createSquad(owner.getId());

        ResponseEntity<String> res = rest.exchange(
            url("/api/squad"), HttpMethod.POST,
            new HttpEntity<>(Map.of("name", "S4"), cookieFor(owner.getId())),
            String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    void join_returns409_whenUserAlreadyHas3Squads() {
        User joiner = userService.upsertFromGoogle("g-ctrl-limit-j", "ctrllimitj@x.y", "CtrlLimitJ", null);
        createSquad(joiner.getId());
        createSquad(joiner.getId());
        createSquad(joiner.getId());

        User owner4 = userService.upsertFromGoogle("g-ctrl-limit-o", "ctrllimito@x.y", "CtrlLimitO", null);
        Integer fourthId = createSquad(owner4.getId());
        String code = inviteCodeOf(fourthId, owner4.getId());

        ResponseEntity<String> res = rest.exchange(
            url("/api/squad/join"), HttpMethod.POST,
            new HttpEntity<>(Map.of("inviteCode", code), cookieFor(joiner.getId())),
            String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    }

    private Integer createSquad(Long ownerId) {
        ResponseEntity<Map> created = rest.exchange(
            url("/api/squad"), HttpMethod.POST,
            new HttpEntity<>(Map.of("name", "S"), cookieFor(ownerId)), Map.class);
        return (Integer) created.getBody().get("id");
    }

    private String inviteCodeOf(Integer squadId, Long memberId) {
        ResponseEntity<Map> detail = rest.exchange(
            url("/api/squad/" + squadId), HttpMethod.GET,
            new HttpEntity<>(cookieFor(memberId)), Map.class);
        return (String) detail.getBody().get("inviteCode");
    }

    private HttpHeaders jsonHeaders() {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        return h;
    }
}

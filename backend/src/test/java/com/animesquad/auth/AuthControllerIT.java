package com.animesquad.auth;

import com.animesquad.squad.Squad;
import com.animesquad.squad.SquadRepository;
import com.animesquad.support.AbstractIntegrationTest;
import com.animesquad.user.User;
import com.animesquad.user.UserRepository;
import com.animesquad.user.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.*;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AuthControllerIT extends AbstractIntegrationTest {

    @Autowired UserService userService;
    @Autowired JwtService jwtService;
    @Autowired TestRestTemplate rest;
    @LocalServerPort int port;
    @Autowired UserRepository userRepository;
    @Autowired SquadRepository squadRepository;

    @BeforeEach
    void usePatchCapableClient() {
        rest.getRestTemplate().setRequestFactory(new JdkClientHttpRequestFactory());
    }

    private String url(String path) { return "http://localhost:" + port + path; }

    private HttpHeaders cookieFor(Long userId) {
        HttpHeaders h = new HttpHeaders();
        h.add(HttpHeaders.COOKIE,
            JwtAuthenticationFilter.COOKIE_NAME + "=" + jwtService.issue(userId));
        return h;
    }

    @Test
    void me_returns401_whenNoCookie() {
        ResponseEntity<String> res = rest.getForEntity(url("/api/me"), String.class);
        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void me_returnsUser_whenCookiePresent() {
        User u = userService.upsertFromGoogle("g-1", "x@y.z", "X", "url");

        ResponseEntity<String> res = rest.exchange(
            url("/api/me"), HttpMethod.GET, new HttpEntity<>(cookieFor(u.getId())), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).contains("\"email\":\"x@y.z\"");
        assertThat(res.getBody()).contains("\"displayName\":\"X\"");
    }

    @Test
    void updateProfile_changesDisplayName() {
        User u = userService.upsertFromGoogle("g-2", "a@b.c", "Old", "url");

        HttpHeaders h = cookieFor(u.getId());
        h.setContentType(MediaType.APPLICATION_JSON);
        ResponseEntity<String> res = rest.exchange(
            url("/api/me"), HttpMethod.PATCH,
            new HttpEntity<>(Map.of("displayName", "New Name"), h), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).contains("\"displayName\":\"New Name\"");
        assertThat(userService.getById(u.getId()).getDisplayName()).isEqualTo("New Name");
    }

    @Test
    void updateProfile_rejectsBlankName() {
        User u = userService.upsertFromGoogle("g-3", "a@b.c", "Old", "url");

        HttpHeaders h = cookieFor(u.getId());
        h.setContentType(MediaType.APPLICATION_JSON);
        ResponseEntity<String> res = rest.exchange(
            url("/api/me"), HttpMethod.PATCH,
            new HttpEntity<>(Map.of("displayName", "   "), h), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void uploadAvatar_storesFileAndUpdatesUrl() {
        User u = userService.upsertFromGoogle("g-4", "a@b.c", "Pat", "old-url");

        HttpHeaders h = cookieFor(u.getId());
        h.setContentType(MediaType.MULTIPART_FORM_DATA);
        ByteArrayResource png = new ByteArrayResource(new byte[] {1, 2, 3, 4}) {
            @Override public String getFilename() { return "a.png"; }
        };
        HttpHeaders partHeaders = new HttpHeaders();
        partHeaders.setContentType(MediaType.IMAGE_PNG);
        HttpEntity<ByteArrayResource> part = new HttpEntity<>(png, partHeaders);
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("file", part);

        ResponseEntity<String> res = rest.exchange(
            url("/api/me/avatar"), HttpMethod.POST, new HttpEntity<>(body, h), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).contains("/uploads/");
        assertThat(userService.getById(u.getId()).getAvatarUrl()).contains("/uploads/");
    }

    @Test
    void uploadAvatar_rejectsNonImage() {
        User u = userService.upsertFromGoogle("g-5", "a@b.c", "Pat", "old-url");

        HttpHeaders h = cookieFor(u.getId());
        h.setContentType(MediaType.MULTIPART_FORM_DATA);
        ByteArrayResource txt = new ByteArrayResource("hello".getBytes()) {
            @Override public String getFilename() { return "a.txt"; }
        };
        HttpHeaders partHeaders = new HttpHeaders();
        partHeaders.setContentType(MediaType.TEXT_PLAIN);
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("file", new HttpEntity<>(txt, partHeaders));

        ResponseEntity<String> res = rest.exchange(
            url("/api/me/avatar"), HttpMethod.POST, new HttpEntity<>(body, h), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void logout_expiresCookie() {
        User u = userService.upsertFromGoogle("g-6", "a@b.c", "Pat", "url");

        ResponseEntity<Void> res = rest.exchange(
            url("/api/me/logout"), HttpMethod.POST, new HttpEntity<>(cookieFor(u.getId())), Void.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        String setCookie = res.getHeaders().getFirst(HttpHeaders.SET_COOKIE);
        assertThat(setCookie).contains(JwtAuthenticationFilter.COOKIE_NAME + "=");
        assertThat(setCookie).contains("Max-Age=0");
    }

    @Test
    void deleteAccount_returns401_whenNotLoggedIn() {
        ResponseEntity<Void> res = rest.exchange(
            url("/api/me"), HttpMethod.DELETE, HttpEntity.EMPTY, Void.class);
        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void deleteAccount_deletesUserAndExpiresCookie() {
        User u = userService.upsertFromGoogle("g-del-1", "del1@test.com", "Del", "url");
        Long userId = u.getId();

        ResponseEntity<Void> res = rest.exchange(
            url("/api/me"), HttpMethod.DELETE, new HttpEntity<>(cookieFor(userId)), Void.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        String setCookie = res.getHeaders().getFirst(HttpHeaders.SET_COOKIE);
        assertThat(setCookie).contains(JwtAuthenticationFilter.COOKIE_NAME + "=");
        assertThat(setCookie).contains("Max-Age=0");
        assertThat(userRepository.existsById(userId)).isFalse();
    }

    @Test
    void deleteAccount_returns409_whenUserOwnsSquad() {
        User u = userService.upsertFromGoogle("g-del-2", "del2@test.com", "Owner", "url");
        Squad squad = new Squad("테스트스쿼드", u.getId(), "TESTCODE1");
        squadRepository.save(squad);

        ResponseEntity<String> res = rest.exchange(
            url("/api/me"), HttpMethod.DELETE, new HttpEntity<>(cookieFor(u.getId())), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    }
}

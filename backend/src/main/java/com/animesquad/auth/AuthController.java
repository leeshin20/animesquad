package com.animesquad.auth;

import com.animesquad.admin.AdminProperties;
import com.animesquad.user.AvatarStorage;
import com.animesquad.user.ProfileVisibility;
import com.animesquad.user.User;
import com.animesquad.user.UserService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
public class AuthController {

    private final UserService userService;
    private final AvatarStorage avatarStorage;
    private final AdminProperties adminProperties;

    @Value("${app.cookie.secure}")
    private boolean cookieSecure;

    @Value("${app.cookie.same-site}")
    private String cookieSameSite;

    @Value("${app.cookie.domain:}")
    private String cookieDomain;

    public AuthController(UserService userService, AvatarStorage avatarStorage, AdminProperties adminProperties) {
        this.userService = userService;
        this.avatarStorage = avatarStorage;
        this.adminProperties = adminProperties;
    }

    public record MeResponse(Long id, String email, String displayName, String avatarUrl, boolean isAdmin, boolean onboardingComplete, ProfileVisibility profileVisibility) {}

    public record UpdateProfileRequest(String displayName, ProfileVisibility profileVisibility) {}

    @GetMapping("/me")
    public ResponseEntity<MeResponse> me(@AuthenticationPrincipal CurrentUser current) {
        return ResponseEntity.ok(toResponse(userService.getById(current.userId())));
    }

    @PatchMapping("/me")
    public ResponseEntity<MeResponse> updateProfile(
        @AuthenticationPrincipal CurrentUser current,
        @RequestBody UpdateProfileRequest body
    ) {
        String name = body.displayName() == null ? "" : body.displayName().trim();
        if (name.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "닉네임을 입력해주세요");
        }
        if (name.length() > 50) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "닉네임은 50자 이하여야 해요");
        }
        User updated = userService.updateDisplayName(current.userId(), name);
        if (body.profileVisibility() != null) {
            updated = userService.updateProfileVisibility(current.userId(), body.profileVisibility());
        }
        return ResponseEntity.ok(toResponse(updated));
    }

    @PostMapping("/me/avatar")
    public ResponseEntity<MeResponse> updateAvatar(
        @AuthenticationPrincipal CurrentUser current,
        @RequestParam("file") MultipartFile file
    ) {
        String url = avatarStorage.store(file);
        return ResponseEntity.ok(toResponse(userService.updateAvatarUrl(current.userId(), url)));
    }

    @PostMapping("/me/logout")
    public ResponseEntity<Void> logout() {
        return ResponseEntity.noContent()
            .header(HttpHeaders.SET_COOKIE, buildClearCookie())
            .build();
    }

    @PostMapping("/me/agree-terms")
    public ResponseEntity<Void> agreeTerms(@AuthenticationPrincipal CurrentUser current) {
        userService.agreeTerms(current.userId());
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/me")
    public ResponseEntity<Void> deleteAccount(@AuthenticationPrincipal CurrentUser current) {
        userService.deleteAccount(current.userId());
        return ResponseEntity.noContent()
            .header(HttpHeaders.SET_COOKIE, buildClearCookie())
            .build();
    }

    private String buildClearCookie() {
        StringBuilder sb = new StringBuilder();
        sb.append(JwtAuthenticationFilter.COOKIE_NAME).append("=");
        sb.append("; Path=/");
        sb.append("; Max-Age=0");
        sb.append("; HttpOnly");
        if (cookieSecure) sb.append("; Secure");
        sb.append("; SameSite=").append(cookieSameSite);
        if (cookieDomain != null && !cookieDomain.isBlank()) {
            sb.append("; Domain=").append(cookieDomain);
        }
        return sb.toString();
    }

    private MeResponse toResponse(User u) {
        boolean isAdmin = adminProperties.isAdminEmail(u.getEmail());
        boolean onboardingComplete = u.getTermsAgreedAt() != null;
        return new MeResponse(u.getId(), u.getEmail(), u.getDisplayName(), u.getAvatarUrl(), isAdmin, onboardingComplete, u.getProfileVisibility());
    }
}

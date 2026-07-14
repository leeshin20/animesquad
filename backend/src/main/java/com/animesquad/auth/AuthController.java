package com.animesquad.auth;

import com.animesquad.admin.AdminProperties;
import com.animesquad.user.AvatarStorage;
import com.animesquad.user.ProfileVisibility;
import com.animesquad.user.User;
import com.animesquad.user.UserService;
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
    private final AuthCookieFactory authCookieFactory;

    public AuthController(
        UserService userService,
        AvatarStorage avatarStorage,
        AdminProperties adminProperties,
        AuthCookieFactory authCookieFactory
    ) {
        this.userService = userService;
        this.avatarStorage = avatarStorage;
        this.adminProperties = adminProperties;
        this.authCookieFactory = authCookieFactory;
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
        if (body.displayName() == null && body.profileVisibility() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "변경할 프로필 정보를 입력해주세요");
        }

        User updated = userService.getById(current.userId());
        if (body.displayName() != null) {
            String name = body.displayName().trim();
            if (name.isEmpty()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "닉네임을 입력해주세요");
            }
            if (name.length() > 50) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "닉네임은 50자 이하여야 해요");
            }
            updated = userService.updateDisplayName(current.userId(), name);
        }
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
            .header(HttpHeaders.SET_COOKIE, authCookieFactory.clearSession())
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
            .header(HttpHeaders.SET_COOKIE, authCookieFactory.clearSession())
            .build();
    }

    private MeResponse toResponse(User u) {
        boolean isAdmin = adminProperties.isAdminEmail(u.getEmail());
        boolean onboardingComplete = u.getTermsAgreedAt() != null;
        return new MeResponse(u.getId(), u.getEmail(), u.getDisplayName(), u.getAvatarUrl(), isAdmin, onboardingComplete, u.getProfileVisibility());
    }
}

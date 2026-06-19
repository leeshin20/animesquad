package com.animesquad.auth;

import com.animesquad.admin.AdminProperties;
import com.animesquad.user.User;
import com.animesquad.user.UserService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class AuthController {

    private final UserService userService;
    private final AdminProperties adminProperties;

    public AuthController(UserService userService, AdminProperties adminProperties) {
        this.userService = userService;
        this.adminProperties = adminProperties;
    }

    public record MeResponse(Long id, String email, String displayName, String avatarUrl, boolean isAdmin) {}

    @GetMapping("/me")
    public ResponseEntity<MeResponse> me(@AuthenticationPrincipal CurrentUser current) {
        User u = userService.getById(current.userId());
        boolean isAdmin = adminProperties.isAdminEmail(u.getEmail());
        return ResponseEntity.ok(new MeResponse(u.getId(), u.getEmail(), u.getDisplayName(), u.getAvatarUrl(), isAdmin));
    }
}

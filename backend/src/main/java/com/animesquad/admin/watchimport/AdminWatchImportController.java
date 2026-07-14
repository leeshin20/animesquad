package com.animesquad.admin.watchimport;

import com.animesquad.admin.AdminProperties;
import com.animesquad.auth.CurrentUser;
import com.animesquad.user.User;
import com.animesquad.user.UserService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import static com.animesquad.admin.watchimport.AdminWatchImportDtos.CommitRequest;
import static com.animesquad.admin.watchimport.AdminWatchImportDtos.CommitResponse;
import static com.animesquad.admin.watchimport.AdminWatchImportDtos.PreviewRequest;
import static com.animesquad.admin.watchimport.AdminWatchImportDtos.PreviewResponse;

@RestController
@RequestMapping("/api/admin/watch-import")
public class AdminWatchImportController {
    private final AdminWatchImportService imports;
    private final UserService users;
    private final AdminProperties adminProperties;

    public AdminWatchImportController(AdminWatchImportService imports, UserService users,
                                      AdminProperties adminProperties) {
        this.imports = imports;
        this.users = users;
        this.adminProperties = adminProperties;
    }

    private void requireAdmin(CurrentUser current) {
        User user = users.getById(current.userId());
        if (!adminProperties.isAdminEmail(user.getEmail())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "admin only");
        }
    }

    @PostMapping("/preview")
    public PreviewResponse preview(@AuthenticationPrincipal CurrentUser current,
                                   @RequestBody PreviewRequest body) {
        requireAdmin(current);
        return imports.preview(body.email(), body.text());
    }

    @PostMapping("/commit")
    public CommitResponse commit(@AuthenticationPrincipal CurrentUser current,
                                 @RequestBody CommitRequest body) {
        requireAdmin(current);
        return imports.commit(body.targetUserId(), body.items());
    }
}

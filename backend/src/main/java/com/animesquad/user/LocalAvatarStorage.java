package com.animesquad.user;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

/** Stores avatars on the local filesystem, served via {@code /uploads/**}. Used in local/test. */
@Service
@Profile("!prod")
public class LocalAvatarStorage implements AvatarStorage {

    private final Path dir;
    private final String publicBase;

    public LocalAvatarStorage(
        @Value("${app.upload.dir}") String dir,
        @Value("${app.upload.public-base}") String publicBase
    ) {
        this.dir = Path.of(dir).toAbsolutePath();
        this.publicBase = publicBase.replaceAll("/+$", "");
    }

    @Override
    public String store(MultipartFile file) {
        validate(file);

        String filename = UUID.randomUUID() + extensionFor(file.getContentType());
        try {
            Files.createDirectories(dir);
            Files.copy(file.getInputStream(), dir.resolve(filename));
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "업로드에 실패했어요", e);
        }
        return publicBase + "/uploads/" + filename;
    }
}

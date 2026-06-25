package com.animesquad.user;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import java.io.IOException;
import java.util.UUID;

/** Stores avatars in Cloudflare R2 (S3-compatible) and returns their public CDN URL. */
@Service
@Profile("prod")
public class R2AvatarStorage implements AvatarStorage {

    private final S3Client s3;
    private final String bucket;
    private final String publicBase;

    public R2AvatarStorage(
        S3Client r2Client,
        @Value("${app.upload.r2.bucket}") String bucket,
        @Value("${app.upload.public-base}") String publicBase
    ) {
        this.s3 = r2Client;
        this.bucket = bucket;
        this.publicBase = publicBase.replaceAll("/+$", "");
    }

    @Override
    public String store(MultipartFile file) {
        validate(file);

        String key = UUID.randomUUID() + extensionFor(file.getContentType());
        try {
            s3.putObject(
                PutObjectRequest.builder()
                    .bucket(bucket)
                    .key(key)
                    .contentType(file.getContentType())
                    .build(),
                RequestBody.fromInputStream(file.getInputStream(), file.getSize())
            );
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "업로드에 실패했어요", e);
        }
        return publicBase + "/" + key;
    }
}

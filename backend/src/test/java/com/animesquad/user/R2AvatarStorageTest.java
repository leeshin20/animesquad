package com.animesquad.user;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class R2AvatarStorageTest {

    private static final String BASE = "https://cdn.animesquad.me";

    @Test
    void store_putsObjectIntoBucketAndReturnsPublicUrl() {
        S3Client s3 = mock(S3Client.class);
        R2AvatarStorage storage = new R2AvatarStorage(s3, "animesquad-uploads", BASE + "/");
        MockMultipartFile file = new MockMultipartFile("file", "a.png", "image/png", new byte[]{1, 2, 3});

        String url = storage.store(file);

        ArgumentCaptor<PutObjectRequest> req = ArgumentCaptor.forClass(PutObjectRequest.class);
        verify(s3).putObject(req.capture(), any(RequestBody.class));
        assertThat(req.getValue().bucket()).isEqualTo("animesquad-uploads");
        assertThat(req.getValue().contentType()).isEqualTo("image/png");
        assertThat(url).startsWith(BASE + "/").endsWith(".png");
        assertThat(req.getValue().key()).isEqualTo(url.substring((BASE + "/").length()));
    }

    @Test
    void store_rejectsNonImage() {
        R2AvatarStorage storage = new R2AvatarStorage(mock(S3Client.class), "bucket", BASE);
        MockMultipartFile file = new MockMultipartFile("file", "a.txt", "text/plain", new byte[]{1});

        assertThatThrownBy(() -> storage.store(file)).isInstanceOf(ResponseStatusException.class);
    }
}

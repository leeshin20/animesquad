package com.animesquad.admin.watchimport;

import com.animesquad.anime.Anime;
import com.animesquad.anime.AnimeRepository;
import com.animesquad.user.User;
import com.animesquad.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.lang.reflect.Field;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import static com.animesquad.admin.watchimport.AdminWatchImportDtos.LineStatus;
import static com.animesquad.admin.watchimport.AdminWatchImportDtos.PreviewLine;
import static com.animesquad.admin.watchimport.AdminWatchImportDtos.PreviewResponse;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminWatchImportServiceTest {

    private final UserRepository users = mock(UserRepository.class);
    private final AnimeRepository animes = mock(AnimeRepository.class);
    private final AdminWatchImportService service = new AdminWatchImportService(users, animes);
    private final User target = user(10L, "target@x.y", "Target");
    private final Anime worldIsDancing = anime(20L, "월드 이즈 댄싱");

    @Test
    void preview_parsesTitleAndTrailingEpisode() {
        when(users.findByEmailIgnoreCase("target@x.y")).thenReturn(Optional.of(target));
        when(animes.findAll()).thenReturn(List.of(worldIsDancing));

        PreviewResponse result = service.preview(" target@x.y ", "월드 이즈 댄싱3화\n");

        assertThat(result.targetUser().id()).isEqualTo(target.getId());
        assertThat(result.lines()).singleElement().satisfies(line -> {
            assertThat(line.lineNumber()).isEqualTo(1);
            assertThat(line.title()).isEqualTo("월드 이즈 댄싱");
            assertThat(line.progress()).isEqualTo(3);
            assertThat(line.status()).isEqualTo(LineStatus.MATCHED);
            assertThat(line.anime().id()).isEqualTo(worldIsDancing.getId());
            assertThat(line.message()).isNull();
        });
    }

    @Test
    void preview_marksInvalidAndUnmatchedWithoutFailingWholePreview() {
        when(users.findByEmailIgnoreCase("target@x.y")).thenReturn(Optional.of(target));
        when(animes.findAll()).thenReturn(List.of());

        PreviewResponse result = service.preview("target@x.y", "형식 오류\n없는 작품2화\n0화");

        assertThat(result.lines()).extracting(PreviewLine::status)
            .containsExactly(LineStatus.INVALID, LineStatus.UNMATCHED, LineStatus.INVALID);
        assertThat(result.lines()).extracting(PreviewLine::lineNumber).containsExactly(1, 2, 3);
        assertThat(result.lines().get(0).message()).isNotBlank();
        assertThat(result.lines().get(1).title()).isEqualTo("없는 작품");
        assertThat(result.lines().get(1).progress()).isEqualTo(2);
        assertThat(result.lines().get(1).anime()).isNull();
        assertThat(result.lines().get(1).message()).isNotBlank();
        assertThat(result.lines().get(2).message()).isNotBlank();
    }

    @Test
    void preview_rejectsMoreThan200PhysicalLines() {
        String text = IntStream.range(0, 201)
            .mapToObj(i -> "작품" + i + "1화")
            .collect(Collectors.joining("\n"));

        assertThatThrownBy(() -> service.preview("target@x.y", text))
            .isInstanceOf(ResponseStatusException.class)
            .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test
    void preview_matchesPunctuationAndSpacingDifferences() {
        Anime anime = anime(21L, "아주르 레인 미속전진! 2!!");
        stubTargetAndAnime(List.of(anime));

        PreviewLine line = service.preview("target@x.y", "아주르레인 미속전진 2 2화").lines().get(0);

        assertThat(line.lineNumber()).isEqualTo(1);
        assertThat(line.title()).isEqualTo("아주르레인 미속전진 2");
        assertThat(line.progress()).isEqualTo(2);
        assertThat(line.status()).isEqualTo(LineStatus.MATCHED);
        assertThat(line.anime().id()).isEqualTo(21L);
        assertThat(line.message()).isNull();
    }

    @Test
    void preview_treatsTwoExactCandidatesAsUnmatched() {
        Anime first = anime(22L, "같은 작품");
        Anime second = anime(23L, "같은작품");
        stubTargetAndAnime(List.of(first, second));

        PreviewLine line = service.preview("target@x.y", "같은 작품4화").lines().get(0);

        assertThat(line.lineNumber()).isEqualTo(1);
        assertThat(line.progress()).isEqualTo(4);
        assertThat(line.status()).isEqualTo(LineStatus.UNMATCHED);
        assertThat(line.anime()).isNull();
        assertThat(line.message()).isNotBlank();
    }

    @Test
    void preview_keepsLastDuplicateAsMatched() {
        stubTargetAndAnime(List.of(worldIsDancing));

        PreviewResponse result = service.preview("target@x.y", "월드 이즈 댄싱2화\n월드 이즈 댄싱3화");

        assertThat(result.lines()).hasSize(2);
        assertThat(result.lines().get(0).lineNumber()).isEqualTo(1);
        assertThat(result.lines().get(0).progress()).isEqualTo(2);
        assertThat(result.lines().get(0).status()).isEqualTo(LineStatus.DUPLICATE);
        assertThat(result.lines().get(0).anime()).isNull();
        assertThat(result.lines().get(0).message()).isEqualTo("뒤의 동일 작품 입력으로 대체됨");
        assertThat(result.lines().get(1).lineNumber()).isEqualTo(2);
        assertThat(result.lines().get(1).progress()).isEqualTo(3);
        assertThat(result.lines().get(1).status()).isEqualTo(LineStatus.MATCHED);
        assertThat(result.lines().get(1).anime().id()).isEqualTo(worldIsDancing.getId());
        assertThat(result.lines().get(1).message()).isNull();
    }

    @Test
    void preview_matchesIndividualSearchKeywordAlias() {
        Anime anime = anime(24L, "BanG Dream!");
        anime.setSearchKeywords("뱅드림, 방드림");
        stubTargetAndAnime(List.of(anime));

        PreviewLine line = service.preview("target@x.y", "방드림7화").lines().get(0);

        assertThat(line.lineNumber()).isEqualTo(1);
        assertThat(line.progress()).isEqualTo(7);
        assertThat(line.status()).isEqualTo(LineStatus.MATCHED);
        assertThat(line.anime().id()).isEqualTo(24L);
        assertThat(line.message()).isNull();
    }

    @Test
    void preview_readsAnimeCacheOnlyOnceForManyLines() {
        Anime a = anime(25L, "작품A");
        Anime b = anime(26L, "작품B");
        Anime c = anime(27L, "작품C");
        stubTargetAndAnime(List.of(a, b, c));

        PreviewResponse result = service.preview("target@x.y", "작품A1화\n작품B2화\n작품C3화");

        assertThat(result.lines()).extracting(PreviewLine::lineNumber).containsExactly(1, 2, 3);
        assertThat(result.lines()).extracting(PreviewLine::progress).containsExactly(1, 2, 3);
        assertThat(result.lines()).extracting(PreviewLine::status)
            .containsExactly(LineStatus.MATCHED, LineStatus.MATCHED, LineStatus.MATCHED);
        assertThat(result.lines()).extracting(line -> line.anime().id()).containsExactly(25L, 26L, 27L);
        assertThat(result.lines()).extracting(PreviewLine::message).containsOnlyNulls();
        verify(animes, times(1)).findAll();
    }

    private void stubTargetAndAnime(List<Anime> anime) {
        when(users.findByEmailIgnoreCase("target@x.y")).thenReturn(Optional.of(target));
        when(animes.findAll()).thenReturn(anime);
    }

    private static User user(Long id, String email, String displayName) {
        User user = new User("google-" + id, email, displayName, null);
        setId(user, id);
        return user;
    }

    private static Anime anime(Long id, String koreanTitle) {
        Anime anime = new Anime(id.intValue(), "Romaji " + id, "Native " + id, null,
            "cover-" + id, 12, "FINISHED", "TV", 2024, null, null);
        anime.setTitleKorean(koreanTitle);
        setId(anime, id);
        return anime;
    }

    private static void setId(Object target, Long id) {
        try {
            Field field = target.getClass().getDeclaredField("id");
            field.setAccessible(true);
            field.set(target, id);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }
}

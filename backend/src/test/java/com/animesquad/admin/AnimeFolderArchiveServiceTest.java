package com.animesquad.admin;

import com.animesquad.anime.Anime;
import com.animesquad.anime.AnimeRepository;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AnimeFolderArchiveServiceTest {

    private final AnimeRepository animes = mock(AnimeRepository.class);
    private final AnimeFolderArchiveService service = new AnimeFolderArchiveService(animes);

    @Test
    void createsQuarterTree_andSkipsBlankKoreanTitles() throws Exception {
        Anime included = anime(101, "Romaji / Title", "  한글   제목  ");
        Anime blank = anime(102, "Ignored", "   ");
        when(animes.findBySeasonYearAndSeasonAndTitleKoreanIsNotNullOrderByTitleKoreanAscIdAsc(
            2026, "SPRING")).thenReturn(List.of(blank, included));

        var archive = service.create(2026, "SPRING");

        assertThat(archive.downloadFilename()).isEqualTo("2026년-2분기-애니-음원-폴더.zip");
        assertThat(entries(archive.bytes())).containsExactly(
            "2026년/",
            "2026년/2026년 2분기/",
            "2026년/2026년 2분기/한글 제목 (Romaji - Title)/");
    }

    @Test
    void createsOnlyRootFolders_whenSeasonHasNoTitledAnime() throws Exception {
        when(animes.findBySeasonYearAndSeasonAndTitleKoreanIsNotNullOrderByTitleKoreanAscIdAsc(
            2026, "WINTER")).thenReturn(List.of());
        assertThat(entries(service.create(2026, "WINTER").bytes()))
            .containsExactly("2026년/", "2026년/2026년 1분기/");
    }

    @Test
    void limitsUnicodeNames_andAddsCollisionSuffix() throws Exception {
        Anime first = anime(201, "Same:Title", "한글/제목.");
        Anime second = anime(202, "Same/Title", "한글:제목.");
        Anime longTitle = anime(203, "😀".repeat(220), "긴 제목");
        when(animes.findBySeasonYearAndSeasonAndTitleKoreanIsNotNullOrderByTitleKoreanAscIdAsc(
            2026, "SUMMER")).thenReturn(List.of(first, second, longTitle));

        List<String> names = entries(service.create(2026, "SUMMER").bytes());

        assertThat(names).contains(
            "2026년/2026년 3분기/한글-제목 (Same-Title)/",
            "2026년/2026년 3분기/한글-제목 (Same-Title) [AniList-202]/");
        String entry = names.stream().filter(n -> n.contains("긴 제목 (")).findFirst().orElseThrow();
        String folder = entry.substring(entry.lastIndexOf('/', entry.length() - 2) + 1, entry.length() - 1);
        assertThat(folder.codePointCount(0, folder.length())).isLessThanOrEqualTo(200);
        assertThat(folder).endsWith(")");
    }

    private static Anime anime(Integer anilistId, String romaji, String korean) {
        Anime anime = new Anime(anilistId, romaji, "Native", null, null, 12,
            "FINISHED", "TV", 2026, "SPRING", null);
        anime.setTitleKorean(korean);
        return anime;
    }

    private static List<String> entries(byte[] bytes) throws Exception {
        List<String> names = new ArrayList<>();
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(bytes))) {
            for (ZipEntry entry; (entry = zip.getNextEntry()) != null;) {
                names.add(entry.getName());
            }
        }
        return names;
    }
}

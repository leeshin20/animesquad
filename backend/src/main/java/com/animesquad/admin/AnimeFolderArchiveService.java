package com.animesquad.admin;

import com.animesquad.anime.Anime;
import com.animesquad.anime.AnimeRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@Service
public class AnimeFolderArchiveService {
    private static final int MAX_FOLDER_CODE_POINTS = 200;
    private final AnimeRepository animes;

    public AnimeFolderArchiveService(AnimeRepository animes) { this.animes = animes; }
    public record Archive(byte[] bytes, String downloadFilename) {}

    @Transactional(readOnly = true)
    public Archive create(int year, String season) {
        int quarter = switch (season) {
            case "WINTER" -> 1; case "SPRING" -> 2;
            case "SUMMER" -> 3; case "FALL" -> 4;
            default -> throw new IllegalArgumentException("invalid season: " + season);
        };
        String root = year + "년/";
        String quarterRoot = root + year + "년 " + quarter + "분기/";
        Set<String> used = new HashSet<>();
        List<Anime> selected = animes
            .findBySeasonYearAndSeasonAndTitleKoreanIsNotNullOrderByTitleKoreanAscIdAsc(year, season);
        try (ByteArrayOutputStream bytes = new ByteArrayOutputStream();
             ZipOutputStream zip = new ZipOutputStream(bytes, StandardCharsets.UTF_8)) {
            addDirectory(zip, root);
            addDirectory(zip, quarterRoot);
            for (Anime anime : selected) {
                if (!anime.getTitleKorean().isBlank()) {
                    addDirectory(zip, quarterRoot + uniqueFolderName(anime, used) + "/");
                }
            }
            zip.finish();
            return new Archive(bytes.toByteArray(),
                year + "년-" + quarter + "분기-애니-음원-폴더.zip");
        } catch (IOException e) {
            throw new IllegalStateException("failed to create anime folder archive", e);
        }
    }

    private static String safeComponent(String value) {
        return value.trim().replace('/', '-').replace(':', '-').replace('\0', '-')
            .replaceAll("\\s+", " ").replaceAll("[. ]+$", "");
    }

    private static String truncate(String value, int max) {
        if (value.codePointCount(0, value.length()) <= max) return value;
        return value.substring(0, value.offsetByCodePoints(0, max));
    }

    private static String baseFolderName(Anime anime) {
        String korean = safeComponent(anime.getTitleKorean());
        String romaji = safeComponent(anime.getTitleRomaji());
        String full = korean + " (" + romaji + ")";
        if (full.codePointCount(0, full.length()) <= MAX_FOLDER_CODE_POINTS) return full;
        int romajiBudget = MAX_FOLDER_CODE_POINTS - korean.codePointCount(0, korean.length()) - 3;
        if (romajiBudget > 0) return korean + " (" + truncate(romaji, romajiBudget) + ")";
        return truncate(korean, MAX_FOLDER_CODE_POINTS - 4) + " (" + truncate(romaji, 1) + ")";
    }

    private static String uniqueFolderName(Anime anime, Set<String> used) {
        String base = baseFolderName(anime);
        if (used.add(base)) return base;
        String suffix = anime.getAnilistId() != null
            ? " [AniList-" + anime.getAnilistId() + "]"
            : " [AnimeSquad-" + anime.getId() + "]";
        String unique = truncate(base, MAX_FOLDER_CODE_POINTS
            - suffix.codePointCount(0, suffix.length())) + suffix;
        used.add(unique);
        return unique;
    }

    private static void addDirectory(ZipOutputStream zip, String path) throws IOException {
        zip.putNextEntry(new ZipEntry(path));
        zip.closeEntry();
    }
}

package com.animesquad.anime;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Component
public class AniListClientImpl implements AniListClient {

    private static final String SEARCH_QUERY = """
        query ($q: String) {
          Page(perPage: 20) {
            media(search: $q, type: ANIME) {
              id
              title { romaji native english }
              coverImage { large }
              episodes
              status
              format
              seasonYear
              startDate { year month day }
            }
          }
        }
        """;

    private static final String SEASON_QUERY = """
        query ($page: Int, $perPage: Int, $year: Int, $season: MediaSeason) {
          Page(page: $page, perPage: $perPage) {
            pageInfo { hasNextPage }
            media(seasonYear: $year, season: $season, type: ANIME, sort: POPULARITY_DESC) {
              id
              title { romaji native english }
              coverImage { large }
              episodes
              status
              format
              seasonYear
              season
              startDate { year month day }
            }
          }
        }
        """;

    private static final String BY_ID_QUERY = """
        query ($id: Int) {
          Media(id: $id, type: ANIME) {
            id
            title { romaji native english }
            coverImage { large }
            episodes
            status
            format
            seasonYear
            season
            startDate { year month day }
          }
        }
        """;

    private final RestClient client;

    public AniListClientImpl(@Value("${app.anilist.url}") String url) {
        this.client = RestClient.builder().baseUrl(url).build();
    }

    @Override
    public List<AniListMedia> search(String query) {
        Map<?, ?> resp = post(SEARCH_QUERY, Map.of("q", query));
        if (resp == null) return List.of();
        Map<?, ?> data = (Map<?, ?>) resp.get("data");
        if (data == null) return List.of();
        Map<?, ?> page = (Map<?, ?>) data.get("Page");
        if (page == null) return List.of();
        List<?> media = (List<?>) page.get("media");
        if (media == null) return List.of();
        return media.stream().map(this::toMedia).toList();
    }

    @Override
    public List<AniListMedia> fetchSeason(int year, String season) {
        List<AniListMedia> all = new ArrayList<>();
        int page = 1;
        int maxPages = 5;
        while (page <= maxPages) {
            Map<?, ?> resp = post(SEASON_QUERY, Map.of(
                "page", page, "perPage", 50, "year", year, "season", season));
            if (resp == null) break;
            Map<?, ?> data = (Map<?, ?>) resp.get("data");
            if (data == null) break;
            Map<?, ?> pageData = (Map<?, ?>) data.get("Page");
            if (pageData == null) break;
            List<?> media = (List<?>) pageData.get("media");
            if (media != null) media.forEach(m -> all.add(toMedia(m)));
            Map<?, ?> pageInfo = (Map<?, ?>) pageData.get("pageInfo");
            boolean hasNext = pageInfo != null && Boolean.TRUE.equals(pageInfo.get("hasNextPage"));
            if (!hasNext) break;
            page++;
        }
        return all;
    }

    @Override
    public AniListMedia fetchById(int anilistId) {
        Map<?, ?> resp = post(BY_ID_QUERY, Map.of("id", anilistId));
        if (resp == null) return null;
        Map<?, ?> data = (Map<?, ?>) resp.get("data");
        if (data == null) return null;
        Object media = data.get("Media");
        if (media == null) return null;
        return toMedia(media);
    }

    private Map<?, ?> post(String query, Map<String, Object> variables) {
        return client.post()
            .body(Map.of("query", query, "variables", variables))
            .retrieve()
            .body(Map.class);
    }

    @SuppressWarnings("unchecked")
    private AniListMedia toMedia(Object raw) {
        Map<String, Object> m = (Map<String, Object>) raw;
        Map<String, Object> title = (Map<String, Object>) m.get("title");
        Map<String, Object> cover = (Map<String, Object>) m.get("coverImage");
        return new AniListMedia(
            ((Number) m.get("id")).intValue(),
            (String) title.get("romaji"),
            (String) title.get("native"),
            (String) title.get("english"),
            cover != null ? (String) cover.get("large") : null,
            m.get("episodes") == null ? null : ((Number) m.get("episodes")).intValue(),
            (String) m.get("status"),
            (String) m.get("format"),
            m.get("seasonYear") == null ? null : ((Number) m.get("seasonYear")).intValue(),
            (String) m.get("season"),
            toDate((Map<String, Object>) m.get("startDate"))
        );
    }

    /** AniList fuzzy date — 연/월/일 중 하나라도 없으면 null. */
    private LocalDate toDate(Map<String, Object> d) {
        if (d == null) return null;
        Number y = (Number) d.get("year");
        Number mo = (Number) d.get("month");
        Number day = (Number) d.get("day");
        if (y == null || mo == null || day == null) return null;
        return LocalDate.of(y.intValue(), mo.intValue(), day.intValue());
    }
}

package com.animesquad.watch;

import com.animesquad.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import javax.sql.DataSource;
import java.nio.charset.StandardCharsets;
import static org.assertj.core.api.Assertions.assertThat;

class EpisodeWatchMigrationIT extends AbstractIntegrationTest {
    @Autowired DataSource dataSource;

    @Test void importsOnlyEvidenceAndDeduplicatesSquadCopiesWithoutPostingEvents() throws Exception {
        try (var connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try (var sql = connection.createStatement()) {
                sql.execute("CREATE SCHEMA history_migration_test");
                sql.execute("SET LOCAL search_path TO history_migration_test");
                sql.execute("""
                    CREATE TABLE users (id BIGINT PRIMARY KEY);
                    CREATE TABLE anime (id BIGINT PRIMARY KEY);
                    CREATE TABLE watch_entry (user_id BIGINT, anime_id BIGINT, progress INT);
                    CREATE TABLE episode_rating (user_id BIGINT, anime_id BIGINT, episode_number INT, created_at TIMESTAMPTZ);
                    CREATE TABLE activity (actor_id BIGINT, anime_id BIGINT, type TEXT, payload JSONB, created_at TIMESTAMPTZ);
                    INSERT INTO users VALUES (1); INSERT INTO anime VALUES (10);
                    INSERT INTO watch_entry VALUES (1,10,3);
                    INSERT INTO episode_rating VALUES (1,10,4,'2020-01-02Z');
                    INSERT INTO activity VALUES
                        (1,10,'PROGRESS_UPDATED','{"progress":2}','2020-01-01Z'),
                        (1,10,'PROGRESS_UPDATED','{"progress":2}','2020-01-01Z'),
                        (1,10,'PROGRESS_UPDATED','{"progress":8}','2020-01-01Z');
                    """);
                try (var resource = getClass().getResourceAsStream("/db/migration/V21__episode_watch.sql")) {
                    sql.execute(new String(resource.readAllBytes(), StandardCharsets.UTF_8));
                }
                try (var rows = sql.executeQuery("SELECT episode_number,source FROM episode_watch ORDER BY episode_number")) {
                    assertThat(rows.next()).isTrue(); assertThat(rows.getInt(1)).isEqualTo(2); assertThat(rows.getString(2)).isEqualTo("LEGACY");
                    assertThat(rows.next()).isTrue(); assertThat(rows.getInt(1)).isEqualTo(4);
                    assertThat(rows.next()).isFalse();
                }
                try (var rows = sql.executeQuery("SELECT count(*) FROM activity")) {
                    rows.next(); assertThat(rows.getInt(1)).isEqualTo(3);
                }
            } finally { connection.rollback(); }
        }
    }
}

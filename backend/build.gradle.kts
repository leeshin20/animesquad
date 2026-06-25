plugins {
    java
    id("org.springframework.boot") version "3.3.5"
    id("io.spring.dependency-management") version "1.1.6"
}

group = "com.animesquad"
version = "0.0.1-SNAPSHOT"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

repositories { mavenCentral() }

// Only emit the executable Spring Boot fat jar (skip the plain jar) so the
// Docker build's COPY *.jar resolves to a single artifact.
tasks.named<Jar>("jar") { enabled = false }

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.boot:spring-boot-starter-oauth2-client")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.flywaydb:flyway-core")
    implementation("org.flywaydb:flyway-database-postgresql")
    runtimeOnly("org.postgresql:postgresql")

    implementation("io.jsonwebtoken:jjwt-api:0.12.6")
    runtimeOnly("io.jsonwebtoken:jjwt-impl:0.12.6")
    runtimeOnly("io.jsonwebtoken:jjwt-jackson:0.12.6")

    implementation(platform("software.amazon.awssdk:bom:2.28.16"))
    implementation("software.amazon.awssdk:s3")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.springframework.security:spring-security-test")
    testImplementation("org.testcontainers:junit-jupiter:1.21.4")
    testImplementation("org.testcontainers:postgresql:1.21.4")
}

tasks.test {
    useJUnitPlatform()

    // Docker Desktop on macOS: docker-java in Testcontainers defaults to API 1.32, which
    // Docker Engine 29+ rejects. The proxy socket also returns a trampoline stub. Point
    // at the raw daemon socket and pin a supported API version. The override path is
    // what gets bind-mounted into Ryuk (raw.sock is outside Docker file-sharing).
    val rawSock = "${System.getProperty("user.home")}/Library/Containers/com.docker.docker/Data/docker.raw.sock"
    if (file(rawSock).exists()) {
        environment("DOCKER_HOST", "unix://$rawSock")
        environment("TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE", "/var/run/docker.sock")
        systemProperty("api.version", "1.43")
    }
}

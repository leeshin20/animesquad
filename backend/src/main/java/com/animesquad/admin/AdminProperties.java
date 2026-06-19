package com.animesquad.admin;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;
import java.util.Locale;

@ConfigurationProperties(prefix = "app.admin")
public class AdminProperties {

    private String emails = "";

    public String getEmails() { return emails; }
    public void setEmails(String emails) { this.emails = emails; }

    public List<String> emailList() {
        if (emails == null || emails.isBlank()) return List.of();
        return List.of(emails.split(",")).stream()
            .map(String::trim)
            .filter(s -> !s.isEmpty())
            .map(s -> s.toLowerCase(Locale.ROOT))
            .toList();
    }

    public boolean isAdminEmail(String email) {
        if (email == null) return false;
        return emailList().contains(email.toLowerCase(Locale.ROOT));
    }
}

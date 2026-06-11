export default function HomePage() {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080";
  return (
    <main style={{ padding: 40, fontFamily: "sans-serif" }}>
      <h1>AnimeSquad</h1>
      <p>친구들과 애니메이션 시청 현황을 공유하세요.</p>
      <a
        href={`${apiBase}/oauth2/authorization/google`}
        style={{
          display: "inline-block",
          padding: "10px 16px",
          background: "#1a73e8",
          color: "white",
          borderRadius: 6,
          textDecoration: "none",
        }}
      >
        Sign in with Google
      </a>
    </main>
  );
}

export const dynamic = "force-dynamic";

const VIDEO_ID = "r5-zVEf_svE";

export default function YtTestPage() {
  const direct = `https://www.youtube.com/embed/${VIDEO_ID}`;
  const proxy = `/api/youtube-embedding?id=${VIDEO_ID}`;
  const proxyTest = `/api/youtube-embedding?id=${VIDEO_ID}&test=1`;

  return (
    <main style={{ padding: 24, color: "#fff", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>YouTube embedding test</h1>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>1. /api/youtube-embedding?test=1 (sanity)</h2>
        <p style={{ fontSize: 13, opacity: 0.7, marginBottom: 8 }}>
          Если тут синий блок с «HELLO» — наш роут отдаёт HTML и iframe рендерится.
        </p>
        <iframe
          width={400}
          height={300}
          src={proxyTest}
          style={{ border: "1px solid #444", background: "#111" }}
        />
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>2. /api/youtube-embedding (наш прокси)</h2>
        <p style={{ fontSize: 13, opacity: 0.7, marginBottom: 8 }}>
          Если в (1) видно HELLO, а тут пусто — проблема в самом YouTube embed внутри нашей обёртки.
        </p>
        <iframe
          className="ytEmbed"
          width={400}
          height={300}
          src={proxy}
          frameBorder={0}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
          allowFullScreen
          style={{ background: "#111" }}
        />
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>3. Прямой YouTube embed (контроль)</h2>
        <p style={{ fontSize: 13, opacity: 0.7, marginBottom: 8 }}>
          Если тут пусто, а в (2) тоже пусто — проблема не в нашем роуте, а в окружении.
        </p>
        <iframe
          width={400}
          height={300}
          src={direct}
          frameBorder={0}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
          allowFullScreen
          style={{ background: "#111" }}
        />
      </section>
    </main>
  );
}

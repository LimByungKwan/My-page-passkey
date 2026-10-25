module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false });
  }

  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SECRET_KEY?.trim();

  if (!url || !key) {
    return res.status(503).json({
      ok: false,
      reason: "MISSING_ENV"
    });
  }

  if (!key.startsWith("sb_secret_")) {
    return res.status(503).json({
      ok: false,
      reason: "CHECK_SECRET_KEY"
    });
  }

  try {
    const endpoint = new URL("/rest/v1/accounts", url);
    endpoint.searchParams.set("select", "id");
    endpoint.searchParams.set("limit", "0");

    const response = await fetch(endpoint, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const code = typeof body.code === "string"
        && /^[A-Z0-9_]{3,20}$/.test(body.code)
        ? body.code
        : "UNKNOWN";

      return res.status(503).json({
        ok: false,
        reason: "SUPABASE_REJECTED",
        upstreamStatus: response.status,
        code
      });
    }

    return res.status(200).json({
      ok: true,
      message: "데이터베이스 연결 성공"
    });
  } catch (error) {
    return res.status(503).json({
      ok: false,
      reason: error.name === "TimeoutError"
        ? "CONNECTION_TIMEOUT"
        : "CONNECTION_ERROR"
    });
  }
};

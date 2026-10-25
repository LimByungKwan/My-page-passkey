module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    return res.status(503).json({
      ok: false,
      message: "서버 연결 설정을 확인해 주세요."
    });
  }

  try {
    // 자료 내용은 가져오지 않고 연결과 조회 권한만 확인합니다.
    const endpoint = new URL("/rest/v1/accounts", url);
    endpoint.searchParams.set("select", "id");
    endpoint.searchParams.set("limit", "0");

    const response = await fetch(endpoint, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      throw new Error("Database connection failed");
    }

    return res.status(200).json({
      ok: true,
      message: "데이터베이스 연결 성공"
    });
  } catch {
    return res.status(503).json({
      ok: false,
      message: "데이터베이스에 연결하지 못했습니다."
    });
  }
};

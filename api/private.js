const { createHash } = require("node:crypto");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      error: "허용하지 않은 요청 방식입니다."
    });
  }

  const cookie = (req.headers.cookie || "")
    .split(";")
    .map(value => value.trim())
    .find(value => value.startsWith("__Host-passkey_session="));

  const token = cookie?.slice("__Host-passkey_session=".length);

  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return res.status(401).json({
      error: "패스키로 로그인해 주세요."
    });
  }

  try {
    const baseURL = process.env.SUPABASE_URL.trim();
    const apiKey = process.env.SUPABASE_SECRET_KEY.trim();
    const tokenHash = createHash("sha256")
      .update(token)
      .digest("hex");

    const sessionURL = new URL("/rest/v1/auth_sessions", baseURL);
    sessionURL.searchParams.set("select", "account_id");
    sessionURL.searchParams.set("token_hash", `eq.${tokenHash}`);
    sessionURL.searchParams.set(
      "expires_at",
      `gt.${new Date().toISOString()}`
    );

    const sessionResponse = await fetch(sessionURL, {
      headers: { apikey: apiKey },
      signal: AbortSignal.timeout(15000)
    });

    if (!sessionResponse.ok) {
      throw new Error("Session lookup failed");
    }

    const sessions = await sessionResponse.json();

    if (!Array.isArray(sessions) || sessions.length !== 1) {
      return res.status(401).json({
        error: "로그인이 만료됐습니다. 다시 로그인해 주세요."
      });
    }

    // 계정은 요청자가 보낸 값이 아니라 서버 세션에서 결정합니다.
    const accountId = sessions[0].account_id;

    // 다른 계정의 자료를 명시적으로 요구하면 거절합니다.
    if (
      req.query.accountId !== undefined &&
      req.query.accountId !== accountId
    ) {
      return res.status(403).json({
        error: "다른 계정의 비공개 자료는 볼 수 없습니다."
      });
    }

    const itemsURL = new URL("/rest/v1/private_items", baseURL);
    itemsURL.searchParams.set("select", "id,title,content");
    itemsURL.searchParams.set("account_id", `eq.${accountId}`);
    itemsURL.searchParams.set("order", "created_at.asc,id.asc");

    const itemsResponse = await fetch(itemsURL, {
      headers: { apikey: apiKey },
      signal: AbortSignal.timeout(15000)
    });

    if (!itemsResponse.ok) {
      throw new Error("Private data lookup failed");
    }

    const items = await itemsResponse.json();

    if (!Array.isArray(items)) {
      throw new Error("Invalid private data");
    }

    return res.status(200).json({
      accountId,
      items,
      count: items.length
    });
  } catch {
    return res.status(503).json({
      error: "자료를 불러오지 못했습니다. 잠시 후 다시 시도하세요."
    });
  }
};

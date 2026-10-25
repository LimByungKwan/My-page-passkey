const { createHash } = require("node:crypto");

const ORIGIN = "https://my-page-passkey.vercel.app";

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "로그아웃 버튼을 이용해 주세요."
    });
  }

  if (req.headers.origin !== ORIGIN) {
    return res.status(403).json({
      error: "허용하지 않은 요청입니다."
    });
  }

  const cookie = (req.headers.cookie || "")
    .split(";")
    .map(value => value.trim())
    .find(value => value.startsWith("__Host-passkey_session="));

  const token = cookie?.slice("__Host-passkey_session=".length);

  try {
    if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) {
      const tokenHash = createHash("sha256")
        .update(token)
        .digest("hex");

      const endpoint = new URL(
        "/rest/v1/auth_sessions",
        process.env.SUPABASE_URL.trim()
      );

      endpoint.searchParams.set("token_hash", `eq.${tokenHash}`);

      const response = await fetch(endpoint, {
        method: "DELETE",
        headers: {
          apikey: process.env.SUPABASE_SECRET_KEY.trim(),
          Prefer: "return=minimal"
        },
        signal: AbortSignal.timeout(15000)
      });

      if (!response.ok) {
        throw new Error("Session deletion failed");
      }
    }

    // 서버 세션 삭제 후 브라우저의 쿠키도 지웁니다.
    res.setHeader("Set-Cookie", [
      "__Host-passkey_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0",
      "__Host-passkey_flow=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0"
    ]);

    return res.status(200).json({
      ok: true,
      message: "로그아웃했습니다."
    });
  } catch {
    return res.status(503).json({
      error: "로그아웃을 완료하지 못했습니다. 다시 시도하세요."
    });
  }
};

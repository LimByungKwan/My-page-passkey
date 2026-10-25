const { randomBytes, createHash } = require("node:crypto");

const ORIGIN = "https://my-page-passkey.vercel.app";
const RP_ID = "my-page-passkey.vercel.app";

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "로그인 버튼을 이용해 주세요."
    });
  }

  if (req.headers.origin !== ORIGIN) {
    return res.status(403).json({
      error: "허용하지 않은 요청입니다."
    });
  }

  try {
    const { generateAuthenticationOptions } =
      await import("@simplewebauthn/server");

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      userVerification: "required"
    });

    const browserBinding = randomBytes(32).toString("base64url");
    const bindingHash = createHash("sha256")
      .update(browserBinding)
      .digest("hex");

    const endpoint = new URL(
      "/rest/v1/auth_challenges",
      process.env.SUPABASE_URL.trim()
    );

    const saved = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: process.env.SUPABASE_SECRET_KEY.trim(),
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        challenge: options.challenge,
        purpose: "login",
        browser_binding_hash: bindingHash
      }),
      signal: AbortSignal.timeout(15000)
    });

    if (!saved.ok) {
      throw new Error("Challenge storage failed");
    }

    res.setHeader(
      "Set-Cookie",
      `__Host-passkey_flow=${browserBinding}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=300`
    );

    return res.status(200).json({ options });
  } catch {
    return res.status(503).json({
      error: "로그인을 준비하지 못했습니다. 잠시 후 다시 시도하세요."
    });
  }
};

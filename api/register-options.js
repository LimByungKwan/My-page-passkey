const {
  randomUUID,
  randomBytes,
  createHash
} = require("node:crypto");

const ORIGIN = "https://my-page-passkey.vercel.app";
const RP_ID = "my-page-passkey.vercel.app";

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (!["POST", "DELETE"].includes(req.method)) {
    res.setHeader("Allow", "POST, DELETE");
    return res.status(405).json({
      error: "등록 화면에서 요청해 주세요."
    });
  }

  if (req.headers.origin !== ORIGIN) {
    return res.status(403).json({
      error: "허용하지 않은 요청입니다."
    });
  }


  if (req.method === "DELETE") {
    const entry = (req.headers.cookie || "")
      .split(";").map(value => value.trim())
      .find(value => value.startsWith("__Host-passkey_flow="));
    const binding = entry?.slice("__Host-passkey_flow=".length);

    let clearedChallenges = 0;
    try {
      if (binding && /^[A-Za-z0-9_-]{43}$/.test(binding)) {
        const bindingHash = createHash("sha256").update(binding).digest("hex");
        const endpoint = new URL(
          "/rest/v1/auth_challenges",
          process.env.SUPABASE_URL.trim()
        );
        endpoint.searchParams.set("select", "id");
        endpoint.searchParams.set("purpose", "eq.register");
        endpoint.searchParams.set("browser_binding_hash", "eq." + bindingHash);
        endpoint.searchParams.set("used_at", "is.null");
        const response = await fetch(endpoint, {
          method: "DELETE",
          headers: {
            apikey: process.env.SUPABASE_SECRET_KEY.trim(),
            Prefer: "return=representation"
          },
          signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) throw new Error("Challenge cancellation failed");
        const removed = await response.json();
        if (!Array.isArray(removed)) throw new Error("Invalid cancellation response");
        clearedChallenges = removed.length;
      }

      res.setHeader("Set-Cookie",
        "__Host-passkey_flow=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0");
      return res.status(200).json({
        cancelled: true,
        clearedChallenges,
        message: "등록을 취소하고 임시 질문을 정리했습니다."
      });
    } catch {
      return res.status(503).json({
        error: "등록은 취소됐지만 임시 질문 정리를 확인하지 못했습니다. 질문은 발급 후 5분이 지나면 사용할 수 없습니다."
      });
    }
  }

  if (!/^application\/json(?:;|$)/i.test(
    req.headers["content-type"] || ""
  )) {
    return res.status(415).json({
      error: "JSON 요청이 필요합니다."
    });
  }

  const displayName = req.body?.displayName;
  const passkeyName = req.body?.passkeyName;

  if (
    typeof displayName !== "string" ||
    typeof passkeyName !== "string" ||
    !displayName.trim() ||
    !passkeyName.trim() ||
    displayName.trim().length > 40 ||
    passkeyName.trim().length > 60
  ) {
    return res.status(400).json({
      error: "별명은 1~40자, 패스키 이름은 1~60자로 입력하세요."
    });
  }

  try {
    const { generateRegistrationOptions } =
      await import("@simplewebauthn/server");

    // 새 계정의 식별자만 미리 만듭니다.
    // accounts 표에는 아직 저장하지 않습니다.
    const accountId = randomUUID();

    const options = await generateRegistrationOptions({
      rpName: "나의 소개 · 비공개 노트",
      rpID: RP_ID,
      userID: new TextEncoder().encode(accountId),
      userName: accountId,
      userDisplayName: displayName.trim(),
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required"
      }
    });

    // 질문을 요청한 브라우저와 등록 확인 요청을 연결합니다.
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
        purpose: "register",
        browser_binding_hash: bindingHash,
        registration_data: {
          accountId,
          displayName: displayName.trim(),
          passkeyName: passkeyName.trim()
        }
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
      error: "등록 준비에 실패했습니다. 잠시 후 다시 시도하세요."
    });
  }
};

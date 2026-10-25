const { createHash, randomBytes } = require("node:crypto");

const ORIGIN = "https://my-page-passkey.vercel.app";
const RP_ID = "my-page-passkey.vercel.app";

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "등록 화면에서 요청해 주세요."
    });
  }

  if (req.headers.origin !== ORIGIN) {
    return res.status(403).json({
      error: "허용하지 않은 요청입니다."
    });
  }

  if (!/^application\/json(?:;|$)/i.test(
    req.headers["content-type"] || ""
  )) {
    return res.status(415).json({
      error: "JSON 요청이 필요합니다."
    });
  }

  const credential = req.body?.credential;

  const cookie = (req.headers.cookie || "")
    .split(";")
    .map(value => value.trim())
    .find(value => value.startsWith("__Host-passkey_flow="));

  const binding = cookie?.slice("__Host-passkey_flow=".length);

  if (!binding || !/^[A-Za-z0-9_-]{43}$/.test(binding)) {
    return res.status(400).json({
      error: "등록 시간이 지났습니다. 처음부터 다시 시도하세요."
    });
  }

  // 브라우저가 돌려준 질문을 읽습니다.
  // 신뢰 여부는 아래에서 서버 저장값과 대조합니다.
  let challenge;

  try {
    const encoded = credential?.response?.clientDataJSON;

    if (typeof encoded !== "string" || encoded.length > 16000) {
      throw new Error("Invalid client data");
    }

    const clientData = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    );

    challenge = clientData.challenge;

    if (
      typeof challenge !== "string" ||
      !/^[A-Za-z0-9_-]{20,256}$/.test(challenge)
    ) {
      throw new Error("Invalid challenge");
    }
  } catch {
    return res.status(400).json({
      error: "등록 응답 형식이 올바르지 않습니다."
    });
  }

  try {
    const baseURL = process.env.SUPABASE_URL.trim();
    const apiKey = process.env.SUPABASE_SECRET_KEY.trim();
    const bindingHash = hash(binding);

    const lookup = new URL("/rest/v1/auth_challenges", baseURL);
    lookup.searchParams.set("select", "id,challenge");
    lookup.searchParams.set("challenge", `eq.${challenge}`);
    lookup.searchParams.set("purpose", "eq.register");
    lookup.searchParams.set("browser_binding_hash", `eq.${bindingHash}`);
    lookup.searchParams.set("used_at", "is.null");
    lookup.searchParams.set("expires_at", `gt.${new Date().toISOString()}`);

    const found = await fetch(lookup, {
      headers: { apikey: apiKey },
      signal: AbortSignal.timeout(15000)
    });

    if (!found.ok) {
      throw new Error("Challenge lookup failed");
    }

    const rows = await found.json();

    if (!Array.isArray(rows) || rows.length !== 1) {
      return res.status(400).json({
        error: "만료되었거나 이미 사용한 등록 요청입니다."
      });
    }

    const saved = rows[0];
    const { verifyRegistrationResponse } =
      await import("@simplewebauthn/server");

    let verification;

    try {
      verification = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge: saved.challenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        requireUserVerification: true
      });
    } catch {
      return res.status(400).json({
        error: "패스키 등록 검증에 실패했습니다."
      });
    }

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({
        error: "검증하지 못한 패스키입니다."
      });
    }

    const info = verification.registrationInfo;
    const key = info.credential;
    const sessionToken = randomBytes(32).toString("base64url");

    // 검증된 공개키만 저장합니다.
    // 질문 사용 처리와 계정 생성은 하나의 작업으로 실행됩니다.
    const result = await fetch(
      new URL("/rest/v1/rpc/finish_passkey_registration", baseURL),
      {
        method: "POST",
        headers: {
          apikey: apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          p_challenge_id: saved.id,
          p_binding_hash: bindingHash,
          p_credential_id: key.id,
          p_public_key: Buffer.from(key.publicKey).toString("base64url"),
          p_counter: key.counter,
          p_transports: key.transports || [],
          p_device_type: info.credentialDeviceType,
          p_backed_up: info.credentialBackedUp,
          p_session_hash: hash(sessionToken)
        }),
        signal: AbortSignal.timeout(15000)
      }
    );

    if (!result.ok) {
      const problem = await result.json().catch(() => ({}));

      if (problem.code === "P0001") {
        return res.status(400).json({
          error: "만료되었거나 이미 사용한 등록 요청입니다."
        });
      }

      throw new Error("Registration storage failed");
    }

    res.setHeader("Set-Cookie", [
      `__Host-passkey_session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`,
      "__Host-passkey_flow=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0"
    ]);

    return res.status(200).json({
      verified: true,
      message: "패스키 등록을 완료했습니다."
    });
  } catch {
    return res.status(503).json({
      error: "등록을 완료하지 못했습니다. 잠시 후 다시 시도하세요."
    });
  }
};

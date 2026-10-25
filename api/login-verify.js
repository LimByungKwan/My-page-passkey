const { createHash, randomBytes } = require("node:crypto");

const ORIGIN = "https://my-page-passkey.vercel.app";
const RP_ID = "my-page-passkey.vercel.app";

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function getCookie(req, name) {
  const entry = (req.headers.cookie || "")
    .split(";")
    .map(value => value.trim())
    .find(value => value.startsWith(name + "="));
  return entry?.slice(name.length + 1);
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "로그인 버튼을 이용해 주세요." });
  }

  if (req.headers.origin !== ORIGIN) {
    return res.status(403).json({ error: "허용하지 않은 요청입니다." });
  }

  if (!/^application\/json(?:;|$)/i.test(req.headers["content-type"] || "")) {
    return res.status(415).json({ error: "JSON 요청이 필요합니다." });
  }

  const binding = getCookie(req, "__Host-passkey_flow");
  if (!binding || !/^[A-Za-z0-9_-]{43}$/.test(binding)) {
    return res.status(400).json({
      error: "유효한 로그인 질문이 없습니다. 로그인 버튼을 다시 눌러 주세요."
    });
  }

  const credential = req.body?.credential;
  let challenge;
  try {
    if (
      typeof credential?.id !== "string" ||
      !/^[A-Za-z0-9_-]{1,2048}$/.test(credential.id)
    ) {
      throw new Error("Invalid credential ID");
    }

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
    return res.status(400).json({ error: "로그인 응답 형식이 올바르지 않습니다." });
  }

  try {
    const baseURL = process.env.SUPABASE_URL.trim();
    const apiKey = process.env.SUPABASE_SECRET_KEY.trim();
    const bindingHash = hash(binding);

    async function read(path, parameters) {
      const url = new URL(path, baseURL);
      for (const [key, value] of Object.entries(parameters)) {
        url.searchParams.set(key, value);
      }
      const response = await fetch(url, {
        headers: { apikey: apiKey },
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) throw new Error("Database lookup failed");
      const rows = await response.json();
      if (!Array.isArray(rows)) throw new Error("Invalid database response");
      return rows;
    }

    const challenges = await read("/rest/v1/auth_challenges", {
      select: "id,challenge",
      challenge: "eq." + challenge,
      purpose: "eq.login",
      browser_binding_hash: "eq." + bindingHash,
      used_at: "is.null",
      expires_at: "gt." + new Date().toISOString()
    });

    if (challenges.length !== 1) {
      return res.status(400).json({
        error: "만료되었거나 이미 사용한 로그인 질문입니다."
      });
    }

    const keys = await read("/rest/v1/passkeys", {
      select: "credential_id,account_id,public_key,counter,transports",
      credential_id: "eq." + credential.id
    });

    if (keys.length !== 1) {
      return res.status(401).json({
        error: "등록되지 않았거나 삭제된 패스키입니다."
      });
    }

    const savedChallenge = challenges[0];
    const savedKey = keys[0];
    const counter = Number(savedKey.counter);

    if (!Number.isSafeInteger(counter) || counter < 0) {
      throw new Error("Invalid stored counter");
    }

    // 기기가 계정 식별자를 돌려줬다면 서버에 저장한 소유자와 대조합니다.
    const userHandle = credential.response?.userHandle;
    if (userHandle !== null && userHandle !== undefined) {
      if (
        typeof userHandle !== "string" ||
        userHandle.length > 512 ||
        Buffer.from(userHandle, "base64url").toString("utf8") !== savedKey.account_id
      ) {
        return res.status(401).json({ error: "패스키의 계정 정보가 일치하지 않습니다." });
      }
    }

    const { verifyAuthenticationResponse } =
      await import("@simplewebauthn/server");

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: credential,
        expectedChallenge: savedChallenge.challenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        requireUserVerification: true,
        credential: {
          id: savedKey.credential_id,
          publicKey: new Uint8Array(Buffer.from(savedKey.public_key, "base64url")),
          counter,
          transports: savedKey.transports || []
        }
      });
    } catch {
      return res.status(401).json({
        error: "패스키 서명 검증에 실패했습니다."
      });
    }

    if (!verification.verified || !verification.authenticationInfo) {
      return res.status(401).json({ error: "검증하지 못한 로그인입니다." });
    }

    const token = randomBytes(32).toString("base64url");
    const result = await fetch(
      new URL("/rest/v1/rpc/finish_passkey_login", baseURL),
      {
        method: "POST",
        headers: {
          apikey: apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          p_challenge_id: savedChallenge.id,
          p_binding_hash: bindingHash,
          p_credential_id: savedKey.credential_id,
          p_expected_counter: counter,
          p_new_counter: verification.authenticationInfo.newCounter,
          p_session_hash: hash(token)
        }),
        signal: AbortSignal.timeout(15000)
      }
    );

    if (!result.ok) {
      const problem = await result.json().catch(() => ({}));
      if (problem.code === "P0001") {
        return res.status(401).json({
          error: "이미 사용한 질문이거나 변경된 패스키입니다. 다시 로그인해 주세요."
        });
      }
      throw new Error("Session creation failed");
    }

    res.setHeader("Set-Cookie", "__Host-passkey_session=" + token + "; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200");
    return res.status(200).json({
      verified: true,
      message: "패스키로 로그인했습니다."
    });
  } catch {
    return res.status(503).json({
      error: "로그인을 완료하지 못했습니다. 잠시 후 다시 시도하세요."
    });
  }
};


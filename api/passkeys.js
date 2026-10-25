const { createHash, randomBytes } = require("node:crypto");

const ORIGIN = "https://my-page-passkey.vercel.app";
const RP_ID = "my-page-passkey.vercel.app";

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}
function cookie(req, name) {
  const entry = (req.headers.cookie || "").split(";").map(v => v.trim())
    .find(v => v.startsWith(name + "="));
  return entry?.slice(name.length + 1);
}
class Rejection extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "POST", "PUT"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST, PUT");
    return res.status(405).json({ error: "허용하지 않은 요청 방식입니다." });
  }
  if (req.method !== "GET") {
    if (req.headers.origin !== ORIGIN) {
      return res.status(403).json({ error: "허용하지 않은 요청입니다." });
    }
    if (!/^application\/json(?:;|$)/i.test(req.headers["content-type"] || "")) {
      return res.status(415).json({ error: "JSON 요청이 필요합니다." });
    }
  }
  const sessionToken = cookie(req, "__Host-passkey_session");
  if (!sessionToken || !/^[A-Za-z0-9_-]{43}$/.test(sessionToken)) {
    return res.status(401).json({ error: "패스키로 먼저 로그인해 주세요." });
  }

  try {
    const baseURL = process.env.SUPABASE_URL.trim();
    const apiKey = process.env.SUPABASE_SECRET_KEY.trim();
    const sessionHash = hash(sessionToken);

    async function database(path, parameters = {}, method = "GET", body) {
      const url = new URL(path, baseURL);
      for (const [key, value] of Object.entries(parameters)) {
        url.searchParams.set(key, value);
      }
      const headers = { apikey: apiKey };
      if (body !== undefined) headers["Content-Type"] = "application/json";
      const response = await fetch(url, {
        method, headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) {
        const problem = await response.json().catch(() => ({}));
        if (problem.code === "P0001") {
          throw new Rejection(400, "만료되었거나 이미 사용한 요청입니다. 다시 로그인하고 시도하세요.");
        }
        if (problem.code === "23505") {
          throw new Rejection(409, "이미 등록된 패스키입니다. 다른 패스키를 사용하세요.");
        }
        throw new Error("Database operation failed");
      }
      if (response.status === 204) return null;
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    }

    const sessions = await database("/rest/v1/auth_sessions", {
      select: "account_id",
      token_hash: "eq." + sessionHash,
      expires_at: "gt." + new Date().toISOString()
    });
    if (!Array.isArray(sessions) || sessions.length !== 1) {
      throw new Rejection(401, "로그인이 만료됐습니다. 다시 로그인해 주세요.");
    }
    const accountId = sessions[0].account_id;

    if (req.method === "GET") {
      const passkeys = await database("/rest/v1/passkeys", {
        select: "credential_id,name,created_at,device_type,backed_up",
        account_id: "eq." + accountId,
        order: "created_at.asc,credential_id.asc"
      });
      if (!Array.isArray(passkeys)) throw new Error("Invalid passkey list");
      return res.status(200).json({ passkeys, count: passkeys.length });
    }

    if (req.method === "POST") {
      const passkeyName = req.body?.passkeyName;
      if (typeof passkeyName !== "string" ||
          !passkeyName.trim() || passkeyName.trim().length > 60) {
        throw new Rejection(400, "패스키 이름은 1~60자로 입력하세요.");
      }

      const accounts = await database("/rest/v1/accounts", {
        select: "display_name", id: "eq." + accountId
      });
      const keys = await database("/rest/v1/passkeys", {
        select: "credential_id,transports", account_id: "eq." + accountId
      });
      if (!Array.isArray(accounts) || accounts.length !== 1 || !Array.isArray(keys)) {
        throw new Error("Invalid account data");
      }

      const { generateRegistrationOptions } = await import("@simplewebauthn/server");
      const options = await generateRegistrationOptions({
        rpName: "나의 소개 · 비공개 노트",
        rpID: RP_ID,
        userID: new TextEncoder().encode(accountId),
        userName: accountId,
        userDisplayName: accounts[0].display_name,
        attestationType: "none",
        excludeCredentials: keys.map(key => ({
          id: key.credential_id, transports: key.transports || []
        })),
        authenticatorSelection: {
          residentKey: "required", userVerification: "required"
        }
      });

      const binding = randomBytes(32).toString("base64url");
      await database("/rest/v1/auth_challenges", {}, "POST", {
        challenge: options.challenge,
        purpose: "add_passkey",
        account_id: accountId,
        browser_binding_hash: hash(binding),
        registration_data: { passkeyName: passkeyName.trim() }
      });
      res.setHeader("Set-Cookie",
        "__Host-passkey_flow=" + binding +
        "; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=300");
      return res.status(200).json({ options });
    }

    const binding = cookie(req, "__Host-passkey_flow");
    if (!binding || !/^[A-Za-z0-9_-]{43}$/.test(binding)) {
      throw new Rejection(400, "패스키 추가 시간이 지났습니다. 다시 시도하세요.");
    }

    const credential = req.body?.credential;
    let challenge;
    try {
      const encoded = credential?.response?.clientDataJSON;
      if (typeof encoded !== "string" || encoded.length > 16000) {
        throw new Error("Invalid client data");
      }
      challenge = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")).challenge;
      if (typeof challenge !== "string" || !/^[A-Za-z0-9_-]{20,256}$/.test(challenge)) {
        throw new Error("Invalid challenge");
      }
    } catch {
      throw new Rejection(400, "패스키 등록 응답 형식이 올바르지 않습니다.");
    }

    const bindingHash = hash(binding);
    const challenges = await database("/rest/v1/auth_challenges", {
      select: "id,challenge",
      challenge: "eq." + challenge,
      purpose: "eq.add_passkey",
      account_id: "eq." + accountId,
      browser_binding_hash: "eq." + bindingHash,
      used_at: "is.null",
      expires_at: "gt." + new Date().toISOString()
    });
    if (!Array.isArray(challenges) || challenges.length !== 1) {
      throw new Rejection(400, "만료되었거나 이미 사용한 패스키 추가 요청입니다.");
    }

    const { verifyRegistrationResponse } = await import("@simplewebauthn/server");
    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge: challenges[0].challenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        requireUserVerification: true
      });
    } catch {
      throw new Rejection(400, "패스키 등록 검증에 실패했습니다.");
    }

    if (!verification.verified || !verification.registrationInfo) {
      throw new Rejection(400, "검증하지 못한 패스키입니다.");
    }

    const info = verification.registrationInfo;
    const key = info.credential;
    await database("/rest/v1/rpc/finish_add_passkey", {}, "POST", {
      p_session_hash: sessionHash,
      p_challenge_id: challenges[0].id,
      p_binding_hash: bindingHash,
      p_credential_id: key.id,
      p_public_key: Buffer.from(key.publicKey).toString("base64url"),
      p_counter: key.counter,
      p_transports: key.transports || [],
      p_device_type: info.credentialDeviceType,
      p_backed_up: info.credentialBackedUp
    });

    res.setHeader("Set-Cookie",
      "__Host-passkey_flow=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0");
    return res.status(200).json({
      verified: true,
      message: "같은 계정에 패스키를 추가했습니다."
    });
  } catch (error) {
    return res.status(error instanceof Rejection ? error.status : 503).json({
      error: error instanceof Rejection ? error.message
        : "패스키 작업을 완료하지 못했습니다. 잠시 후 다시 시도하세요."
    });
  }
};


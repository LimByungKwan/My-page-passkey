const ORIGIN = "https://my-page-passkey.vercel.app";

const PAGE = String.raw`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>로그아웃 세션 폐기 확인</title>
<style>body{background:#f6f4ed;color:#202d25;font:15px/1.8 "Malgun Gothic",system-ui,sans-serif;margin:0}main{max-width:900px;margin:40px auto;padding:0 20px}a{color:#1d4d3a}button{background:#1d4d3a;color:white;border:0;border-radius:6px;padding:14px 20px;font:inherit;cursor:pointer}button:disabled{opacity:.6}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:white;padding:20px;border:1px solid #c9cec4;border-radius:6px}#status{white-space:pre-line}</style>
</head><body><main>
<a href="/private.html">← 비공개 노트로 돌아가기</a>
<h1>로그아웃 후 이전 세션 재사용 검사</h1>
<p>이 검사를 실행하면 현재 브라우저에서 로그아웃됩니다. 서버가 동일한 세션 값을 보관한 채 자료 조회 → 로그아웃 → 이전 값으로 재조회 순서로 확인합니다.</p>
<p>실제 세션 값은 출력하지 않습니다. 기록의 [가림: 같은 세션 A]는 세 요청에서 동일한 값을 사용했다는 표시입니다.</p>
<button id="run">로그아웃과 이전 세션 거절 확인</button>
<p id="status" role="status" aria-live="polite">로그인한 상태에서 실행해 주세요.</p><pre id="result" hidden></pre>
<script>
const button = document.getElementById("run");
const status = document.getElementById("status");
const result = document.getElementById("result");
button.addEventListener("click", async () => {
  if (button.disabled) return;
  button.disabled = true;
  result.hidden = true;
  status.textContent = "서버에서 같은 세션 값의 로그아웃 전후를 확인하고 있습니다.";
  try {
    const response = await fetch("/api/test-logout", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" }, body: "{}"
    });
    const data = await response.json();
    result.textContent = JSON.stringify(data, null, 2);
    result.hidden = false;
    status.textContent = data.passed
      ? "검사 통과: 로그인 중 조회 200 / 로그아웃 200 / 이전 세션 재사용 401.\n현재 브라우저는 로그아웃됐습니다. 이 결과를 보관해 주세요."
      : (data.error || "예상과 다른 결과입니다. 아래 기록을 확인해 주세요.");
  } catch {
    status.textContent = "검사를 완료하지 못했습니다. 비공개 노트에서 로그인 상태를 확인해 주세요.";
  } finally { button.disabled = false; }
});
</script></main></body></html>`;

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(PAGE);
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "허용하지 않은 요청입니다." });
  }
  if (req.headers.origin !== ORIGIN) {
    return res.status(403).json({ error: "허용하지 않은 요청입니다." });
  }
  const entry = (req.headers.cookie || "").split(";").map(v => v.trim())
    .find(v => v.startsWith("__Host-passkey_session="));
  const token = entry?.slice("__Host-passkey_session=".length);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return res.status(401).json({ error: "비공개 노트에서 먼저 패스키로 로그인해 주세요." });
  }
  // 세 번의 요청에 같은 값을 사용합니다. 보고서에는 원문을 넣지 않습니다.
  const sessionCookie = "__Host-passkey_session=" + token;
  const masked = "[가림: 같은 세션 A]";
  const records = [];
  async function request(method, path) {
    const response = await fetch(new URL(path, ORIGIN), {
      method,
      headers: { Cookie: sessionCookie, Origin: ORIGIN },
      redirect: "error",
      signal: AbortSignal.timeout(20000)
    });
    const body = await response.json();
    records.push({
      request: { method, path, cookie: masked },
      response: { status: response.status, body }
    });
    return { response, body };
  }
  try {
    const before = await request("GET", "/api/private");
    if (before.response.status !== 200) {
      return res.status(409).json({
        passed: false,
        error: "로그인 상태가 아닙니다. 먼저 비공개 노트에서 로그인해 주세요.",
        records
      });
    }
    const logout = await request("POST", "/api/logout");
    if (logout.response.status !== 200) {
      return res.status(503).json({
        passed: false, error: "로그아웃 요청에 실패했습니다.", records
      });
    }
    const clearedCookies = logout.response.headers.getSetCookie();
    if (clearedCookies.length) res.setHeader("Set-Cookie", clearedCookies);
    const after = await request("GET", "/api/private");
    const passed = after.response.status === 401;
    return res.status(200).json({
      passed,
      checkedAt: new Date().toISOString(),
      explanation: "서버가 로그아웃 전의 동일한 세션 값을 다시 전송했습니다. 실제 값은 가렸습니다.",
      records
    });
  } catch {
    return res.status(503).json({
      passed: false,
      error: "검사를 완료하지 못했습니다. 비공개 노트에서 로그인 상태를 확인해 주세요.",
      records
    });
  }
};


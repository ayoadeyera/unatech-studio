const assert = require("node:assert/strict");

async function main() {
  const { API_BASE_URL, apiRequest, apiUrl } = await import("../client/src/api.ts");
  assert.equal(API_BASE_URL, "", "the default development API uses the Vite proxy");
  assert.equal(apiUrl("/api/health"), "/api/health");

  const originalFetch = global.fetch;
  try {
    global.fetch = async () => new Response("<!doctype html><html></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
    await assert.rejects(
      apiRequest("/api/health"),
      /returned non-JSON data.*Vite's \/api proxy/i,
      "HTML fallback responses explain the frontend/backend routing issue"
    );

    global.fetch = async () => new Response(JSON.stringify({ success: false, message: "Project not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
    await assert.rejects(apiRequest("/api/projects/missing"), /Project not found/);

    global.fetch = async () => { throw new TypeError("network unavailable"); };
    await assert.rejects(
      apiRequest("/api/health"),
      /Could not reach the UnaTech API.*Start the Express server/i
    );
  } finally {
    global.fetch = originalFetch;
  }

  console.log("API client tests passed (proxy URL, HTML fallback diagnostics, HTTP errors, connection errors).");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

const assert = require("node:assert/strict");

import("./createUuid.ts").then(({ createUuid }) => {
  const native = crypto.randomUUID;
  try {
    const normal = createUuid();
    assert.match(normal, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    crypto.randomUUID = undefined;
    const fallback = createUuid();
    assert.match(fallback, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.notEqual(fallback, normal);
    console.log("PASS: secure UUIDv4 IDs with native randomUUID and getRandomValues fallback.");
  } finally {
    crypto.randomUUID = native;
  }
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

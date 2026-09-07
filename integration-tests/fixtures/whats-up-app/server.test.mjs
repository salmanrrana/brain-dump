import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./server.mjs";

test("serves both pages and rejects unknown paths and mutations", async () => {
  const app = createApp();
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${app.address().port}`;
  try {
    const home = await fetch(base);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /id="next"/);
    const next = await fetch(`${base}/next`);
    assert.equal(next.status, 200);
    assert.match(await next.text(), />whats up</);
    assert.equal((await fetch(`${base}/missing`)).status, 404);
    assert.equal((await fetch(base, { method: "POST" })).status, 405);
  } finally {
    app.closeAllConnections();
    await new Promise((resolve) => app.close(resolve));
  }
});

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

// npm test builds first; exercise the production CLI, not the Vite dev server.
test("production HTML serves every referenced same-origin JS and CSS asset", async () => {
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const { port } = reservation.address();
  await new Promise((resolve, reject) => reservation.close((error) => error ? reject(error) : resolve()));

  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [
    fileURLToPath(new URL("../node_modules/vinext/dist/cli.js", import.meta.url)),
    "start", "--hostname", "127.0.0.1", "--port", String(port),
  ], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    env: { ...process.env, NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
    windowsHide: true,
  });
  let logs = "";
  let spawnError;
  server.on("error", (error) => { spawnError = error; });
  for (const stream of [server.stdout, server.stderr]) {
    stream.on("data", (chunk) => { logs = (logs + chunk).slice(-64000); });
  }
  const exited = once(server, "exit");
  // Avoid an unhandled rejection if spawning fails before readiness polling.
  exited.catch(() => {});
  try {
    let home;
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      assert.equal(server.exitCode, null, "production server exited before readiness");
      assert.equal(server.signalCode, null, "production server was terminated before readiness");
      try {
        home = await fetch(origin, { redirect: "manual", signal: AbortSignal.timeout(3000) });
        break;
      } catch {
        await delay(200);
      }
    }
    assert.ok(home, "production server did not become ready in 60 seconds");
    assert.equal(home.status, 200, "homepage HTTP status");
    const html = await home.text();
    const assets = new Set();
    for (const tag of html.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
      const attribute = /\b(?:src|href)\s*=\s*(["'])(.*?)\1/i.exec(tag[0]);
      if (!attribute) continue;
      const url = new URL(attribute[2].replaceAll("&amp;", "&"), origin);
      if (url.origin === origin && /\.(?:m?js|css)$/i.test(url.pathname)) assets.add(url.href);
    }
    assert.ok([...assets].some((url) => /\.m?js$/i.test(new URL(url).pathname)), "HTML must reference production JS");
    assert.ok([...assets].some((url) => /\.css$/i.test(new URL(url).pathname)), "HTML must reference production CSS");
    for (const url of assets) {
      const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10000) });
      assert.equal(response.status, 200, `asset HTTP status: ${url}`);
      assert.ok((await response.arrayBuffer()).byteLength > 0, `empty asset: ${url}`);
      const type = response.headers.get("content-type") ?? "";
      assert.match(type, new URL(url).pathname.endsWith(".css") ? /text\/css/i : /javascript/i,
        `asset must not be an HTML fallback: ${url}`);
      console.log(`production asset 200: ${new URL(url).pathname}`);
    }
  } catch (error) {
    console.error(`Production server logs:\n${logs || "(no output)"}`);
    throw error;
  } finally {
    if (server.pid) {
      if (process.platform === "win32") {
        // Kill the whole tree: killing an npm/cmd wrapper alone leaves Node alive.
        const killer = spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], { windowsHide: true });
        await once(killer, "close");
      } else {
        try { process.kill(-server.pid, "SIGKILL"); } catch (error) {
          if (error.code !== "ESRCH") throw error;
        }
      }
      await exited;
    }
  }
});

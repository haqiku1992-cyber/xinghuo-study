import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const packaged = process.argv[2];
const executable = packaged ? path.resolve(packaged) : createRequire(import.meta.url)("electron");
const directory = await mkdtemp(path.join(os.tmpdir(), "xinghuo-study-smoke-"));
try {
  for (const phase of ["write", "read"]) {
    await new Promise((resolve, reject) => {
      const child = spawn(executable, [...(packaged ? [] : ["desktop/main.mjs"]), "--desktop-smoke"], {
        env: { ...process.env, XINGHUO_SMOKE_DIR: directory, XINGHUO_SMOKE_PHASE: phase }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
      });
      let logs = "";
      child.stdout.on("data", data => { logs += data; }); child.stderr.on("data", data => { logs += data; });
      const timer = setTimeout(() => {
        if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
        else child.kill("SIGKILL");
      }, 90000);
      child.on("error", error => { clearTimeout(timer); reject(error); });
      child.on("close", code => { clearTimeout(timer); if (code === 0) resolve(); else reject(new Error(`Electron smoke ${phase} exit ${code}\n${logs}`)); });
    });
    const result = JSON.parse(await readFile(path.join(directory, `${phase}.json`), "utf8"));
    assert.equal(result.ok, true);
    assert.equal(result.networkAttempts.length, 0);
    console.log(`${packaged ? "Packaged" : "Development"} Electron ${phase}: PASS (${result.questions} questions; isolated persistent storage; no sync/SW/network requests)`);
  }
} catch (error) {
  console.error(await readFile(path.join(directory, "diagnostic.log"), "utf8").catch(() => "No main-process log"));
  throw error;
} finally {
  // Only this test-created directory, never the application's real userData.
  assert.equal(path.dirname(directory), os.tmpdir());
  assert.ok(path.basename(directory).startsWith("xinghuo-study-smoke-"));
  await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
}

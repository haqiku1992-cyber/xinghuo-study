import { timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dataPath = process.env.SYNC_DATA_PATH || "/data/study-data.json";
const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Content-Type": "application/json; charset=utf-8",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: noStoreHeaders });
}

function authorized(request: Request) {
  const expected = process.env.SYNC_PASSWORD;
  const supplied = request.headers.get("x-sync-password") || "";
  if (!expected || !supplied) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

async function readCloudData() {
  try {
    const raw = await readFile(dataPath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function GET(request: Request) {
  if (!process.env.SYNC_PASSWORD) return json({ error: "同步服务尚未配置" }, 503);
  if (!authorized(request)) return json({ error: "同步密码不正确" }, 401);
  try {
    return json({ data: await readCloudData() });
  } catch {
    return json({ error: "读取同步数据失败" }, 500);
  }
}

export async function PUT(request: Request) {
  if (!process.env.SYNC_PASSWORD) return json({ error: "同步服务尚未配置" }, 503);
  if (!authorized(request)) return json({ error: "同步密码不正确" }, 401);

  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || !body.data || typeof body.data !== "object") {
      return json({ error: "同步数据格式无效" }, 400);
    }
    const payload = JSON.stringify({
      version: 1,
      updatedAt: Date.now(),
      data: body.data,
    });
    if (Buffer.byteLength(payload) > 1024 * 1024) return json({ error: "同步数据过大" }, 413);

    await mkdir(path.dirname(dataPath), { recursive: true });
    const temporaryPath = `${dataPath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporaryPath, payload, { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, dataPath);
    return json({ ok: true, updatedAt: Date.now() });
  } catch {
    return json({ error: "写入同步数据失败" }, 500);
  }
}

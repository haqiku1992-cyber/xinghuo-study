import { app, BrowserWindow, dialog, Menu, protocol, session, shell } from "electron";
import path from "node:path";
import os from "node:os";
import { mkdirSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { APP_ORIGIN, isAppURL, isExternalURL, serveApp } from "./protocol.mjs";

protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
app.setName("学习记录");
app.setAppUserModelId("io.github.haqiku1992.xinghuostudy");
for (const flag of ["disable-background-networking", "disable-component-update", "disable-domain-reliability", "no-pings"]) app.commandLine.appendSwitch(flag);

const smoke = process.argv.includes("--desktop-smoke");
const smokeDir = process.env.XINGHUO_SMOKE_DIR;
if (smoke && (!smokeDir || !path.isAbsolute(smokeDir) || path.dirname(smokeDir) !== os.tmpdir() || !path.basename(smokeDir).startsWith("xinghuo-study-smoke-"))) throw new Error("Smoke tests require an isolated temporary directory");
const userData = smoke ? path.join(smokeDir, "user-data") : path.join(process.env.LOCALAPPDATA ?? app.getPath("appData"), "XinghuoStudy");
mkdirSync(userData, { recursive: true });
app.setPath("userData", userData);
app.setPath("sessionData", userData);
const directory = fileURLToPath(new URL("../desktop-dist/", import.meta.url));
const logSmoke = (message) => { if (smoke) appendFileSync(path.join(smokeDir, "diagnostic.log"), `${message}\n`); };
logSmoke("main started");
let window;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { window?.restore(); window?.focus(); });
  app.on("window-all-closed", () => app.quit());
  app.whenReady().then(async () => {
    logSmoke("app ready");
    Menu.setApplicationMenu(null);
    const requests = [];
    session.defaultSession.setSpellCheckerEnabled(false);
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      if (smoke) requests.push(details.url);
      const allowed = (isAppURL(details.url) && !new URL(details.url).pathname.startsWith("/api/") && !new URL(details.url).pathname.endsWith("/sw.js")) || details.url.startsWith("blob:app://study/");
      callback({ cancel: !allowed });
    });
    let resourceErrorShown = false;
    protocol.handle("app", async (request) => {
      const response = await serveApp(request, directory);
      if (!smoke && response.status >= 400 && !resourceErrorShown) {
        resourceErrorShown = true;
        dialog.showErrorBox("本地资源载入失败", `无法读取 ${new URL(request.url).pathname}。请重新启动或安装应用；学习数据不会被清除。`);
      }
      return response;
    });
    window = new BrowserWindow({
      title: "学习记录", width: 920, height: 860, minWidth: 400, minHeight: 600,
      show: !smoke, backgroundColor: "#f8f8f6", icon: fileURLToPath(new URL("./icon.ico", import.meta.url)),
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, spellcheck: false, devTools: !app.isPackaged },
    });
    logSmoke("window created");
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    if (smoke) window.webContents.on("console-message", (event) => logSmoke(`renderer: ${event.message}`));
    window.webContents.on("will-navigate", (event, url) => { if (!isAppURL(url)) event.preventDefault(); });
    window.webContents.on("will-attach-webview", (event) => event.preventDefault());
    // External links require an explicit native context-menu click, never automatic navigation.
    window.webContents.on("context-menu", (_event, params) => {
      if (isExternalURL(params.linkURL)) Menu.buildFromTemplate([{ label: "在系统浏览器打开来源链接", click: () => { void shell.openExternal(params.linkURL); } }]).popup({ window });
    });
    session.defaultSession.on("will-download", (event, item, contents) => {
      if (contents !== window.webContents || !item.getURL().startsWith("blob:app://study/") || !item.getFilename().endsWith(".json")) { event.preventDefault(); return; }
      if (smoke) item.setSavePath(path.join(smokeDir, "export.json"));
      else item.setSaveDialogOptions({ title: "导出学习数据", defaultPath: path.join(app.getPath("documents"), item.getFilename()), filters: [{ name: "学习数据 JSON", extensions: ["json"] }] });
    });
    window.webContents.on("did-fail-load", (_event, code, description) => {
      if (smoke) return;
      dialog.showErrorBox("学习记录载入失败", `请重新启动或安装应用，学习数据不会被清除。\n${code}: ${description}`);
    });
    if (smoke) {
      await window.loadURL("about:blank");
      logSmoke("blank loaded");
      const { prepareSmoke } = await import("./smoke.mjs");
      await prepareSmoke(window);
      logSmoke("probe prepared");
    }
    await window.loadURL(`${APP_ORIGIN}/`);
    logSmoke("page loaded");
    if (smoke) {
      const { runSmoke } = await import("./smoke.mjs");
      try { await runSmoke(window, smokeDir, requests, userData); app.exit(0); }
      catch (error) { logSmoke(error.stack); console.error(error); app.exit(1); }
    }
  }).catch((error) => { logSmoke(error.stack); console.error(error); app.exit(1); });
}

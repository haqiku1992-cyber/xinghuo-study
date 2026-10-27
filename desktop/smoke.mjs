import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

// Fixed internal acceptance checks, enabled only by the explicit smoke flag.
// No test interface or filesystem capability is exposed to the renderer.
export async function prepareSmoke(window) {
  window.webContents.debugger.attach("1.3");
  await window.webContents.debugger.sendCommand("Page.enable");
  await window.webContents.debugger.sendCommand("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.__desktopProbe = { secretReads: 0, serviceWorkers: 0 };
    localStorage.setItem('xinghuo-sync-secret-v1', 'test-stale-secret');
    const get = Storage.prototype.getItem;
    Storage.prototype.getItem = function(key) {
      if (key === 'xinghuo-sync-secret-v1') window.__desktopProbe.secretReads++;
      return get.call(this, key);
    };
    if (navigator.serviceWorker) navigator.serviceWorker.register = () => {
      window.__desktopProbe.serviceWorkers++; throw new Error('Desktop must not register SW');
    };
  ` });
}

export async function runSmoke(window, directory, requests, userData) {
  const execute = (fn, ...args) => window.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
  const wait = async (fn) => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) { if (await execute(fn)) return; await delay(100); }
    throw new Error(`UI condition timed out: ${fn}`);
  };
  const click = async (selector) => {
    assert.equal(await execute((selector) => { const element = document.querySelector(selector); if (!element || element.disabled) return false; element.click(); return true; }, selector), true, selector);
    await delay(120);
  };
  const clickText = async (text) => {
    assert.equal(await execute(text => { const b = [...document.querySelectorAll("button")].find(b => b.textContent.trim() === text); if (!b || b.disabled) return false; b.click(); return true; }, text), true, text);
    await delay(120);
  };
  const store = () => execute(() => JSON.parse(localStorage.getItem("xinghuo-study-v1")));
  const restore = async (text, confirm) => {
    await execute((text, confirm) => {
      window.confirm = () => confirm;
      const input = document.querySelector('input[type="file"]');
      const files = new DataTransfer(); files.items.add(new File([text], "pwa-backup.json", { type: "application/json" }));
      input.files = files.files; input.dispatchEvent(new Event("change", { bubbles: true }));
    }, text, confirm);
    await delay(300);
  };
  await wait(() => document.body.innerText.includes("当前题库 343/"));
  const questions = await execute(async () => (await fetch("/questions.json")).json());
  assert.equal(questions.length, 343);
  assert.equal(await execute(() => typeof window.require), "undefined");
  assert.equal(await execute(() => typeof window.process), "undefined");
  assert.equal(window.webContents.getLastWebPreferences().sandbox, true);
  assert.equal(path.dirname(userData), directory);

  if (process.env.XINGHUO_SMOKE_PHASE === "write") {
    assert.deepEqual(await store(), { session: null, wrong: {}, progress: {}, history: [], theme: "light" });
    await click(".theme-button");
    assert.equal((await store()).theme, "dark");
    await click(".type-grid button"); await click(".topic-picker-list button");
    await wait(() => !!document.querySelector(".options button"));
    const current = await store();
    const id = current.session.questionIds[0];
    const question = questions.find(q => q.id === id);
    const correct = current.session.optionOrders[id].indexOf(question.answer.charCodeAt(0) - 65);
    await click(`.options button:nth-child(${(correct + 1) % question.options.length + 1})`);
    await clickText("提交答案");
    assert.equal((await store()).progress[id].attempts, 1);
    assert.equal((await store()).wrong[id].count, 1);
    await clickText("交卷");
    assert.equal((await store()).history.length, 1);
    await click(".report-shell .secondary-button");
    assert.ok(await execute(() => !!document.querySelector(".quiz-footer")));
    await clickText("结束复盘"); await clickText("返回首页");
    await click(".type-grid button"); await click(".topic-picker-list button");
    await click(".quiz-top .icon-button");
    await click(".bottom-nav button:last-child");
    assert.ok(await execute(() => !document.querySelector('input[type="password"]') && !document.body.innerText.includes("安装到手机") && document.body.innerText.includes("学习记录只保存在这台电脑")));
    const expected = await store();
    await click(".setting-list button:first-child");
    let exported;
    for (let retry = 0; retry < 50; retry++) {
      try { exported = await readFile(path.join(directory, "export.json"), "utf8"); break; } catch { await delay(100); }
    }
    assert.deepEqual(JSON.parse(exported), expected);
    assert.ok(!exported.includes("test-stale-secret"));
    await restore('{"history":{}}', true); assert.deepEqual(await store(), expected);
    await restore(JSON.stringify({ ...expected, theme: "light" }), false); assert.deepEqual(await store(), expected);
    await restore(JSON.stringify({ ...expected, theme: "light" }), true); assert.equal((await store()).theme, "light");
    await restore(exported, true); assert.deepEqual(await store(), expected);
    await writeFile(path.join(directory, "expected.json"), JSON.stringify(expected));
  } else {
    const expected = JSON.parse(await readFile(path.join(directory, "expected.json"), "utf8"));
    assert.deepEqual(await store(), expected, "record survives a full process restart");
    await click(".continue-card");
    assert.ok(await execute(() => !!document.querySelector(".question-card h1")));
  }
  const probe = await execute(() => window.__desktopProbe);
  assert.deepEqual(probe, { secretReads: 0, serviceWorkers: 0 });
  const networkAttempts = requests.filter(url => !url.startsWith("app://study/") && !url.startsWith("blob:app://study/"));
  assert.deepEqual(networkAttempts, []);
  assert.equal(requests.some(url => /\/api\/sync|\/sw\.js/.test(url)), false);
  assert.equal(process._getActiveHandles().some(handle => handle.constructor.name === "Server"), false);
  await window.webContents.session.flushStorageData();
  await writeFile(path.join(directory, `${process.env.XINGHUO_SMOKE_PHASE}.json`), JSON.stringify({ ok: true, questions: questions.length, networkAttempts, userData }));
  window.webContents.debugger.detach();
}

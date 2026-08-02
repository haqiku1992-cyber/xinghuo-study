"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildStudyPlan, formatDuration, getNextReviewAt, isReviewDue, MASTERY_STREAK, pickPracticeQuestions, recordAttempt, STUDY_TARGET, type ProgressMap } from "./study-progress";

type QuestionType = "single" | "judge" | "short" | "essay";
type Tab = "home" | "practice" | "wrong" | "stats" | "settings";
type Rating = "mastered" | "fuzzy" | "unknown";
type Answer = { value: string; submitted?: boolean; correct?: boolean; rating?: Rating };
type Question = {
  id: string;
  type: QuestionType;
  question: string;
  options?: string[];
  answer?: string;
  explanation?: string;
  reference_answer?: string;
  key_points?: string[];
  source: string;
  tags: string[];
  updated_at: string;
};
type Session = {
  id: string;
  type: QuestionType;
  questionIds: string[];
  index: number;
  answers: Record<string, Answer>;
  startedAt: number;
  wrongOnly?: boolean;
  reviewIds?: string[];
};
type WrongRecord = { count: number; lastWrong: number; streak: number; keep?: boolean };
type HistoryItem = { id: string; type: QuestionType; at: number; durationMs: number; count: number; correct: number; ratings: Record<Rating, number> };
type Store = { session: Session | null; wrong: Record<string, WrongRecord>; progress: ProgressMap; history: HistoryItem[]; theme: "light" | "dark" };
type SyncStatus = "disconnected" | "connecting" | "synced" | "pending" | "error";

const STORAGE_KEY = "xinghuo-study-v1";
const SYNC_KEY = "xinghuo-sync-secret-v1";
const examDate = new Date("2027-06-01T00:00:00+08:00");
const typeMeta: Record<QuestionType, { name: string; short: string; icon: string; tone: string }> = {
  single: { name: "单项选择题", short: "单选", icon: "A", tone: "amber" },
  judge: { name: "判断题", short: "判断", icon: "✓", tone: "green" },
  short: { name: "简答题", short: "简答", icon: "简", tone: "blue" },
  essay: { name: "论述题", short: "论述", icon: "论", tone: "rose" },
};
const emptyStore: Store = { session: null, wrong: {}, progress: {}, history: [], theme: "light" };

function mergeStores(local: Store, cloudValue: unknown): Store {
  if (!cloudValue || typeof cloudValue !== "object") return local;
  const cloud = { ...emptyStore, ...(cloudValue as Partial<Store>) };
  const history = new Map<string, HistoryItem>();
  for (const item of [...cloud.history, ...local.history]) {
    if (item?.id) history.set(item.id, item);
  }
  const wrong: Record<string, WrongRecord> = { ...cloud.wrong };
  for (const [id, record] of Object.entries(local.wrong)) {
    const remote = wrong[id];
    if (!remote || record.lastWrong >= remote.lastWrong) wrong[id] = record;
  }
  const progress: ProgressMap = { ...cloud.progress };
  for (const [id, record] of Object.entries(local.progress)) {
    const remote = progress[id];
    if (!remote || record.lastAttempt >= remote.lastAttempt) progress[id] = record;
  }
  const session = !cloud.session || (local.session && local.session.startedAt >= cloud.session.startedAt)
    ? local.session
    : cloud.session;
  return {
    session,
    wrong,
    progress,
    history: [...history.values()].sort((a, b) => a.at - b.at),
    theme: local.theme,
  };
}

function sameDay(a: number, b = Date.now()) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

export default function Home() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [store, setStore] = useState<Store>(emptyStore);
  const [tab, setTab] = useState<Tab>("home");
  const [screen, setScreen] = useState<"main" | "quiz" | "report">("main");
  const [ready, setReady] = useState(false);
  const [report, setReport] = useState<HistoryItem | null>(null);
  const [notice, setNotice] = useState("");
  const [syncSecret, setSyncSecret] = useState("");
  const [syncInput, setSyncInput] = useState("");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("disconnected");
  const [lastSyncAt, setLastSyncAt] = useState(0);
  const [syncReady, setSyncReady] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const storeRef = useRef(store);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  storeRef.current = store;

  useEffect(() => {
    fetch("/questions.json").then((r) => {
      if (!r.ok) throw new Error("题库载入失败");
      return r.json();
    }).then(setQuestions).catch(() => setNotice("题库暂时无法载入，请联网后重试"));
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setStore({ ...emptyStore, ...JSON.parse(raw) });
      const savedSecret = localStorage.getItem(SYNC_KEY);
      if (savedSecret) {
        setSyncSecret(savedSecret);
        setSyncInput(savedSecret);
      }
    } catch {}
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !syncSecret || syncReady) return;
    void connectSync(syncSecret, false);
  }, [ready, syncSecret, syncReady]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    document.documentElement.dataset.theme = store.theme;
  }, [store, ready]);

  useEffect(() => {
    if (!ready || !syncReady || !syncSecret) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    setSyncStatus("pending");
    syncTimer.current = setTimeout(async () => {
      try {
        const response = await fetch("/api/sync", {
          method: "PUT",
          headers: { "Content-Type": "application/json", "x-sync-password": syncSecret },
          body: JSON.stringify({ data: storeRef.current }),
        });
        if (!response.ok) throw new Error("同步失败");
        setSyncStatus("synced");
        setLastSyncAt(Date.now());
      } catch {
        setSyncStatus("error");
      }
    }, 900);
    return () => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
    };
  }, [store, ready, syncReady, syncSecret]);

  useEffect(() => {
    if (!ready || !syncReady || !syncSecret) return;
    let pulling = false;
    const refresh = async () => {
      if (pulling || document.visibilityState !== "visible") return;
      pulling = true;
      await pullCloud(true);
      pulling = false;
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const interval = window.setInterval(() => void refresh(), 30000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ready, syncReady, syncSecret]);

  useEffect(() => {
    if (!questions.length || !store.session) return;
    const available = new Set(questions.map((q) => q.id));
    if (store.session.questionIds.some((id) => !available.has(id))) {
      setStore((s) => ({ ...s, session: null }));
    }
  }, [questions, store.session]);

  const daysLeft = Math.max(0, Math.ceil((examDate.getTime() - Date.now()) / 86400000));
  const questionMap = useMemo(() => Object.fromEntries(questions.map((q) => [q.id, q])), [questions]);
  const active = store.session;
  const current = active ? questionMap[active.questionIds[active.index]] : undefined;
  const currentAnswer = current && active ? active.answers[current.id] ?? { value: "" } : { value: "" };
  const currentProgress = current ? store.progress[current.id] : undefined;
  const currentNextReviewAt = currentProgress ? getNextReviewAt(currentProgress) : undefined;
  const todayCount = store.history.filter((h) => sameDay(h.at)).reduce((sum, h) => sum + h.count, 0);
  const totalCount = store.history.reduce((sum, h) => sum + h.count, 0);
  const wrongCount = Object.keys(store.wrong).length;
  const studyPlan = buildStudyPlan(store.progress, daysLeft);
  const todayRemaining = Math.max(0, studyPlan.dailyTarget - todayCount);

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2200);
  }

  async function connectSync(secretValue = syncInput, remember = true) {
    const secret = secretValue.trim();
    if (!secret) return flash("请输入同步密码");
    setSyncStatus("connecting");
    try {
      const response = await fetch("/api/sync", {
        headers: { "x-sync-password": secret },
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "连接失败");
      const cloudStore = result.data?.data;
      const merged = mergeStores(storeRef.current, cloudStore);
      setStore(merged);
      setSyncSecret(secret);
      setSyncInput(secret);
      setSyncReady(true);
      setSyncStatus("synced");
      setLastSyncAt(Date.now());
      if (remember) localStorage.setItem(SYNC_KEY, secret);
      if (!result.data) flash("同步已连接，正在创建首份云端记录");
      else flash("云端学习记录已合并");
    } catch (error) {
      setSyncReady(false);
      setSyncStatus("error");
      if (!remember) {
        localStorage.removeItem(SYNC_KEY);
        setSyncSecret("");
        setSyncInput("");
      }
      flash(error instanceof Error ? error.message : "同步连接失败");
    }
  }

  async function pullCloud(quiet = false) {
    if (!syncSecret) return;
    if (!quiet) setSyncStatus("connecting");
    try {
      const response = await fetch("/api/sync", {
        headers: { "x-sync-password": syncSecret },
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "同步失败");
      const merged = mergeStores(storeRef.current, result.data?.data);
      if (JSON.stringify(merged) !== JSON.stringify(storeRef.current)) setStore(merged);
      setSyncStatus("synced");
      setLastSyncAt(Date.now());
      if (!quiet) flash("学习记录已同步");
    } catch (error) {
      setSyncStatus("error");
      if (!quiet) flash(error instanceof Error ? error.message : "同步失败");
    }
  }

  async function syncNow() {
    await pullCloud(false);
  }

  function disconnectSync() {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    localStorage.removeItem(SYNC_KEY);
    setSyncSecret("");
    setSyncInput("");
    setSyncReady(false);
    setSyncStatus("disconnected");
    flash("已断开云同步，本地记录仍然保留");
  }

  function startPractice(type: QuestionType, wrongOnly = false) {
    const pool = questions.filter((q) => q.type === type && (!wrongOnly || store.wrong[q.id]));
    if (!pool.length) return flash(wrongOnly ? "这一题型暂时没有错题" : "演示题库正在载入");
    const now = Date.now();
    const picked = pickPracticeQuestions(pool, store.progress, { includeMastered: wrongOnly, now });
    if (!picked.length) return flash("这一题型的题目已经全部学会");
    const reviewIds = wrongOnly ? [] : picked.filter((question) => isReviewDue(store.progress[question.id], now)).map((question) => question.id);
    setStore((s) => ({
      ...s,
      session: { id: crypto.randomUUID(), type, questionIds: picked.map((q) => q.id), index: 0, answers: {}, startedAt: now, wrongOnly, reviewIds },
    }));
    setScreen("quiz");
    if (picked.length < 15) flash(`当前题库仅有 ${picked.length} 题，本轮使用全部题目`);
  }

  function updateAnswer(patch: Partial<Answer>) {
    if (!active || !current) return;
    setStore((s) => s.session ? ({
      ...s,
      session: { ...s.session, answers: { ...s.session.answers, [current.id]: { ...currentAnswer, ...patch } } },
    }) : s);
  }

  function submitObjective() {
    if (!current || !currentAnswer.value) return flash("请先选择答案");
    const correct = currentAnswer.value === current.answer;
    const now = Date.now();
    setStore((s) => {
      const wrong = { ...s.wrong };
      const progress = { ...s.progress, [current.id]: recordAttempt(s.progress[current.id], correct, now) };
      if (!correct) {
        const old = wrong[current.id] ?? { count: 0, lastWrong: now, streak: 0 };
        wrong[current.id] = { ...old, count: old.count + 1, lastWrong: now, streak: 0 };
      } else if (wrong[current.id]) {
        const nextStreak = wrong[current.id].streak + 1;
        if (nextStreak >= 2 && !wrong[current.id].keep) delete wrong[current.id];
        else wrong[current.id] = { ...wrong[current.id], streak: nextStreak };
      }
      return s.session ? {
        ...s, wrong, progress,
        session: { ...s.session, answers: { ...s.session.answers, [current.id]: { ...currentAnswer, submitted: true, correct } } },
      } : s;
    });
  }

  function rateSubjective(rating: Rating) {
    if (!current) return;
    const now = Date.now();
    setStore((s) => {
      const wrong = { ...s.wrong };
      const progress = { ...s.progress, [current.id]: recordAttempt(s.progress[current.id], rating === "mastered", now) };
      if (rating !== "mastered") {
        const old = wrong[current.id] ?? { count: 0, lastWrong: now, streak: 0 };
        wrong[current.id] = { ...old, count: old.count + 1, lastWrong: now, streak: 0 };
      } else if (wrong[current.id]) {
        const nextStreak = wrong[current.id].streak + 1;
        if (nextStreak >= 2 && !wrong[current.id].keep) delete wrong[current.id];
        else wrong[current.id] = { ...wrong[current.id], streak: nextStreak };
      }
      return s.session ? {
        ...s, wrong, progress,
        session: { ...s.session, answers: { ...s.session.answers, [current.id]: { ...currentAnswer, submitted: true, rating } } },
      } : s;
    });
  }

  function move(delta: number) {
    setStore((s) => s.session ? ({ ...s, session: { ...s.session, index: Math.max(0, Math.min(s.session.questionIds.length - 1, s.session.index + delta)) } }) : s);
  }

  function finish() {
    if (!active) return;
    const isObjective = active.type === "single" || active.type === "judge";
    const answers = Object.values(active.answers).filter((a) => a.submitted);
    const finishedAt = Date.now();
    const item: HistoryItem = {
      id: active.id, type: active.type, at: finishedAt, durationMs: Math.max(0, finishedAt - active.startedAt), count: answers.length,
      correct: isObjective ? answers.filter((a) => a.correct).length : 0,
      ratings: {
        mastered: answers.filter((a) => a.rating === "mastered").length,
        fuzzy: answers.filter((a) => a.rating === "fuzzy").length,
        unknown: answers.filter((a) => a.rating === "unknown").length,
      },
    };
    setStore((s) => ({ ...s, session: null, history: [...s.history, item] }));
    setReport(item);
    setScreen("report");
  }

  function goMain(nextTab: Tab = "home") {
    setScreen("main");
    setTab(nextTab);
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `星火学习数据-${new Date().toISOString().slice(0, 10)}.json`; link.click();
    URL.revokeObjectURL(url);
  }

  function importData(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { setStore({ ...emptyStore, ...JSON.parse(String(reader.result)) }); flash("学习数据已恢复"); }
      catch { flash("文件格式无法识别"); }
    };
    reader.readAsText(file);
  }

  if (!ready) return null;

  if (screen === "quiz" && active && current) {
    const submitted = currentAnswer.submitted;
    const subjective = current.type === "short" || current.type === "essay";
    return (
      <main className="app-shell quiz-shell">
        {notice && <div className="toast">{notice}</div>}
        <header className="quiz-top">
          <button className="icon-button" onClick={() => goMain("practice")} aria-label="返回">‹</button>
          <div className="quiz-title"><strong>{typeMeta[current.type].name}</strong><span>{active.wrongOnly ? "错题复习" : "日常练习"}</span></div>
          <button className="plain-button" onClick={finish}>交卷</button>
        </header>
        <div className="progress-row">
          <span>第 <strong>{active.index + 1}</strong> / {active.questionIds.length} 题</span>
          <span>{Object.values(active.answers).filter((a) => a.submitted).length} 题已完成</span>
        </div>
        <div className="progress-track"><i style={{ width: `${((active.index + 1) / active.questionIds.length) * 100}%` }} /></div>

        <article className="question-card">
          <div className="question-tags"><span>{typeMeta[current.type].short}</span>{active.reviewIds?.includes(current.id) && <span>到期复习</span>}{current.tags.map((t) => <em key={t}>{t}</em>)}</div>
          <h1>{current.question}</h1>
          {current.type === "single" && (
            <div className="options">
              {current.options?.map((option, i) => {
                const letter = String.fromCharCode(65 + i);
                const cls = submitted ? (letter === current.answer ? "correct" : currentAnswer.value === letter ? "wrong-answer" : "") : currentAnswer.value === letter ? "selected" : "";
                return <button key={option} className={cls} disabled={submitted} onClick={() => updateAnswer({ value: letter })}><b>{letter}</b><span>{option}</span></button>;
              })}
            </div>
          )}
          {current.type === "judge" && (
            <div className="judge-grid">
              {[["正确", "T", "✓"], ["错误", "F", "×"]].map(([label, value, icon]) => (
                <button key={value} disabled={submitted} className={submitted ? (value === current.answer ? "correct" : currentAnswer.value === value ? "wrong-answer" : "") : currentAnswer.value === value ? "selected" : ""} onClick={() => updateAnswer({ value })}><b>{icon}</b>{label}</button>
              ))}
            </div>
          )}
          {subjective && (
            <textarea
              className={current.type === "essay" ? "essay-input" : ""}
              placeholder={current.type === "essay" ? "按“观点—依据—结合实际—总结”的思路写下你的回答…" : "先写下你的答案，再查看参考内容…"}
              value={currentAnswer.value}
              disabled={submitted}
              onChange={(e) => updateAnswer({ value: e.target.value })}
            />
          )}
          {!submitted && (
            <button className="primary-button" onClick={subjective ? () => updateAnswer({ submitted: true }) : submitObjective}>
              {subjective ? "查看参考答案" : "提交答案"}
            </button>
          )}
        </article>

        {submitted && (
          <section className="answer-panel">
            {!subjective && <div className={`answer-result ${currentAnswer.correct ? "ok" : "bad"}`}><b>{currentAnswer.correct ? "回答正确" : "再想一想"}</b><span>正确答案：{current.answer === "T" ? "正确" : current.answer === "F" ? "错误" : current.answer}</span></div>}
            {(!subjective || currentAnswer.rating) && (
              <div className={`mastery-progress ${currentProgress?.masteredAt ? "done" : ""}`}>
                <b>{currentProgress?.masteredAt ? "已学会" : `掌握进度 ${currentProgress?.correctStreak ?? 0}/${MASTERY_STREAK}`}</b>
                <span>{currentProgress?.masteredAt && currentNextReviewAt ? `下次复习 ${new Date(currentNextReviewAt).toLocaleDateString("zh-CN")}` : `连续答对 ${MASTERY_STREAK} 次后进入已学会`}</span>
              </div>
            )}
            <div className="reference">
              <span className="eyebrow">{subjective ? "参考答案" : "答案解析"}</span>
              <p>{subjective ? current.reference_answer : current.explanation}</p>
              {current.key_points && <><span className="eyebrow">得分要点</span><ul>{current.key_points.map((p) => <li key={p}>{p}</li>)}</ul></>}
              <small>来源：{current.source}</small>
            </div>
            {subjective && !currentAnswer.rating && (
              <div className="rating">
                <p>对照后，你觉得掌握得怎么样？</p>
                <div><button onClick={() => rateSubjective("mastered")}>掌握</button><button onClick={() => rateSubjective("fuzzy")}>模糊</button><button onClick={() => rateSubjective("unknown")}>不会</button></div>
              </div>
            )}
            {subjective && currentAnswer.rating && <div className="saved-rating">已记录：{{ mastered: "掌握", fuzzy: "模糊", unknown: "不会" }[currentAnswer.rating]}</div>}
          </section>
        )}
        <footer className="quiz-footer">
          <button disabled={active.index === 0} onClick={() => move(-1)}>上一题</button>
          <button className="next-button" disabled={active.index === active.questionIds.length - 1} onClick={() => move(1)}>下一题</button>
        </footer>
      </main>
    );
  }

  if (screen === "report" && report) {
    const objective = report.type === "single" || report.type === "judge";
    return (
      <main className="app-shell report-shell">
        <div className="report-mark">✓</div>
        <span className="eyebrow">本轮完成</span>
        <h1>稳稳地又向前一步</h1>
        <p>复习重在持续，不必追求一次全对。</p>
        <div className="report-card">
          <div><strong>{report.count}</strong><span>完成题数</span></div>
          {objective ? <><div><strong>{report.correct}</strong><span>正确</span></div><div><strong>{report.count - report.correct}</strong><span>错误</span></div><div><strong>{report.count ? Math.round(report.correct / report.count * 100) : 0}%</strong><span>正确率</span></div></> :
            <><div><strong>{report.ratings.mastered}</strong><span>掌握</span></div><div><strong>{report.ratings.fuzzy}</strong><span>模糊</span></div><div><strong>{report.ratings.unknown}</strong><span>不会</span></div></>}
        </div>
        <div className="report-note">用时 {formatDuration(report.durationMs)} · 错题会进入复习区</div>
        <button className="primary-button" onClick={() => startPractice(report.type)}>再练一轮</button>
        <button className="secondary-button" onClick={() => goMain("home")}>返回首页</button>
      </main>
    );
  }

  return (
    <main className="app-shell">
      {notice && <div className="toast">{notice}</div>}
      <div className={`page-content${tab === "wrong" ? " wrong-page-content" : ""}`}>
        {tab === "home" && (
          <>
            <header className="home-header"><button className="icon-button theme-button" onClick={() => setStore((s) => ({ ...s, theme: s.theme === "light" ? "dark" : "light" }))}>{store.theme === "light" ? "☾" : "☀"}</button></header>
            <section className="hero-card">
              <span className="eyebrow">考试倒计时 · 2027年6月1日</span>
              <div className="countdown"><strong>{daysLeft}</strong><span>天</span></div>
              <p>距离考试还有 {daysLeft} 天</p>
              <div className="hero-line" />
              <div className="today-row"><span>今日学习</span><strong>{todayCount}<small> 题</small></strong><em>{todayCount ? "保持节奏，很棒" : "今天也开始一点点"}</em></div>
            </section>
            <SectionTitle title="今日计划" side={`目标 ${STUDY_TARGET} 题`} />
            <section className="study-plan-card">
              <div className="study-plan-main"><span><small>今日还需</small><strong>{todayRemaining}<em> 题</em></strong></span><span><small>每日新题</small><b>{studyPlan.dailyNewTarget} 题</b></span><span><small>到期复习</small><b>{studyPlan.dueReviewCount} 题</b></span></div>
              <div className="study-plan-track"><i style={{ width: `${Math.min(100, studyPlan.masteredCount / STUDY_TARGET * 100)}%` }} /></div>
              <div className="study-plan-meta"><span>已掌握 {studyPlan.masteredCount}/{STUDY_TARGET}</span><span>距考试 {daysLeft} 天</span></div>
              <p>今日建议共 {studyPlan.dailyTarget} 题；当前题库 {questions.length}/{STUDY_TARGET}{questions.length < STUDY_TARGET ? `，还需补充 ${STUDY_TARGET - questions.length} 题` : ""}。</p>
            </section>
            <SectionTitle title="选择题型" side="每轮最多 15 题" />
            <div className="type-grid">
              {(Object.keys(typeMeta) as QuestionType[]).map((type) => (
                <button className={`type-card ${typeMeta[type].tone}`} key={type} onClick={() => startPractice(type)}>
                  <i>{typeMeta[type].icon}</i><span><strong>{typeMeta[type].name}</strong><small>{questions.filter((q) => q.type === type && !store.progress[q.id]?.masteredAt).length} 待学 · {questions.filter((q) => q.type === type && store.progress[q.id]?.masteredAt).length} 已学会</small></span><b>›</b>
                </button>
              ))}
            </div>
            {active && <button className="continue-card" onClick={() => setScreen("quiz")}><span><small>继续上次练习</small><strong>{typeMeta[active.type].name} · 第 {active.index + 1} 题</strong></span><b>继续 ›</b></button>}
            <button className="wrong-shortcut" onClick={() => setTab("wrong")}><i>↻</i><span><strong>错题复习</strong><small>{wrongCount ? `${wrongCount} 道题等待巩固` : "暂无错题，继续保持"}</small></span><b>›</b></button>
            <div className="demo-note">内容版本 2026.07 · 部分题型仍为流程演示内容</div>
          </>
        )}
        {tab === "practice" && <PracticePage questions={questions} progress={store.progress} startPractice={startPractice} active={active} resume={() => setScreen("quiz")} />}
        {tab === "wrong" && <WrongPage questions={questions} wrong={store.wrong} startPractice={startPractice} clearType={(type) => setStore((s) => ({ ...s, wrong: Object.fromEntries(Object.entries(s.wrong).filter(([id]) => questionMap[id]?.type !== type)) }))} />}
        {tab === "stats" && <StatsPage history={store.history} questions={questions} wrongCount={wrongCount} />}
        {tab === "settings" && (
          <section className="subpage">
            <PageHeader eyebrow="偏好与数据" title="设置" />
            <div className="setting-card"><span><strong>显示主题</strong><small>适应不同阅读环境</small></span><button className="toggle" onClick={() => setStore((s) => ({ ...s, theme: s.theme === "light" ? "dark" : "light" }))}>{store.theme === "dark" ? "夜间" : "日间"}</button></div>
            <SectionTitle title="设备同步" side={syncReady ? "已连接" : "单用户"} />
            <div className="sync-card">
              <div className="sync-heading">
                <span className={`sync-dot ${syncStatus}`} />
                <span><strong>{syncReady ? "学习记录云同步" : "连接私人同步"}</strong><small>{{
                  disconnected: "输入 Zeabur 中设置的同步密码",
                  connecting: "正在连接云端记录…",
                  synced: lastSyncAt ? `上次同步 ${new Date(lastSyncAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}` : "云端记录已连接",
                  pending: "本地有新记录，正在自动保存…",
                  error: "暂时无法同步，本地记录不受影响",
                }[syncStatus]}</small></span>
              </div>
              {syncReady ? (
                <div className="sync-actions">
                  <button onClick={syncNow}>立即同步</button>
                  <button onClick={disconnectSync}>断开</button>
                </div>
              ) : (
                <div className="sync-connect">
                  <input type="password" value={syncInput} onChange={(event) => setSyncInput(event.target.value)} placeholder="同步密码" autoComplete="current-password" onKeyDown={(event) => event.key === "Enter" && connectSync()} />
                  <button onClick={() => connectSync()}>连接</button>
                </div>
              )}
              <p>密码只保存在此设备；数据通过 HTTPS 写入你的 Zeabur 持久卷。</p>
            </div>
            <SectionTitle title="学习数据" />
            <div className="setting-list">
              <button onClick={exportData}><span><strong>导出学习数据</strong><small>保存为 JSON 文件</small></span><b>导出</b></button>
              <button onClick={() => importRef.current?.click()}><span><strong>恢复学习数据</strong><small>从之前的 JSON 备份恢复</small></span><b>选择文件</b></button>
              <input ref={importRef} hidden type="file" accept="application/json" onChange={(e) => importData(e.target.files?.[0])} />
            </div>
            <SectionTitle title="安装到手机" />
            <div className="install-card">
              <b>像 App 一样打开</b>
              <p><strong>iPhone：</strong>用 Safari 打开本站，点“分享”→“添加到主屏幕”。</p>
              <p><strong>Android：</strong>用 Chrome 打开本站，点菜单→“安装应用”或“添加到主屏幕”。</p>
              <small>首次打开需要联网；加载完成后可离线进入已缓存页面和题库。</small>
            </div>
            <div className="privacy-card"><b>本地优先</b><p>学习记录默认保存在当前设备；连接私人同步后，会加密传输至你自己的持久卷。</p></div>
            <div className="version">学习记录 · PWA 版 0.3</div>
          </section>
        )}
      </div>
      <nav className="bottom-nav">
        {([["home", "⌂", "首页"], ["practice", "▤", "刷题"], ["wrong", "↻", "错题"], ["stats", "◒", "统计"], ["settings", "⚙", "设置"]] as [Tab, string, string][]).map(([key, icon, label]) => (
          <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}><i>{icon}</i><span>{label}</span>{key === "wrong" && wrongCount > 0 && <em>{wrongCount}</em>}</button>
        ))}
      </nav>
    </main>
  );
}

function SectionTitle({ title, side }: { title: string; side?: string }) {
  return <div className="section-title"><h2>{title}</h2>{side && <span>{side}</span>}</div>;
}
function PageHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <header className="page-header"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1></header>;
}
function PracticePage({ questions, progress, startPractice, active, resume }: { questions: Question[]; progress: ProgressMap; startPractice: (t: QuestionType) => void; active: Session | null; resume: () => void }) {
  return <section className="subpage"><PageHeader eyebrow="按题型专项练习" title="开始刷题" />
    {active && <button className="continue-card" onClick={resume}><span><small>未完成的练习</small><strong>{typeMeta[active.type].name} · 第 {active.index + 1}/{active.questionIds.length} 题</strong></span><b>继续 ›</b></button>}
    <div className="practice-list">{(Object.keys(typeMeta) as QuestionType[]).map((type) => <button key={type} onClick={() => startPractice(type)}><i className={typeMeta[type].tone}>{typeMeta[type].icon}</i><span><strong>{typeMeta[type].name}</strong><small>{questions.filter((q) => q.type === type && !progress[q.id]?.masteredAt).length} 待学 · {questions.filter((q) => q.type === type && progress[q.id]?.masteredAt).length} 已学会</small></span><b>开始 ›</b></button>)}</div>
    <div className="tip-card"><b>练习说明</b><p>每轮优先加入没做过的题；连续答对 5 次后标记为“已学会”，后续常规练习不再出现。答错会重新累计。</p></div>
  </section>;
}
function WrongPage({ questions, wrong, startPractice, clearType }: { questions: Question[]; wrong: Store["wrong"]; startPractice: (t: QuestionType, w?: boolean) => void; clearType: (t: QuestionType) => void }) {
  const [filter, setFilter] = useState<QuestionType>("single");
  const list = questions.filter((q) => q.type === filter && wrong[q.id]);
  return <section className="subpage"><PageHeader eyebrow="连续答对两次自动移出" title="错题本" />
    <div className="filter-tabs">{(Object.keys(typeMeta) as QuestionType[]).map((type) => <button key={type} className={filter === type ? "active" : ""} onClick={() => setFilter(type)}>{typeMeta[type].short}<em>{questions.filter((q) => q.type === type && wrong[q.id]).length}</em></button>)}</div>
    {list.length ? <><div className="wrong-actions"><button className="primary-button" onClick={() => startPractice(filter, true)}>练习本类错题</button><button onClick={() => clearType(filter)}>清空</button></div><div className="wrong-list">{list.map((q) => <article key={q.id}><span>{typeMeta[q.type].short}</span><h3>{q.question}</h3><p>错误 {wrong[q.id].count} 次 · 最近 {new Date(wrong[q.id].lastWrong).toLocaleDateString("zh-CN")}</p><div><small>连续答对 {wrong[q.id].streak}/2 次</small><i><b style={{ width: `${wrong[q.id].streak * 50}%` }} /></i></div></article>)}</div></> :
      <div className="empty-state"><i>✓</i><h2>这里很干净</h2><p>本题型暂时没有错题。错题会自动收进来，连续答对两次后移出。</p></div>}
  </section>;
}
function StatsPage({ history, wrongCount }: { history: HistoryItem[]; questions: Question[]; wrongCount: number }) {
  const total = history.reduce((s, h) => s + h.count, 0);
  const dates = [...new Set(history.map((h) => new Date(h.at).toDateString()))];
  function rate(type: QuestionType) {
    const items = history.filter((h) => h.type === type);
    const count = items.reduce((s, h) => s + h.count, 0);
    if (!count) return 0;
    return Math.round(items.reduce((s, h) => s + (type === "single" || type === "judge" ? h.correct : h.ratings.mastered), 0) / count * 100);
  }
  return <section className="subpage"><PageHeader eyebrow="每一次练习都算数" title="学习统计" />
    <div className="stats-hero"><div><strong>{total}</strong><span>累计完成</span></div><div><strong>{dates.length}</strong><span>学习天数</span></div><div><strong>{wrongCount}</strong><span>错题总数</span></div></div>
    <SectionTitle title="分题型表现" />
    <div className="rate-list">{(Object.keys(typeMeta) as QuestionType[]).map((type) => <div key={type}><i className={typeMeta[type].tone}>{typeMeta[type].icon}</i><span><strong>{typeMeta[type].name}</strong><small>{type === "single" || type === "judge" ? "正确率" : "掌握率"}</small></span><div><b>{rate(type)}%</b><em><i style={{ width: `${rate(type)}%` }} /></em></div></div>)}</div>
    <SectionTitle title="最近练习" />
    {history.length ? <div className="history-list">{[...history].reverse().slice(0, 5).map((h) => {
      const objective = h.type === "single" || h.type === "judge";
      const score = objective ? h.correct : h.ratings.mastered;
      const resultRate = h.count ? Math.round(score / h.count * 100) : 0;
      return <div key={h.id}><span><strong>{typeMeta[h.type].name}</strong><small>{new Date(h.at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</small></span><div className="history-result"><b>{score}/{h.count}</b><small>{resultRate}% {objective ? "正确率" : "掌握率"}</small></div></div>;
    })}</div> : <div className="empty-mini">完成第一轮练习后，这里会生成你的学习轨迹。</div>}
  </section>;
}

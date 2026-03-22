import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Project = {
  id: string;
  name: string;
  examDate: string;
  totalProblems: number;
};

type ReviewTask = {
  id: string;
  label: string;
};

type StudySession = {
  id: string;
  projectId: string;
  date: string; // "YYYY-MM-DD"
  amount: number;
  content?: string;
};

function usePersistentState<T>(
  key: string,
  defaultValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored ? (JSON.parse(stored) as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const setPersistent = useCallback((next: T | ((prev: T) => T)) => {
    setValue((prev) =>
      typeof next === "function" ? (next as (prev: T) => T)(prev) : next
    );
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore
    }
  }, [key, value]);

  return [value, setPersistent];
}

function App() {
  const [projects, setProjects] = usePersistentState<Project[]>(
    "study-app:projects",
    []
  );
  const [activeProjectId, setActiveProjectId] = usePersistentState<string | null>(
    "study-app:activeProjectId",
    null
  );

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [projects, activeProjectId]
  );

  const [examDateInput, setExamDateInput] = useState("");
  const [totalProblemsInput, setTotalProblemsInput] = useState("");

  const [doneNewTodayByProject, setDoneNewTodayByProject] = usePersistentState<
    Record<string, string>
  >("study-app:doneNewTodayByProject", {});
  const [studyContentByProject, setStudyContentByProject] = usePersistentState<
    Record<string, string>
  >("study-app:studyContentByProject", {});

  const [studySessions, setStudySessions] = usePersistentState<StudySession[]>(
    "study-app:studySessions",
    []
  );

  const [checkedReviewIdsByProject, setCheckedReviewIdsByProject] =
    usePersistentState<Record<string, string[]>>(
      "study-app:checkedReviewIdsByProject",
      {}
    );

  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [activeTab, setActiveTab] = useState<0 | 1 | 2>(0);
  const [showAddProject, setShowAddProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectExamDate, setNewProjectExamDate] = useState("");
  const [newProjectTotal, setNewProjectTotal] = useState("");

  const doneNewTodayInput = activeProjectId
    ? (doneNewTodayByProject[activeProjectId] ?? "0")
    : "0";
  const setDoneNewTodayInput = useCallback(
    (value: string | ((prev: string) => string)) => {
      if (!activeProjectId) return;
      const next =
        typeof value === "function" ? value(doneNewTodayInput) : value;
      setDoneNewTodayByProject((prev) => ({
        ...prev,
        [activeProjectId]: next,
      }));
    },
    [activeProjectId, doneNewTodayInput, setDoneNewTodayByProject]
  );

  const studyContentInput = activeProjectId
    ? (studyContentByProject[activeProjectId] ?? "")
    : "";
  const setStudyContentInput = useCallback(
    (value: string | ((prev: string) => string)) => {
      if (!activeProjectId) return;
      const next =
        typeof value === "function" ? value(studyContentInput) : value;
      setStudyContentByProject((prev) => ({
        ...prev,
        [activeProjectId]: next,
      }));
    },
    [activeProjectId, studyContentInput, setStudyContentByProject]
  );

  const checkedReviewIds = activeProjectId
    ? (checkedReviewIdsByProject[activeProjectId] ?? [])
    : [];
  const setCheckedReviewIds = useCallback(
    (value: string[] | ((prev: string[]) => string[])) => {
      if (!activeProjectId) return;
      const next =
        typeof value === "function" ? value(checkedReviewIds) : value;
      setCheckedReviewIdsByProject((prev) => ({
        ...prev,
        [activeProjectId]: next,
      }));
    },
    [activeProjectId, checkedReviewIds, setCheckedReviewIdsByProject]
  );

  useEffect(() => {
    if (activeProject) {
      setExamDateInput(activeProject.examDate);
      setTotalProblemsInput(String(activeProject.totalProblems));
    }
  }, [activeProject]);

  useEffect(() => {
    if (projects.length > 0 && !activeProjectId) setActiveProjectId(projects[0].id);
  }, [projects, activeProjectId, setActiveProjectId]);

  const migratedRef = useRef(false);
  useEffect(() => {
    if (migratedRef.current || projects.length > 0) return;
    try {
      const raw = window.localStorage.getItem("study-app:settings");
      if (!raw) return;
      const old = JSON.parse(raw) as { examDate?: string; totalProblems?: number };
      if (!old?.examDate || typeof old.totalProblems !== "number") return;
      migratedRef.current = true;
      const id = "migrated-" + Date.now();
      const project: Project = {
        id,
        name: "マイ試験",
        examDate: old.examDate,
        totalProblems: old.totalProblems,
      };
      setProjects([project]);
      setActiveProjectId(id);
      setStudySessions((prev) =>
        prev.map((s) => ({
          ...s,
          projectId: (s as StudySession & { projectId?: string }).projectId ?? id,
        }))
      );
    } catch {
      migratedRef.current = true;
    }
  }, [projects.length, setProjects, setActiveProjectId, setStudySessions]);

  const activeSessions = useMemo(
    () =>
      activeProjectId
        ? studySessions.filter((s) => s.projectId === activeProjectId)
        : [],
    [studySessions, activeProjectId]
  );

  const realToday = new Date();
  const realTodayStr = realToday.toISOString().slice(0, 10); // YYYY-MM-DD
  const todayStr = realTodayStr;

  let daysLeft: number | null = null;

  if (activeProject) {
    const exam = new Date(activeProject.examDate);
    const diffMs = exam.getTime() - realToday.setHours(0, 0, 0, 0);
    daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  }

  const parsedDoneNewTodayForCarry = (() => {
    const n = Number(doneNewTodayInput);
    return Number.isNaN(n) || n < 0 ? 0 : n;
  })();

  // 繰り越し込みの「今日の必要ノルマ」を計算（表示中の日 = todayStr。明日で表示時は実今日の未達が追加分になる）
  // 実今日の実績は入力欄の値を使う（studySessions は useEffect で遅れて更新されるため）
  const { requiredNewToday, carryOverToday, showCarryOverLabel } = useMemo(() => {
    if (!activeProject) return { requiredNewToday: null as number | null, carryOverToday: 0, showCarryOverLabel: false };

    const totalProblems = activeProject.totalProblems;
    const examDate = activeProject.examDate;
    const examTime = new Date(examDate).setHours(0, 0, 0, 0);

    const sessionsInRange = activeSessions.filter(
      (s) => s.date >= realTodayStr && s.date <= todayStr
    );
    const sessionByDate = new Map<string, number>();
    sessionsInRange.forEach((s) => sessionByDate.set(s.date, s.amount));

    const dates: string[] = [];
    for (let d = new Date(realTodayStr); d <= new Date(todayStr); d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().slice(0, 10));
    }

    let carryIn = 0;
    let requiredNewToday: number | null = null;
    let carryOverToday = 0;
    let showCarryOverLabel = false;

    for (const dateStr of dates) {
      const totalDoneBefore = sessionsInRange
        .filter((s) => s.date < dateStr)
        .reduce((sum, s) => sum + s.amount, 0);
      const remaining = Math.max(0, totalProblems - totalDoneBefore);
      const dateTime = new Date(dateStr).setHours(0, 0, 0, 0);
      const daysLeftAt = Math.max(
        0,
        Math.ceil((examTime - dateTime) / (1000 * 60 * 60 * 24))
      );
      const baseDaily = daysLeftAt > 0 ? Math.ceil(remaining / daysLeftAt) : remaining;
      const done =
        dateStr === realTodayStr
          ? parsedDoneNewTodayForCarry
          : (sessionByDate.get(dateStr) ?? 0);
      const required = baseDaily + carryIn;
      const carryOut = Math.max(0, required - done);

      if (dateStr === todayStr) {
        requiredNewToday = required;
        carryOverToday = carryIn;
        showCarryOverLabel = carryIn > 0 && todayStr > realTodayStr;
        break;
      }
      carryIn = carryOut;
    }

    if (requiredNewToday === null) {
      const remaining = totalProblems;
      const dateTime = new Date(todayStr).setHours(0, 0, 0, 0);
      const daysLeftAt = Math.max(
        0,
        Math.ceil((examTime - dateTime) / (1000 * 60 * 60 * 24))
      );
      requiredNewToday = daysLeftAt > 0 ? Math.ceil(remaining / daysLeftAt) : remaining;
    }

    return { requiredNewToday, carryOverToday, showCarryOverLabel };
  }, [activeProject, activeSessions, realTodayStr, todayStr, parsedDoneNewTodayForCarry]);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (!examDateInput || !totalProblemsInput || !activeProjectId) return;

    const total = Number(totalProblemsInput);
    if (Number.isNaN(total) || total <= 0) return;

    setProjects((prev) =>
      prev.map((p) =>
        p.id === activeProjectId
          ? { ...p, examDate: examDateInput, totalProblems: total }
          : p
      )
    );
  };

  const handleChangeDoneToday = (value: string) => {
    setDoneNewTodayInput(value);
  };

  const handleToggleReview = (taskId: string) => {
    setCheckedReviewIds((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]
    );
  };

  const handleAddProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim() || !newProjectExamDate || !newProjectTotal) return;
    const total = Number(newProjectTotal);
    if (Number.isNaN(total) || total <= 0) return;
    const id = crypto.randomUUID();
    const project: Project = {
      id,
      name: newProjectName.trim(),
      examDate: newProjectExamDate,
      totalProblems: total,
    };
    setProjects((prev) => [...prev, project]);
    setActiveProjectId(id);
    setShowAddProject(false);
    setNewProjectName("");
    setNewProjectExamDate("");
    setNewProjectTotal("");
  };

  const handleDeleteProject = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (projects.length <= 1) return;
    setProjects((prev) => {
      const next = prev.filter((p) => p.id !== projectId);
      if (next.length === 0) return prev;
      return next;
    });
    if (activeProjectId === projectId) {
      const remaining = projects.filter((p) => p.id !== projectId);
      setActiveProjectId(remaining[0]?.id ?? null);
    }
    setStudySessions((prev) => prev.filter((s) => s.projectId !== projectId));
    setDoneNewTodayByProject((prev) => {
      const next = { ...prev };
      delete next[projectId];
      return next;
    });
    setStudyContentByProject((prev) => {
      const next = { ...prev };
      delete next[projectId];
      return next;
    });
    setCheckedReviewIdsByProject((prev) => {
      const next = { ...prev };
      delete next[projectId];
      return next;
    });
  };

  const parsedDoneNewToday = parsedDoneNewTodayForCarry;

  // 今日の新規実績＋勉強内容から StudySession を更新（忘却曲線用の「種」）※常に実日付で保存
  useEffect(() => {
    if (!activeProjectId) return;
    const sessionId = `session-${realTodayStr}-${activeProjectId}`;
    setStudySessions((prev) => {
      const others = prev.filter(
        (s) => !(s.projectId === activeProjectId && s.date === realTodayStr)
      );
      if (parsedDoneNewToday <= 0 && !studyContentInput.trim()) {
        return others;
      }
      const nextSession: StudySession = {
        id: sessionId,
        projectId: activeProjectId,
        date: realTodayStr,
        amount: parsedDoneNewToday,
        content: studyContentInput.trim() || undefined,
      };
      return [...others, nextSession];
    });
  }, [activeProjectId, parsedDoneNewToday, studyContentInput, setStudySessions, realTodayStr]);

  const REVIEW_INTERVALS = [1, 7, 30] as const;

  const reviewTasks: ReviewTask[] = useMemo(() => {
    const addDays = (dateStr: string, days: number): string => {
      const d = new Date(dateStr);
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    };

    const seen = new Set<string>(); // (date, interval) で1日1タスクに
    const tasks: ReviewTask[] = [];
    const sessionsFromStart = activeSessions.filter((s) => s.date >= realTodayStr);

    sessionsFromStart.forEach((session) => {
      REVIEW_INTERVALS.forEach((interval) => {
        const targetDate = addDays(session.date, interval);
        if (targetDate !== todayStr) return;
        const key = `${session.date}-${interval}`;
        if (seen.has(key)) return;
        seen.add(key);

        const [, m, d] = session.date.split("-").map(Number);
        const dateLabel = `${m}/${d}日分の復習`;
        const label = session.content
          ? `${dateLabel}（${session.content}）`
          : dateLabel;

        tasks.push({
          id: `${session.date}-d${interval}`,
          label,
        });
      });
    });

    return tasks;
  }, [activeSessions, todayStr, realTodayStr]);

  // 新規パート 0〜100%（繰り越し込みの必要数で達成率を計算）
  const newRatio =
    requiredNewToday !== null && requiredNewToday > 0
      ? Math.min(parsedDoneNewToday / requiredNewToday, 1)
      : 1;
  const newScore = newRatio * 100;

  // 復習パート 0〜100%（今あるタスクのチェックだけカウント）
  const totalReviewTasks = reviewTasks.length;
  const taskIdSet = useMemo(
    () => new Set(reviewTasks.map((t) => t.id)),
    [reviewTasks]
  );
  const doneReviewCount = checkedReviewIds.filter((id) => taskIdSet.has(id))
    .length;
  const reviewRatio =
    totalReviewTasks > 0
      ? Math.min(doneReviewCount / totalReviewTasks, 1)
      : 0;
  const reviewScore = reviewRatio * 100;

  // 今日の合計進捗 0〜100%（新規と復習の平均）
  const totalProgress = (newScore + reviewScore) / 2;

  const totalDoneProblems = activeSessions.reduce((sum, s) => sum + s.amount, 0);
  const remainingProblems =
    activeProject != null
      ? Math.max(0, activeProject.totalProblems - totalDoneProblems)
      : null;

  // 直近7日分の日別達成率（新規パート基準・今日は入力値を使用）
  const last7DaysChartData = useMemo(() => {
    if (!activeProject) return [];

    const totalProblems = activeProject.totalProblems;
    const examTime = new Date(activeProject.examDate).setHours(0, 0, 0, 0);
    const sessionByDate = new Map<string, number>();
    activeSessions.forEach((s) => sessionByDate.set(s.date, s.amount));

    const dates: string[] = [];
    const start = new Date(realTodayStr);
    start.setDate(start.getDate() - 6);
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().slice(0, 10));
    }

    let carryIn = 0;
    const result: { dateStr: string; label: string; value: number }[] = [];

    for (const dateStr of dates) {
      const totalDoneBefore = activeSessions
        .filter((s) => s.date < dateStr)
        .reduce((sum, s) => sum + s.amount, 0);
      const remaining = Math.max(0, totalProblems - totalDoneBefore);
      const dateTime = new Date(dateStr).setHours(0, 0, 0, 0);
      const daysLeftAt = Math.max(
        0,
        Math.ceil((examTime - dateTime) / (1000 * 60 * 60 * 24))
      );
      const baseDaily = daysLeftAt > 0 ? Math.ceil(remaining / daysLeftAt) : remaining;
      const done =
        dateStr === realTodayStr
          ? parsedDoneNewTodayForCarry
          : (sessionByDate.get(dateStr) ?? 0);

      if (dateStr < realTodayStr) {
        const [, m, d] = dateStr.split("-").map(Number);
        result.push({ dateStr, label: `${m}/${d}`, value: 0 });
        carryIn = 0;
        continue;
      }

      const required = baseDaily + carryIn;
      const ratio = required > 0 ? Math.min(done / required, 1) : 0;
      carryIn = Math.max(0, required - done);

      const [, m, d] = dateStr.split("-").map(Number);
      result.push({
        dateStr,
        label: `${m}/${d}`,
        value: Math.round(ratio * 100),
      });
    }

    return result;
  }, [activeProject, activeSessions, realTodayStr, parsedDoneNewTodayForCarry]);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="w-full max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* 1. タイトル */}
        <header>
          <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">
            勉強進捗管理
          </h1>
        </header>

        {/* プロジェクト一覧 ＋ 追加ボタン（床） */}
        <div className="w-full rounded-2xl border border-slate-200 bg-white/90 shadow-sm p-4">
          <div className="flex flex-wrap items-center gap-2">
            {projects.map((p) => (
              <div
                key={p.id}
                className={`inline-flex items-stretch rounded-xl overflow-hidden transition ${
                  activeProjectId === p.id ? "shadow-md ring-1 ring-slate-900/10" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActiveProjectId(p.id)}
                  className={`rounded-l-xl px-4 py-2 text-sm font-medium transition ${
                    activeProjectId === p.id
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {p.name}
                </button>
                {projects.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => handleDeleteProject(e, p.id)}
                    className={`flex items-center justify-center min-w-[2rem] py-2 px-2.5 rounded-r-xl text-slate-400 hover:text-white hover:bg-red-500 transition-colors ${
                      activeProjectId === p.id ? "bg-slate-800 hover:bg-red-500" : "bg-slate-100 hover:bg-red-500"
                    }`}
                    title="プロジェクトを削除"
                    aria-label={`${p.name}を削除`}
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setShowAddProject((prev) => !prev)}
              className="flex items-center justify-center rounded-xl w-10 h-10 border-2 border-dashed border-slate-300 text-slate-500 hover:border-sky-400 hover:text-sky-600 hover:bg-sky-50/50 transition"
              title="プロジェクトを追加"
            >
              <span className="text-xl leading-none">+</span>
            </button>
          </div>
          {showAddProject && (
            <form
              onSubmit={handleAddProject}
              className="mt-4 pt-4 border-t border-slate-100 space-y-3"
            >
              <h3 className="text-sm font-medium text-slate-700">新しいプロジェクト</h3>
              <div className="grid gap-3 sm:grid-cols-[1fr,1fr,auto] sm:items-end">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">名前（例：期末テスト）</label>
                  <input
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    placeholder="プロジェクト名"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">試験日</label>
                  <input
                    type="date"
                    value={newProjectExamDate}
                    onChange={(e) => setNewProjectExamDate(e.target.value)}
                    min={realTodayStr}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">総問題数</label>
                  <input
                    type="number"
                    value={newProjectTotal}
                    onChange={(e) => setNewProjectTotal(e.target.value)}
                    min={1}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    required
                  />
                </div>
                <div className="flex gap-2 sm:items-end">
                  <button
                    type="submit"
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                  >
                    設定
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddProject(false)}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            </form>
          )}
          {projects.length === 0 && !showAddProject && (
            <p className="mt-2 text-sm text-slate-500">
              上の「+」を押して、試験・科目ごとのプロジェクトを追加してください。
            </p>
          )}
        </div>

        {/* 設定アコーディオン（幅100％） */}
        <div className="w-full rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between px-5 py-4 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
            onClick={() => setShowSettingsPanel((prev) => !prev)}
            aria-expanded={showSettingsPanel}
          >
            <span>試験設定</span>
            <span
              className={`inline-block text-slate-400 transition-transform duration-200 ${
                showSettingsPanel ? "rotate-180" : ""
              }`}
              aria-hidden
            >
              ▼
            </span>
          </button>
          {showSettingsPanel && (
            <div className="border-t border-slate-100 bg-slate-50/30 px-5 py-5">
              {!activeProject ? (
                <p className="text-sm text-slate-500">
                  上の「+」でプロジェクトを追加してください。
                </p>
              ) : (
              <form onSubmit={handleSaveSettings} className="space-y-4">
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-slate-700">
                    試験日
                  </label>
                  <input
                    type="date"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-200 outline-none bg-white"
                    value={examDateInput}
                    onChange={(e) => setExamDateInput(e.target.value)}
                    min={realTodayStr}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-slate-700">
                    総問題数
                  </label>
                  <input
                    type="number"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-200 outline-none bg-white"
                    value={totalProblemsInput}
                    onChange={(e) => setTotalProblemsInput(e.target.value)}
                    min={1}
                    required
                  />
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-slate-800 transition"
                  >
                    設定を保存
                  </button>
                </div>
              </form>
              )}
            </div>
          )}
        </div>

        {/* 2. 試験までのカウントダウン専用カード */}
        <div className="bg-white/80 backdrop-blur-sm shadow-lg rounded-3xl border border-slate-100 p-6">
          <h2 className="text-lg font-medium text-slate-900 mb-4">
            試験までのカウントダウン
          </h2>
          {activeProject ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch sm:justify-between">
              <div className="space-y-4 flex-1 min-w-0">
                <div>
                  <p className="text-sm text-slate-500">試験日</p>
                  <p className="text-xl font-semibold text-slate-900">
                    {activeProject.examDate}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">残り日数</p>
                  <p className="text-3xl font-semibold text-slate-900 tracking-tight">
                    {daysLeft}{" "}
                    <span className="text-base font-normal text-slate-500">日</span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-6">
                  <div>
                    <p className="text-sm text-slate-500">総問題数</p>
                    <p className="text-xl font-semibold text-slate-900">
                      {activeProject.totalProblems.toLocaleString()} 問
                    </p>
                  </div>
                  {remainingProblems !== null && (
                    <div>
                      <p className="text-sm text-slate-500">残り問題数</p>
                      <p className="text-xl font-semibold text-slate-900">
                        {remainingProblems.toLocaleString()} 問
                      </p>
                    </div>
                  )}
                </div>
              </div>
              <div className="w-full sm:w-[33%] sm:min-w-[33%] rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-4 flex flex-col justify-evenly">
                <p className="text-sm font-medium text-slate-700">今日の進捗</p>
                <p className="text-3xl font-semibold text-slate-900">
                  {totalProgress.toFixed(0)}%
                </p>
                <p className="text-sm text-slate-500">
                  新規 {newScore.toFixed(0)}% / 復習 {reviewScore.toFixed(0)}%
                </p>
              </div>
            </div>
          ) : (
            <p className="text-slate-500 text-sm">
              上の「+」でプロジェクトを設定するとカウントダウンが表示されます。
            </p>
          )}
        </div>

        {/* 3. タブ（100%幅・3等分）＋ メインエリア */}
        <div className="w-full">
          <div className="flex w-full rounded-t-2xl overflow-hidden border border-b-0 border-slate-200 bg-slate-100/80">
            <button
              type="button"
              className={`flex-1 py-3 px-4 text-sm font-medium transition ${
                activeTab === 0
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:bg-slate-200/60"
              }`}
              onClick={() => setActiveTab(0)}
            >
              今日のタスク
            </button>
            <button
              type="button"
              className={`flex-1 py-3 px-4 text-sm font-medium transition border-x border-slate-200 ${
                activeTab === 1
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:bg-slate-200/60"
              }`}
              onClick={() => setActiveTab(1)}
            >
              復習タスク
            </button>
            <button
              type="button"
              className={`flex-1 py-3 px-4 text-sm font-medium transition ${
                activeTab === 2
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:bg-slate-200/60"
              }`}
              onClick={() => setActiveTab(2)}
            >
              データ
            </button>
          </div>

        {/* タブの中身（表示切り替え） */}
        <div className="bg-white/80 backdrop-blur-sm shadow-lg rounded-b-3xl border border-t-0 border-slate-200 p-6 min-h-[280px]">
        {activeTab === 0 && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-slate-500">
                未達成分は翌日に繰り越されます。
              </p>
            </div>

            {activeProject && (
              <div className="text-right w-24 h-14 flex flex-col justify-center shrink-0">
                <p className="text-xs text-slate-500">新規パート達成度</p>
                <p className="text-xl font-semibold text-slate-900">
                  {newScore.toFixed(0)}%
                </p>
              </div>
            )}
          </div>

          {activeProject && requiredNewToday !== null ? (
            <div className="space-y-4">
              <div className="grid gap-6 md:grid-cols-[2fr,3fr] items-start">
                <div className="space-y-2">
                  <p className="text-2xl font-semibold text-slate-900 tracking-tight">
                    {requiredNewToday}{" "}
                    <span className="text-base font-normal text-slate-500">
                      問 / 日
                    </span>
                    {showCarryOverLabel && (
                      <span className="ml-2 text-sm font-normal text-amber-700">
                        （うち繰り越し {carryOverToday} 問）
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex-1 space-y-1">
                  <label className="block text-sm font-medium text-slate-700">
                    解いた問題数
                  </label>
                  <input
                    type="number"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-200 outline-none bg-slate-50/60"
                    value={doneNewTodayInput}
                    onChange={(e) => handleChangeDoneToday(e.target.value)}
                    onFocus={() => { if (doneNewTodayInput === "0") setDoneNewTodayInput(""); }}
                    onBlur={() => { if (doneNewTodayInput === "") setDoneNewTodayInput("0"); }}
                    min={0}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-700">
                  勉強内容（任意）
                </label>
                <input
                  type="text"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-200 outline-none bg-slate-50/60 placeholder:text-slate-400"
                  placeholder="例：第3章、英単語1〜100"
                  value={studyContentInput}
                  onChange={(e) => setStudyContentInput(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              プロジェクトを選択し、設定で試験日・総問題数を保存すると今日の目安ノルマが表示されます。
            </p>
          )}
        </div>
        )}

        {activeTab === 1 && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm text-slate-500">
                エビングハウスの忘却曲線に基づき、復習内容を提示します。
              </p>
            </div>

            {activeProject && (
              <div className="text-right w-24 h-14 flex flex-col justify-center shrink-0">
                <p className="text-xs text-slate-500">復習パート達成度</p>
                <p className="text-xl font-semibold text-slate-900">
                  {reviewScore.toFixed(0)}%
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            {reviewTasks.map((task) => (
              <label
                key={task.id}
                className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm text-slate-800 cursor-pointer hover:bg-slate-100"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-sky-500 focus:ring-sky-400"
                  checked={checkedReviewIds.includes(task.id)}
                  onChange={() => handleToggleReview(task.id)}
                />
                <span>{task.label}</span>
              </label>
            ))}
          </div>
        </div>
        )}

        {activeTab === 2 && activeProject && last7DaysChartData.length > 0 && (
          <div className="min-h-[280px] flex flex-col pb-[10%]">
            <h2 className="text-lg font-medium text-slate-900 mb-4">
              直近7日の達成率
            </h2>
            <div className="mt-auto flex items-end justify-between gap-1 h-20">
              {last7DaysChartData.map((item) => (
                <div
                  key={item.dateStr}
                  className="flex-1 flex flex-col items-center gap-1 min-w-0"
                >
                  <div className="w-full flex flex-col justify-end items-center h-14">
                    <span className="text-xs text-slate-500 mb-0.5">
                      {item.value}%
                    </span>
                    <div
                      className="w-full max-w-[2rem] rounded-t-md bg-sky-400 transition-all"
                      style={{ height: `${Math.max(4, item.value)}%` }}
                      title={`${item.label}: ${item.value}%`}
                    />
                  </div>
                  <span className="text-xs text-slate-500 truncate w-full text-center">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 2 && (!activeProject || last7DaysChartData.length === 0) && (
          <p className="text-slate-500 text-sm">
            プロジェクトを選択し設定を保存すると、直近7日の達成率グラフが表示されます。
          </p>
        )}
        </div>
        </div>
      </div>
    </div>
  );
}

export default App;
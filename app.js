(function () {
  "use strict";

  const questions = Array.isArray(window.QUESTION_BANK) ? window.QUESTION_BANK : [];
  const questionById = new Map(questions.map((question) => [Number(question.id), question]));
  const validIds = new Set(questions.map((question) => Number(question.id)));
  const STORE_KEY = "violet_math_308_v4";
  const LEGACY_STORE_KEY = "violet-math-practice-v2";
  const SYNC_NAMESPACE = "math-violet:";
  const SUPABASE_URL = "https://awvmsvxzsphxfzluunwh.supabase.co";
  const SUPABASE_KEY = "sb_publishable_dYerJoJGAsbb-k0zvbLQSA__2kPW0HH";

  const defaultState = () => ({
    version: 4,
    answers: {},
    drafts: {},
    results: {},
    completed: {},
    favorites: {},
    wrongBook: {},
    order: questions.map((question) => Number(question.id)),
    reviewIds: [],
    currentId: questions[0] ? Number(questions[0].id) : 0,
    mode: "all",
    topic: "ALL",
    elapsed: 0,
    timerRunning: true,
    lastTick: Date.now(),
    lastSaved: null,
    syncCode: ""
  });

  const $ = (id) => document.getElementById(id);
  const elements = {
    timer: $("timer"),
    timerToggle: $("timerToggle"),
    timerReset: $("timerReset"),
    statDone: $("statDone"),
    statAccuracy: $("statAccuracy"),
    statWrong: $("statWrong"),
    statFavorite: $("statFavorite"),
    mode: $("modeSelect"),
    topic: $("topicSelect"),
    shuffle: $("shuffleButton"),
    resetOrder: $("resetOrderButton"),
    progressBar: $("progressBar"),
    progressText: $("progressText"),
    saveTime: $("saveTime"),
    syncCode: $("syncCode"),
    syncButton: $("syncButton"),
    generateSyncCode: $("generateSyncCode"),
    syncStatus: $("syncStatus"),
    clearAll: $("clearAllButton"),
    questionGrid: $("questionGrid"),
    questionCard: $("questionCard"),
    emptyState: $("emptyState"),
    showAll: $("showAllButton"),
    topicBadge: $("topicBadge"),
    questionNumber: $("questionNumber"),
    questionText: $("questionText"),
    options: $("options"),
    resultPanel: $("resultPanel"),
    resultSummary: $("resultSummary"),
    analysisText: $("analysisText"),
    prev: $("prevButton"),
    favorite: $("favoriteButton"),
    retry: $("retryButton"),
    submit: $("submitButton"),
    next: $("nextButton"),
    mobilePrev: $("mobilePrev"),
    mobileNext: $("mobileNext"),
    mobilePanel: $("mobilePanel"),
    mobilePanelToggle: $("mobilePanelToggle"),
    sidebar: $("sidebar"),
    closeSidebar: $("closeSidebar"),
    sidebarBackdrop: $("sidebarBackdrop"),
    toast: $("toast")
  };

  let state = loadState();
  let cloudTimer = null;
  let toastTimer = null;

  function isObject(value) {
    return value && typeof value === "object" && !Array.isArray(value);
  }

  function cleanRecord(value) {
    return isObject(value) ? value : {};
  }

  function normalizeOrder(value) {
    if (!Array.isArray(value)) return questions.map((question) => Number(question.id));
    const seen = new Set();
    const valid = value.map(Number).filter((id) => validIds.has(id) && !seen.has(id) && seen.add(id));
    if (valid.length !== questions.length) return questions.map((question) => Number(question.id));
    return valid;
  }

  function normalizeState(value) {
    const base = defaultState();
    const incoming = isObject(value) ? value : {};
    const next = {
      ...base,
      ...incoming,
      answers: cleanRecord(incoming.answers),
      drafts: cleanRecord(incoming.drafts),
      results: cleanRecord(incoming.results),
      completed: cleanRecord(incoming.completed),
      favorites: cleanRecord(incoming.favorites),
      wrongBook: cleanRecord(incoming.wrongBook),
      order: normalizeOrder(incoming.order),
      reviewIds: Array.isArray(incoming.reviewIds) ? incoming.reviewIds.map(Number).filter((id) => validIds.has(id)) : []
    };
    next.currentId = validIds.has(Number(next.currentId)) ? Number(next.currentId) : base.currentId;
    next.elapsed = Math.max(0, Number(next.elapsed) || 0);
    next.timerRunning = Boolean(next.timerRunning);
    next.lastTick = Date.now();
    next.syncCode = cleanSyncCode(next.syncCode);
    if (!["all", "todo", "wrong", "favorite"].includes(next.mode)) next.mode = "all";
    return next;
  }

  function migrateLegacy(legacy) {
    const next = defaultState();
    if (!isObject(legacy)) return next;
    const selected = cleanRecord(legacy.selected);
    const submitted = cleanRecord(legacy.submitted);
    const results = cleanRecord(legacy.results);
    Object.keys(submitted).forEach((key) => {
      const id = Number(key);
      if (!validIds.has(id) || !submitted[key]) return;
      const choice = selected[key];
      const correct = Boolean(results[key]);
      if (choice) next.answers[id] = { choice, correct, at: new Date().toISOString() };
      next.completed[id] = true;
      next.results[id] = correct;
      if (!correct) next.wrongBook[id] = true;
    });
    (Array.isArray(legacy.favorites) ? legacy.favorites : []).forEach((id) => {
      if (validIds.has(Number(id))) next.favorites[Number(id)] = true;
    });
    next.currentId = validIds.has(Number(legacy.currentId)) ? Number(legacy.currentId) : next.currentId;
    next.elapsed = Math.max(0, Number(legacy.elapsed) || 0);
    next.timerRunning = legacy.timerRunning !== false;
    next.mode = legacy.filter === "wrong" ? "wrong" : legacy.filter === "favorite" ? "favorite" : legacy.filter === "todo" ? "todo" : "all";
    next.topic = legacy.topic && legacy.topic !== "all" ? legacy.topic : "ALL";
    next.lastSaved = Object.keys(next.completed).length ? new Date().toISOString() : null;
    if (next.mode === "wrong") next.reviewIds = next.order.filter((id) => next.wrongBook[id]);
    return next;
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (saved) return normalizeState(saved);
      const legacy = JSON.parse(localStorage.getItem(LEGACY_STORE_KEY) || "null");
      const migrated = migrateLegacy(legacy);
      localStorage.setItem(STORE_KEY, JSON.stringify(migrated));
      return normalizeState(migrated);
    } catch (_) {
      return defaultState();
    }
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    })[character]);
  }

  function cleanSyncCode(value) {
    return String(value || "").trim().slice(0, 64);
  }

  function cloudSyncCode() {
    return SYNC_NAMESPACE + cleanSyncCode(state.syncCode);
  }

  function cloudHeaders(includeJson = false) {
    const headers = { apikey: SUPABASE_KEY };
    if (includeJson) headers["Content-Type"] = "application/json";
    return headers;
  }

  function formatTime(totalSeconds) {
    const total = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
  }

  function effectiveElapsed() {
    if (!state.timerRunning) return state.elapsed;
    return state.elapsed + Math.max(0, Math.floor((Date.now() - state.lastTick) / 1000));
  }

  function commitTimer() {
    if (!state.timerRunning) return;
    state.elapsed = effectiveElapsed();
    state.lastTick = Date.now();
  }

  function renderTimer() {
    elements.timer.textContent = formatTime(effectiveElapsed());
    elements.timerToggle.textContent = state.timerRunning ? "暂停" : "继续";
  }

  function save(options = {}) {
    commitTimer();
    state.lastSaved = new Date().toISOString();
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    renderSaveTime();
    if (options.cloud !== false) {
      if (options.immediateCloud) pushCloud();
      else queueCloud();
    }
  }

  function queueCloud() {
    clearTimeout(cloudTimer);
    cloudTimer = setTimeout(pushCloud, 500);
  }

  async function pushCloud(showMessage = false) {
    const rawCode = cleanSyncCode(state.syncCode);
    if (rawCode.length < 8) return false;
    clearTimeout(cloudTimer);
    commitTimer();
    const payload = { ...state, app: "violet-math-308", version: 4 };
    elements.syncStatus.textContent = "正在同步…";
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/quiz_sync?on_conflict=sync_code`, {
        method: "POST",
        headers: { ...cloudHeaders(true), Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ sync_code: cloudSyncCode(), state: payload, updated_at: new Date().toISOString() })
      });
      if (!response.ok) throw new Error(await response.text());
      elements.syncStatus.textContent = "已同步 " + new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
      if (showMessage) showToast("进度已同步到云端");
      return true;
    } catch (_) {
      elements.syncStatus.textContent = "云同步暂时失败，本机已保存";
      if (showMessage) showToast("云同步暂时失败，本机进度没有丢失");
      return false;
    }
  }

  async function fetchCloudRow() {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/quiz_sync?sync_code=eq.${encodeURIComponent(cloudSyncCode())}&select=state,updated_at`, {
      headers: cloudHeaders()
    });
    if (!response.ok) throw new Error(await response.text());
    const rows = await response.json();
    return rows[0] || null;
  }

  function applyCloudState(cloudState) {
    const localCode = state.syncCode;
    state = normalizeState({ ...cloudState, syncCode: localCode });
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    elements.mode.value = state.mode;
    elements.topic.value = state.topic;
    render();
  }

  async function syncWithCloud(showMessage = true) {
    const code = cleanSyncCode(state.syncCode);
    if (code.length < 8) {
      if (showMessage) showToast("请设置至少8位同步码");
      return false;
    }
    elements.syncStatus.textContent = "正在读取云端…";
    try {
      const row = await fetchCloudRow();
      if (!row) {
        await pushCloud(false);
        if (showMessage) showToast("已创建这组同步进度");
        return true;
      }
      const localTime = Date.parse(state.lastSaved || 0) || 0;
      const remoteTime = Date.parse(row.updated_at || row.state?.lastSaved || 0) || 0;
      const hasLocalProgress = Object.keys(state.completed).some((id) => state.completed[id]);
      if (hasLocalProgress && localTime > remoteTime + 1000) {
        await pushCloud(false);
        if (showMessage) showToast("已把本机较新的进度上传");
      } else {
        applyCloudState(row.state);
        elements.syncStatus.textContent = "已恢复云端进度";
        if (showMessage) showToast("已从云端恢复进度");
      }
      return true;
    } catch (_) {
      elements.syncStatus.textContent = "云同步暂时失败，本机已保存";
      if (showMessage) showToast("云同步失败，请稍后再试");
      return false;
    }
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elements.toast.classList.remove("is-visible"), 2100);
  }

  function renderTopics() {
    const counts = new Map();
    questions.forEach((question) => counts.set(question.topic || "其他", (counts.get(question.topic || "其他") || 0) + 1));
    elements.topic.innerHTML = `<option value="ALL">全部题型（${questions.length}）</option>` + [...counts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], "zh-CN"))
      .map(([topic, count]) => `<option value="${escapeHtml(topic)}">${escapeHtml(topic)}（${count}）</option>`)
      .join("");
    if (![...counts.keys()].includes(state.topic)) state.topic = "ALL";
    elements.topic.value = state.topic;
  }

  function filteredQuestions() {
    const sourceIds = state.mode === "wrong" ? state.reviewIds : state.order;
    return sourceIds.map((id) => questionById.get(Number(id))).filter((question) => {
      if (!question) return false;
      if (state.topic !== "ALL" && question.topic !== state.topic) return false;
      if (state.mode === "todo" && state.completed[question.id]) return false;
      if (state.mode === "favorite" && !state.favorites[question.id]) return false;
      return true;
    });
  }

  function ensureCurrent(list) {
    if (!list.length) return null;
    if (!list.some((question) => Number(question.id) === Number(state.currentId))) state.currentId = Number(list[0].id);
    return questionById.get(Number(state.currentId)) || list[0];
  }

  function currentContext() {
    const list = filteredQuestions();
    const question = ensureCurrent(list);
    const index = question ? list.findIndex((item) => Number(item.id) === Number(question.id)) : -1;
    return { list, question, index };
  }

  function renderStats(context) {
    const done = Object.keys(state.completed).filter((id) => state.completed[id]).length;
    const resolvedResults = Object.keys(state.results).filter((id) => state.completed[id]);
    const correct = resolvedResults.filter((id) => state.results[id] === true).length;
    const wrong = Object.keys(state.wrongBook).filter((id) => state.wrongBook[id]).length;
    const favorite = Object.keys(state.favorites).filter((id) => state.favorites[id]).length;
    elements.statDone.textContent = done;
    elements.statAccuracy.textContent = resolvedResults.length ? Math.round((correct / resolvedResults.length) * 100) + "%" : "—";
    elements.statWrong.textContent = wrong;
    elements.statFavorite.textContent = favorite;
    const position = context.index >= 0 ? context.index + 1 : 0;
    elements.progressText.textContent = `${position} / ${context.list.length}`;
    elements.progressBar.style.width = context.list.length ? `${(position / context.list.length) * 100}%` : "0%";
  }

  function renderSaveTime() {
    elements.saveTime.textContent = state.lastSaved ? "已保存 " + new Date(state.lastSaved).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "尚未作答";
  }

  function renderQuestionGrid(context) {
    elements.questionGrid.innerHTML = context.list.map((question, index) => {
      const classes = ["grid-question"];
      if (state.completed[question.id]) classes.push("is-done");
      if (state.wrongBook[question.id]) classes.push("is-wrong");
      if (Number(question.id) === Number(state.currentId)) classes.push("is-current");
      return `<button type="button" class="${classes.join(" ")}" data-index="${index}" title="第${question.id}题">${question.id}</button>`;
    }).join("");
    elements.questionGrid.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        const target = context.list[Number(button.dataset.index)];
        if (!target) return;
        state.currentId = Number(target.id);
        save();
        closeSidebar();
        render();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });
  }

  function renderQuestion(context) {
    const empty = !context.question;
    elements.questionCard.classList.toggle("is-hidden", empty);
    elements.emptyState.classList.toggle("is-hidden", !empty);
    if (empty) return;

    const question = context.question;
    const record = state.answers[question.id];
    const draft = state.drafts[question.id];
    const selected = record?.choice || draft;
    elements.topicBadge.textContent = question.topic || "数学专项";
    elements.questionNumber.textContent = `题库第 ${question.id} 题 · 当前 ${context.index + 1}/${context.list.length}`;
    elements.questionText.textContent = question.question;
    elements.options.innerHTML = "";

    question.options.forEach((option, optionIndex) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option";
      button.dataset.option = option.id;
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", selected === option.id ? "true" : "false");
      button.setAttribute("aria-label", `选项${optionIndex + 1}：${option.text}`);
      if (selected === option.id) button.classList.add("is-selected");
      if (record && option.id === question.answer) button.classList.add("is-correct");
      if (record && record.choice === option.id && !record.correct) button.classList.add("is-wrong");
      button.disabled = Boolean(record);
      const status = record && option.id === question.answer ? "✓" : record && record.choice === option.id && !record.correct ? "×" : "";
      button.innerHTML = `<span class="option-key">${escapeHtml(option.id)}</span><span class="option-text">${escapeHtml(option.text)}</span><span class="option-status">${status}</span>`;
      button.addEventListener("click", () => selectOption(question.id, option.id));
      elements.options.appendChild(button);
    });

    elements.favorite.textContent = state.favorites[question.id] ? "★ 已收藏" : "☆ 收藏";
    elements.retry.textContent = record ? "重做本题" : "跳过";
    elements.submit.disabled = !draft || Boolean(record);
    elements.submit.textContent = record ? "已提交" : "提交答案";
    elements.prev.disabled = context.index <= 0;
    elements.next.disabled = context.index < 0 || context.index >= context.list.length - 1;
    elements.mobilePrev.disabled = elements.prev.disabled;
    elements.mobileNext.disabled = elements.next.disabled;

    elements.resultPanel.classList.toggle("is-hidden", !record);
    if (record) {
      const correctOption = question.options.find((option) => option.id === question.answer);
      elements.resultSummary.className = "result-summary " + (record.correct ? "correct" : "wrong");
      elements.resultSummary.textContent = record.correct
        ? `回答正确｜你的答案：${record.choice}`
        : `回答错误｜你的答案：${record.choice}　正确答案：${question.answer}${correctOption ? "．" + correctOption.text : ""}`;
      elements.analysisText.textContent = question.explanation;
    }
  }

  function render() {
    const context = currentContext();
    elements.mode.value = state.mode;
    elements.topic.value = state.topic;
    renderStats(context);
    renderSaveTime();
    renderQuestionGrid(context);
    renderQuestion(context);
    renderTimer();
  }

  function selectOption(questionId, optionId) {
    if (state.answers[questionId]) return;
    state.drafts[questionId] = optionId;
    save();
    render();
  }

  function submitAnswer() {
    const { question } = currentContext();
    if (!question || state.answers[question.id]) return;
    const choice = state.drafts[question.id];
    if (!choice) return;
    const correct = choice === question.answer;
    state.answers[question.id] = { choice, correct, at: new Date().toISOString() };
    state.completed[question.id] = true;
    state.results[question.id] = correct;
    if (correct && state.mode === "wrong") delete state.wrongBook[question.id];
    if (!correct) state.wrongBook[question.id] = true;
    save();
    render();
    setTimeout(() => elements.resultPanel.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60);
  }

  function move(delta) {
    const context = currentContext();
    const nextQuestion = context.list[context.index + delta];
    if (!nextQuestion) return;
    state.currentId = Number(nextQuestion.id);
    save();
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function retryOrSkip() {
    const { question } = currentContext();
    if (!question) return;
    if (state.answers[question.id]) {
      delete state.answers[question.id];
      delete state.drafts[question.id];
      save();
      render();
      showToast("本题已恢复为空白，可以重新作答");
    } else {
      move(1);
    }
  }

  function toggleFavorite() {
    const { question } = currentContext();
    if (!question) return;
    if (state.favorites[question.id]) delete state.favorites[question.id];
    else state.favorites[question.id] = true;
    save();
    render();
  }

  function enterMode(mode) {
    state.mode = mode;
    if (mode === "wrong") {
      state.reviewIds = state.order.filter((id) => state.wrongBook[id]);
      state.reviewIds.forEach((id) => {
        delete state.answers[id];
        delete state.drafts[id];
      });
    } else {
      state.reviewIds = [];
    }
    const list = filteredQuestions();
    if (list[0]) state.currentId = Number(list[0].id);
    save();
    render();
    if (mode === "wrong" && list.length) showToast("错题已恢复为空白，请重新作答");
  }

  function shuffleOrder() {
    const order = questions.map((question) => Number(question.id));
    for (let index = order.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [order[index], order[swapIndex]] = [order[swapIndex], order[index]];
    }
    state.order = order;
    if (state.mode === "wrong") state.reviewIds = order.filter((id) => state.reviewIds.includes(id));
    const list = filteredQuestions();
    if (list[0]) state.currentId = Number(list[0].id);
    save();
    render();
    showToast("题目顺序已随机打乱");
  }

  function resetOrder() {
    state.order = questions.map((question) => Number(question.id));
    if (state.mode === "wrong") state.reviewIds = state.order.filter((id) => state.reviewIds.includes(id));
    const list = filteredQuestions();
    if (list[0]) state.currentId = Number(list[0].id);
    save();
    render();
    showToast("已恢复按题号顺序刷题");
  }

  function openSidebar() {
    elements.sidebar.classList.add("is-open");
    elements.sidebarBackdrop.classList.add("is-visible");
    elements.sidebarBackdrop.setAttribute("aria-hidden", "false");
    elements.mobilePanelToggle.setAttribute("aria-expanded", "true");
  }

  function closeSidebar() {
    elements.sidebar.classList.remove("is-open");
    elements.sidebarBackdrop.classList.remove("is-visible");
    elements.sidebarBackdrop.setAttribute("aria-hidden", "true");
    elements.mobilePanelToggle.setAttribute("aria-expanded", "false");
  }

  function generateCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    const code = [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
    elements.syncCode.value = code;
    state.syncCode = code;
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    showToast("同步码已生成，请在手机和电脑输入同一个码");
  }

  async function clearAllData() {
    const confirmed = window.confirm("确定清除所有数学刷题数据吗？\n\n已答题目、错题、收藏、当前位置和计时都会归零，并同步到手机和电脑。此操作不能撤销。");
    if (!confirmed) return;

    const syncCode = state.syncCode;
    state = defaultState();
    state.syncCode = syncCode;
    state.timerRunning = false;
    state.lastTick = Date.now();
    elements.mode.value = "all";
    elements.topic.value = "ALL";
    elements.syncCode.value = syncCode;
    save({ cloud: false });
    render();
    closeSidebar();

    if (syncCode.length >= 8) {
      const synced = await pushCloud(false);
      showToast(synced ? "所有刷题数据已清除，并已同步到其他设备" : "本机数据已清除，云同步暂时失败");
    } else {
      showToast("所有数学刷题数据已清除");
    }
  }

  elements.mode.addEventListener("change", () => enterMode(elements.mode.value));
  elements.topic.addEventListener("change", () => {
    state.topic = elements.topic.value;
    const list = filteredQuestions();
    if (list[0]) state.currentId = Number(list[0].id);
    save();
    render();
  });
  elements.shuffle.addEventListener("click", shuffleOrder);
  elements.resetOrder.addEventListener("click", resetOrder);
  elements.prev.addEventListener("click", () => move(-1));
  elements.next.addEventListener("click", () => move(1));
  elements.mobilePrev.addEventListener("click", () => move(-1));
  elements.mobileNext.addEventListener("click", () => move(1));
  elements.favorite.addEventListener("click", toggleFavorite);
  elements.retry.addEventListener("click", retryOrSkip);
  elements.submit.addEventListener("click", submitAnswer);
  elements.showAll.addEventListener("click", () => {
    state.topic = "ALL";
    enterMode("all");
  });

  elements.timerToggle.addEventListener("click", () => {
    if (state.timerRunning) {
      commitTimer();
      state.timerRunning = false;
    } else {
      state.timerRunning = true;
      state.lastTick = Date.now();
    }
    save();
    renderTimer();
  });
  elements.timerReset.addEventListener("click", () => {
    if (!window.confirm("确定把本次计时重置为零吗？")) return;
    state.elapsed = 0;
    state.lastTick = Date.now();
    save();
    renderTimer();
  });

  elements.syncButton.addEventListener("click", async () => {
    const code = cleanSyncCode(elements.syncCode.value);
    if (code.length < 8) {
      showToast("请设置至少8位同步码");
      return;
    }
    state.syncCode = code;
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    await syncWithCloud(true);
  });
  elements.syncCode.addEventListener("change", () => {
    elements.syncCode.value = cleanSyncCode(elements.syncCode.value);
  });
  elements.generateSyncCode.addEventListener("click", generateCode);
  elements.clearAll.addEventListener("click", clearAllData);
  elements.mobilePanel.addEventListener("click", openSidebar);
  elements.mobilePanelToggle.addEventListener("click", openSidebar);
  elements.closeSidebar.addEventListener("click", closeSidebar);
  elements.sidebarBackdrop.addEventListener("click", closeSidebar);

  document.addEventListener("keydown", (event) => {
    if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) return;
    const { question } = currentContext();
    if (!question) return;
    if (["1", "2", "3", "4"].includes(event.key) && !state.answers[question.id]) {
      const option = question.options[Number(event.key) - 1];
      if (option) selectOption(question.id, option.id);
    } else if (event.key === "Enter") {
      submitAnswer();
    } else if (event.key === "ArrowLeft") {
      move(-1);
    } else if (event.key === "ArrowRight") {
      move(1);
    } else if (event.key.toLowerCase() === "f") {
      toggleFavorite();
    } else if (event.key === "Escape") {
      closeSidebar();
    }
  });

  window.addEventListener("beforeunload", () => {
    commitTimer();
    state.lastSaved = new Date().toISOString();
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      save({ immediateCloud: true });
    } else {
      state.lastTick = Date.now();
      if (state.syncCode) syncWithCloud(false);
    }
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== STORE_KEY || !event.newValue) return;
    try {
      state = normalizeState(JSON.parse(event.newValue));
      render();
    } catch (_) {}
  });

  setInterval(renderTimer, 500);
  setInterval(() => save(), 30000);

  renderTopics();
  elements.mode.value = state.mode;
  elements.syncCode.value = state.syncCode || "";
  render();
  if (state.syncCode) syncWithCloud(false);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
})();

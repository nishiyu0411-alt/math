(function () {
  "use strict";

  const questions = Array.isArray(window.QUESTION_BANK) ? window.QUESTION_BANK : [];
  const STORAGE_KEY = "violet-math-practice-v2";
  const blankState = {
    started: false,
    currentId: 1,
    selected: {},
    submitted: {},
    results: {},
    favorites: [],
    elapsed: 0,
    timerRunning: false,
    filter: "all",
    topic: "all"
  };

  let state = loadState();
  let timerHandle = null;
  let deferredInstallPrompt = null;
  let toastHandle = null;

  const $ = (id) => document.getElementById(id);
  const els = {
    welcome: $("welcome"), app: $("app"), start: $("startButton"), timer: $("timer"), timerToggle: $("timerToggle"),
    save: $("saveButton"), saveStatus: $("saveStatus"), savePulse: $("savePulse"), install: $("installButton"), installWelcome: $("installWelcome"),
    topic: $("topicSelect"), topicBadge: $("topicBadge"), number: $("questionNumber"), text: $("questionText"), options: $("options"),
    resultPanel: $("resultPanel"), resultTitle: $("resultTitle"), analysis: $("analysisText"), favorite: $("favoriteButton"),
    submit: $("submitButton"), prev: $("prevButton"), next: $("nextButton"), mobilePrev: $("mobilePrev"), mobileNext: $("mobileNext"),
    progressRing: $("progressRing"), progressPercent: $("progressPercent"), doneCount: $("doneCount"), correctSummary: $("correctSummary"),
    allCount: $("allCount"), todoCount: $("todoCount"), wrongCount: $("wrongCount"), favoriteCount: $("favoriteCount"),
    empty: $("emptyState"), card: $("questionCard"), clearFilters: $("clearFilters"),
    navModal: $("navigatorModal"), navBackdrop: $("navigatorBackdrop"), navGrid: $("questionGrid"), navSearch: $("navigatorSearch"),
    openNav: $("openNavigator"), mobileNav: $("mobileNavigator"), closeNav: $("closeNavigator"), toast: $("toast")
  };

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved || typeof saved !== "object") return { ...blankState };
      return {
        ...blankState,
        ...saved,
        selected: saved.selected || {},
        submitted: saved.submitted || {},
        results: saved.results || {},
        favorites: Array.isArray(saved.favorites) ? saved.favorites : []
      };
    } catch (_) {
      return { ...blankState };
    }
  }

  function persist(message) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    els.saveStatus.textContent = message || "进度已自动保存";
    els.savePulse.animate([{ transform: "scale(1)" }, { transform: "scale(1.9)" }, { transform: "scale(1)" }], { duration: 420 });
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("is-visible");
    clearTimeout(toastHandle);
    toastHandle = setTimeout(() => els.toast.classList.remove("is-visible"), 2200);
  }

  function formatTime(total) {
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return [hours, minutes, seconds].map((n) => String(n).padStart(2, "0")).join(":");
  }

  function renderTimer() {
    els.timer.textContent = formatTime(state.elapsed);
    els.timerToggle.textContent = state.timerRunning ? "Ⅱ" : "▶";
    els.timerToggle.setAttribute("aria-label", state.timerRunning ? "暂停计时" : "继续计时");
  }

  function syncTimer() {
    clearInterval(timerHandle);
    timerHandle = null;
    if (state.started && state.timerRunning) {
      timerHandle = setInterval(() => {
        state.elapsed += 1;
        renderTimer();
        if (state.elapsed % 10 === 0) persist();
      }, 1000);
    }
    renderTimer();
  }

  function currentQuestion() {
    return questions.find((q) => q.id === Number(state.currentId)) || questions[0];
  }

  function filteredQuestions() {
    return questions.filter((q) => {
      if (state.topic !== "all" && q.topic !== state.topic) return false;
      if (state.filter === "todo" && state.submitted[q.id]) return false;
      if (state.filter === "wrong" && state.results[q.id] !== false) return false;
      if (state.filter === "favorite" && !state.favorites.includes(q.id)) return false;
      return true;
    });
  }

  function ensureCurrentInFilter() {
    const list = filteredQuestions();
    if (list.length && !list.some((q) => q.id === Number(state.currentId))) state.currentId = list[0].id;
    return list;
  }

  function renderTopics() {
    const counts = new Map();
    questions.forEach((q) => counts.set(q.topic, (counts.get(q.topic) || 0) + 1));
    els.topic.innerHTML = '<option value="all">全部题型（' + questions.length + '）</option>' +
      [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], "zh-CN")).map(([topic, count]) =>
        '<option value="' + escapeHtml(topic) + '">' + escapeHtml(topic) + '（' + count + '）</option>'
      ).join("");
    els.topic.value = state.topic;
  }

  function renderStats() {
    const done = Object.keys(state.submitted).filter((id) => state.submitted[id]).length;
    const correct = Object.values(state.results).filter(Boolean).length;
    const wrong = Object.values(state.results).filter((x) => x === false).length;
    const percent = Math.round((done / questions.length) * 100);
    els.progressRing.style.setProperty("--progress", (percent * 3.6) + "deg");
    els.progressPercent.textContent = percent + "%";
    els.doneCount.textContent = done;
    els.correctSummary.textContent = "答对 " + correct + " 题";
    els.allCount.textContent = questions.length;
    els.todoCount.textContent = questions.length - done;
    els.wrongCount.textContent = wrong;
    els.favoriteCount.textContent = state.favorites.length;
    document.querySelectorAll(".filter-button").forEach((button) => button.classList.toggle("is-active", button.dataset.filter === state.filter));
  }

  function renderQuestion() {
    const list = ensureCurrentInFilter();
    const empty = list.length === 0;
    els.empty.classList.toggle("is-hidden", !empty);
    els.card.classList.toggle("is-hidden", empty);
    renderStats();
    if (empty) return;

    const q = currentQuestion();
    const selected = state.selected[q.id];
    const submitted = Boolean(state.submitted[q.id]);
    const indexInFilter = list.findIndex((x) => x.id === q.id);
    els.topicBadge.textContent = q.topic;
    els.number.textContent = "第 " + q.id + " 题 / 共 " + questions.length + " 题";
    els.text.textContent = q.question;
    els.favorite.classList.toggle("is-active", state.favorites.includes(q.id));
    els.favorite.textContent = state.favorites.includes(q.id) ? "★" : "☆";
    els.favorite.setAttribute("aria-pressed", state.favorites.includes(q.id) ? "true" : "false");

    els.options.innerHTML = "";
    q.options.forEach((option, optionIndex) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option";
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", selected === option.id ? "true" : "false");
      button.dataset.option = option.id;
      if (selected === option.id) button.classList.add("is-selected");
      if (submitted && option.id === q.answer) button.classList.add("is-correct");
      if (submitted && selected === option.id && selected !== q.answer) button.classList.add("is-wrong");
      button.disabled = submitted;
      const status = submitted && option.id === q.answer ? "✓" : (submitted && selected === option.id && selected !== q.answer ? "×" : "");
      button.innerHTML = '<span class="option-letter">' + option.id + '</span><span class="option-text">' + escapeHtml(option.text) + '</span><span class="option-status">' + status + '</span>';
      button.addEventListener("click", () => selectOption(q.id, option.id));
      button.setAttribute("aria-label", "选项" + (optionIndex + 1) + "：" + option.text);
      els.options.appendChild(button);
    });

    els.submit.disabled = !selected || submitted;
    els.submit.textContent = submitted ? "已提交" : "提交答案";
    els.resultPanel.classList.toggle("is-hidden", !submitted);
    if (submitted) {
      const isCorrect = state.results[q.id];
      const correctOption = q.options.find((x) => x.id === q.answer);
      els.resultTitle.className = "result-title " + (isCorrect ? "correct" : "wrong");
      els.resultTitle.textContent = isCorrect ? "回答正确，很稳！" : "这题答错了，正确答案是 " + q.answer + "．" + (correctOption ? correctOption.text : "");
      els.analysis.textContent = q.explanation;
    }
    els.prev.disabled = indexInFilter <= 0;
    els.next.disabled = indexInFilter < 0 || indexInFilter >= list.length - 1;
    persist();
  }

  function selectOption(questionId, optionId) {
    if (state.submitted[questionId]) return;
    state.selected[questionId] = optionId;
    persist();
    renderQuestion();
  }

  function submitAnswer() {
    const q = currentQuestion();
    const selected = state.selected[q.id];
    if (!selected || state.submitted[q.id]) return;
    state.submitted[q.id] = true;
    state.results[q.id] = selected === q.answer;
    persist("本题结果已保存");
    renderQuestion();
    setTimeout(() => els.resultPanel.scrollIntoView({ behavior: "smooth", block: "nearest" }), 80);
  }

  function move(delta) {
    const list = ensureCurrentInFilter();
    const index = list.findIndex((q) => q.id === Number(state.currentId));
    const next = list[index + delta];
    if (!next) return;
    state.currentId = next.id;
    persist();
    renderQuestion();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleFavorite() {
    const id = currentQuestion().id;
    if (state.favorites.includes(id)) state.favorites = state.favorites.filter((x) => x !== id);
    else state.favorites.push(id);
    persist();
    renderQuestion();
  }

  function openNavigator() {
    renderNavigator();
    els.navModal.classList.remove("is-hidden");
    els.navBackdrop.classList.remove("is-hidden");
    els.navBackdrop.setAttribute("aria-hidden", "false");
    setTimeout(() => els.navSearch.focus(), 50);
  }

  function closeNavigator() {
    els.navModal.classList.add("is-hidden");
    els.navBackdrop.classList.add("is-hidden");
    els.navBackdrop.setAttribute("aria-hidden", "true");
    els.navSearch.value = "";
  }

  function renderNavigator() {
    const term = els.navSearch.value.trim().toLowerCase();
    const visible = questions.filter((q) => !term || String(q.id).includes(term) || q.question.toLowerCase().includes(term) || q.topic.toLowerCase().includes(term));
    els.navGrid.innerHTML = "";
    visible.forEach((q) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "grid-button";
      if (state.submitted[q.id]) button.classList.add("is-done");
      if (state.results[q.id] === false) button.classList.add("is-wrong");
      if (q.id === Number(state.currentId)) button.classList.add("is-current");
      button.textContent = q.id;
      button.title = q.topic + "：" + q.question;
      button.addEventListener("click", () => {
        state.filter = "all";
        state.topic = "all";
        state.currentId = q.id;
        els.topic.value = "all";
        closeNavigator();
        persist();
        renderQuestion();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
      els.navGrid.appendChild(button);
    });
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  }

  function startStudy() {
    state.started = true;
    state.timerRunning = true;
    els.welcome.classList.add("is-hidden");
    els.app.classList.remove("is-hidden");
    persist();
    syncTimer();
    renderQuestion();
  }

  async function triggerInstall() {
    if (!deferredInstallPrompt) {
      showToast("可在浏览器菜单中选择“添加到主屏幕”");
      return;
    }
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    els.install.classList.add("is-hidden");
    els.installWelcome.classList.add("is-hidden");
  }

  function bindEvents() {
    els.start.addEventListener("click", startStudy);
    els.timerToggle.addEventListener("click", () => {
      state.timerRunning = !state.timerRunning;
      persist(state.timerRunning ? "计时已继续" : "计时已暂停");
      syncTimer();
      showToast(state.timerRunning ? "继续计时" : "计时已暂停");
    });
    els.save.addEventListener("click", () => { state.timerRunning = false; persist("全部进度已保存"); syncTimer(); showToast("已保存并暂停计时，可以安全退出"); });
    els.submit.addEventListener("click", submitAnswer);
    [els.prev, els.mobilePrev].forEach((el) => el.addEventListener("click", () => move(-1)));
    [els.next, els.mobileNext].forEach((el) => el.addEventListener("click", () => move(1)));
    els.favorite.addEventListener("click", toggleFavorite);
    document.querySelectorAll(".filter-button").forEach((button) => button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      ensureCurrentInFilter();
      persist();
      renderQuestion();
    }));
    els.topic.addEventListener("change", () => { state.topic = els.topic.value; ensureCurrentInFilter(); persist(); renderQuestion(); });
    els.clearFilters.addEventListener("click", () => { state.filter = "all"; state.topic = "all"; els.topic.value = "all"; renderQuestion(); });
    [els.openNav, els.mobileNav].forEach((el) => el.addEventListener("click", openNavigator));
    els.closeNav.addEventListener("click", closeNavigator);
    els.navBackdrop.addEventListener("click", closeNavigator);
    els.navSearch.addEventListener("input", renderNavigator);
    els.install.addEventListener("click", triggerInstall);
    els.installWelcome.addEventListener("click", triggerInstall);
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      els.install.classList.remove("is-hidden");
      els.installWelcome.classList.remove("is-hidden");
    });
    window.addEventListener("keydown", (event) => {
      if (!els.navModal.classList.contains("is-hidden") && event.key === "Escape") return closeNavigator();
      if (!state.started || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
      const q = currentQuestion();
      const number = Number(event.key);
      if (number >= 1 && number <= q.options.length) selectOption(q.id, q.options[number - 1].id);
      if (event.key === "Enter") submitAnswer();
      if (event.key === "ArrowLeft") move(-1);
      if (event.key === "ArrowRight") move(1);
    });
    window.addEventListener("pagehide", () => persist());
  }

  function init() {
    if (!questions.length) {
      document.body.innerHTML = "<p style='padding:2rem'>题库载入失败，请重新上传完整文件。</p>";
      return;
    }
    bindEvents();
    renderTopics();
    renderTimer();
    els.start.textContent = state.started ? "继续上次进度" : "开始答题";
    if (state.started) {
      els.welcome.classList.add("is-hidden");
      els.app.classList.remove("is-hidden");
      state.timerRunning = true;
      syncTimer();
      renderQuestion();
    }
    if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }

  init();
})();

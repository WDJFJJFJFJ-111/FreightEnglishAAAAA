// ─── App State ────────────────────────────────────────────────────────────────
const App = {
  vocab: [],
  sentences: [],
  dialogues: [],
  vocabById: {},

  dlgIdx: 0,
  vocabFilter: '',

  learned: new Set(),
  streak: 0,
  lastDate: '',
  currentTab: 'home',

  // SRS state
  srsProgress: {},     // { [wordId]: { level, review_count, next_review } }
  reviewSession: null, // { queue, idx, stats } when active

  // ─── Init ──────────────────────────────────────────────────────────────────
  async init() {
    this.loadProgress();
    this.loadSRSProgress();
    this.updateStreak();
    try {
      const [vocab, sentences, dialogues] = await Promise.all([
        fetch('vocabulary.json').then(r => r.json()),
        fetch('sentences.json').then(r => r.json()),
        fetch('dialogues.json').then(r => r.json()),
      ]);
      this.vocab = vocab;
      this.sentences = sentences;
      this.dialogues = dialogues;
      this.vocab.forEach(w => { this.vocabById[w.id] = w; });
    } catch (e) {
      console.error('Data load error:', e);
      document.getElementById('main').innerHTML =
        '<div class="card" style="color:#991b1b">Failed to load data. Please serve via HTTP (npx serve .)</div>';
      return;
    }
    document.getElementById('streak-num').textContent = this.streak;
    this.switchTab('home');
  },

  // ─── Navigation ────────────────────────────────────────────────────────────
  switchTab(tab) {
    this.currentTab = tab;
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.tab === tab);
    });
    const renders = {
      home:      () => this.renderHome(),
      words:     () => this.renderWords(),
      sentences: () => this.renderSentences(),
      dialogue:  () => this.renderDialogue(),
      review:    () => this.renderReview(),
      progress:  () => this.renderProgress(),
    };
    (renders[tab] || renders.home)();
  },

  // ─── Home Tab ──────────────────────────────────────────────────────────────
  renderHome() {
    const dayNum = Math.floor(Date.now() / 86400000);
    const word = this.vocab[dayNum % this.vocab.length];
    const sent = this.sentences[dayNum % this.sentences.length];
    const learnedCount = this.learned.size;
    const total = this.vocab.length;
    const { reviewWords, newWords } = this.getDailyLearningSet();
    const dueCount = reviewWords.length + newWords.slice(0, Math.max(0, 10 - reviewWords.length)).length;

    document.getElementById('main').innerHTML = `
      <div class="stats-strip">
        <div class="stat-box">
          <div class="stat-num">${this.streak}</div>
          <div class="stat-label">Day Streak 🔥</div>
        </div>
        <div class="stat-box">
          <div class="stat-num">${learnedCount}</div>
          <div class="stat-label">Mastered</div>
        </div>
        <div class="stat-box">
          <div class="stat-num">${reviewWords.length}</div>
          <div class="stat-label">Due Today</div>
        </div>
      </div>
      ${dueCount > 0 ? `
        <button class="btn-start-review" onclick="App.switchTab('review')">
          🔁 Start Review — ${dueCount} cards due
        </button>` : `
        <div class="card" style="text-align:center;padding:20px 16px">
          <div style="font-size:36px;margin-bottom:8px">🎉</div>
          <div class="meaning" style="font-weight:700">All caught up!</div>
          <div class="phonetic" style="margin-top:4px">No cards due today</div>
        </div>`}
      <div class="section-title" style="margin-top:6px">📖 Word of the Day</div>
      ${this.buildWordCard(word)}
      <div class="section-title" style="margin-top:20px">💬 Sentence of the Day</div>
      ${this.buildSentCard(sent)}
    `;
  },

  // ─── Vocabulary Tab (searchable list) ──────────────────────────────────────
  renderWords() {
    // Only build the shell once; let _renderWordList fill the list
    if (!document.getElementById('vocab-list')) {
      document.getElementById('main').innerHTML = `
        <input
          type="search"
          id="vocab-search"
          class="search-bar"
          placeholder="🔍  Search vocabulary..."
          oninput="App.filterWords(this.value)"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
        >
        <div id="vocab-result-count" class="result-count"></div>
        <div id="vocab-list"></div>
      `;
    }
    this._renderWordList();
  },

  _renderWordList() {
    const q = this.vocabFilter.toLowerCase().trim();
    const filtered = q
      ? this.vocab.filter(w =>
          w.word.toLowerCase().includes(q) ||
          w.zh.includes(q) ||
          (w.abbr && w.abbr.toLowerCase().includes(q)) ||
          w.example.toLowerCase().includes(q))
      : this.vocab;

    const countEl = document.getElementById('vocab-result-count');
    if (countEl) {
      countEl.textContent = q
        ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''} for "${this.vocabFilter}"`
        : `${filtered.length} words total`;
    }

    const listEl = document.getElementById('vocab-list');
    if (listEl) {
      listEl.innerHTML = filtered.length
        ? filtered.map(w => this.buildWordCard(w)).join('')
        : '<div class="card" style="text-align:center;color:#94a3b8;padding:30px">No results found</div>';
    }
  },

  filterWords(query) {
    this.vocabFilter = query;
    this._renderWordList();
    // Restore cursor position in search input
    const input = document.getElementById('vocab-search');
    if (input && document.activeElement !== input) input.focus();
  },

  // ─── Sentences Tab (full list) ─────────────────────────────────────────────
  renderSentences() {
    const cards = this.sentences.map(s => this.buildSentCard(s)).join('');
    document.getElementById('main').innerHTML = `
      <div class="section-title">${this.sentences.length} Logistics Sentences</div>
      ${cards}
    `;
  },

  // ─── Dialogue Tab ──────────────────────────────────────────────────────────
  renderDialogue() {
    if (!this.dialogues.length) return;
    const d = this.dialogues[this.dlgIdx];
    const di = this.dlgIdx;
    const linesHtml = d.lines.map((line, li) => `
      <div class="dialogue-line ${line.role === 'A' ? 'role-a' : 'role-b'}">
        <div class="line-header">
          <span class="role-label">${line.label}</span>
          <button class="btn-speak-sm" onclick="App.speakLine(${di},${li})">🔊</button>
        </div>
        <div class="line-en">${line.en}</div>
        <div class="line-zh">${line.zh}</div>
      </div>
    `).join('');

    document.getElementById('main').innerHTML = `
      <div class="pager">
        <button class="btn-nav" onclick="App.prevDlg()">◀</button>
        <span class="pager-num">${this.dlgIdx + 1} / ${this.dialogues.length}</span>
        <button class="btn-nav" onclick="App.nextDlg()">▶</button>
      </div>
      <div class="card">
        <div class="word">${d.title}</div>
        <div class="meaning">${d.title_zh}</div>
        <div class="phonetic" style="margin-top:6px">${d.scene_zh}</div>
      </div>
      <div class="dialogue-box">${linesHtml}</div>
      <button class="btn-speak-all" onclick="App.speakAll(${di})">🔊 Read All Lines</button>
    `;
  },

  prevDlg() { this.dlgIdx = (this.dlgIdx - 1 + this.dialogues.length) % this.dialogues.length; this.renderDialogue(); },
  nextDlg() { this.dlgIdx = (this.dlgIdx + 1) % this.dialogues.length; this.renderDialogue(); },

  speakLine(dlgIdx, lineIdx) {
    const line = this.dialogues[dlgIdx].lines[lineIdx];
    if (line) this.speak(line.en);
  },

  speakAll(dlgIdx) {
    const lines = this.dialogues[dlgIdx].lines;
    let i = 0;
    const next = () => {
      if (i >= lines.length) return;
      const u = new SpeechSynthesisUtterance(lines[i].en);
      u.lang = 'en-US';
      u.rate = 0.85;
      this._applyEnglishVoice(u);
      u.onend = () => { i++; setTimeout(next, 600); };
      speechSynthesis.speak(u);
    };
    speechSynthesis.cancel();
    next();
  },

  // ─── Progress Tab ──────────────────────────────────────────────────────────
  renderProgress() {
    const total = this.vocab.length;
    const learnedCount = this.learned.size;
    const pct = total ? Math.round(learnedCount / total * 100) : 0;

    const catTotal = {}, catLearned = {};
    this.vocab.forEach(w => {
      catTotal[w.category] = (catTotal[w.category] || 0) + 1;
      if (this.learned.has(w.id)) catLearned[w.category] = (catLearned[w.category] || 0) + 1;
    });

    const catRows = Object.keys(catTotal).map(c => {
      const done = catLearned[c] || 0;
      const tot = catTotal[c];
      const p = Math.round(done / tot * 100);
      return `
        <div class="progress-row">
          <span class="progress-label">${c}</span>
          <div class="mini-bar-wrap"><div class="mini-bar" style="width:${p}%"></div></div>
          <span class="progress-count">${done}/${tot}</span>
        </div>`;
    }).join('');

    document.getElementById('main').innerHTML = `
      <div class="card">
        <div class="word" style="text-align:center">Learning Progress</div>
        <div class="big-progress-wrap">
          <div class="big-progress-bar" style="width:${pct}%"></div>
        </div>
        <div class="meaning" style="text-align:center;margin-top:8px">${learnedCount} / ${total} words mastered (${pct}%)</div>
        <div class="meaning" style="text-align:center;margin-top:4px">🔥 ${this.streak}-day streak</div>
      </div>
      <div class="card">
        <div class="meaning" style="font-weight:700;margin-bottom:14px">Progress by Category</div>
        ${catRows}
      </div>
      <button class="btn-reset" onclick="App.resetProgress()">🗑  Reset Progress</button>
    `;
  },

  // ─── Card Builders ─────────────────────────────────────────────────────────
  buildWordCard(w) {
    if (!w) return '<div class="card">No data</div>';
    const isLearned = this.learned.has(w.id);
    return `
      <div class="card">
        <div class="word-row">
          <span class="word">${w.word}</span>
          ${w.abbr ? `<span class="abbr-badge">${w.abbr}</span>` : ''}
          <span class="level-badge level-${w.level}">L${w.level}</span>
        </div>
        ${w.phonetic ? `<div class="phonetic">[${w.phonetic}]</div>` : ''}
        <div class="meaning">${w.zh}</div>
        <div class="example">"${w.example}"</div>
        <div class="btn-row">
          <button class="btn-speak" onclick="App.speakVocab(${w.id})">🔊 发音</button>
          <button class="btn-example" onclick="App.speakVocabExample(${w.id})">📖 例句</button>
          <button class="btn-mark ${isLearned ? 'learned' : ''}" onclick="App.toggleLearn(${w.id})">
            ${isLearned ? '✅ Learned' : '📌 Mark'}
          </button>
        </div>
      </div>`;
  },

  buildSentCard(s) {
    if (!s) return '<div class="card">No data</div>';
    return `
      <div class="card">
        <span class="cat-badge cat-${s.category}">${s.category}</span>
        <div class="sent-en">${s.sentence}</div>
        <div class="sent-zh">${s.zh}</div>
        <div class="btn-row" style="margin-top:12px">
          <button class="btn-speak" onclick="App.speakSent(${s.id})">🔊 Listen</button>
        </div>
      </div>`;
  },

  // ─── Speech ────────────────────────────────────────────────────────────────
  speakVocab(id) {
    const w = this.vocabById[id];
    if (w) this.speak(w.word);
  },

  speakVocabExample(id) {
    const w = this.vocabById[id];
    if (w) this.speak(w.example);
  },

  speakSent(id) {
    const s = this.sentences.find(x => x.id === id);
    if (s) this.speak(s.sentence);
  },

  speak(text) {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.85;
    const go = () => {
      this._applyEnglishVoice(u);
      speechSynthesis.speak(u);
    };
    if (speechSynthesis.getVoices().length > 0) {
      go();
    } else {
      speechSynthesis.addEventListener('voiceschanged', go, { once: true });
    }
  },

  _applyEnglishVoice(utterance) {
    const voices = speechSynthesis.getVoices();
    const voice = voices.find(v => v.lang === 'en-US' && v.localService)
               || voices.find(v => v.lang.startsWith('en') && v.localService)
               || voices.find(v => v.lang === 'en-US')
               || voices.find(v => v.lang.startsWith('en'));
    if (voice) utterance.voice = voice;
  },

  // ─── SRS Helpers ───────────────────────────────────────────────────────────
  getTodayStr() {
    return new Date().toISOString().slice(0, 10);
  },

  loadSRSProgress() {
    try {
      const raw = localStorage.getItem('freightEnglishProgress');
      this.srsProgress = raw ? JSON.parse(raw) : {};
    } catch (e) {
      this.srsProgress = {};
    }
  },

  saveSRSProgress() {
    try {
      localStorage.setItem('freightEnglishProgress', JSON.stringify(this.srsProgress));
    } catch (e) {}
  },

  getDailyLearningSet() {
    const today = this.getTodayStr();
    const reviewWords = [];
    const newWords = [];
    this.vocab.forEach(w => {
      const p = this.srsProgress[w.id];
      if (!p) {
        newWords.push(w);
      } else if (p.next_review <= today) {
        reviewWords.push(w);
      }
    });
    return { reviewWords, newWords };
  },

  srsReview(wordId, result) {
    const INTERVALS = [0, 1, 3, 7, 15, 30];
    const today = this.getTodayStr();
    const p = this.srsProgress[wordId] || { level: 0, review_count: 0, next_review: today };

    if (result === 'good')  p.level = Math.min(p.level + 1, INTERVALS.length - 1);
    else if (result === 'again') p.level = Math.max(p.level - 1, 0);
    // 'hard': level unchanged

    const next = new Date();
    next.setDate(next.getDate() + INTERVALS[p.level]);
    p.next_review   = next.toISOString().slice(0, 10);
    p.review_count  = (p.review_count || 0) + 1;

    this.srsProgress[wordId] = p;
    this.saveSRSProgress();
  },

  // ─── Review Tab ────────────────────────────────────────────────────────────
  renderReview() {
    if (!this.vocab.length) return;
    if (!this.reviewSession) {
      this._renderReviewHome();
    } else if (this.reviewSession.idx < this.reviewSession.queue.length) {
      this._renderReviewCard();
    } else {
      this._renderReviewDone();
    }
  },

  _renderReviewHome() {
    const { reviewWords, newWords } = this.getDailyLearningSet();
    const MAX_REVIEW = 20, MAX_NEW = 10;
    const queueReview = reviewWords.slice(0, MAX_REVIEW);
    const queueNew    = newWords.slice(0, Math.max(MAX_NEW, 30 - queueReview.length));
    const total       = queueReview.length + queueNew.length;

    document.getElementById('main').innerHTML = `
      <div class="card">
        <div class="meaning" style="font-weight:700;margin-bottom:14px">📅 今日学习</div>
        <div class="review-stat-grid">
          <div class="review-stat-box review-stat-due">
            <div class="review-stat-num">${reviewWords.length}</div>
            <div class="review-stat-label">待复习</div>
          </div>
          <div class="review-stat-box review-stat-new">
            <div class="review-stat-num">${newWords.length}</div>
            <div class="review-stat-label">新词</div>
          </div>
          <div class="review-stat-box review-stat-queue">
            <div class="review-stat-num">${total}</div>
            <div class="review-stat-label">今日卡片</div>
          </div>
        </div>
        ${total > 0
          ? `<button class="btn-start-review" style="margin-top:16px" onclick="App.startReview()">开始学习 →</button>`
          : `<div style="text-align:center;padding:16px 0">
               <div style="font-size:36px">🎉</div>
               <div class="meaning" style="margin-top:8px;font-weight:700">今日全部完成！</div>
             </div>`
        }
      </div>
      <div class="card">
        <div class="meaning" style="font-weight:700;margin-bottom:12px">📊 SRS 等级分布</div>
        ${this._buildSRSLevelRows()}
      </div>
    `;
  },

  startReview() {
    const { reviewWords, newWords } = this.getDailyLearningSet();
    const MAX_REVIEW = 20, MAX_NEW = 10;
    const queueReview = reviewWords.slice(0, MAX_REVIEW);
    const queueNew    = newWords.slice(0, Math.max(MAX_NEW, 30 - queueReview.length));
    // Shuffle to mix review and new
    const queue = [...queueReview, ...queueNew].sort(() => Math.random() - 0.5);
    this.reviewSession = { queue, idx: 0, stats: { again: 0, hard: 0, good: 0 } };
    this._renderReviewCard();
  },

  _renderReviewCard() {
    const { queue, idx, stats } = this.reviewSession;
    const w   = queue[idx];
    const pct = Math.round((idx / queue.length) * 100);
    const p   = this.srsProgress[w.id];
    const lvl = p ? `L${p.level}` : 'New';

    document.getElementById('main').innerHTML = `
      <div class="review-header">
        <button class="review-quit" onclick="App.quitReview()">✕</button>
        <div class="review-bar-wrap">
          <div class="review-bar" style="width:${pct}%"></div>
        </div>
        <span class="review-counter">${idx + 1}/${queue.length}</span>
      </div>
      <div class="card review-card">
        <div class="review-level-tag">${lvl}</div>
        <div class="review-word">${w.word}</div>
        ${w.abbr ? `<div class="abbr-badge" style="margin:6px 0">${w.abbr}</div>` : ''}
        ${w.phonetic ? `<div class="phonetic">[${w.phonetic}]</div>` : ''}
        <div class="review-meaning">${w.zh}</div>
        <div class="review-example">"${w.example}"</div>
        <div class="btn-row" style="margin-top:14px">
          <button class="btn-speak" onclick="App.speakVocab(${w.id})">🔊 发音</button>
          <button class="btn-example" onclick="App.speakVocabExample(${w.id})">📖 例句</button>
        </div>
      </div>
      <div class="review-btn-row">
        <button class="btn-review-again" onclick="App.reviewCard('again')">
          <span class="rbtn-icon">✕</span>
          <span class="rbtn-label">不会</span>
        </button>
        <button class="btn-review-hard" onclick="App.reviewCard('hard')">
          <span class="rbtn-icon">△</span>
          <span class="rbtn-label">一般</span>
        </button>
        <button class="btn-review-good" onclick="App.reviewCard('good')">
          <span class="rbtn-icon">✓</span>
          <span class="rbtn-label">记住了</span>
        </button>
      </div>
      <div class="review-session-stats">
        <span class="rss-again">✕ ${stats.again}</span>
        <span class="rss-hard">△ ${stats.hard}</span>
        <span class="rss-good">✓ ${stats.good}</span>
      </div>
    `;
  },

  reviewCard(result) {
    const w = this.reviewSession.queue[this.reviewSession.idx];
    this.srsReview(w.id, result);
    this.reviewSession.stats[result]++;
    this.reviewSession.idx++;
    this.renderReview();
  },

  quitReview() {
    this.reviewSession = null;
    this.renderReview();
  },

  _renderReviewDone() {
    const { stats, queue } = this.reviewSession;
    document.getElementById('main').innerHTML = `
      <div class="card" style="text-align:center;padding:28px 20px">
        <div style="font-size:52px;margin-bottom:12px">🎉</div>
        <div class="word">今日学习完成！</div>
        <div class="review-done-stats">
          <div class="rds-box rds-again"><div class="rds-num">${stats.again}</div><div class="rds-lbl">不会</div></div>
          <div class="rds-box rds-hard"><div class="rds-num">${stats.hard}</div><div class="rds-lbl">一般</div></div>
          <div class="rds-box rds-good"><div class="rds-num">${stats.good}</div><div class="rds-lbl">记住了</div></div>
        </div>
        <div class="phonetic" style="margin-top:12px">共复习 ${queue.length} 张卡片</div>
      </div>
      <button class="btn-start-review" onclick="App.finishReview()">← 返回</button>
    `;
  },

  finishReview() {
    this.reviewSession = null;
    this.renderReview();
  },

  _buildSRSLevelRows() {
    const INTERVALS = [0, 1, 3, 7, 15, 30];
    const labels = ['新词', 'L1 · 1天', 'L2 · 3天', 'L3 · 7天', 'L4 · 15天', 'L5 · 30天'];
    const colors = ['#94a3b8', '#60a5fa', '#34d399', '#a78bfa', '#f59e0b', '#10b981'];
    const counts = new Array(INTERVALS.length).fill(0);
    let newCount = 0;

    this.vocab.forEach(w => {
      const p = this.srsProgress[w.id];
      if (!p) { newCount++; }
      else { counts[Math.min(p.level, INTERVALS.length - 1)]++; }
    });

    const total = this.vocab.length;
    const allCounts = [newCount, ...counts.slice(1)]; // L0 bucket = new
    // Overwrite index 0 with actual L0 (seen but at level 0)
    allCounts[0] = newCount + counts[0];

    return labels.map((label, i) => {
      const count = i === 0 ? newCount : counts[i];
      const pct   = total ? Math.round(count / total * 100) : 0;
      return `
        <div class="progress-row">
          <span class="progress-label" style="color:${colors[i]};font-weight:600">${label}</span>
          <div class="mini-bar-wrap"><div class="mini-bar" style="width:${pct}%;background:${colors[i]}"></div></div>
          <span class="progress-count">${count}</span>
        </div>`;
    }).join('');
  },

  // ─── Progress Management ───────────────────────────────────────────────────
  toggleLearn(id) {
    if (this.learned.has(id)) this.learned.delete(id);
    else this.learned.add(id);
    this.saveProgress();
    this.switchTab(this.currentTab);
  },

  updateStreak() {
    const today = new Date().toDateString();
    if (this.lastDate === today) return;
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    this.streak = (this.lastDate === yesterday) ? this.streak + 1 : 1;
    this.lastDate = today;
    this.saveProgress();
  },

  saveProgress() {
    try {
      localStorage.setItem('fet_learned', JSON.stringify([...this.learned]));
      localStorage.setItem('fet_streak', String(this.streak));
      localStorage.setItem('fet_last_date', this.lastDate);
    } catch (e) {}
  },

  loadProgress() {
    try {
      const l = localStorage.getItem('fet_learned');
      this.learned = new Set(l ? JSON.parse(l).map(Number) : []);
      this.streak = parseInt(localStorage.getItem('fet_streak') || '0', 10);
      this.lastDate = localStorage.getItem('fet_last_date') || '';
    } catch (e) {
      this.learned = new Set();
    }
  },

  resetProgress() {
    if (!confirm('Reset all learning progress? This cannot be undone.')) return;
    this.learned = new Set();
    this.streak = 0;
    this.lastDate = new Date().toDateString();
    this.saveProgress();
    document.getElementById('streak-num').textContent = 0;
    this.renderProgress();
  },

  toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.getElementById('toasts').appendChild(el);
    setTimeout(() => el.remove(), 2600);
  },
};

window.addEventListener('load', () => App.init());

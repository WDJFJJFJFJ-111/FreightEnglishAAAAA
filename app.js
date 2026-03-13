// ─── App State ────────────────────────────────────────────────────────────────
const App = {
  vocab: [],       // from vocabulary.json
  sentences: [],   // from sentences.json
  dialogues: [],   // from dialogues.json
  // vocab lookup by id for O(1) access
  vocabById: {},

  wordIdx: 0,
  sentIdx: 0,
  dlgIdx: 0,

  learned: new Set(),
  streak: 0,
  lastDate: '',
  currentTab: 'home',

  // ─── Init ──────────────────────────────────────────────────────────────────
  async init() {
    this.loadProgress();
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
        '<div class="card" style="color:#c00">数据加载失败，请通过 HTTP 服务器访问（npx serve .）</div>';
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
      progress:  () => this.renderProgress(),
    };
    (renders[tab] || renders.home)();
  },

  // ─── Home Tab ──────────────────────────────────────────────────────────────
  renderHome() {
    const dayNum = Math.floor(Date.now() / 86400000);
    const word = this.vocab[dayNum % this.vocab.length];
    const sent = this.sentences[dayNum % this.sentences.length];
    document.getElementById('main').innerHTML = `
      <div class="section-title">📖 今日单词</div>
      ${this.buildWordCard(word)}
      <div class="section-title" style="margin-top:20px">💬 今日句子</div>
      ${this.buildSentCard(sent)}
    `;
  },

  // ─── Words Tab ─────────────────────────────────────────────────────────────
  renderWords() {
    if (!this.vocab.length) return;
    const w = this.vocab[this.wordIdx];
    document.getElementById('main').innerHTML = `
      <div class="pager">
        <button class="btn-nav" onclick="App.prevWord()">◀</button>
        <span class="pager-num">${this.wordIdx + 1} / ${this.vocab.length}</span>
        <button class="btn-nav" onclick="App.nextWord()">▶</button>
      </div>
      <div class="cat-badge cat-${w.category}">${w.category}</div>
      ${this.buildWordCard(w)}
    `;
  },
  prevWord() { this.wordIdx = (this.wordIdx - 1 + this.vocab.length) % this.vocab.length; this.renderWords(); },
  nextWord() { this.wordIdx = (this.wordIdx + 1) % this.vocab.length; this.renderWords(); },

  // ─── Sentences Tab ─────────────────────────────────────────────────────────
  renderSentences() {
    if (!this.sentences.length) return;
    const s = this.sentences[this.sentIdx];
    document.getElementById('main').innerHTML = `
      <div class="pager">
        <button class="btn-nav" onclick="App.prevSent()">◀</button>
        <span class="pager-num">${this.sentIdx + 1} / ${this.sentences.length}</span>
        <button class="btn-nav" onclick="App.nextSent()">▶</button>
      </div>
      ${this.buildSentCard(s)}
    `;
  },
  prevSent() { this.sentIdx = (this.sentIdx - 1 + this.sentences.length) % this.sentences.length; this.renderSentences(); },
  nextSent() { this.sentIdx = (this.sentIdx + 1) % this.sentences.length; this.renderSentences(); },

  // ─── Dialogue Tab ──────────────────────────────────────────────────────────
  renderDialogue() {
    if (!this.dialogues.length) return;
    const d = this.dialogues[this.dlgIdx];
    const di = this.dlgIdx;
    const linesHtml = d.lines.map((line, li) => `
      <div class="dialogue-line ${line.role === 'A' ? 'role-a' : 'role-b'}">
        <div class="line-header">
          <span class="role-label">${line.label}</span>
          <button class="btn-speak-sm" onclick="App.speakLine(${di}, ${li})">🔊</button>
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
      <button class="btn-speak-all" onclick="App.speakAll(${di})">🔊 连续朗读全部</button>
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
        <div class="word" style="text-align:center">学习进度</div>
        <div class="big-progress-wrap">
          <div class="big-progress-bar" style="width:${pct}%"></div>
        </div>
        <div class="meaning" style="text-align:center;margin-top:8px">${learnedCount} / ${total} 词已掌握 (${pct}%)</div>
        <div class="meaning" style="text-align:center">🔥 连续学习 ${this.streak} 天</div>
      </div>
      <div class="card">
        <div class="meaning" style="font-weight:bold;margin-bottom:12px">分类进度</div>
        ${catRows}
      </div>
      <button class="btn-reset" onclick="App.resetProgress()">🗑 重置进度</button>
    `;
  },

  // ─── Card Builders ─────────────────────────────────────────────────────────
  buildWordCard(w) {
    if (!w) return '<div class="card">暂无数据</div>';
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
          <button class="btn-speak" onclick="App.speakVocab(${w.id})">🔊 朗读例句</button>
          <button class="btn-mark ${isLearned ? 'learned' : ''}" onclick="App.toggleLearn(${w.id})">
            ${isLearned ? '✅ 已掌握' : '📌 标记掌握'}
          </button>
        </div>
      </div>`;
  },

  buildSentCard(s) {
    if (!s) return '<div class="card">暂无数据</div>';
    return `
      <div class="card">
        <div class="cat-badge cat-${s.category}">${s.category}</div>
        <div class="line-en" style="font-size:17px;margin:10px 0">${s.sentence}</div>
        <div class="meaning">${s.zh}</div>
        <button class="btn-speak" onclick="App.speakSent(${s.id})">🔊 朗读句子</button>
      </div>`;
  },

  // ─── Speak Helpers (use IDs to avoid inline string escaping) ──────────────
  speakVocab(id) {
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
    u.rate = 0.9;
    const go = () => {
      this._applyEnglishVoice(u);
      speechSynthesis.speak(u);
    };
    // Voices may not be loaded yet on first call
    if (speechSynthesis.getVoices().length > 0) {
      go();
    } else {
      speechSynthesis.addEventListener('voiceschanged', go, { once: true });
    }
  },

  _applyEnglishVoice(utterance) {
    const voices = speechSynthesis.getVoices();
    // Prefer local en-US, then any en-*, then nothing (browser default)
    const voice = voices.find(v => v.lang === 'en-US' && v.localService)
               || voices.find(v => v.lang.startsWith('en') && v.localService)
               || voices.find(v => v.lang === 'en-US')
               || voices.find(v => v.lang.startsWith('en'));
    if (voice) utterance.voice = voice;
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
    if (!confirm('确认重置所有学习进度？此操作不可撤销。')) return;
    this.learned = new Set();
    this.streak = 0;
    this.lastDate = new Date().toDateString();
    this.saveProgress();
    document.getElementById('streak-num').textContent = 0;
    this.renderProgress();
  },
};

window.addEventListener('load', () => App.init());

/* RADAR 99 / SCOUT RADARI v4.1 — All-in-One Cloud & Local YouTube Shorts Studio (Vanilla JS) */
(function () {
  'use strict';

  // Default PIN "9999" SHA-256 hex
  const DEFAULT_PIN_HASH = '888df25ae35772424a560c7152a1de794440e0ea5cfee62828333a456a506e05';
  const YT_CHANNEL_STUDIO_UPLOAD = 'https://studio.youtube.com/channel/UCsMATcMQQo3o4sAFFE4mAaQ/videos/upload?d=ud';

  const state = {
    players: [],
    bundles: [],
    dbStats: { eafcPlayersIndexed: 18405, tmPlayersIndexed: 50149 },
    category: 'all',
    posGroup: 'ALL',
    sortBy: 'viral',
    search: '',
    selectedId: null,
    duelAId: null,
    duelBId: null,
    prodMode: 'surprise',
    isLiveServer: false,
    activeApiBase: '',
    backendSource: '',
    backendCfg: { url: '', apiKey: '' },
    ytStatus: { ready: false, authenticated: false },
    cloudCfg: { pat: '', repo: 'MFTTT11/scout-radari', branch: 'main' },
    queue: [],
    busy: false,
  };

  const CAT_LABELS = {
    'scout-gem': 'Gizli Genç',
    'u18': 'U18 Wonderkid',
    'wonder-regions': 'Wonder Bölge',
    'moneyball': 'Moneyball',
    'superlig': 'Süper Lig / TR',
    'fiery': 'Sert Savaşçı',
  };

  function normalizeBaseUrl(raw) {
    return String(raw || '').trim().replace(/\/+$/, '');
  }

  function apiFetch(path, opts) {
    const o = Object.assign({ cache: 'no-store' }, opts || {});
    const headers = Object.assign({}, o.headers || {});
    if (state.backendCfg.apiKey) {
      headers['X-Radar-Key'] = state.backendCfg.apiKey;
    }
    o.headers = headers;
    return fetch(`${state.activeApiBase}${path}`, o);
  }

  function buildMediaUrl(path) {
    const base = `${state.activeApiBase}${path}`;
    if (!state.backendCfg.apiKey) return base;
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}key=${encodeURIComponent(state.backendCfg.apiKey)}`;
  }

  async function sha256Hex(str) {
    if (window.crypto && window.crypto.subtle) {
      const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    return str === '9999' ? DEFAULT_PIN_HASH : str;
  }

  function isLocalHost() {
    const h = window.location.hostname || '';
    return h === 'localhost' || h === '127.0.0.1' || h === '' || window.location.protocol === 'file:';
  }

  function initPinGate() {
    const gate = document.getElementById('pinGateOverlay');
    if (isLocalHost()) {
      gate.classList.remove('active');
      return;
    }
    const unlocked = localStorage.getItem('radar99_pin_ok') === '1';
    if (!unlocked) {
      gate.classList.add('active');
    }
  }

  function loadStorage() {
    try {
      const savedQ = JSON.parse(localStorage.getItem('scout_radari_queue') || '[]');
      if (Array.isArray(savedQ)) state.queue = savedQ;
    } catch (_) {}
    try {
      const savedBackend = JSON.parse(localStorage.getItem('radar99_backend_cfg') || '{}');
      if (savedBackend.url) state.backendCfg.url = normalizeBaseUrl(savedBackend.url);
      if (savedBackend.apiKey) state.backendCfg.apiKey = String(savedBackend.apiKey).trim();
    } catch (_) {}
    try {
      const savedCloud = JSON.parse(localStorage.getItem('radar99_cloud_cfg') || '{}');
      if (savedCloud.pat) state.cloudCfg.pat = savedCloud.pat;
      if (savedCloud.repo) state.cloudCfg.repo = savedCloud.repo;
      if (savedCloud.branch) state.cloudCfg.branch = savedCloud.branch;
    } catch (_) {}
    document.getElementById('backendUrlInput').value = state.backendCfg.url;
    document.getElementById('backendKeyInput').value = state.backendCfg.apiKey;
    document.getElementById('ghPatInput').value = state.cloudCfg.pat;
    document.getElementById('ghRepoInput').value = state.cloudCfg.repo;
    document.getElementById('ghBranchInput').value = state.cloudCfg.branch;
  }

  function saveQueue() {
    try { localStorage.setItem('scout_radari_queue', JSON.stringify(state.queue)); } catch (_) {}
    document.getElementById('queueCountBadge').textContent = String(state.queue.length);
  }

  function toast(msg) {
    const el = document.getElementById('toastEl');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2800);
  }

  function copyText(text, label) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => toast(label || 'Kopyalandı!'));
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      toast(label || 'Kopyalandı!');
    }
  }

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtEur(val) {
    const n = Number(val || 0);
    if (!n) return '-';
    if (n >= 1_000_000) {
      const m = n / 1_000_000;
      return '€' + (m >= 10 || Number.isInteger(m) ? m.toFixed(0) : m.toFixed(1)) + 'M';
    }
    if (n >= 1000) return '€' + Math.round(n / 1000) + 'K';
    return '€' + n;
  }

  function spokenEur(val) {
    const n = Number(val || 0);
    if (n >= 1_000_000) {
      const m = (n / 1_000_000).toFixed(1).replace('.0', '').replace('.', ' virgül ');
      return m + ' milyon euro';
    }
    if (n >= 1000) return Math.round(n / 1000) + ' bin euro';
    return 'doğrulanmış değer';
  }

  function buildScoutScript(p) {
    const dnaPart = p.dna && p.dna.name ? ` Oyun DNA'sı yüzde ${p.dna.similarityPct} ${p.dna.name} profili!` : '';
    const wPart = p.topAttrs && p.topAttrs.length >= 2
      ? ` En keskin silahları ${p.topAttrs[0].value} ${p.topAttrs[0].label.toLowerCase()} ve ${p.topAttrs[1].value} ${p.topAttrs[1].label.toLowerCase()}.`
      : '';
    const projPart = p.projectedPeak ? ` 2028 tavan tahmini ${p.projectedPeak}!` : '';
    if (p.age <= 20 && p.growth >= 10) {
      return `Bu ${p.age} yaşındaki gizli yeteneği henüz kimse bilmiyor! ${p.nation}, ${p.pos}, ${p.club}: karşınızda ${p.name}! Piyasa değeri sadece ${spokenEur(p.mv)}. EA FC puanı ${p.ovr} ama potansiyeli tam ${p.pot}, artı ${p.growth} gelişim.${wPart}${dnaPart} RADAR 99 Keşif Skoru ${p.gemScore}.${projPart} Devler kapmadan bu ismi not al!`;
    }
    return `RADAR 99 kilitlendi! ${p.nation}, ${p.pos} ve ${p.club}: karşınızda ${p.name}! Güncel değeri ${spokenEur(p.mv)}, EA FC puanı ${p.ovr}, potansiyeli ${p.pot}.${wPart}${dnaPart} Sıradaki yetenek kim olsun, yorumlara yaz!`;
  }

  function radarHexSvg(stats, accent, secondStats, secondAccent) {
    const cx = 86, cy = 80, maxR = 54;
    const keys = [
      ['HIZ', 'pac'], ['ŞUT', 'sho'], ['PAS', 'pas'],
      ['DRİ', 'dri'], ['DEF', 'def'], ['FİZ', 'phy'],
    ];
    const pt = (i, r) => {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 6;
      return [cx + Math.cos(a) * maxR * r, cy + Math.sin(a) * maxR * r];
    };
    const ring = (r) => keys.map((_, i) => pt(i, r).map((v) => v.toFixed(1)).join(',')).join(' ');
    const poly = (st) => keys.map(([, k], i) => pt(i, Math.max(0.18, (st[k] || 50) / 99)).map((v) => v.toFixed(1)).join(',')).join(' ');
    const axes = keys.map(([lbl], i) => {
      const [x, y] = pt(i, 1);
      const [lx, ly] = pt(i, 1.27);
      return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="currentColor" stroke-opacity="0.14" stroke-width="1"/>
        <text x="${lx.toFixed(1)}" y="${(ly + 3.5).toFixed(1)}" fill="currentColor" fill-opacity="0.72" font-size="9" font-weight="700" text-anchor="middle" font-family="JetBrains Mono, monospace">${lbl}</text>`;
    }).join('');
    const secondPoly = secondStats
      ? `<polygon points="${poly(secondStats)}" fill="${secondAccent}" fill-opacity="0.22" stroke="${secondAccent}" stroke-width="2.2"/>`
      : '';
    return `<svg viewBox="0 0 172 160" width="166" height="154" aria-hidden="true">
      ${[0.35, 0.68, 1].map((r) => `<polygon points="${ring(r)}" fill="none" stroke="currentColor" stroke-opacity="0.16" stroke-width="1"/>`).join('')}
      ${axes}
      <polygon points="${poly(stats)}" fill="${accent}" fill-opacity="0.24" stroke="${accent}" stroke-width="2.2"/>
      ${secondPoly}
    </svg>`;
  }

  function tacticalPitchSvg(posGroup, foot, isFiery) {
    const zones = {
      ST: [76, 30, 22, 16],
      WING: [foot && foot.includes('Sol') ? 106 : 46, 42, 16, 28],
      MID: [76, 66, 26, 22],
      FB: [foot && foot.includes('Sol') ? 34 : 118, 92, 14, 30],
      CB: [76, 114, 28, 16],
    };
    const [zx, zy, rx, ry] = zones[posGroup] || zones.MID;
    const col = isFiery ? 'var(--duel-b)' : 'var(--pitch)';
    return `<svg viewBox="0 0 152 154" width="148" height="150" aria-hidden="true">
      <rect x="10" y="8" width="132" height="138" rx="8" fill="none" stroke="currentColor" stroke-opacity="0.22" stroke-width="1.4"/>
      <line x1="10" y1="77" x2="142" y2="77" stroke="currentColor" stroke-opacity="0.18" stroke-width="1.2"/>
      <circle cx="76" cy="77" r="16" fill="none" stroke="currentColor" stroke-opacity="0.18" stroke-width="1.2"/>
      <rect x="44" y="8" width="64" height="22" fill="none" stroke="currentColor" stroke-opacity="0.18" stroke-width="1.2"/>
      <rect x="44" y="124" width="64" height="22" fill="none" stroke="currentColor" stroke-opacity="0.18" stroke-width="1.2"/>
      <ellipse cx="${zx}" cy="${zy}" rx="${rx}" ry="${ry}" fill="${col}" fill-opacity="0.28" stroke="${col}" stroke-width="1.8"/>
      <circle cx="${zx}" cy="${zy}" r="4.5" fill="${col}"/>
    </svg>`;
  }

  /* ---------- Connection Status & Engine Detection ---------- */
  function updateEngineStatusUi(errMsg) {
    const lbl = document.getElementById('liveServerLabel');
    const hint = document.getElementById('engineModeHint');
    const bBadge = document.getElementById('backendStatusBadge');
    const bBox = document.getElementById('backendStatusBox');

    if (state.isLiveServer) {
      const ytOk = Boolean(state.ytStatus && state.ytStatus.ready);
      const srcLabel = state.backendSource === 'tunnel' ? 'Tunnel Stüdyo' : 'Özel PC Stüdyo';
      lbl.textContent = ytOk ? `🟢 ${srcLabel} + YouTube API` : `🟢 ${srcLabel} (0 Actions)`;
      hint.innerHTML = ytOk
        ? `🟢 <strong>${srcLabel} + YouTube Data API v3 aktif (0 Actions dakikası · %100 Gizli)</strong> — Tıkladığında doğrudan MP4 render edilir ve <strong>"Dosya seç" olmadan</strong> tek tıkla YouTube Studio'ya yüklenir!`
        : `🟢 <strong>${srcLabel} bağlı (0 Actions dakikası · Sınırsız &amp; %100 Gizli)</strong> — Tıkladığında doğrudan MP4 üretilir ve aşağıda oynatılır. "Dosya seç" olmadan YouTube yükleme için <code>client_secrets.json</code> ekle.`;
      if (bBadge) bBadge.textContent = ytOk ? '🟢 Bağlı + YouTube API' : '🟢 Bağlı (0 Actions)';
      if (bBox) {
        bBox.innerHTML = `<strong>Aktif Özel Stüdyo (${esc(state.activeApiBase || window.location.origin)})</strong>` +
          `0 GitHub Actions dakikası · Sınırsız &amp; %100 Gizli · YouTube OAuth: <strong>${ytOk ? '✅ Hazır (Tek Tık API)' : '⚠️ client_secrets.json bekleniyor'}</strong>`;
      }
    } else if (state.cloudCfg.pat) {
      lbl.textContent = '☁️ GitHub Actions Bağlı';
      hint.innerHTML = `☁️ <strong>GitHub Actions Bulut Stüdyo bağlı</strong> (<code>${esc(state.cloudCfg.repo)}</code>) — Aylık Actions kotan yoksa <strong>Bulut &amp; Ayarlar</strong> sekmesinden Özel PC/Tunnel Stüdyo bağla!`;
      document.getElementById('cloudRunsPanel').style.display = 'flex';
      if (bBadge) bBadge.textContent = 'PC/Tunnel Kapalı';
      if (bBox && errMsg) bBox.innerHTML = `<strong>Bağlantı Hatası</strong>${esc(errMsg)}`;
    } else {
      lbl.textContent = 'Özel Stüdyo Bekliyor';
      hint.innerHTML = '💡 <strong>0 GitHub Actions dakikasıyla %100 gizli üretim</strong> için PC\'nde <code>RADAR99_BASLAT.bat</code> (veya <code>./radar99_baslat.sh</code>) çalıştır — ya da <strong>Bulut &amp; Ayarlar</strong> sekmesinden Cloudflare Tunnel adresini gir.';
      document.getElementById('cloudRunsPanel').style.display = 'none';
      if (bBadge) bBadge.textContent = errMsg ? '⚠️ Bağlanamadı' : 'Bağlantı Bekliyor';
      if (bBox) {
        bBox.innerHTML = errMsg
          ? `<strong>Bağlantı Hatası</strong>${esc(errMsg)}`
          : `<strong>Durum</strong>PC'nde <code>RADAR99_BASLAT.bat</code> (Windows) veya <code>./radar99_baslat.sh</code> (Mac/Linux) çalıştır — site <code>127.0.0.1:8765</code> bağlantısını otomatik yakalar!`;
      }
    }
  }

  async function tryPingBase(baseUrl, apiKey, timeoutMs) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs || 2600) : null;
    try {
      const headers = {};
      if (apiKey) headers['X-Radar-Key'] = apiKey;
      const r = await fetch(`${baseUrl}/api/ping`, {
        cache: 'no-store',
        headers,
        signal: ctrl ? ctrl.signal : undefined,
      });
      if (r.status === 401) {
        return { ok: false, error: 'X-Radar-Key gizli erişim anahtarı hatalı veya eksik (HTTP 401).' };
      }
      if (!r.ok) return { ok: false, error: `Sunucu yanıt kodu: HTTP ${r.status}` };
      const d = await r.json();
      if (d && d.ok) return { ok: true, data: d };
      return { ok: false, error: 'Geçersiz ping yanıtı.' };
    } catch (e) {
      return { ok: false, error: e && e.name === 'AbortError' ? 'Bağlantı zaman aşımına uğradı.' : (e.message || 'Sunucuya ulaşılamadı.') };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function probeLiveServer() {
    state.isLiveServer = false;
    state.activeApiBase = '';
    state.backendSource = '';
    state.ytStatus = { ready: false, authenticated: false };
    let lastErr = '';

    const candidates = [];
    if (state.backendCfg.url) {
      const isTun = !state.backendCfg.url.includes('127.0.0.1') && !state.backendCfg.url.includes('localhost');
      candidates.push({ base: state.backendCfg.url, key: state.backendCfg.apiKey, src: isTun ? 'tunnel' : 'pc', timeout: 3500 });
    }
    if (isLocalHost()) {
      candidates.push({ base: '', key: state.backendCfg.apiKey, src: 'pc', timeout: 2000 });
    } else if (!state.backendCfg.url) {
      // Auto-detect local PC RADAR99_BASLAT.bat directly from live HTTPS site (zero config!)
      candidates.push({ base: 'http://127.0.0.1:8765', key: state.backendCfg.apiKey, src: 'pc', timeout: 1600 });
    }

    for (const c of candidates) {
      const res = await tryPingBase(c.base, c.key, c.timeout);
      if (res.ok) {
        state.isLiveServer = true;
        state.activeApiBase = c.base;
        state.backendSource = c.src;
        state.ytStatus = (res.data && res.data.youtube) || { ready: false, authenticated: false };
        lastErr = '';
        break;
      }
      if (state.backendCfg.url && c.base === state.backendCfg.url) {
        lastErr = res.error;
      }
    }

    updateEngineStatusUi(lastErr);
    return { ok: state.isLiveServer, error: lastErr };
  }

  /* ---------- ViralRank Algorithm Preview & One-Click Produce ---------- */
  function pickClientViralCandidate(mode) {
    if (mode === 'duel-auto' || (mode === 'surprise' && Math.random() < 0.4)) {
      const young = state.players.filter((p) => p.age <= 20 && p.growth >= 10);
      const pool = young.length >= 4 ? young : state.players;
      const byPos = {};
      pool.forEach((p) => { (byPos[p.posGroup] = byPos[p.posGroup] || []).push(p); });
      let best = null, bestScore = -1, bestScoreTxt = '';
      Object.values(byPos).forEach((lst) => {
        if (lst.length < 2) return;
        for (let i = 0; i < Math.min(10, lst.length); i++) {
          for (let j = i + 1; j < Math.min(12, lst.length); j++) {
            const a = lst[i], b = lst[j];
            if (a.club === b.club) continue;
            const ks = ['pac', 'sho', 'pas', 'dri', 'def', 'phy'];
            const wA = ks.filter((k) => a.stats[k] > b.stats[k]).length;
            const wB = ks.filter((k) => b.stats[k] > a.stats[k]).length;
            const sc = (25 - Math.abs(wA - wB) * 6) + a.growth + b.growth + (a.nation !== b.nation ? 8 : 0);
            if (sc > bestScore) { bestScore = sc; best = [a, b]; bestScoreTxt = `${wA}-${wB}`; }
          }
        }
      });
      if (best) {
        return {
          kind: 'duel-pair',
          playerA: best[0].name,
          playerB: best[1].name,
          title: `⚔️ ${best[0].name} vs ${best[1].name}`,
          detail: `${best[0].posGroup} Kıran Kırana Düello (${bestScoreTxt}) · ${best[0].ovr}→${best[0].pot} vs ${best[1].ovr}→${best[1].pot} POT`,
        };
      }
    }
    const filtered = state.players.filter((p) => mode === 'surprise' || mode === 'custom' ? p.age <= 20 : p.poolTag === mode);
    const pool = (filtered.length ? filtered : state.players)
      .slice()
      .sort((a, b) => ((b.viralScore || b.gemScore) - (a.viralScore || a.gemScore)));
    const top = pool.slice(0, Math.min(8, pool.length));
    const pick = top[Math.floor(Math.random() * top.length)];
    return {
      kind: 'custom',
      playerA: pick.name,
      playerB: '',
      title: `💎 ${pick.name} (${pick.age} Yaş · ${pick.club})`,
      detail: `ViralRank ${pick.viralScore || pick.gemScore}/99 · ${pick.ovr}→${pick.pot} POT (+${pick.growth}) · ${fmtEur(pick.mv)} · ${pick.viralReason || ''}`,
    };
  }

  function showAlgoPreview() {
    const cand = pickClientViralCandidate(state.prodMode);
    const strip = document.getElementById('algoPreviewStrip');
    strip.style.display = 'flex';
    strip.innerHTML = `
      <div>
        <strong>Algoritma Önerisi: ${esc(cand.title)}</strong>
        <div style="font-size:12px;color:var(--ink-muted);margin-top:2px;">${esc(cand.detail)}</div>
      </div>
      <button class="btn btn-primary btn-sm" id="btnProduceThisPick">⚡ Bunu Üret</button>
    `;
    document.getElementById('btnProduceThisPick').onclick = () => {
      triggerProduction({ mode: cand.kind, playerA: cand.playerA, playerB: cand.playerB });
    };
  }

  function setProgress(active, stageText, pct, subText) {
    const box = document.getElementById('liveProgressBox');
    box.classList.toggle('active', active);
    if (stageText != null) document.getElementById('liveStageText').textContent = stageText;
    if (pct != null) {
      document.getElementById('livePctText').textContent = `${pct}%`;
      document.getElementById('liveProgFill').style.width = `${pct}%`;
    }
    if (subText != null) document.getElementById('liveStageSub').innerHTML = subText;
  }

  async function triggerProduction(overrides) {
    if (state.busy) { toast('Şu an devam eden bir üretim var!'); return; }
    const o = overrides || {};
    const mode = o.mode || state.prodMode;
    const playerA = o.playerA != null ? o.playerA : (mode === 'custom' ? document.getElementById('prodCustomPlayer').value.trim() : '');
    const playerB = o.playerB || '';
    const privacy = document.getElementById('prodPrivacy').value;
    const clipSource = document.getElementById('prodClipSource').value;
    const highlightUrl = document.getElementById('prodHighlightUrl').value.trim();
    const uploadYoutube = document.getElementById('prodAutoUpload').checked;

    if (mode === 'custom' && !playerA) {
      toast('Özel Oyuncu modunda bir oyuncu adı yaz!');
      document.getElementById('prodCustomPlayer').focus();
      return;
    }

    switchView('hub');

    // Path A: Connected Private PC / Cloudflare Tunnel Studio (0 GitHub Actions minutes!)
    if (state.isLiveServer) {
      state.busy = true;
      document.getElementById('btnViralProduce').disabled = true;
      setProgress(true, 'Özel Stüdyo başlatılıyor (0 Actions dakikası)...', 8, '18.405 oyuncu taranıyor...');
      try {
        const res = await apiFetch('/api/viral-pick', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode, playerA, playerB, highlightUrl, clipSource, uploadYoutube, privacy }),
        });
        const d = await res.json();
        if (!d.ok) {
          toast('⚠️ ' + (d.error || 'Başlatılamadı'));
          state.busy = false;
          document.getElementById('btnViralProduce').disabled = false;
          setProgress(false);
          return;
        }
        pollLocalJob();
      } catch (e) {
        toast('Özel Stüdyo bağlantı hatası: ' + e.message);
        state.busy = false;
        document.getElementById('btnViralProduce').disabled = false;
      }
      return;
    }

    // Path B: Optional GitHub Actions Cloud Studio (if user has Actions quota)
    if (!state.cloudCfg.pat) {
      toast('💻 0 Actions dakikasıyla üretmek için PC\'nde RADAR99_BASLAT.bat aç veya Ayarlar\'dan Tunnel URL gir!');
      switchView('settings');
      document.getElementById('backendUrlInput').focus();
      return;
    }

    state.busy = true;
    document.getElementById('btnViralProduce').disabled = true;
    setProgress(true, '☁️ GitHub Actions Bulut Stüdyo tetikleniyor...', 12, `Repo: ${esc(state.cloudCfg.repo)} · Mod: ${esc(mode)}`);
    try {
      const url = `https://api.github.com/repos/${state.cloudCfg.repo}/actions/workflows/radar99-cloud-studio.yml/dispatches`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${state.cloudCfg.pat}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ref: state.cloudCfg.branch || 'main',
          inputs: {
            mode,
            player_a: playerA,
            player_b: playerB,
            highlight_url: highlightUrl,
            clip_source: clipSource,
            upload_youtube: uploadYoutube ? 'true' : 'false',
            privacy,
          },
        }),
      });
      if (resp.status === 204 || resp.ok) {
        toast('🚀 Bulut video üretimi başlatıldı! Canlı durum takip ediliyor...');
        setProgress(true, '☁️ Bulut Runner kuyruğa alındı...', 22, 'GitHub Actions Ubuntu sunucusunda MP4 + 6/6 QA + YouTube yüklemesi başlıyor (~3-5 dk).');
        setTimeout(() => pollCloudRuns(true), 4500);
      } else {
        const errTxt = await resp.text();
        toast('⚠️ Bulut tetikleme hatası (' + resp.status + ') — Kota yoksa Özel PC/Tunnel Stüdyo kullan!');
        setProgress(true, '⚠️ Bulut tetikleme hatası (' + resp.status + ')', 0, esc(errTxt.slice(0, 220)));
        state.busy = false;
        document.getElementById('btnViralProduce').disabled = false;
      }
    } catch (err) {
      toast('⚠️ Ağ hatası: ' + err.message);
      state.busy = false;
      document.getElementById('btnViralProduce').disabled = false;
    }
  }

  async function pollLocalJob() {
    try {
      const r = await apiFetch('/api/job');
      const job = await r.json();
      const pct = job.progressPct || 25;
      const sub = (job.stageDetail || '') + (job.lockedPlayer ? ` · Kilitlenen: <strong>${esc(job.lockedPlayer.name || '')}</strong>` : '');
      setProgress(true, job.stageLabel || 'İşleniyor...', pct, sub);
      if (job.status === 'running') {
        setTimeout(pollLocalJob, 1400);
      } else {
        state.busy = false;
        document.getElementById('btnViralProduce').disabled = false;
        if (job.status === 'done') {
          toast('✅ Video + 6/6 QA + SEO/GEO/AEO Paketi hazır!');
          await refreshReadyVideos();
        } else {
          toast('⚠️ Üretimde hata oluştu, terminal logunu kontrol et.');
        }
      }
    } catch (_) {
      state.busy = false;
      document.getElementById('btnViralProduce').disabled = false;
    }
  }

  async function pollCloudRuns(keepPolling) {
    if (!state.cloudCfg.pat) return;
    try {
      const r = await fetch(`https://api.github.com/repos/${state.cloudCfg.repo}/actions/workflows/radar99-cloud-studio.yml/runs?per_page=6`, {
        headers: { Authorization: `Bearer ${state.cloudCfg.pat}`, Accept: 'application/vnd.github+json' },
      });
      if (!r.ok) return;
      const data = await r.json();
      const runs = data.workflow_runs || [];
      document.getElementById('cloudRunsPanel').style.display = 'flex';
      const box = document.getElementById('cloudRunsList');
      if (!runs.length) {
        box.innerHTML = '<div style="font-size:13px;color:var(--ink-muted);">Henüz bulut üretimi yok — yukarıdan tek tıkla ilkini başlat!</div>';
      } else {
        box.innerHTML = runs.map((run) => {
          const badge = run.status === 'completed'
            ? (run.conclusion === 'success' ? '✅ Hazır' : `⚠️ ${run.conclusion}`)
            : `⏳ ${run.status === 'in_progress' ? 'Render Ediliyor' : 'Sırada'}`;
          const dt = new Date(run.created_at).toLocaleString('tr-TR');
          return `<div class="cloud-run-row">
            <div>
              <strong>#${run.run_number} · ${esc(run.display_title || 'RADAR 99 Render')}</strong>
              <div style="font-size:12px;color:var(--ink-muted);">${dt} · ${badge}</div>
            </div>
            <div style="display:flex;gap:8px;">
              <a class="btn btn-sm" href="${esc(run.html_url)}" target="_blank" rel="noopener">Paket &amp; Rapor ↗</a>
              <a class="btn btn-sm yt-upload-btn" href="${YT_CHANNEL_STUDIO_UPLOAD}" target="_blank" rel="noopener">YouTube Studio ↗</a>
            </div>
          </div>`;
        }).join('');
      }

      if (keepPolling && runs.length) {
        const latest = runs[0];
        if (latest.status !== 'completed') {
          const pct = latest.status === 'in_progress' ? 62 : 28;
          setProgress(true, `☁️ Bulut Render #${latest.run_number}: ${latest.status === 'in_progress' ? 'Video işleniyor...' : 'Kuyrukta...'}`, pct,
            `<a href="${esc(latest.html_url)}" target="_blank" rel="noopener" style="color:var(--pitch);font-weight:700;">Canlı Bulut Logunu Gör ↗</a>`);
          setTimeout(() => pollCloudRuns(true), 8000);
        } else {
          state.busy = false;
          document.getElementById('btnViralProduce').disabled = false;
          const ok = latest.conclusion === 'success';
          setProgress(true, ok ? `✅ Bulut Render #${latest.run_number} Tamamlandı!` : `⚠️ Bulut Render #${latest.run_number}: ${latest.conclusion}`, ok ? 100 : 0,
            `<a href="${esc(latest.html_url)}" target="_blank" rel="noopener" style="color:var(--pitch);font-weight:700;">Hazır MP4 + ZIP Paketini Aç ↗</a> · YouTube Studio'yu kontrol et!`);
          if (ok) toast('✅ Bulut videosu hazır! Artifact & YouTube Studio\'da!');
        }
      }
    } catch (_) {}
  }

  /* ---------- Ready Videos & 1-Click YouTube Publish Center ---------- */
  async function refreshReadyVideos() {
    if (state.isLiveServer) {
      try {
        const r = await apiFetch('/api/renders');
        if (r.ok) {
          const d = await r.json();
          if (d.renders && d.renders.length) {
            state.bundles = d.renders;
          }
        }
      } catch (_) {}
    }
    renderArchive();
  }

  async function handleOneClickYoutubeUpload(idx) {
    const b = state.bundles[idx];
    const titleEl = document.getElementById(`titleSel_${idx}`);
    const chosenTitle = titleEl ? titleEl.value : (b.title || '');
    const priv = document.getElementById('prodPrivacy').value;

    // Connected Private PC / Tunnel Studio with OAuth ready -> Direct YouTube Data API v3 Full-Package Upload (ZERO "Dosya seç"!)
    if (state.isLiveServer && state.ytStatus.ready && b.metaFile) {
      const btn = document.querySelector(`[data-yt-up="${idx}"]`);
      if (btn) { btn.disabled = true; btn.textContent = 'Yükleniyor...'; }
      toast('🚀 Video + SEO/GEO/AEO + 4 Dil + .SRT Altyazı doğrudan YouTube API ile yükleniyor...');
      try {
        const autoScheduleGeo = priv === 'auto_geo';
        const res = await apiFetch('/api/youtube/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            metaFile: b.metaFile,
            privacy: autoScheduleGeo ? 'private' : priv,
            autoScheduleGeo,
            titleOverride: chosenTitle,
          }),
        });
        const d = await res.json();
        if (d.ok) {
          toast(`✅ YouTube Studio'ya otomatik yüklendi! (${d.localizationsCount || 4} GEO dil${d.srtUploaded ? ' + SRT' : ''})`);
          window.open(d.studioEditUrl, '_blank');
          await refreshReadyVideos();
        } else {
          toast('⚠️ ' + (d.error || 'OAuth hatası'));
        }
      } catch (e) {
        toast('⚠️ Yükleme hatası: ' + e.message);
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🚀 Tek Tıkla YouTube\'a Yükle'; }
      }
      return;
    }

    // Fallback (No backend or client_secrets.json not placed yet): Copy full Title+SEO/GEO/AEO & open YouTube Studio Upload directly!
    const fullCopy = `${chosenTitle}\n\n${b.description || ''}`;
    if (state.isLiveServer && !state.ytStatus.ready) {
      copyText(fullCopy, '⚠️ client_secrets.json eksik — Başlık+SEO kopyalandı (Ayarlar\'dan 2 dk\'da tam otomatik API açabilirsin!)');
    } else {
      copyText(fullCopy, '📋 Başlık + SEO/GEO/AEO kopyalandı → YouTube Studio açılıyor (0 Actions otomatik yükleme için PC Stüdyo bağla!)');
    }
    window.open(YT_CHANNEL_STUDIO_UPLOAD, '_blank');
  }

  function renderArchive() {
    const grid = document.getElementById('archiveGrid');
    document.getElementById('archiveCountBadge').textContent = String(state.bundles.length);
    if (!state.bundles.length) {
      grid.innerHTML = '<div class="panel-card"><p style="color:var(--ink-muted);">Henüz hazır video yok — yukarıdan "Algoritmadan En İlginç İçeriği Üret" butonuna tıkla!</p></div>';
      return;
    }

    grid.innerHTML = state.bundles.map((b, idx) => {
      const isDuel = b.format === 'duel_9x16';
      const thumbs = isDuel
        ? ['./assets/duel_cover.jpg', './assets/duel_walkout.jpg', './assets/duel_stats.jpg', './assets/duel_winner.jpg']
        : ['./assets/gem_cover.jpg', './assets/gem_walkout.jpg', './assets/gem_terminal.jpg', './assets/gem_highlights.jpg'];
      const qa = b.qualityGate || {};
      const checks = qa.checks || {};
      const scores = b.seoGeoAeoScores || { seo: b.seoScore || 100, geo: 100, aeo: 100 };
      const qaLabels = {
        data_integrity: 'Veri',
        video_stream: '1080×1920',
        visual_frames: 'Frame-0',
        audio_loudness: 'Ses dB',
        subtitle_sync: 'Altyazı',
        duplicate_guard: 'Benzersiz',
      };
      const rawVideoPath = b.urls && b.urls.video ? b.urls.video : (b.artifacts && b.artifacts.video ? `/videos/${encodeURIComponent(b.artifacts.video)}` : '');
      const videoUrl = state.isLiveServer && rawVideoPath ? buildMediaUrl(rawVideoPath) : '';
      const zipUrl = state.isLiveServer && b.artifacts && b.artifacts.bundleZip ? buildMediaUrl(`/assets/output/${encodeURIComponent(b.artifacts.bundleZip)}?download=1`) : '';
      const ytUrl = (b.youtubeUpload && b.youtubeUpload.studioEditUrl) || '';

      const mediaBlock = videoUrl
        ? `<div class="ready-video-wrap">
            <video class="ready-video-el" controls preload="metadata" src="${videoUrl}"></video>
            <div style="display:flex;flex-direction:column;gap:10px;">
              <div class="frames-strip">${thumbs.map((src) => `<img src="${src}" class="frame-thumb" alt="${esc(b.playerName)}" loading="lazy" />`).join('')}</div>
              <div class="qa-row">${Object.entries(checks).map(([k, v]) => `<span class="qa-chip">${v.passed ? '✓' : '✕'} ${qaLabels[k] || k}</span>`).join('')}</div>
              <div class="tri-score-strip">
                <span class="tri-chip">SEO ${scores.seo}/100</span>
                <span class="tri-chip">GEO ${scores.geo}/100</span>
                <span class="tri-chip">AEO ${scores.aeo}/100</span>
              </div>
            </div>
          </div>`
        : `<div class="frames-strip">${thumbs.map((src) => `<img src="${src}" class="frame-thumb" alt="${esc(b.playerName)}" loading="lazy" />`).join('')}</div>
           <div class="qa-row">
             ${Object.entries(checks).map(([k, v]) => `<span class="qa-chip">${v.passed ? '✓' : '✕'} ${qaLabels[k] || k}</span>`).join('')}
             <span class="tri-chip">SEO ${scores.seo}</span>
             <span class="tri-chip">GEO ${scores.geo}</span>
             <span class="tri-chip">AEO ${scores.aeo}</span>
           </div>`;

      const titles = (b.titleVariants && b.titleVariants.length) ? b.titleVariants : [b.title || b.playerName];

      return `<article class="bundle-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
          <div>
            <div style="font-size:12px;font-weight:700;color:var(--pitch);text-transform:uppercase;letter-spacing:0.05em;">
              ${isDuel ? '⚔️ 1v1 VS Düello · 9:16' : '🕵️ Gizli Genç Yetenek · 9:16'}
            </div>
            <h3 style="font-family:var(--font-display);font-size:21px;margin:4px 0 2px;">${esc(b.playerName)}</h3>
            <div style="font-size:13px;color:var(--ink-muted);">${esc(b.club || '')} · ${b.durationSec || '-'} sn · ${esc(b.geoSchedule || '19:00 TRT')}</div>
          </div>
          <span class="qa-chip">🛡️ ${esc(qa.score || '6/6')} PASS</span>
        </div>

        ${mediaBlock}

        <div>
          <label class="field-label" for="titleSel_${idx}">🎯 5 Viral A/B CTR Başlığı (Seç &amp; Yükle)</label>
          <select id="titleSel_${idx}" class="duel-select">
            ${titles.map((t, i) => `<option value="${esc(t)}">[#${i + 1} · ${t.length}/100] ${esc(t)}</option>`).join('')}
          </select>
        </div>

        ${b.aeoDirectAnswer ? `<div class="script-preview"><strong>AEO Yapay Zeka Özeti (Google AI / Perplexity)</strong>${esc(b.aeoDirectAnswer)}</div>` : ''}

        <div class="script-preview">
          <strong>📌 Sabitlenecek İlk Yorum</strong>
          ${esc(b.pinnedComment || '')}
        </div>

        <details style="font-size:12.5px;color:var(--ink-muted);">
          <summary style="cursor:pointer;font-weight:700;color:var(--ink);">SEO/GEO/AEO Tam Açıklama + FAQ + .SRT Önizleme</summary>
          <pre class="code-block" style="margin-top:8px;max-height:200px;overflow:auto;">${esc(b.description || '')}</pre>
          ${b.srtPreview ? `<pre class="code-block" style="margin-top:8px;max-height:140px;overflow:auto;">${esc(b.srtPreview)}</pre>` : ''}
        </details>

        <div class="btn-row">
          <button class="btn yt-upload-btn" data-yt-up="${idx}">🚀 Tek Tıkla YouTube'a Yükle</button>
          ${ytUrl ? `<a class="btn btn-primary btn-sm" href="${esc(ytUrl)}" target="_blank" rel="noopener">Studio'da Aç ↗</a>` : ''}
          ${zipUrl ? `<a class="btn btn-sm" href="${zipUrl}">⬇ ZIP İndir</a>` : ''}
          <button class="btn btn-sm" data-copy-seo="${idx}">Başlık + SEO Kopyala</button>
          <button class="btn btn-sm" data-copy-pin="${idx}">İlk Yorum</button>
          <button class="btn btn-sm" data-copy-srt="${idx}">SRT</button>
        </div>
      </article>`;
    }).join('');

    grid.querySelectorAll('.frame-thumb').forEach((img) => {
      img.addEventListener('click', () => openLightbox(img.src));
    });
    grid.querySelectorAll('[data-yt-up]').forEach((btn) => {
      btn.addEventListener('click', () => handleOneClickYoutubeUpload(Number(btn.getAttribute('data-yt-up'))));
    });
    grid.querySelectorAll('[data-copy-seo]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-copy-seo'));
        const b = state.bundles[idx];
        const title = document.getElementById(`titleSel_${idx}`).value;
        copyText(`${title}\n\n${b.description}`, 'Başlık + SEO/GEO/AEO açıklama kopyalandı!');
      });
    });
    grid.querySelectorAll('[data-copy-pin]').forEach((btn) => {
      btn.addEventListener('click', () => {
        copyText(state.bundles[Number(btn.getAttribute('data-copy-pin'))].pinnedComment || '', 'Sabitlenecek yorum kopyalandı!');
      });
    });
    grid.querySelectorAll('[data-copy-srt]').forEach((btn) => {
      btn.addEventListener('click', () => {
        copyText(state.bundles[Number(btn.getAttribute('data-copy-srt'))].srtPreview || '', 'SRT altyazı kopyalandı!');
      });
    });
  }

  /* ---------- Explorer & Dossier ---------- */
  function filteredPlayers() {
    const q = state.search.trim().toLowerCase();
    const list = state.players.filter((p) => {
      if (state.category !== 'all' && p.poolTag !== state.category) return false;
      if (state.posGroup !== 'ALL' && p.posGroup !== state.posGroup) return false;
      if (q) {
        const hay = `${p.name} ${p.club} ${p.league} ${p.nation} ${p.pos} ${(p.dna && p.dna.name) || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const sorters = {
      viral: (a, b) => ((b.viralScore || b.gemScore) - (a.viralScore || a.gemScore)) || (b.growth - a.growth),
      gem: (a, b) => (b.gemScore - a.gemScore) || (b.growth - a.growth),
      growth: (a, b) => (b.growth - a.growth) || (b.pot - a.pot),
      pot: (a, b) => (b.pot - a.pot) || (b.growth - a.growth),
      age: (a, b) => (a.age - b.age) || (b.pot - a.pot),
      mv: (a, b) => ((a.mv || 9e9) - (b.mv || 9e9)) || (b.pot - a.pot),
    };
    list.sort(sorters[state.sortBy] || sorters.viral);
    return list;
  }

  function renderPlayerTable() {
    const rows = filteredPlayers();
    document.getElementById('feedCountLabel').textContent = `${rows.length} oyuncu listeleniyor`;
    const tbody = document.getElementById('playerTbody');
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--ink-muted);padding:32px;">Filtreye uyan oyuncu bulunamadı.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.slice(0, 80).map((p) => {
      const sel = p.id === state.selectedId ? ' selected' : '';
      const accent = (p.colors && p.colors[0]) || 'var(--pitch)';
      const dnaTxt = p.dna && p.dna.name ? `%${p.dna.similarityPct} ${esc(p.dna.name)}` : '—';
      return `<tr class="player-row${sel}" data-pid="${p.id}">
        <td>
          <div class="p-cell">
            <span class="p-swatch" style="background:${accent}"></span>
            <div>
              <div class="p-name">${esc(p.name)}</div>
              <div class="p-sub">${esc(p.club)} · ${esc(p.nation)}</div>
            </div>
          </div>
        </td>
        <td><span class="pos-tag">${esc(p.pos)}</span></td>
        <td class="mono">${p.age}</td>
        <td class="mono"><strong>${p.ovr}</strong> → ${p.pot} ${p.growth >= 8 ? `<span class="growth-tag">+${p.growth}</span>` : ''}</td>
        <td class="mono hide-sm">${fmtEur(p.mv)}</td>
        <td class="gem-score">${p.viralScore || p.gemScore}</td>
        <td class="dna-mini hide-sm">${dnaTxt}</td>
      </tr>`;
    }).join('');
  }

  function renderDossier() {
    const p = state.players.find((x) => x.id === state.selectedId) || state.players[0];
    const panel = document.getElementById('dossierPanel');
    if (!p) return;
    const accent = (p.colors && p.colors[0]) || 'var(--pitch)';
    const statItems = [
      ['HIZ', p.stats.pac], ['ŞUT', p.stats.sho], ['PAS', p.stats.pas],
      ['DRİ', p.stats.dri], ['DEF', p.stats.def], ['FİZ', p.stats.phy],
    ];
    const scriptText = buildScoutScript(p);

    panel.innerHTML = `
      <div class="dossier-head">
        <div>
          <h2 class="dossier-name">${esc(p.name)}</h2>
          <div class="dossier-meta">${esc(p.club)} · ${esc(p.league)} · ${esc(p.nation)}</div>
          <div class="dossier-meta" style="margin-top:4px;">${p.age} Yaş · ${p.heightCm ? p.heightCm + ' cm · ' : ''}${esc(p.foot)} · ${esc(p.roleTr)}</div>
        </div>
        <div class="rating-box">
          <div class="rating-main mono">${p.ovr}</div>
          <div class="rating-pot">POT ${p.pot}${p.growth >= 6 ? ` (+${p.growth})` : ''}</div>
        </div>
      </div>

      <div class="metric-strip">
        <div class="metric-box"><div class="metric-k">2026 Değer</div><div class="metric-v">${fmtEur(p.mv)}</div></div>
        <div class="metric-box"><div class="metric-k">2028 Tavan</div><div class="metric-v" style="color:var(--pitch)">${esc(p.projectedPeak || fmtEur(p.mv * 2))}</div></div>
        <div class="metric-box"><div class="metric-k">ViralRank</div><div class="metric-v" style="color:var(--gold)">${p.viralScore || p.gemScore}/99</div></div>
      </div>

      ${p.dna && p.dna.name ? `<div class="dna-banner"><span>Oyun DNA'sı: <strong>%${p.dna.similarityPct} ${esc(p.dna.name)}</strong> (${esc(p.dna.club)})</span><span class="mono" style="font-weight:700;color:var(--pitch)">${p.dna.ovr} OVR</span></div>` : ''}

      <div class="viz-pair">
        <div class="viz-box"><span class="viz-label">6 Eksenli Radar</span>${radarHexSvg(p.stats, accent)}</div>
        <div class="viz-box"><span class="viz-label">Saha Etki Alanı</span>${tacticalPitchSvg(p.posGroup, p.foot, p.isFiery)}</div>
      </div>

      <div class="stat-bars">
        ${statItems.map(([k, v]) => `<div class="stat-row"><div class="stat-top"><span>${k}</span><span class="mono">${v}</span></div><div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, v)}%"></div></div></div>`).join('')}
      </div>

      <div class="script-preview"><strong>RADAR 99 Shorts Anlatımı (TR)</strong>${esc(scriptText)}</div>

      <div class="btn-row">
        <button class="btn btn-primary" id="dossierProduceBtn">⚡ Videosunu Üret &amp; YouTube'a Hazırla</button>
        <button class="btn btn-sm" id="dossierSendABtn">Düello A</button>
        <button class="btn btn-sm" id="dossierSendBBtn">Düello B</button>
        <button class="btn btn-sm" id="dossierQueueBtn">Kuyruğa Ekle</button>
      </div>
    `;

    document.getElementById('dossierProduceBtn').onclick = () => triggerProduction({ mode: 'custom', playerA: p.name });
    document.getElementById('dossierSendABtn').onclick = () => { state.duelAId = p.id; syncDuelSelects(); renderDuelStage(); switchView('duel'); };
    document.getElementById('dossierSendBBtn').onclick = () => { state.duelBId = p.id; syncDuelSelects(); renderDuelStage(); switchView('duel'); };
    document.getElementById('dossierQueueBtn').onclick = () => addQueuePlayer(p.name, `${p.age} Yaş · ${p.ovr}→${p.pot} POT`);
  }

  /* ---------- 1v1 Duel Arena ---------- */
  function syncDuelSelects() {
    const selA = document.getElementById('duelSelectA');
    const selB = document.getElementById('duelSelectB');
    const opts = state.players.map((p) => `<option value="${p.id}">${esc(p.name)} (${p.age}y · ${p.pos} · ${p.ovr}→${p.pot} · ${esc(p.club)})</option>`).join('');
    selA.innerHTML = opts;
    selB.innerHTML = opts;
    if (state.duelAId) selA.value = String(state.duelAId);
    if (state.duelBId) selB.value = String(state.duelBId);
  }

  function autoPickDuelGems() {
    const pick = pickClientViralCandidate('duel-auto');
    const pA = state.players.find((x) => x.name === pick.playerA) || state.players[0];
    const pB = state.players.find((x) => x.name === pick.playerB) || state.players[1];
    state.duelAId = pA.id;
    state.duelBId = pB.id;
    syncDuelSelects();
    renderDuelStage();
    toast(`🔥 ${pick.detail}`);
  }

  function renderDuelStage() {
    const a = state.players.find((x) => x.id === Number(state.duelAId)) || state.players[0];
    const b = state.players.find((x) => x.id === Number(state.duelBId)) || state.players[1];
    const box = document.getElementById('duelStage');
    if (!a || !b) return;
    const rows = [
      ['HIZ', a.stats.pac, b.stats.pac], ['ŞUT', a.stats.sho, b.stats.sho], ['PAS', a.stats.pas, b.stats.pas],
      ['DRİ', a.stats.dri, b.stats.dri], ['DEF', a.stats.def, b.stats.def], ['FİZ', a.stats.phy, b.stats.phy],
    ];
    let winsA = 0, winsB = 0;
    rows.forEach(([, va, vb]) => { if (va > vb) winsA++; else if (vb > va) winsB++; });
    const winner = winsA > winsB ? a : (winsB > winsA ? b : (a.pot >= b.pot ? a : b));
    const dative = { 0: "0'a", 1: "1'e", 2: "2'ye", 3: "3'e", 4: "4'e", 5: "5'e", 6: "6'ya" }[winsA] || `${winsA}'e`;
    const duelScript = `RADAR 99 genç yetenek düellosu! ${a.age} yaşındaki ${a.name} mi, yoksa ${b.age} yaşındaki ${b.name} mi daha büyük yıldız olacak? Altı stat kapışmasında skor ${dative} ${winsB}! Piyasa değerinde ${a.name} ${spokenEur(a.mv)}, ${b.name} ${spokenEur(b.mv)}. Veriler ${winner.name} diyor! A mı, B mi? Yorumlara yaz!`;

    box.innerHTML = `
      <div class="duel-board">
        <div class="scoreboard">
          <div>
            <div style="font-size:12px;font-weight:700;color:var(--duel-a);">🔵 A · ${esc(a.club)}</div>
            <div style="font-family:var(--font-display);font-size:22px;font-weight:700;">${esc(a.name)}</div>
            <div style="font-size:12.5px;color:var(--ink-muted);">${a.age} Yaş · ${esc(a.pos)} · ${a.ovr}→${a.pot} POT · ${fmtEur(a.mv)}</div>
          </div>
          <div class="score-pill mono"><span style="color:var(--duel-a)">${winsA}</span> - <span style="color:var(--duel-b)">${winsB}</span></div>
          <div style="text-align:right;">
            <div style="font-size:12px;font-weight:700;color:var(--duel-b);">${esc(b.club)} · B 🔴</div>
            <div style="font-family:var(--font-display);font-size:22px;font-weight:700;">${esc(b.name)}</div>
            <div style="font-size:12.5px;color:var(--ink-muted);">${b.age} Yaş · ${esc(b.pos)} · ${b.ovr}→${b.pot} POT · ${fmtEur(b.mv)}</div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;">
          ${rows.map(([lbl, va, vb]) => `
            <div class="tug-row">
              <span class="mono" style="font-weight:700;color:${va > vb ? 'var(--duel-a)' : 'var(--ink-muted)'}">${va}${va > vb ? ' ✓' : ''}</span>
              <div class="tug-bar-l"><div class="tug-fill-a" style="width:${va}%"></div></div>
              <span class="mono" style="text-align:center;font-size:12px;font-weight:700;color:var(--gold)">${lbl}</span>
              <div class="tug-bar-r"><div class="tug-fill-b" style="width:${vb}%"></div></div>
              <span class="mono" style="text-align:right;font-weight:700;color:${vb > va ? 'var(--duel-b)' : 'var(--ink-muted)'}">${vb > va ? '✓ ' : ''}${vb}</span>
            </div>`).join('')}
        </div>
      </div>

      <div class="panel-card">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <h2>İkili Radar &amp; Karar</h2>
          <span class="qa-chip">Kazanan: ${winner.id === a.id ? 'A' : 'B'}</span>
        </div>
        <div style="display:flex;justify-content:center;">${radarHexSvg(a.stats, 'var(--duel-a)', b.stats, 'var(--duel-b)')}</div>
        <div class="script-preview"><strong>1v1 Düello Anlatımı (TR)</strong>${esc(duelScript)}</div>
        <div class="btn-row">
          <button class="btn btn-primary" id="duelProduceBtn">⚔️ Bu Düellonun Videosunu Üret</button>
          <button class="btn btn-sm" id="duelCopyScriptBtn">Metni Kopyala</button>
        </div>
      </div>
    `;

    document.getElementById('duelProduceBtn').onclick = () => triggerProduction({ mode: 'duel-pair', playerA: a.name, playerB: b.name });
    document.getElementById('duelCopyScriptBtn').onclick = () => copyText(duelScript, '1v1 Düello senaryosu kopyalandı!');
  }

  /* ---------- Queue & Navigation ---------- */
  function addQueuePlayer(name, note) {
    const clean = (name || '').trim();
    if (!clean) return;
    if (!state.queue.some((x) => x.name.toLowerCase() === clean.toLowerCase())) {
      state.queue.unshift({ name: clean, note: note || 'Scout Kuyruğu' });
      saveQueue();
      renderQueue();
      toast(`"${clean}" izleme kuyruğuna eklendi`);
    }
  }

  function renderQueue() {
    const ul = document.getElementById('queueList');
    if (!state.queue.length) {
      ul.innerHTML = '<li class="queue-item" style="color:var(--ink-muted);">Kuyruk boş — Keşif Radarı\'ndan oyuncu ekle.</li>';
      return;
    }
    ul.innerHTML = state.queue.map((item, i) => `
      <li class="queue-item">
        <div><strong>${esc(item.name)}</strong><div style="font-size:12px;color:var(--ink-muted);">${esc(item.note)}</div></div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-primary btn-sm" data-prod-q="${i}">⚡ Üret</button>
          <button class="btn btn-sm" data-rm-q="${i}">Sil</button>
        </div>
      </li>`).join('');
    ul.querySelectorAll('[data-prod-q]').forEach((b) => {
      b.onclick = () => triggerProduction({ mode: 'custom', playerA: state.queue[Number(b.getAttribute('data-prod-q'))].name });
    });
    ul.querySelectorAll('[data-rm-q]').forEach((b) => {
      b.onclick = () => { state.queue.splice(Number(b.getAttribute('data-rm-q')), 1); saveQueue(); renderQueue(); };
    });
  }

  function switchView(viewId) {
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.getAttribute('data-view') === viewId));
    document.querySelectorAll('.view-panel').forEach((p) => p.classList.toggle('active', p.id === `view-${viewId}`));
  }

  function openLightbox(src) {
    document.getElementById('lightboxImg').src = src;
    document.getElementById('lightboxModal').classList.add('open');
  }

  function wireEvents() {
    document.getElementById('pinUnlockForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const entered = (document.getElementById('pinInput').value || '').trim();
      const targetHash = localStorage.getItem('radar99_pin_hash') || DEFAULT_PIN_HASH;
      const got = await sha256Hex(entered);
      if (got === targetHash) {
        localStorage.setItem('radar99_pin_ok', '1');
        document.getElementById('pinGateOverlay').classList.remove('active');
        document.getElementById('pinErrMsg').textContent = '';
        document.getElementById('pinInput').value = '';
        toast('🔓 RADAR 99 Stüdyo açıldı!');
      } else {
        document.getElementById('pinErrMsg').textContent = 'Hatalı PIN! (Varsayılan PIN: 9999)';
      }
    });

    document.getElementById('lockSiteBtn').addEventListener('click', () => {
      localStorage.removeItem('radar99_pin_ok');
      document.getElementById('pinGateOverlay').classList.add('active');
      toast('🔒 Site kilitlendi');
    });

    document.getElementById('saveNewPinBtn').addEventListener('click', async () => {
      const np = (document.getElementById('newPinInput').value || '').trim();
      if (np.length < 4) { toast('PIN en az 4 karakter olmalı!'); return; }
      const h = await sha256Hex(np);
      localStorage.setItem('radar99_pin_hash', h);
      localStorage.setItem('radar99_pin_ok', '1');
      document.getElementById('newPinInput').value = '';
      toast('✅ Yeni yönetici PIN kaydedildi!');
    });

    document.querySelectorAll('.nav-btn').forEach((btn) => btn.addEventListener('click', () => switchView(btn.getAttribute('data-view'))));
    document.getElementById('themeToggleBtn').addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('scout_radari_theme', next); } catch (_) {}
    });

    // Tab 1 Production Controls
    document.querySelectorAll('#prodModePills .pill-btn').forEach((b) => {
      b.addEventListener('click', () => {
        document.querySelectorAll('#prodModePills .pill-btn').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        state.prodMode = b.getAttribute('data-pmode');
        document.getElementById('customPlayerWrap').style.display = state.prodMode === 'custom' ? 'block' : 'none';
      });
    });
    document.getElementById('btnViralProduce').addEventListener('click', () => triggerProduction());
    document.getElementById('btnPreviewAlgoPick').addEventListener('click', showAlgoPreview);
    document.getElementById('refreshReadyBtn').addEventListener('click', async () => {
      await refreshReadyVideos();
      if (state.cloudCfg.pat) await pollCloudRuns(false);
      toast('Hazır videolar güncellendi');
    });
    document.getElementById('refreshCloudRunsBtn').addEventListener('click', () => pollCloudRuns(false));

    // Explorer & Duel controls
    document.getElementById('searchInput').addEventListener('input', (e) => { state.search = e.target.value; renderPlayerTable(); });
    document.querySelectorAll('#catFilters .pill-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#catFilters .pill-btn').forEach((x) => x.classList.remove('active'));
        btn.classList.add('active');
        state.category = btn.getAttribute('data-cat');
        renderPlayerTable();
      });
    });
    document.getElementById('posSelect').addEventListener('change', (e) => { state.posGroup = e.target.value; renderPlayerTable(); });
    document.getElementById('sortSelect').addEventListener('change', (e) => { state.sortBy = e.target.value; renderPlayerTable(); });
    document.getElementById('playerTbody').addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-pid]');
      if (!tr) return;
      state.selectedId = Number(tr.getAttribute('data-pid'));
      renderPlayerTable();
      renderDossier();
    });
    document.getElementById('randomGemBtn').addEventListener('click', () => {
      const list = filteredPlayers();
      if (!list.length) return;
      const pick = list[Math.floor(Math.random() * Math.min(list.length, 12))];
      state.selectedId = pick.id;
      renderPlayerTable();
      renderDossier();
      toast(`🔥 ViralRank #${pick.viralScore || pick.gemScore}: ${pick.name}`);
    });

    document.getElementById('duelSelectA').addEventListener('change', (e) => { state.duelAId = Number(e.target.value); renderDuelStage(); });
    document.getElementById('duelSelectB').addEventListener('change', (e) => { state.duelBId = Number(e.target.value); renderDuelStage(); });
    document.getElementById('autoDuelBtn').addEventListener('click', autoPickDuelGems);
    document.getElementById('swapDuelBtn').addEventListener('click', () => {
      const tmp = state.duelAId; state.duelAId = state.duelBId; state.duelBId = tmp;
      syncDuelSelects(); renderDuelStage();
    });

    // Private PC / Cloudflare Tunnel Backend Settings (0 GitHub Actions minutes!)
    document.getElementById('fillLocalBackendBtn').addEventListener('click', () => {
      document.getElementById('backendUrlInput').value = 'http://127.0.0.1:8765';
      document.getElementById('backendKeyInput').value = '';
      toast('PC yerel adresi dolduruldu — şimdi "Bağlantıyı Kaydet & Test Et" tıkla!');
    });
    document.getElementById('saveBackendCfgBtn').addEventListener('click', async () => {
      state.backendCfg.url = normalizeBaseUrl(document.getElementById('backendUrlInput').value);
      state.backendCfg.apiKey = document.getElementById('backendKeyInput').value.trim();
      localStorage.setItem('radar99_backend_cfg', JSON.stringify(state.backendCfg));
      const res = await probeLiveServer();
      if (res.ok) {
        await refreshReadyVideos();
        toast('🟢 Özel PC / Tunnel Stüdyo bağlandı! (0 Actions dakikası · Sınırsız)');
      } else {
        toast('⚠️ Bağlanamadı: ' + (res.error || 'Sunucu kapalı veya anahtar yanlış'));
      }
    });
    document.getElementById('clearBackendCfgBtn').addEventListener('click', async () => {
      state.backendCfg = { url: '', apiKey: '' };
      document.getElementById('backendUrlInput').value = '';
      document.getElementById('backendKeyInput').value = '';
      localStorage.removeItem('radar99_backend_cfg');
      await probeLiveServer();
      await refreshReadyVideos();
      toast('Özel Stüdyo bağlantısı sıfırlandı.');
    });

    // Cloud Settings & Queue
    document.getElementById('saveCloudCfgBtn').addEventListener('click', async () => {
      state.cloudCfg.pat = document.getElementById('ghPatInput').value.trim();
      state.cloudCfg.repo = document.getElementById('ghRepoInput').value.trim() || 'MFTTT11/scout-radari';
      state.cloudCfg.branch = document.getElementById('ghBranchInput').value.trim() || 'main';
      localStorage.setItem('radar99_cloud_cfg', JSON.stringify(state.cloudCfg));
      updateEngineStatusUi();
      if (state.cloudCfg.pat) {
        await pollCloudRuns(false);
        toast('☁️ Bulut bağlantısı kaydedildi ve doğrulandı!');
      } else {
        toast('Token boş — sadece yerel/statik mod aktif.');
      }
    });
    document.getElementById('clearCloudCfgBtn').addEventListener('click', () => {
      state.cloudCfg.pat = '';
      document.getElementById('ghPatInput').value = '';
      localStorage.removeItem('radar99_cloud_cfg');
      updateEngineStatusUi();
      toast('GitHub Token tarayıcıdan silindi.');
    });
    document.getElementById('copyYtExportCmdBtn').addEventListener('click', () => copyText('.venv/bin/python pipeline/youtube_uploader.py --export-github-secrets', 'OAuth Secret komutu kopyalandı!'));
    document.getElementById('copyGenCmdBtn').addEventListener('click', () => copyText(document.getElementById('generatedCmdBox').textContent, 'Komut kopyalandı!'));

    document.getElementById('queueAddBtn').addEventListener('click', () => {
      const inp = document.getElementById('queueAddInput');
      addQueuePlayer(inp.value, 'Manuel Scout Hedefi');
      inp.value = '';
    });
    document.getElementById('clearQueueBtn').addEventListener('click', () => { state.queue = []; saveQueue(); renderQueue(); });
    document.getElementById('copyBatchCmdBtn').addEventListener('click', () => {
      const names = state.queue.length ? state.queue.map((x) => x.name) : ['Geovany Quenda', 'Arda Ünyay'];
      copyText(names.map((n) => `.venv/bin/python pipeline/run_viral_pick.py --mode custom --player-a "${n}" --upload-youtube --privacy auto_geo`).join(' && \\\n'), 'Toplu komut kopyalandı!');
    });

    // Brand Kit buttons & Lightbox
    document.getElementById('lightboxModal').addEventListener('click', () => document.getElementById('lightboxModal').classList.remove('open'));
    document.querySelectorAll('[data-lightbox-src]').forEach((img) => img.addEventListener('click', () => openLightbox(img.getAttribute('data-lightbox-src'))));
    document.getElementById('copyBrandBioBtn').addEventListener('click', () => copyText(document.getElementById('brandBioText').textContent, 'YouTube açıklaması kopyalandı!'));
    document.getElementById('copyShortBioBtn').addEventListener('click', () => copyText("📡 Devler kapmadan 16–20 yaş gizli yetenekler!\n🧬 18.405 canlı veri • Oyun DNA'sı • 1v1 Düello\n👇 Sıradaki wonderkid'i yorumlara yaz!", 'TikTok / Reels bio kopyalandı!'));
    document.getElementById('copyBrandTagsBtn').addEventListener('click', () => copyText(document.getElementById('brandTagsText').textContent, 'Kanal etiketleri kopyalandı!'));
    document.getElementById('copyTrailerBtn').addEventListener('click', () => copyText("Real Madrid, City veya Galatasaray bu ismi açıkladığında herkes yeni duyacak... Ama sen 2 yıl önceden tanıyacaksın! RADAR 99 her gün 18 binden fazla oyuncuyu tarıyor, 16 ile 20 yaş arasındaki gizli cevherleri, Oyun DNA'sını ve piyasa değerini 45 saniyede önüne koyuyor. Devler kapmadan bu isimleri not almak istiyorsan şimdi abone ol — sıradaki gizli yetenek yolda!", 'Fragman metni kopyalandı!'));
  }

  async function init() {
    try {
      const savedTheme = localStorage.getItem('scout_radari_theme');
      if (savedTheme === 'light' || savedTheme === 'dark') document.documentElement.setAttribute('data-theme', savedTheme);
    } catch (_) {}

    initPinGate();
    loadStorage();
    wireEvents();
    await probeLiveServer();

    const resp = await fetch('./data/scout_data.json');
    const data = await resp.json();
    state.players = data.players || [];
    state.bundles = data.bundles || [];
    state.dbStats = data.dbStats || state.dbStats;

    document.getElementById('kpiEafc').textContent = (state.dbStats.eafcPlayersIndexed || 18405).toLocaleString('tr-TR');
    document.getElementById('kpiTm').textContent = (state.dbStats.tmPlayersIndexed || 50149).toLocaleString('tr-TR');

    const joachim = state.players.find((p) => p.name.includes('Joachim')) || state.players[0];
    const mastantuono = state.players.find((p) => p.name.includes('Mastantuono')) || state.players[0];
    const bardghji = state.players.find((p) => p.name.includes('Bardghji')) || state.players[1];
    state.selectedId = joachim ? joachim.id : null;
    state.duelAId = mastantuono ? mastantuono.id : null;
    state.duelBId = bardghji ? bardghji.id : null;

    saveQueue();
    await refreshReadyVideos();
    renderPlayerTable();
    renderDossier();
    syncDuelSelects();
    renderDuelStage();
    renderQueue();
    if (state.cloudCfg.pat) pollCloudRuns(false);
  }

  init();
})();

/* ============================================================
   CRM — New Beginning   (vanilla JS, bez budowania)   v36
   Realtime + auto-zapis + @oznaczenia + "Poproś o demo" + wyszukiwarka.
   v36 (2026-06-25): widoki per-osoba — każdy domyślnie widzi TYLKO swoje karty;
     • panel zespołu (👥 Pokaż) = wybór czyje karty widać: jedna / kilka / wszyscy (dla każdego);
     • tryby widoku: Wszystkie (moje + gdzie jestem opiekunem) / Moje / Na dziś-zaległe / Archiwum;
     • "Kosz" → "Archiwum" (chowanie z tablicy, odwracalne); "Usuń kartę" → "Przenieś do archiwum";
     • etap 'archiwum' usunięty z lejka, stare karty zmigrowane do Archiwum.
   v26 (2026-06-22): ujednolicony przepływ demo —
     • demo_requests = ŹRÓDŁO PRAWDY (księga: kto/kiedy/karta/status),
       flaga demo_requested = tylko ZNACZNIK chipa na tablicy;
     • "Poproś o demo": INSERT do księgi NAJPIERW (odporny), znacznik best-effort;
     • wklejenie linku do dema → prośba 'done' + chip gaśnie.
   ============================================================ */

/* ---------- Etapy lejka (1:1 z Notion) ---------- */
const STATUSES = [
  { key: "lead",          label: "Lead",                  dot: "#9b9a97", bg: "#e8e8e6", fg: "#5a594f", tint: "#f8f8f7" },
  { key: "zainteresowany",label: "Wysłane demo",           dot: "#529cca", bg: "#ddebf1", fg: "#2c6e8f", tint: "#f4f9fc" },
  { key: "umowiony",      label: "Zainteresowany",        dot: "#9a6dd7", bg: "#ede1f7", fg: "#6940a5", tint: "#faf7fd" },
  { key: "po_spotkaniu",  label: "Sprzedaż",               dot: "#e0837d", bg: "#fbe4e2", fg: "#a8362f", tint: "#fdf6f5" },
  { key: "oferta",        label: "Oferta/umowa",           dot: "#d9b54a", bg: "#faf3dd", fg: "#8a6d1a", tint: "#fdfbf2" },
  { key: "konwersja",     label: "Konwersja",              dot: "#6aa84f", bg: "#dbeddb", fg: "#3d6b2e", tint: "#f5faf4" },
];
const statusOf = (k) => STATUSES.find((s) => s.key === k) || STATUSES[0];
// status spoza lejka (np. dawny etap 'archiwum') traktuj jak 'lead' — żeby karta nigdy nie zniknęła z tablicy
const normStatus = (c) => { const k = c && c.status; return STATUSES.some((s) => s.key === k) ? k : "lead"; };

/* ---------- Zespół (dynamiczny) ---------- */
const DEMO_OWNERS = ["Krzysztof", "Marceli", "Szymon", "Bartek", "Piotr"];
const ownerColor = (name) => {
  // ODRĘBNY kolor per osoba — wg pozycji w zespole (zero kolizji); skaluje się na wiele osób (złoty kąt barw)
  let idx = state.team.indexOf(name);
  if (idx < 0) { let h = 0; const s = String(name || "?"); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; idx = 7 + (h % 12); }
  const hue = Math.round((idx * 137.508) % 360);
  return `hsl(${hue} 60% 45%)`;
};
const initials = (name) => (name || "?").trim().charAt(0).toUpperCase();

/* ---------- Stan ---------- */
const state = {
  clients: [], commentsByClient: {}, team: [],
  viewMode: "all",          // tryb widoku: "all" (Wszystkie = zaznaczeni: owner|opiekun) | "owner:<imię>" (zakładka osoby) | "due" | "archive"
  layout: "kanban",         // układ tablicy/„na dziś": "kanban" (kolumny) | "table" (tabela)
  owners: null,             // Set wybranych właścicieli (panel zespołu); null → traktuj jak [zalogowany]
  ownersAll: false,         // sentinel „Wszyscy" — rozwija się dynamicznie do bieżącego zespołu (nie zamraża listy)
  ownerPopOpen: false,      // czy rozwinięty panel zespołu (poza DOM, by przeżyć przebudowę #tabs przez realtime)
  currentUser: "Krzysztof", search: "", live: false, openCardId: null, openCardWasArchived: false, newCardIds: new Set(), skipFlipId: null, animateNextRender: false,
  suppressUntil: 0, lastSnap: "",
};

/* ---------- Panel zespołu: czyje karty widać (domyślnie tylko moje) ---------- */
// pełna lista właścicieli = zespół ∪ faktyczni właściciele kart (łapie „sieroty": owner spoza team_members)
function allOwners() {
  return Array.from(new Set([...(state.team || []), ...state.clients.map((c) => c.owner)].filter(Boolean)));
}
function selectedOwnersSet() {
  if (state.ownersAll) { const all = allOwners(); return new Set(all.length ? all : [state.currentUser]); }
  if (state.owners && state.owners.size) return state.owners;
  return new Set([state.currentUser]);
}
function ownerSummary() {
  if (state.ownersAll) return "wszyscy";
  const names = [...selectedOwnersSet()];
  if (names.length === 1) return names[0] === state.currentUser ? "tylko ja" : names[0];
  if (names.length <= 2) return names.join(", ");
  return names.length + " osób";
}
function ownersKey() { return "crm.owners." + (state.currentUser || "?"); }
function persistOwners() {
  try { localStorage.setItem(ownersKey(), JSON.stringify(state.ownersAll ? ["*"] : [...selectedOwnersSet()])); } catch {}
}
function loadOwners() {   // → { all: bool, owners: Set }
  try {
    const raw = localStorage.getItem(ownersKey());
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        if (arr.includes("*")) return { all: true, owners: new Set([state.currentUser]) };
        const ok = arr.filter((n) => n === state.currentUser || (state.team || []).includes(n));
        if (ok.length) return { all: false, owners: new Set(ok) };
      }
    }
  } catch {}
  return { all: false, owners: new Set([state.currentUser]) };
}

/* ============================================================
   WARSTWA DANYCH (demo ↔ Supabase)
   ============================================================ */
let sb = null;
const cfg = window.CRM_CONFIG || {};
const LIVE = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);

const api = {
  isLive: () => LIVE,
  async init() { if (LIVE) sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY); },
  async getUser() { if (!LIVE) return { email: "demo@local" }; const { data } = await sb.auth.getUser(); return data.user; },
  async signIn(email, password) { const { error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw error; },
  async signOut() { if (LIVE) await sb.auth.signOut(); },
  async resetPassword(email) { const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }); if (error) throw error; },
  async updatePassword(pw) { const { error } = await sb.auth.updateUser({ password: pw }); if (error) throw error; },

  async getClients() {
    if (!LIVE) return structuredClone(DEMO_CLIENTS);
    const { data, error } = await sb.from("clients").select("*").order("created_at", { ascending: true });
    if (error) throw error; return data;
  },
  async updateClient(id, patch) {
    if (!LIVE) return;
    holdRefresh();
    const { error } = await sb.from("clients").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    holdRefresh();   // przesuń okno od MOMENTU commitu, nie od startu (echo nie cofnie świeżej zmiany)
  },
  async addClient(obj) {
    if (!LIVE) { obj.id = "demo-" + Date.now(); return obj; }
    holdRefresh();
    const { data, error } = await sb.from("clients").insert(obj).select().single();
    if (error) throw error; holdRefresh(); return data;
  },
  async deleteClient(id) { if (!LIVE) return; holdRefresh(); const { error } = await sb.from("clients").delete().eq("id", id); if (error) throw error; holdRefresh(); },
  // Archiwum: „przeniesienie" = oznaczenie znacznikiem (odwracalne); przywrócenie = wyczyszczenie znacznika
  async softDeleteClient(id) { return api.updateClient(id, { deleted_at: new Date().toISOString() }); },
  async restoreClient(id) { return api.updateClient(id, { deleted_at: null }); },
  // TRWAŁE usunięcie z Archiwum — warunkowe: skasuje TYLKO jeśli karta nadal jest w Archiwum (deleted_at != null).
  // Dzięki temu wyścig „ktoś inny przywrócił w międzyczasie" nie skasuje żywej karty. Zwraca true gdy faktycznie usunięto.
  async purgeClient(id) {
    if (!LIVE) { return true; }
    holdRefresh();
    const { data, error } = await sb.from("clients").delete().not("deleted_at", "is", null).eq("id", id).select();
    if (error) throw error; holdRefresh();
    return !!(data && data.length);
  },

  async getAllComments() {
    if (!LIVE) return structuredClone(DEMO_COMMENTS);
    const { data, error } = await sb.from("comments").select("*").order("created_at", { ascending: true });
    if (error) throw error;
    const by = {}; (data || []).forEach((c) => { (by[c.client_id] = by[c.client_id] || []).push(c); }); return by;
  },
  async getComments(clientId) {
    if (!LIVE) return structuredClone(DEMO_COMMENTS[clientId] || []);
    const { data, error } = await sb.from("comments").select("*").eq("client_id", clientId).order("created_at", { ascending: true });
    if (error) throw error; return data;
  },
  async addComment(clientId, body) {
    if (!LIVE) { const row = { client_id: clientId, author: state.currentUser, body, created_at: new Date().toISOString() }; (state.commentsByClient[clientId] = state.commentsByClient[clientId] || []).push(row); return row; }
    holdRefresh();
    const { data, error } = await sb.from("comments").insert({ client_id: clientId, author: state.currentUser, body }).select().single();
    if (error) throw error; holdRefresh(); return data;
  },

  async getTeam() {
    if (!LIVE) return DEMO_OWNERS.map((name) => ({ email: name.toLowerCase() + "@demo", name }));
    const { data, error } = await sb.from("team_members").select("*").order("created_at", { ascending: true });
    if (error) throw error; return data || [];
  },
  async upsertMe(email, name) {
    if (!LIVE) return { email, name };
    const { data, error } = await sb.from("team_members").upsert({ email, name }, { onConflict: "email" }).select().single();
    if (error) throw error; return data;
  },

  async requestDemo(clientId, note) {
    if (!LIVE) return;
    holdRefresh();
    // ŹRÓDŁO PRAWDY = wpis w „księdze" demo_requests (kto + kiedy + która karta + status).
    // Dlatego NAJPIERW wstawiamy wpis (await + rzuć błędem, gdy się nie uda) —
    // bez wpisu prośba „nie istnieje" i nie ma sensu zapalać znacznika.
    const { error } = await sb.from("demo_requests")
      .insert({ client_id: clientId, requested_by: state.currentUser, note: note || null, status: "pending" });
    if (error) throw error;
    // Flaga na karcie = tylko ZNACZNIK do szybkiego „chipa" na tablicy. Best-effort:
    // jeśli nie pyknie, prośba i tak jest zapisana w księdze (wyłapie ją dyżurny/raport).
    sb.from("clients").update({ demo_requested: true }).eq("id", clientId)
      .then(({ error: e2 }) => { if (e2) console.error("demo flag (znacznik)", e2); }, (e) => console.error("demo flag (znacznik)", e));
    holdRefresh();
  },

  // Zamknięcie prośby: gdy karta dostała link do dema, oznacz JEJ otwarte prośby jako 'done'
  // (księga przestaje je liczyć) i zgaś znacznik na karcie. Best-effort — błąd tylko logujemy,
  // bo to porządkowanie, nie krytyczny zapis (link już się zapisał wcześniej).
  async markDemoDone(clientId) {
    if (!LIVE) return;
    holdRefresh();
    const { error } = await sb.from("demo_requests")
      .update({ status: "done" }).eq("client_id", clientId).neq("status", "done");
    if (error) { console.error("markDemoDone (księga)", error); return; }
    sb.from("clients").update({ demo_requested: false, demo_building: false }).eq("id", clientId)
      .then(({ error: e2 }) => { if (e2) console.error("markDemoDone (znacznik)", e2); }, (e) => console.error("markDemoDone (znacznik)", e));
    holdRefresh();
  },

  async subscribe(onChange) {
    if (!LIVE) return;
    // utrzymuj ŚWIEŻY token na sokecie realtime (sesja wygasa ~1h i jest cicho odświeżana,
    // bez tego live-podgląd po godzinie po cichu umiera)
    const { data: { session } } = await sb.auth.getSession();
    if (session?.access_token) sb.realtime.setAuth(session.access_token);
    sb.auth.onAuthStateChange((_e, s) => { if (s?.access_token) sb.realtime.setAuth(s.access_token); });
    sb.channel("crm-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "demo_requests" }, onChange)
      .subscribe();
  },
};

/* ============================================================
   POMOCNICZE
   ============================================================ */
const $ = (sel) => document.querySelector(sel);
const fmtDate = (d) => { if (!d) return ""; const dt = new Date(d); if (isNaN(dt)) return d; return dt.toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" }); };
const fmtDateTime = (d) => { if (!d) return ""; const dt = new Date(d); if (isNaN(dt)) return d; return dt.toLocaleString("pl-PL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); };
// follow_up = timestamp; pole datetime-local chce "YYYY-MM-DDTHH:MM"
const toDTLocal = (v) => { if (!v) return ""; let s = String(v).replace(" ", "T"); if (s.length === 10) s += "T00:00"; return s.slice(0, 16); };
// część dla pola <input type="date"> (YYYY-MM-DD) i opcjonalnego <input type="time"> (HH:MM; pusta gdy północ = brak godziny)
const toDateInput = (v) => toDTLocal(v).slice(0, 10);
const toTimeInput = (v) => { const t = toDTLocal(v).slice(11, 16); return (t && t !== "00:00") ? t : ""; };
// chip follow-upu: pokaż godzinę gdy ustawiona (≠ północ), inaczej samą datę
const fmtFollow = (v) => { if (!v) return ""; const s = String(v).replace(" ", "T"); const dt = new Date(s.length === 10 ? s + "T00:00" : s); if (isNaN(dt)) return fmtDate(v); return (dt.getHours() === 0 && dt.getMinutes() === 0) ? fmtDate(v) : dt.toLocaleString("pl-PL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); };
const esc = (s) => (s == null ? "" : String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
// Notatka → zamień URL-e (http(s):// i www.) w treści na KLIKALNE hiperłącza, resztę zostaw jako bezpieczny tekst.
// Nowe linie zachowane przez white-space:pre-wrap na widoku.
const NOTE_PLACEHOLDER = "notatki, historia rozmów… (kliknij, aby pisać; wklejone linki staną się klikalne)";
const linkify = (text) => {
  if (!text) return "";
  // 1) http(s)://… 2) www.… 3) goły adres ZE ŚCIEŻKĄ (np. firma.github.io/x) — nie poprzedzony @ (pomija maile)
  const re = /(?<![\w@./-])((?:https?:\/\/|www\.)[^\s<>"']+|[a-z0-9][a-z0-9.-]*\.[a-z]{2,}\/[^\s<>"']*)/gi;
  let out = "", last = 0, m;
  while ((m = re.exec(text)) !== null) {
    out += esc(text.slice(last, m.index));                 // tekst przed linkiem
    const trimmed = m[0].replace(/[.,;:)\]}>]+$/, "");      // utnij końcową interpunkcję (zostaje poza linkiem)
    const trailing = m[0].slice(trimmed.length);
    const href = /^https?:\/\//i.test(trimmed) ? trimmed : "https://" + trimmed;   // dolep https:// gdy brak
    out += safeUrl(href)
      ? `<a href="${esc(href)}" target="_blank" rel="noopener" class="note-link">${esc(trimmed)}</a>`
      : esc(trimmed);
    out += esc(trailing);
    last = m.index + m[0].length;
  }
  out += esc(text.slice(last));
  return out;
};
const canEdit = (client) => client.owner === state.currentUser;
const isDueSoon = (d) => { if (!d) return false; const dt = new Date(d); if (isNaN(dt)) return false; const t = new Date(); t.setHours(23, 59, 59, 999); return dt <= t; };
const dueState = (d) => { if (!d) return ""; const dt = new Date(d); if (isNaN(dt)) return ""; const t = new Date(); t.setHours(0,0,0,0); const day = new Date(dt); day.setHours(0,0,0,0); if (day < t) return "overdue"; if (day.getTime() === t.getTime()) return "today"; return ""; };
const safeUrl = (u) => { try { const x = new URL(u); return (x.protocol === "http:" || x.protocol === "https:") ? u : ""; } catch { return ""; } };
const debounce = (fn, ms) => { let h; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); }; };
const DEMO_FLAG_HTML = `<span class="demo-flag">Poproszono o demo</span>`;
// Pole demo: gdy jest link → KLIKALNY link + odnośniki (otwórz/kopiuj); inaczej → przycisk „Poproś o demo"
// (+ „🔗 link", który odsłania pole do wklejenia gotowego linku). Po wklejeniu zmienia się w link i odnośniki.
function demoFieldHTML(c, editable) {
  const demoSafe = safeUrl(c.demo_url);
  if (demoSafe) {
    return `<a class="maps-link demo-link" href="${esc(demoSafe)}" target="_blank" rel="noopener">otwórz demo</a>
      <button type="button" class="maps-btn" id="demo-copy" title="Kopiuj link do dema">⧉</button>
      ${editable ? `<button type="button" class="maps-btn" id="demo-edit" title="Zmień / usuń link">✎</button>
      <input data-key="demo_url" id="demo-input" class="demo-input" value="${esc(c.demo_url || "")}" placeholder="link do dema" hidden />` : ""}`;
  }
  if (!editable) return `<span class="readonly">—</span>`;
  return `<span class="demo-row">${c.demo_requested ? DEMO_FLAG_HTML : `<button type="button" class="ghost-btn demo-btn" id="ask-demo">Poproś o demo</button>`}</span>
    <button type="button" class="maps-btn" id="demo-add" title="Wklej gotowy link do dema">link</button>
    <input data-key="demo_url" id="demo-input" class="demo-input" value="" placeholder="wklej link do dema" hidden />`;
}
const reduceMotion = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
// FLIP: płynne przestawianie kart (rejestruj pozycje przed przerysowaniem, animuj po)
function flipAnimate(board, prevRects) {
  if (reduceMotion()) { state.skipFlipId = null; return; }
  try {
    board.querySelectorAll(".card").forEach((el) => {
      const old = prevRects.get(el.dataset.id);
      const moved = el.dataset.id === state.skipFlipId; // karta przed chwilą przeciągnięta
      if (old && !moved) { // istniejąca karta zmienia pozycję → płynnie dosuń
        const now = el.getBoundingClientRect();
        const dx = old.left - now.left, dy = old.top - now.top;
        if (dx || dy) {
          el.style.transition = "none";
          el.style.transform = `translate(${dx}px,${dy}px)`;
          requestAnimationFrame(() => { el.style.transition = "transform .24s cubic-bezier(.2,.7,.3,1)"; el.style.transform = ""; });
        }
      } else { // nowa karta LUB świeżo przeniesiona → delikatne pojawienie W MIEJSCU (bez lotu przez ekran)
        el.style.transition = "none"; el.style.opacity = "0"; el.style.transform = "scale(.97)";
        requestAnimationFrame(() => { el.style.transition = "opacity .18s ease, transform .18s ease"; el.style.opacity = ""; el.style.transform = ""; });
      }
    });
  } catch (e) { console.error("flip", e); }
  state.skipFlipId = null;
}
function flashCard(id) {
  try { const el = document.querySelector(`#board .card[data-id="${CSS.escape(String(id))}"]`); if (el) { el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 700); } } catch {}
}

/* ============================================================
   RENDER — zakładki
   ============================================================ */
// Przełącznik układu (kanban / tabela) — w pasku tabów, po prawej obok „Pokaż"
const KANBAN_ICON = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="16" rx="1.5"/><rect x="17" y="4" width="4" height="10" rx="1.5"/></svg>`;
const TABLE_ICON = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9.5h18M3 15h18M11 4v16"/></svg>`;
function renderTabs() {
  const tabs = $("#tabs");
  const me = state.currentUser;
  const sel = selectedOwnersSet();
  const mine = state.clients.filter((c) => sel.has(c.owner));      // wybrani w „Pokaż" — zakres „Na dziś"/„Archiwum"
  const active = mine.filter((c) => !c.deleted_at);
  const dueCount = active.filter((c) => !c.follow_up_done && isDueSoon(c.follow_up)).length;
  const archiveCount = mine.length - active.length;
  // „Wszystkie" = suma po ZAZNACZONYCH: ich lidy + lidy, gdzie są opiekunem
  const allCount = state.clients.filter((c) => !c.deleted_at && (sel.has(c.owner) || sel.has(c.opiekun))).length;
  const ownerCount = (n) => state.clients.filter((c) => !c.deleted_at && c.owner === n).length;
  // zakładki per-osoba = KAŻDY zaznaczony (ja pierwszy, potem reszta wg kolejności zespołu); moja zakładka = moje imię
  const personTabs = [me, ...(allOwners().length ? allOwners() : [me]).filter((n) => n !== me)].filter((n) => sel.has(n));
  // legacy/martwy viewMode → mapuj; gdy stoisz na zakładce osoby, która zniknęła z zaznaczenia → „Wszystkie"
  if (state.viewMode === "board") state.viewMode = sel.has(me) ? "owner:" + me : "all";
  if (state.viewMode.startsWith("owner:") && !personTabs.includes(state.viewMode.slice(6))) state.viewMode = "all";
  const modes = [
    { key: "all", label: "Wszystkie", count: allCount },
    ...personTabs.map((n) => ({ key: "owner:" + n, label: n, count: ownerCount(n), dot: ownerColor(n) })),
    { key: "due",     label: "📅 Na dziś / zaległe",  count: dueCount },
    { key: "archive", label: "🗄 Archiwum",           count: archiveCount },
  ];
  const showSwitch = state.viewMode !== "archive";       // Archiwum ma własny widok-listę — przełącznik nie dotyczy
  const showOwnerPanel = true;                           // „Pokaż" steruje teraz i „Wszystkie", i zakładkami osób — zawsze widoczny
  const vsBtn = (key, icon, label) =>
    `<button class="vs-btn ${state.layout === key ? "on" : ""}" data-layout="${key}" title="Widok: ${label}" aria-pressed="${state.layout === key}">${icon}<span>${label}</span></button>`;
  tabs.innerHTML =
    `<div class="tab-modes">${modes.map((m) =>
      `<button class="tab ${state.viewMode === m.key ? "active" : ""}" data-mode="${m.key}">${m.dot ? `<span class="tab-dot" style="background:${m.dot}"></span>` : ""}${esc(m.label)}<span class="count">${m.count}</span></button>`).join("")}</div>
     ${showSwitch ? `<div class="view-switch" role="group" aria-label="Układ widoku">${vsBtn("kanban", KANBAN_ICON, "Kanban")}${vsBtn("table", TABLE_ICON, "Tabela")}</div>` : ""}
     ${showOwnerPanel ? `<div class="owner-panel">
       <button class="owner-toggle" id="owner-toggle" aria-haspopup="true" title="Wybierz, czyje karty widać">👥 Pokaż: <strong>${esc(ownerSummary())}</strong> <span class="caret">▾</span></button>
       <div class="owner-pop" id="owner-pop" hidden></div>
     </div>` : ""}`;
  tabs.querySelectorAll(".tab[data-mode]").forEach((el) =>
    el.addEventListener("click", () => { state.viewMode = el.dataset.mode; renderTabs(); renderBoard(); }));
  tabs.querySelectorAll(".vs-btn[data-layout]").forEach((el) =>
    el.addEventListener("click", () => { if (state.layout === el.dataset.layout) return; state.layout = el.dataset.layout; renderTabs(); renderBoard(); }));
  wireOwnerPanel();
}

/* Panel zespołu (rozwijany): klik = dodaj/usuń osobę z widoku; „Wszyscy" = wszyscy naraz (dynamicznie). Dostępny dla każdego. */
function wireOwnerPanel() {
  const toggle = $("#owner-toggle"), pop = $("#owner-pop");
  if (!toggle || !pop) return;
  const sel = selectedOwnersSet();
  const people = allOwners().length ? allOwners() : [state.currentUser];   // unia: zespół + faktyczni właściciele kart (nie gubimy „sierot")
  const allOn = !!state.ownersAll;
  pop.innerHTML =
    `<button class="owner-opt owner-all ${allOn ? "on" : ""}" data-all="1"><span class="owner-check">${allOn ? "✓" : ""}</span> Wszyscy</button>
     <div class="owner-sep"></div>
     ${people.map((n) => {
       const on = sel.has(n);
       const me = n === state.currentUser ? ` <span class="owner-me">(ja)</span>` : "";
       return `<button class="owner-opt ${on ? "on" : ""}" data-name="${esc(n)}"><span class="owner-check">${on ? "✓" : ""}</span><span class="avatar sm" style="background:${ownerColor(n)}">${initials(n)}</span> ${esc(n)}${me}</button>`;
     }).join("")}`;
  pop.hidden = !state.ownerPopOpen;                            // odtwórz stan otwarcia po przebudowie (#tabs przerysowuje realtime)
  toggle.setAttribute("aria-expanded", String(!!state.ownerPopOpen));
  toggle.onclick = (e) => {
    e.stopPropagation();
    const willOpen = pop.hidden;
    pop.hidden = !willOpen; state.ownerPopOpen = willOpen;
    toggle.setAttribute("aria-expanded", String(willOpen));
  };
  pop.querySelectorAll(".owner-opt").forEach((opt) => opt.addEventListener("click", (e) => {
    e.stopPropagation();
    if (opt.dataset.all) {
      if (allOn) { state.ownersAll = false; state.owners = new Set([state.currentUser]); }   // „Wszyscy" wyłączone → wróć do mnie
      else { state.ownersAll = true; }                                                        // „Wszyscy" = sentinel (rozwija się do bieżącego zespołu)
    } else {
      const cur = new Set(selectedOwnersSet());                // gdy było „wszyscy", rozwiń unię i odznacz jedną osobę
      state.ownersAll = false;
      const n = opt.dataset.name;
      if (cur.has(n)) cur.delete(n); else cur.add(n);
      if (!cur.size) cur.add(state.currentUser);               // nigdy pusto
      state.owners = cur;
    }
    persistOwners();
    state.ownerPopOpen = true;                                 // zostaw panel otwarty (wybór wielu naraz)
    renderTabs(); renderBoard();
  }));
}
function closeOwnerPanel() {
  state.ownerPopOpen = false;
  const pop = $("#owner-pop"); if (pop) pop.hidden = true;
  const t = $("#owner-toggle"); if (t) t.setAttribute("aria-expanded", "false");
}

/* ============================================================
   RENDER — tablica
   ============================================================ */
const activeClients = () => state.clients.filter((c) => !c.deleted_at);   // karty NIE w archiwum
function visibleClients() {
  const q = state.search.trim().toLowerCase();
  const sel = selectedOwnersSet();
  const mine = state.clients.filter((c) => sel.has(c.owner));     // tylko wybrani właściciele (domyślnie: ja)
  let list;
  // SZUKANIE jest GLOBALNE — po wszystkich właścicielach (łatwo wykryć, że kolega ma już danego klienta);
  // filtr właścicieli z panelu działa tylko przy pustym polu szukania.
  if (state.viewMode === "archive") list = (q ? state.clients : mine).filter((c) => c.deleted_at);   // Archiwum (szukasz → globalnie)
  else {
    let active;
    if (q) active = activeClients();                                              // szukasz → wszyscy
    else if (state.viewMode === "all") active = activeClients().filter((c) => sel.has(c.owner) || sel.has(c.opiekun));  // Wszystkie = zaznaczeni: ich lidy + gdzie są opiekunem
    else if (state.viewMode.startsWith("owner:")) { const n = state.viewMode.slice(6); active = activeClients().filter((c) => c.owner === n); }  // zakładka osoby = jej lidy (owner)
    else active = mine.filter((c) => !c.deleted_at);                             // „Na dziś" → wybrani właściciele (Pokaż)
    if (state.viewMode === "due" && !q) list = active.filter((c) => !c.follow_up_done && isDueSoon(c.follow_up));
    else list = active;
  }
  if (q) list = list.filter((c) => [c.name, c.company, c.phone, c.email].filter(Boolean).join(" ").toLowerCase().includes(q));
  // sort: RĘCZNA kolejność (position) decyduje; rezerwa = najbliższy follow-up, potem alfabetycznie (stabilnie)
  const ts = (v) => { if (!v) return Infinity; const t = Date.parse(v); return Number.isNaN(t) ? Infinity : t; };
  const pos = (c) => (c.position == null ? Number.POSITIVE_INFINITY : Number(c.position));
  return [...list].sort((a, b) =>
    (pos(a) - pos(b)) ||
    (ts(a.follow_up) - ts(b.follow_up)) ||
    String(a.name || "").localeCompare(String(b.name || ""), "pl"));
}

function renderBoard() {
  const board = $("#board");
  const tableMode = state.layout === "table" && state.viewMode !== "archive";
  const isArchive = state.viewMode === "archive";
  board.classList.toggle("board-table", tableMode || isArchive);   // Archiwum też jako tabela
  // FLIP (mierzenie pozycji + animacja) TYLKO gdy karty realnie się przestawiają (drag / zmiana etapu / nowa / usunięta).
  // Przy realtime i wyszukiwarce pomijamy — zero wymuszonych reflow = zero laga.
  const animate = !tableMode && !isArchive && !reduceMotion() && (state.skipFlipId || state.animateNextRender);
  const prevRects = new Map();
  if (animate) board.querySelectorAll(".card").forEach((el) => prevRects.set(el.dataset.id, el.getBoundingClientRect()));

  if (tableMode) {                                  // widok tabeli (Tablica / Na dziś) — zamiast kolumn kanban
    renderTable(board, visibleClients());
    state.skipFlipId = null; state.animateNextRender = false;
    if (typeof renderBell === "function") renderBell();
    return;
  }

  if (isArchive) {
    // ARCHIWUM — tabela zarchiwizowanych (najświeższe na górze), bez kolumn lejka i bez „Nowej karty"
    const arch = [...visibleClients()].sort((a, b) => String(b.deleted_at || "").localeCompare(String(a.deleted_at || "")));
    renderTable(board, arch, { archive: true });
    state.skipFlipId = null; state.animateNextRender = false;
    return;
  }

  const list = visibleClients();
  board.innerHTML = STATUSES.map((s) => {
    const cards = list.filter((c) => normStatus(c) === s.key);
    return `<section class="column" data-status="${s.key}">
      <div class="col-inner" style="background:${s.tint}">
        <div class="column-head">
          <span class="col-pill" style="background:${s.bg};color:${s.fg}"><span class="dot" style="background:${s.dot}"></span>${esc(s.label)}</span>
          <span class="col-count">${cards.length}</span>
          <button class="add-card" data-status="${s.key}" title="Dodaj kartę do etapu" aria-label="Dodaj kartę do etapu">＋</button>
        </div>
        <div class="cards" data-status="${s.key}">${cards.map(renderCard).join("")}</div>
        <button class="add-card-btn" data-status="${s.key}" style="color:${s.fg}">＋ Nowa karta</button>
      </div>
    </section>`;
  }).join("");

  board.querySelectorAll(".card").forEach((el) => el.addEventListener("click", () => openModal(el.dataset.id)));
  board.querySelectorAll(".add-card-btn, .add-card").forEach((el) => el.addEventListener("click", (e) => { e.stopPropagation(); newCard(el.dataset.status); }));
  wireDragAndDrop();
  if (animate) flipAnimate(board, prevRects);
  state.skipFlipId = null; state.animateNextRender = false;
  if (typeof renderBell === "function") renderBell();
}

// Widok tabeli — te same karty (z bieżącego trybu/właścicieli), wiersze zamiast kolumn. Klik w wiersz → karta.
// opts.archive = wariant Archiwum: zamiast Follow-up/Demo kolumna „Schowano" + podpowiedź o przywracaniu.
function renderTable(board, list, opts = {}) {
  const archive = !!opts.archive;
  if (!list.length) {
    board.innerHTML = archive ? `<div class="empty-archive">🗄 Archiwum jest puste</div>`
                              : `<div class="table-empty">Brak kart do wyświetlenia.</div>`;
    return;
  }
  const dash = `<span class="tb-empty">—</span>`;
  const nameCell = (c) => `<div class="tb-name"><span class="tb-nm">${esc(c.name)}</span>${c.company ? `<span class="tb-co">${esc(c.company)}</span>` : ""}</div>`;
  const statusCell = (c) => { const s = statusOf(normStatus(c)); return `<span class="status-pill" style="background:${s.bg};color:${s.fg}"><span class="dot" style="background:${s.dot}"></span>${esc(s.label)}</span>`; };
  const teamCell = (c) => `${c.opiekun ? `<span class="avatar avatar-sec" title="Opiekun: ${esc(c.opiekun)}" style="background:${ownerColor(c.opiekun)}">${initials(c.opiekun)}</span>` : ""}<span class="avatar" title="Handlowiec: ${esc(c.owner)}" style="background:${ownerColor(c.owner)}">${initials(c.owner)}</span>`;

  const head = archive
    ? `<th>Klient</th><th>Telefon</th><th>Status</th><th>Schowano</th><th>Komentarze</th><th>Zespół</th>`
    : `<th>Klient</th><th>Telefon</th><th>Status</th><th>Follow-up</th><th>Komentarze</th><th>Demo</th><th>Zespół</th>`;

  const rows = list.map((c) => {
    const cnt = (state.commentsByClient[c.id] || []).length;
    const numCell = `<td class="tb-num">${cnt ? `💬 ${cnt}` : dash}</td>`;
    if (archive) {
      return `<tr class="tb-row" data-id="${esc(String(c.id))}">
        <td>${nameCell(c)}</td>
        <td>${c.phone ? esc(c.phone) : dash}</td>
        <td>${statusCell(c)}</td>
        <td class="tb-arch">${c.deleted_at ? esc(fmtDateTime(c.deleted_at)) : dash}</td>
        ${numCell}
        <td class="tb-team"><div class="tb-team-in">${teamCell(c)}</div></td>
      </tr>`;
    }
    const ds = c.follow_up_done ? "" : dueState(c.follow_up);
    const fu = c.follow_up
      ? `<span class="tb-fu ${c.follow_up_done ? "fu-done" : (ds ? "fu-" + ds : "")}">${c.follow_up_done ? "✓ " : ""}${esc(fmtFollow(c.follow_up))}${ds === "overdue" ? " ⚠" : ""}</span>`
      : dash;
    const demo = (c.demo_url && String(c.demo_url).trim()) ? `<span class="chip chip-demo-done" title="Demo gotowe">✅ demo</span>`
      : c.demo_building ? `<span class="chip chip-building" title="Demo w budowie">🔨 w budowie</span>`
      : c.demo_requested ? `<span class="chip chip-demo" title="Poproszono o demo">📩 demo</span>` : dash;
    return `<tr class="tb-row" data-id="${esc(String(c.id))}">
        <td>${nameCell(c)}</td>
        <td>${c.phone ? esc(c.phone) : dash}</td>
        <td>${statusCell(c)}</td>
        <td>${fu}</td>
        ${numCell}
        <td class="tb-demo">${demo}</td>
        <td class="tb-team"><div class="tb-team-in">${teamCell(c)}</div></td>
      </tr>`;
  }).join("");

  const hint = archive ? `<div class="archive-head">🗄 Archiwum — karty schowane z tablicy. Kliknij wiersz, aby przywrócić.</div>` : "";
  board.innerHTML = `${hint}<div class="table-wrap"><table class="crm-table">
      <thead><tr>${head}</tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  board.querySelectorAll(".tb-row").forEach((el) => el.addEventListener("click", () => openModal(el.dataset.id)));
}

function renderCardInner(c) {
  const cnt = (state.commentsByClient[c.id] || []).length;
  const ds = c.follow_up_done ? "" : dueState(c.follow_up);   // zrobiony follow-up nie świeci jako „dziś/zaległe"
  return `<div class="card-title"><span class="card-ic">👤</span>${esc(c.name)}</div>
    ${c.company ? `<div class="card-company">${esc(c.company)}</div>` : ""}
    <div class="card-meta">${c.phone ? `<span class="chip">📞 ${esc(c.phone)}</span>` : ""}</div>
    <div class="card-foot">
      ${(c.follow_up && !c.follow_up_done) ? `<span class="chip ${ds ? "chip-" + ds : ""}" title="Follow-up">📅 ${esc(fmtFollow(c.follow_up))}${ds === "overdue" ? " ⚠" : ""}</span>` : ""}
      ${cnt ? `<span class="chip">💬 ${cnt}</span>` : ""}
      ${(c.demo_url && String(c.demo_url).trim())
        ? `<span class="chip chip-demo-done" title="Demo gotowe — link w karcie">✅ demo</span>`
        : (c.demo_building
          ? `<span class="chip chip-building" title="Demo w budowie — sesja właśnie je robi">🔨 w budowie</span>`
          : (c.demo_requested ? `<span class="chip chip-demo" title="Poproszono o demo">📩 demo</span>` : ""))}
      <span class="card-owner">${c.opiekun ? `<span class="avatar avatar-sec" title="Opiekun: ${esc(c.opiekun)}" style="background:${ownerColor(c.opiekun)}">${initials(c.opiekun)}</span>` : ""}<span class="avatar" title="Handlowiec: ${esc(c.owner)}" style="background:${ownerColor(c.owner)}">${initials(c.owner)}</span></span>
    </div>`;
}
function renderCard(c) {
  const inArchive = state.viewMode === "archive";
  const editable = canEdit(c) && !inArchive;       // w archiwum nic nie przeciągamy
  // gdy widać karty kilku osób — obwódka w kolorze właściciela (łatwo odróżnić, czyj to lead)
  const multiOwner = selectedOwnersSet().size > 1;
  const ownerBorder = multiOwner ? ` style="border:2px solid ${ownerColor(c.owner)}"` : "";
  return `<article class="card${inArchive ? " archived" : ""}" data-id="${esc(c.id)}" draggable="${editable}"${ownerBorder}>${renderCardInner(c)}</article>`;
}
// aktualizuj JEDNĄ kartę bez przerysowywania całej tablicy (zachowuje listenery klik/drag → zero laga, zero migania)
function updateCardInPlace(c) {
  if (!c) return;
  try {
    const card = document.querySelector(`#board .card[data-id="${CSS.escape(String(c.id))}"]`);
    if (card) card.innerHTML = renderCardInner(c);
  } catch (e) { console.error("updateCardInPlace", e); }
}

/* ---------- Drag & drop (cała kolumna; tylko swoje karty) ---------- */
let dragId = null;
// Karty w kolumnie (DOM), bez przeciąganej; do wyliczenia indeksu i sąsiadów upuszczenia
function colCardEls(zone, excludeId) {
  return [...zone.querySelectorAll(".cards .card")].filter((el) => el.dataset.id !== String(excludeId));
}
// Index wstawienia wg pozycji kursora (Y); zwraca też element, NAD który wstawiamy (lub null = na koniec)
function dropTarget(zone, clientY, excludeId) {
  const els = colCardEls(zone, excludeId);
  for (let i = 0; i < els.length; i++) {
    const r = els[i].getBoundingClientRect();
    if (clientY < r.top + r.height / 2) return { idx: i, before: els[i], els };
  }
  return { idx: els.length, before: null, els };
}
// Nowa wartość position = średnia sąsiadów (wstawienie „pomiędzy"); brzegi ±1000
function positionForDrop(zone, clientY, excludeId) {
  const { before, els } = dropTarget(zone, clientY, excludeId);
  const posOf = (el) => { const c = state.clients.find((x) => String(x.id) === el.dataset.id); return c && c.position != null ? Number(c.position) : null; };
  const afterEl = before ? els[els.indexOf(before) - 1] : els[els.length - 1];
  const beforePos = afterEl ? posOf(afterEl) : null;   // karta NAD miejscem wstawienia
  const nextPos = before ? posOf(before) : null;        // karta POD miejscem wstawienia
  if (beforePos != null && nextPos != null) return (beforePos + nextPos) / 2;
  if (beforePos != null) return beforePos + 1000;
  if (nextPos != null) return nextPos - 1000;
  return 1000;
}
function clearDropMarks(scope) { (scope || document).querySelectorAll(".card.drop-above,.card.drop-below").forEach((el) => el.classList.remove("drop-above", "drop-below")); }
function markDrop(zone, clientY) {
  clearDropMarks(zone);
  const { before, els } = dropTarget(zone, clientY, dragId);
  if (before) before.classList.add("drop-above");
  else if (els.length) els[els.length - 1].classList.add("drop-below");
}

function wireDragAndDrop() {
  const board = $("#board");
  board.querySelectorAll('.card[draggable="true"]').forEach((card) => {
    card.addEventListener("dragstart", (e) => { dragId = card.dataset.id; card.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", card.dataset.id); });
    card.addEventListener("dragend", () => { dragId = null; card.classList.remove("dragging"); clearDropMarks(board); board.querySelectorAll(".column.drag-over").forEach((z) => z.classList.remove("drag-over")); });
  });
  board.querySelectorAll(".column").forEach((zone) => {
    zone.addEventListener("dragover", (e) => { if (!dragId) return; e.preventDefault(); zone.classList.add("drag-over"); markDrop(zone, e.clientY); });
    zone.addEventListener("dragleave", (e) => { if (!zone.contains(e.relatedTarget)) { zone.classList.remove("drag-over"); clearDropMarks(zone); } });
    zone.addEventListener("drop", async (e) => {
      e.preventDefault(); zone.classList.remove("drag-over"); clearDropMarks(zone);
      if (!dragId) return;
      const newStatus = zone.dataset.status;
      const c = state.clients.find((x) => String(x.id) === String(dragId));
      if (!c) return;
      const prevStatus = c.status, prevPos = c.position;
      const newPos = positionForDrop(zone, e.clientY, c.id);
      if (c.status === newStatus && newPos === c.position) return;        // nic się nie zmienia
      c.status = newStatus; c.position = newPos; state.skipFlipId = c.id; renderBoard(); flashCard(c.id);
      const patch = (prevStatus !== newStatus) ? { status: newStatus, position: newPos } : { position: newPos };
      try { await api.updateClient(c.id, patch); }
      catch (err) { console.error(err); c.status = prevStatus; c.position = prevPos; state.animateNextRender = true; renderBoard(); toast("Nie zapisano — przywrócono poprzednią kolejność"); }
    });
  });
}

/* ============================================================
   MODAL — karta (auto-zapis, bez przycisku "Zapisz")
   ============================================================ */
async function openModal(id) {
  const c = state.clients.find((x) => String(x.id) === String(id));
  if (!c) return;
  // ŚWIEŻE otwarcie karty (modal był zamknięty) → dołóż wpis do historii, żeby gest „wstecz" (dwa palce w bok
  // na Macu) albo przycisk wstecz zamykał kartę zamiast wychodzić ze strony. Przy ‹ › nawigacji nie dokładamy.
  if ($("#modal-overlay").hidden && !state.modalHistoryPushed) {
    state.modalHistoryPushed = true;
    try { history.pushState({ crmModal: true }, ""); } catch {}
  }
  state.openCardId = id;
  state.openCardWasArchived = !!c.deleted_at;   // zapamiętaj, w jakim trybie otwarto (do wykrycia zmiany przez inną osobę)
  // komentarze z pamięci (są utrzymywane na bieżąco: start, dodanie, realtime) — bez osobnego zapytania,
  // dzięki temu modal nigdy się nie „wywala" przy chwilowym błędzie sieci i otwiera się natychmiast
  const comments = state.commentsByClient[id] || [];
  state.commentsByClient[id] = comments;

  // KARTA W ARCHIWUM → widok przywracania (read-only + Przywróć / Usuń trwale)
  if (c.deleted_at) {
    const roRow = (label, val) => `<div class="prop-label">${label}</div><div class="prop-value readonly">${esc(val) || "—"}</div>`;
    $("#modal-body").innerHTML = `
      <h2>${esc(c.name)}</h2>
      <div class="archive-banner">🗄 Ta karta jest w Archiwum — schowana ${esc(fmtDateTime(c.deleted_at))}. Możesz ją przywrócić.</div>
      <div class="props">
        ${roRow("🔥 Quality", c.quality)}
        ${roRow("🏢 Nazwa Firmy", c.company)}
        ${roRow("📞 Phone", c.phone)}
        ${roRow("@ Email", c.email)}
        ${roRow("◎ Status", statusOf(c.status).label)}
        ${roRow("📅 Follow Up", c.follow_up ? fmtFollow(c.follow_up) : "")}
        ${roRow("👤 Person", c.owner)}
      </div>
      ${c.notes ? `<hr class="section-divider" /><div class="notes-label">Notatki</div><div class="notes-view readonly">${linkify(c.notes)}</div>` : ""}
      <hr class="section-divider" />
      <div class="notes-label">Komentarze</div>
      <div class="comments-wrap" id="comments-wrap">${renderComments(comments)}</div>
      <div class="save-row archive-actions">
        <button class="primary-btn" id="restore-card">↩ Przywróć kartę</button>
        <button class="ghost-btn danger-btn" id="purge-card">Usuń trwale</button>
      </div>`;
    $(".modal").classList.remove("modal-full");   // Archiwum = mały modal
    $("#modal-overlay").hidden = false;
    $("#restore-card").addEventListener("click", () => doRestoreCard(c.id));
    $("#purge-card").addEventListener("click", (e) => askPurgeCard(c.id, e.target));
    updateNavButtons();
    return;
  }

  const editable = canEdit(c);

  const field = (label, icon, key, type = "text") => {
    const val = c[key] || "";
    const input = editable ? `<input type="${type}" data-key="${key}" value="${esc(val)}" />` : `<div class="prop-value readonly">${esc(val) || "—"}</div>`;
    return `<div class="prop-label">${icon} ${label}</div><div class="prop-value">${input}</div>`;
  };
  const statusSelect = editable
    ? `<select data-key="status">${STATUSES.map((s) => `<option value="${s.key}" ${normStatus(c) === s.key ? "selected" : ""}>${esc(s.label)}</option>`).join("")}</select>`
    : `<div class="prop-value readonly"><span class="status-pill" style="background:${statusOf(normStatus(c)).bg};color:${statusOf(normStatus(c)).fg}"><span class="dot" style="background:${statusOf(normStatus(c)).dot}"></span>${esc(statusOf(normStatus(c)).label)}</span></div>`;
  const ownerOpts = Array.from(new Set([...state.team, c.owner].filter(Boolean)));
  const ownerSelect = editable
    ? `<select data-key="owner">${ownerOpts.map((o) => `<option value="${esc(o)}" ${c.owner === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`
    : `<div class="prop-value readonly">${esc(c.owner)}</div>`;
  const opiekunOpts = Array.from(new Set([...state.team, c.opiekun].filter(Boolean)));
  const opiekunSelect = editable
    ? `<select data-key="opiekun"><option value="">— brak —</option>${opiekunOpts.map((o) => `<option value="${esc(o)}" ${c.opiekun === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`
    : `<div class="prop-value readonly">${esc(c.opiekun) || "—"}</div>`;
  const safe = safeUrl(c.google_maps);
  const stars = Math.max(0, Math.min(3, parseInt(c.quality, 10) || 0));   // ocena 1–3 (w kolumnie quality)

  $("#modal-body").innerHTML = `
    <div class="cm">
      <div class="cm-left">
        ${editable ? `<input class="title-input cm-name" data-key="name" value="${esc(c.name)}" placeholder="Imię i nazwisko" />` : `<h2 class="cm-name">${esc(c.name)}</h2>`}
        ${!editable ? `<div class="readonly-note">To karta: ${esc(c.owner)}. Pól nie edytujesz, ale możesz dodać komentarz (z @oznaczeniem).</div>` : ""}

        <div class="cm-props">
          <div class="cm-group">
            <div class="cm-gh">Kontakt</div>
            <div class="cm-row"><span class="k">Firma</span><div class="v">${editable ? `<input data-key="company" value="${esc(c.company || "")}" placeholder="—" />` : `<div class="prop-value readonly">${esc(c.company) || "—"}</div>`}</div></div>
            <div class="cm-row"><span class="k">Telefon</span><div class="v">${editable ? `<input data-key="phone" value="${esc(c.phone || "")}" placeholder="—" />` : `<div class="prop-value readonly">${esc(c.phone) || "—"}</div>`}</div></div>
            <div class="cm-row"><span class="k">Email</span><div class="v">${editable ? `<input data-key="email" value="${esc(c.email || "")}" placeholder="—" />` : `<div class="prop-value readonly">${esc(c.email) || "—"}</div>`}</div></div>
            <div class="cm-row"><span class="k">Maps</span><div class="v maps-cell">${editable
                  ? `<input data-key="google_maps" id="maps-input" value="${esc(c.google_maps || "")}" placeholder="link" />`
                  : (safe ? `<a class="maps-link" href="${esc(safe)}" target="_blank" rel="noopener">otwórz</a>` : `<span class="readonly">—</span>`)}${(c.google_maps || "").trim()
                  ? `${editable ? `<button type="button" class="maps-btn" id="maps-open" title="Otwórz wizytówkę Google">↗</button>` : ""}<button type="button" class="maps-btn" id="maps-copy" title="Kopiuj link">⧉</button>`
                  : ""}</div></div>
          </div>

          <div class="cm-group">
            <div class="cm-gh">Sprzedaż</div>
            <div class="cm-row"><span class="k">Ocena</span><div class="v">${editable
                ? `<div class="stars" id="stars">${[1,2,3].map((n) => `<button type="button" class="star${n <= stars ? " on" : ""}" data-val="${n}" title="${n}/3" aria-label="Ocena ${n} z 3">★</button>`).join("")}</div>`
                : `<div class="stars readonly">${[1,2,3].map((n) => `<span class="star${n <= stars ? " on" : ""}">★</span>`).join("")}</div>`}</div></div>
            <div class="cm-row"><span class="k">Status</span><div class="v">${statusSelect}</div></div>
            <div class="cm-row"><span class="k">Handlowiec</span><div class="v">${ownerSelect}</div></div>
            <div class="cm-row"><span class="k">Opiekun</span><div class="v">${opiekunSelect}</div></div>
            <div class="cm-row"><span class="k">Demo</span><div class="v demo-cell maps-cell" id="demo-cell">${demoFieldHTML(c, editable)}</div></div>
          </div>
        </div>

        <div class="cm-notes">
          <div class="notes-label">Notatki</div>
          ${editable
            ? `<div class="notes-view" id="notes-view" tabindex="0" title="Kliknij, aby edytować">${c.notes ? linkify(c.notes) : `<span class="notes-empty">${esc(NOTE_PLACEHOLDER)}</span>`}</div>
               <textarea class="notes" data-key="notes" id="notes-edit" hidden>${esc(c.notes || "")}</textarea>`
            : `<div class="notes-view readonly">${c.notes ? linkify(c.notes) : "—"}</div>`}
        </div>

        ${editable ? `<div class="save-row"><button class="ghost-btn" id="delete-card">Przenieś do archiwum</button></div>` : ""}
      </div>

      <aside class="cm-right">
        <div class="comments-wrap" id="comments-wrap">${renderActivity(c, comments)}</div>
        <div class="composer">
          ${editable ? `<div class="fu-setter" id="fu-setter" hidden>
            <div class="fu-setter-row">
              <input type="date" id="fu-date" />
              <input type="time" id="fu-time" title="Godzina (opcjonalnie)" />
            </div>
            <div class="fu-quick">
              <button type="button" class="fu-chip" data-days="1">Jutro</button>
              <button type="button" class="fu-chip" data-days="3">+3 dni</button>
              <button type="button" class="fu-chip" data-days="7">+tydzień</button>
              <button type="button" class="fu-chip fu-chip-clear" data-clear="1">Wyczyść</button>
            </div>
          </div>` : ""}
          <div class="add-comment">
            ${editable ? `<button type="button" class="fu-mode" id="fu-mode" title="Zaplanuj follow-up" aria-pressed="false">${FU_ICON}<span>Follow-up</span></button>` : ""}
            <div class="hl-wrap"><div id="comment-hl" class="hl-backdrop" aria-hidden="true"></div><input id="new-comment" placeholder="Dodaj komentarz...  (@ aby oznaczyć osobę)" autocomplete="off" /></div>
            <button id="send-comment">Wyślij</button>
            <div id="mention-pop" class="mention-pop" hidden></div>
          </div>
        </div>
      </aside>
    </div>
  `;
  $(".modal").classList.add("modal-full");       // główna karta = pełny ekran (Kosz/proste zostają małe)
  $("#modal-overlay").hidden = false;

  // Linki (Google Maps / Demo): jedno kliknięcie otwiera + przycisk kopiowania (jak w Notion)
  const wireLink = (openId, copyId, inputId, rawVal) => {
    const openBtn = document.getElementById(openId);
    if (openBtn) openBtn.addEventListener("click", () => {
      const input = document.getElementById(inputId);
      const url = safeUrl((input ? input.value : rawVal) || "");
      if (url) window.open(url, "_blank", "noopener");
    });
    const copyBtn = document.getElementById(copyId);
    if (copyBtn) copyBtn.addEventListener("click", async () => {
      const input = document.getElementById(inputId);
      const url = ((input ? input.value : rawVal) || "").trim();
      if (!url) return;
      const done = () => {
        const old = copyBtn.textContent;
        copyBtn.textContent = "✓ skopiowano";
        copyBtn.classList.add("ok");
        setTimeout(() => { copyBtn.textContent = old; copyBtn.classList.remove("ok"); }, 1300);
      };
      try { await navigator.clipboard.writeText(url); done(); }
      catch { if (input) { input.focus(); input.select(); done(); } }   // fallback bez clipboard API
    });
  };
  wireLink("maps-open", "maps-copy", "maps-input", c.google_maps);

  if (editable) {
    const saveDeb = debounce((el) => saveField(c.id, el.dataset.key, el.value), 600);
    document.querySelectorAll("#modal-body [data-key]").forEach((el) => {
      if (el.id === "demo-input") return;   // pole demo ma własne wiązanie (wireDemoCell) — bez podwójnego zapisu
      el.addEventListener("change", () => saveField(c.id, el.dataset.key, el.value));
      // auto-zapis NA BIEŻĄCO przy pisaniu (inaczej tekst ginie, gdy zamkniesz modal myszą)
      if (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && el.type !== "date" && el.type !== "datetime-local")) {
        el.addEventListener("input", () => saveDeb(el));
      }
    });
    // (Follow-up i komentarze obsługuje feed po prawej — wiąże wireComposer.)
    // Notatka: widok z KLIKALNYMI linkami ↔ edycja. Klik w tekst → edytuj; klik w link → otwiera.
    const nView = $("#notes-view"), nEdit = $("#notes-edit");
    if (nView && nEdit) {
      const grow = () => { nEdit.style.height = "auto"; nEdit.style.height = Math.max(220, nEdit.scrollHeight) + "px"; };
      nView.addEventListener("click", (e) => {
        if (e.target.closest("a")) return;                          // klik w link → otwiera, nie edytuje
        nView.hidden = true; nEdit.hidden = false; grow(); nEdit.focus();
        const v = nEdit.value; nEdit.value = ""; nEdit.value = v;    // kursor na koniec
      });
      nEdit.addEventListener("input", grow);
      nEdit.addEventListener("blur", () => {                         // koniec edycji → znów widok z linkami
        nView.innerHTML = nEdit.value ? linkify(nEdit.value) : `<span class="notes-empty">${esc(NOTE_PLACEHOLDER)}</span>`;
        nEdit.hidden = true; nView.hidden = false;
      });
    }
    // Ocena gwiazdkowa (1–3, w kolumnie quality): klik ustawia ocenę; klik w aktualną najwyższą gwiazdkę → zeruje.
    const starsEl = $("#stars");
    if (starsEl) starsEl.querySelectorAll(".star").forEach((b) => b.addEventListener("click", () => {
      const val = Number(b.dataset.val);
      const cur = Math.max(0, Math.min(3, parseInt(c.quality, 10) || 0));
      const next = (val === cur) ? 0 : val;
      starsEl.querySelectorAll(".star").forEach((s) => s.classList.toggle("on", Number(s.dataset.val) <= next));
      saveField(c.id, "quality", next ? String(next) : "");
    }));
  }
  const delBtn = $("#delete-card"); if (delBtn) delBtn.addEventListener("click", () => askArchiveCard(c.id, delBtn));
  wireDemoCell(c.id);
  wireComposer(c.id);
  updateNavButtons();
}

async function saveField(id, key, value) {
  const c = state.clients.find((x) => String(x.id) === String(id));
  if (!c) return;
  const v = value === "" ? null : value;
  const prev = c[key];
  if (prev === v) return;            // nic się nie zmieniło — nie strzelaj zbędnym zapisem (m.in. data+Esc)
  c[key] = v;
  try {
    await api.updateClient(id, { [key]: v });
    flashSaved();
    // Zmiana linku do dema → odśwież wiersz demo: link gotowy → „✅ Demo gotowe"; wyczyszczony → wróć do prośby/przycisku.
    if (key === "demo_url") {
      if (v) {
        api.markDemoDone(id).then(() => {
          c.demo_requested = false;               // prośba załatwiona (księga: done), znacznik 📩 gaśnie
          c.demo_building = false;                 // demo dostarczone → gaśnie też znacznik „🔨 w budowie"
          refreshDemoCell(id);                     // pole demo → link + odnośniki
          updateCardInPlace(c); refreshFeed(id);   // wpis „Demo gotowe" w feedzie
        }, (e) => console.error("markDemoDone", e));
      } else {
        refreshDemoCell(id);                       // wyczyszczono link → wróć do prośby/przycisku
        updateCardInPlace(c); refreshFeed(id);
      }
    }
    if (key === "owner") {
      // przepisanie właściciela: bez przebudowy modala (chroni niezapisany tekst w innych polach)
      renderTabs(); state.animateNextRender = true; renderBoard();
      if (!canEdit(c) && state.openCardId === id) closeModal();   // karta przeszła do innej osoby → zamknij
      return;
    }
    if (key === "status" || key === "follow_up") { renderTabs(); state.animateNextRender = true; renderBoard(); return; }
    if (key === "name" || key === "company" || key === "phone" || key === "opiekun") { updateCardInPlace(c); return; }
  } catch (err) {
    console.error(err);
    c[key] = prev;                   // cofnij — żeby ekran nie pokazywał „zapisanej" wartości, która nie poszła do bazy
    if (state.openCardId === id) {
      const el = document.querySelector(`#modal-body [data-key="${key}"]`);
      if (el && document.activeElement !== el && "value" in el) el.value = prev == null ? "" : prev;
    }
    renderTabs(); renderBoard(); updateCardInPlace(c);
    toast("Nie zapisano — przywrócono poprzednią wartość");
  }
}

/* ---------- Feed aktywności: follow-up + demo jako wpisy „jak komentarz" ---------- */
const FU_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`;
const EDIT_ICON = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
const TRASH_ICON = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/></svg>`;
const CHECK_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;

// Pojedyncze przypomnienie (aktywny follow-up) — układ jak komentarz, z akcjami: edytuj / usuń / zrobione
function reminderHTML(c, editable) {
  const ds = dueState(c.follow_up);                  // "" | "today" | "overdue"
  const badge = ds === "overdue" ? `<span class="rm-badge rm-overdue">zaległe</span>`
              : ds === "today"   ? `<span class="rm-badge rm-today">dziś</span>` : "";
  const actions = editable ? `<div class="reminder-actions">
        <button type="button" class="rm-act rm-edit" title="Edytuj" aria-label="Edytuj przypomnienie">${EDIT_ICON}</button>
        <button type="button" class="rm-act rm-del" title="Usuń" aria-label="Usuń przypomnienie">${TRASH_ICON}</button>
        <button type="button" class="rm-act rm-done" title="Oznacz jako zrobione" aria-label="Zrobione">${CHECK_ICON}</button>
      </div>` : "";
  return `<div class="comment feed-item feed-followup reminder${ds ? " is-" + ds : ""}">
      <span class="avatar feed-ic">${FU_ICON}</span>
      <div class="comment-main">
        <div class="comment-head"><span class="c-author">${esc(fmtFollow(c.follow_up))}</span>${badge}${actions}</div>
        <div class="comment-body">${c.follow_up_note ? esc(c.follow_up_note) : `<span class="feed-muted">— bez treści —</span>`}</div>
      </div>
    </div>`;
}
function commentHTML(c) {
  return `<div class="comment">
      <span class="avatar" style="background:${ownerColor(c.author)}">${initials(c.author)}</span>
      <div class="comment-main">
        <div class="comment-head"><span class="c-author">${esc(c.author)}</span><span class="c-time">${esc(fmtDateTime(c.created_at))}</span></div>
        <div class="comment-body">${highlightMentions(c.body)}</div>
      </div>
    </div>`;
}
// Prawy panel = opcjonalna sekcja „Przypomnienia" (gdy jest aktywny follow-up) + zawsze „Komentarze"
function renderActivity(c, comments) {
  const editable = canEdit(c);
  let html = "";
  if (c.follow_up && !c.follow_up_done) {            // aktywny follow-up → sekcja Przypomnienia
    html += `<section class="feed-section">
        <div class="feed-section-head">Przypomnienia</div>
        ${reminderHTML(c, editable)}
      </section>`;
  }
  const n = comments.length;
  html += `<section class="feed-section">
      <div class="feed-section-head">Komentarze${n ? ` <span class="cm-cc">${n}</span>` : ""}</div>
      ${n ? comments.map(commentHTML).join("") : `<div class="no-comments">Brak komentarzy.</div>`}
    </section>`;
  return html;
}
// Przerysuj prawy panel w otwartej (pełnej) karcie
function refreshFeed(id) {
  const wrap = $("#comments-wrap");
  if (!wrap || state.openCardId !== id) return;
  const c = state.clients.find((x) => String(x.id) === String(id));
  if (!c || c.deleted_at) return;                 // Archiwum ma własny, prosty widok
  wrap.innerHTML = renderActivity(c, state.commentsByClient[id] || []);
}
async function setFollowDone(id, done) {
  const c = state.clients.find((x) => String(x.id) === String(id));
  if (!c) return;
  const prev = !!c.follow_up_done;
  if (prev === done) return;
  c.follow_up_done = done;
  refreshFeed(id); updateCardInPlace(c); renderTabs();         // odśwież feed, chip na tablicy i licznik „zaległe"
  try { await api.updateClient(id, { follow_up_done: done }); flashSaved(); }
  catch (err) { console.error(err); c.follow_up_done = prev; refreshFeed(id); updateCardInPlace(c); renderTabs(); toast("Nie zapisano"); }
}
// „Zrobione": zapisuje w komentarzach trwały ślad „follow-up wykonany" (z terminem) i czyści follow-up
// → przypomnienie znika z karty i z kafelka tablicy, ale w „Komentarzach" zostaje wpis kto i kiedy go zamknął.
async function completeReminder(id) {
  const c = state.clients.find((x) => String(x.id) === String(id));
  if (!c || !c.follow_up) return;
  const term = fmtFollow(c.follow_up);
  const note = (c.follow_up_note || "").trim();
  const body = `✓ Follow-up wykonany — termin ${term}${note ? ` („${note}")` : ""}`;
  try {                                             // wpis do komentarzy (utrwalany; w demo trzyma się w pamięci do przeładowania)
    const arr = state.commentsByClient[id] = state.commentsByClient[id] || [];
    const before = arr.length;
    const row = await api.addComment(id, body);
    if (arr.length === before && row) arr.push(row);   // live: addComment nie dopisuje lokalnie → dopisz zwrócony wiersz
  } catch (err) { console.error(err); toast("Nie zapisano wpisu"); }
  const wasDone = !!c.follow_up_done;
  await saveField(id, "follow_up_note", "");         // → null
  await saveField(id, "follow_up", "");              // → null (saveField odświeża tablicę; chip znika)
  if (wasDone) { c.follow_up_done = false; try { await api.updateClient(id, { follow_up_done: false }); } catch (e) { console.error(e); } }
  refreshFeed(id); updateCardInPlace(c); renderTabs();
  toast("Follow-up wykonany");
}
// Usuń przypomnienie: kasuje termin + treść follow-upu (chip na tablicy też znika)
async function deleteReminder(id) {
  const c = state.clients.find((x) => String(x.id) === String(id));
  if (!c) return;
  await saveField(id, "follow_up_note", "");        // → null
  await saveField(id, "follow_up", "");             // → null (saveField odświeża tablicę)
  if (c.follow_up_done) { c.follow_up_done = false; try { await api.updateClient(id, { follow_up_done: false }); } catch (e) { console.error(e); } }
  refreshFeed(id);
  toast("Usunięto przypomnienie");
}
function renderComments(list) {
  if (!list.length) return `<div class="no-comments">Brak komentarzy.</div>`;
  return list.map(commentHTML).join("");
}
function highlightMentions(text) {
  return esc(text).replace(/@([A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż][\wĄĆĘŁŃÓŚŹŻąćęłńóśźż]*)/g,
    (_m, name) => `<span class="mention${/^claude$/i.test(name) ? " mention-claude" : ""}">@${name}</span>`);
}

/* ---------- Pole pod feedem: komentarz + tryb „Follow-up" + @mention ---------- */
function wireComposer(clientId) {
  const c = state.clients.find((x) => String(x.id) === String(clientId));
  const inp = $("#new-comment"), pop = $("#mention-pop");
  const modeBtn = $("#fu-mode"), setter = $("#fu-setter"), sendBtn = $("#send-comment");
  const fuDate = $("#fu-date"), fuTime = $("#fu-time");
  const PH_COMMENT = "Dodaj komentarz...  (@ aby oznaczyć osobę)";
  let fuMode = false;

  // podświetlanie @claude WPISYWANEGO w polu (nakładka: realny input nietknięty, pod spodem warstwa z pomarańczowym tłem)
  const hl = $("#comment-hl");
  if (hl) {                                                    // skopiuj metryki z inputu, by tło trafiało dokładnie pod glify
    const cs = getComputedStyle(inp);
    ["fontFamily", "fontSize", "fontWeight", "fontStyle", "letterSpacing", "lineHeight",
     "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
     "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth"]
      .forEach((p) => { hl.style[p] = cs[p]; });
  }
  const syncHL = () => {
    if (!hl) return;
    hl.innerHTML = esc(inp.value).replace(
      /@([A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż][\wĄĆĘŁŃÓŚŹŻąćęłńóśźż]*)/g,
      (_m, name) => (/^claude$/i.test(name) ? `<span class="hl-claude">@${name}</span>` : `@${name}`)
    );
    hl.scrollLeft = inp.scrollLeft;                            // trzymaj tło zsynchronizowane przy przewijaniu długiego tekstu
  };
  inp.addEventListener("input", syncHL);
  inp.addEventListener("scroll", syncHL);

  const setMode = (on) => {                                    // przełącz pole między „komentarz" a „follow-up"
    fuMode = on && !!modeBtn;
    if (modeBtn) { modeBtn.classList.toggle("on", fuMode); modeBtn.setAttribute("aria-pressed", fuMode ? "true" : "false"); }
    if (setter) setter.hidden = !fuMode;
    inp.placeholder = fuMode ? "Treść follow-upu (opcjonalnie)…" : PH_COMMENT;
    if (sendBtn) sendBtn.textContent = fuMode ? "Zaplanuj" : "Wyślij";
    if (fuMode && c) {                                          // wejście w tryb → prefill bieżącym follow-upem
      if (fuDate) fuDate.value = toDateInput(c.follow_up);
      if (fuTime) fuTime.value = toTimeInput(c.follow_up);
      inp.value = c.follow_up_note || "";
    }
    syncHL();
    inp.focus();
  };

  const sendComment = async () => {
    const body = inp.value.trim();
    if (!body) return;
    inp.value = ""; pop.hidden = true; syncHL();
    try {
      await api.addComment(clientId, body);
      const fresh = await api.getComments(clientId);
      state.commentsByClient[clientId] = fresh;
      refreshFeed(clientId);
      updateCardInPlace(c);                                     // tylko chip 💬, bez przebudowy tablicy
    } catch (err) { console.error(err); toast("Nie udało się dodać komentarza"); }
  };

  const saveFollowUp = () => {                                  // „Zaplanuj": data(+godz) + treść → follow_up na karcie, pojawia się w feedzie
    const d = fuDate ? fuDate.value : "", t = fuTime ? fuTime.value : "";
    if (!d) { toast("Ustaw datę follow-upu"); return; }
    saveField(clientId, "follow_up_note", inp.value.trim());
    saveField(clientId, "follow_up", t ? `${d}T${t}` : d);
    if (c && c.follow_up_done) setFollowDone(clientId, false);  // nowy termin → znów „do zrobienia"
    inp.value = ""; syncHL();
    setMode(false);
    refreshFeed(clientId);
  };

  const submit = () => { if (fuMode) saveFollowUp(); else sendComment(); };

  if (modeBtn) modeBtn.addEventListener("click", () => setMode(!fuMode));
  if (sendBtn) sendBtn.addEventListener("click", submit);
  // szybkie terminy w setterze (Jutro / +3 dni / +tydzień / Wyczyść)
  if (setter) setter.querySelectorAll(".fu-chip").forEach((ch) => ch.addEventListener("click", () => {
    if (ch.dataset.clear) { if (fuDate) fuDate.value = ""; if (fuTime) fuTime.value = ""; }
    else {
      const dt = new Date(); dt.setHours(0, 0, 0, 0); dt.setDate(dt.getDate() + (Number(ch.dataset.days) || 0));
      const y = dt.getFullYear(), m = String(dt.getMonth() + 1).padStart(2, "0"), dd = String(dt.getDate()).padStart(2, "0");
      if (fuDate) fuDate.value = `${y}-${m}-${dd}`;
    }
    inp.focus();
  }));
  // akcje przypomnienia (delegacja — panel się przerysowuje): zrobione / edytuj / usuń (2 kliki)
  const wrap = $("#comments-wrap");
  if (wrap) wrap.addEventListener("click", (e) => {
    if (!c) return;
    if (e.target.closest(".rm-done")) { completeReminder(clientId); return; }      // zrobione → wpis „wykonany" w komentarzach + czyści follow-up
    if (e.target.closest(".rm-edit")) { setMode(true); return; }                   // edytuj → otwórz pole follow-upu z prefillem
    if (e.target.closest(".rm-del-yes")) { deleteReminder(clientId); return; }
    if (e.target.closest(".rm-del-no")) { refreshFeed(clientId); return; }
    const del = e.target.closest(".rm-del");
    if (del) {                                                                     // pierwszy klik kosza → potwierdzenie inline
      const box = del.closest(".reminder-actions");
      if (box) box.innerHTML = `<span class="rm-confirm">Usunąć?</span>
        <button type="button" class="rm-act rm-del-yes" title="Tak, usuń">Tak</button>
        <button type="button" class="rm-act rm-del-no" title="Anuluj">Nie</button>`;
    }
  });

  inp.addEventListener("keydown", (e) => {
    if (!pop.hidden) {
      const items = [...pop.querySelectorAll(".mention-item")];
      if (items.length && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter")) {
        let idx = items.findIndex((i) => i.classList.contains("active"));
        if (e.key === "Enter") { e.preventDefault(); (items[idx] || items[0]).click(); return; }
        e.preventDefault();
        idx = e.key === "ArrowDown" ? Math.min(items.length - 1, idx + 1) : Math.max(0, idx - 1);
        items.forEach((i) => i.classList.remove("active")); items[idx].classList.add("active"); return;
      }
      if (e.key === "Escape") { pop.hidden = true; return; }
    }
    if (e.key === "Enter") submit();
  });
  inp.addEventListener("input", () => {
    const m = inp.value.slice(0, inp.selectionStart).match(/@([\wĄĆĘŁŃÓŚŹŻąćęłńóśźż]*)$/);
    if (!m) { pop.hidden = true; return; }
    const q = m[1].toLowerCase();
    const pool = ["Claude", ...state.team];
    const matches = pool.filter((n) => n.toLowerCase().includes(q)).slice(0, 6);
    if (!matches.length) { pop.hidden = true; return; }
    pop.innerHTML = matches.map((n, i) => {
      const cl = n.toLowerCase() === "claude";
      return `<div class="mention-item ${i === 0 ? "active" : ""}${cl ? " mention-item-claude" : ""}" data-name="${esc(n)}"><span class="avatar" style="background:${cl ? "#FF6A00" : ownerColor(n)}">${cl ? "✦" : initials(n)}</span>${esc(n)}${cl ? ' <span class="mi-claude-tag">edytuje demo</span>' : ""}</div>`;
    }).join("");
    pop.hidden = false;
    pop.querySelectorAll(".mention-item").forEach((it) => it.addEventListener("click", () => {
      const pos = inp.selectionStart;
      inp.value = inp.value.slice(0, pos).replace(/@([\wĄĆĘŁŃÓŚŹŻąćęłńóśźż]*)$/, "@" + it.dataset.name + " ") + inp.value.slice(pos);
      pop.hidden = true; inp.focus(); syncHL();
    }));
  });
}

// podłącz przyciski pola demo (kopiuj / otwórz-edycję / poproś o demo / wklejenie linku)
function wireDemoCell(id) {
  const c = state.clients.find((x) => String(x.id) === String(id));
  if (!c) return;
  const copyBtn = $("#demo-copy");
  if (copyBtn) copyBtn.addEventListener("click", async () => {
    const url = (c.demo_url || "").trim(); if (!url) return;
    try { await navigator.clipboard.writeText(url); } catch {}
    const old = copyBtn.textContent; copyBtn.textContent = "✓ skopiowano"; copyBtn.classList.add("ok");
    setTimeout(() => { copyBtn.textContent = old; copyBtn.classList.remove("ok"); }, 1300);
  });
  const reveal = () => { const inp = $("#demo-input"); if (inp) { inp.hidden = false; inp.focus(); inp.select(); } };
  const editBtn = $("#demo-edit"); if (editBtn) editBtn.addEventListener("click", reveal);
  const addBtn = $("#demo-add"); if (addBtn) addBtn.addEventListener("click", reveal);
  const askBtn = $("#ask-demo"); if (askBtn) askBtn.addEventListener("click", () => doRequestDemo(id));
  const inp = $("#demo-input"); if (inp) inp.addEventListener("change", () => saveField(id, "demo_url", inp.value));
}
// przerysuj CAŁE pole demo wg aktualnego stanu karty (przycisk ↔ link + odnośniki) i podłącz na nowo
function refreshDemoCell(id) {
  const cell = $("#demo-cell");
  if (!cell || state.openCardId !== id) return;
  const c = state.clients.find((x) => String(x.id) === String(id));
  if (!c) return;
  cell.innerHTML = demoFieldHTML(c, canEdit(c));
  wireDemoCell(id);
}

async function doRequestDemo(id) {
  const c = state.clients.find((x) => String(x.id) === String(id));
  if (!c) return;
  try {
    await api.requestDemo(id);
    c.demo_requested = true;          // ustaw flagę dopiero PO sukcesie (przy błędzie nic nie miga)
    refreshDemoCell(id);
    updateCardInPlace(c); refreshFeed(id); toast("Zgłoszono prośbę o demo");   // wpis „Poproszono o demo" w feedzie
  } catch (err) { console.error(err); toast("Nie udało się zgłosić"); }
}

async function askArchiveCard(id, btn) {
  const row = btn.parentElement;
  row.innerHTML = `<span class="confirm-del">Przenieść kartę do Archiwum? (będzie można przywrócić)</span>
     <button class="ghost-btn" id="del-no" style="margin-left:auto">Anuluj</button>
     <button class="primary-btn" id="del-yes">Tak, do Archiwum</button>`;
  $("#del-no").addEventListener("click", () => openModal(id));
  $("#del-yes").addEventListener("click", async () => {
    try {
      await api.softDeleteClient(id);                 // do Archiwum (odwracalne), NIE trwałe usunięcie
      const c = state.clients.find((x) => String(x.id) === String(id));
      if (c) c.deleted_at = new Date().toISOString();
      closeModal(); renderTabs();
      const el = document.querySelector(`#board .card[data-id="${CSS.escape(String(id))}"]`);
      if (el && !reduceMotion()) { el.style.transition = "opacity .18s ease, transform .18s ease"; el.style.opacity = "0"; el.style.transform = "scale(.94)"; }
      setTimeout(() => { state.animateNextRender = true; renderBoard(); }, reduceMotion() ? 0 : 170);
      toast("Przeniesiono do Archiwum");
    } catch (err) { console.error(err); $(".confirm-del").textContent = "Nie udało się przenieść"; }
  });
}

async function doRestoreCard(id) {
  const c = state.clients.find((x) => String(x.id) === String(id));
  if (!c) return;
  try {
    await api.restoreClient(id);
    c.deleted_at = null;
    closeModal(); renderTabs(); state.animateNextRender = true; renderBoard();
    toast("Przywrócono kartę");
  } catch (err) { console.error(err); toast("Nie udało się przywrócić"); }
}

function askPurgeCard(id, btn) {
  const c = state.clients.find((x) => String(x.id) === String(id));
  const nazwa = c && c.name ? `„${esc(c.name)}" ` : "";
  const row = btn.parentElement;
  row.innerHTML = `<span class="confirm-del">Usunąć ${nazwa}NA ZAWSZE (wraz z komentarzami)? Tego nie cofniesz.</span>
     <button class="ghost-btn" id="purge-no" style="margin-left:auto">Anuluj</button>
     <button class="primary-btn danger-btn" id="purge-yes">Tak, na zawsze</button>`;
  $("#purge-no").addEventListener("click", () => openModal(id));
  $("#purge-yes").addEventListener("click", async () => {
    // BRAMKA: jeśli ktoś w międzyczasie przywrócił kartę z Archiwum — NIE kasuj żywego leada
    const cur = state.clients.find((x) => String(x.id) === String(id));
    if (!cur) { toast("Tej karty już nie ma"); closeModal(); renderTabs(); renderBoard(); return; }
    if (!cur.deleted_at) { toast("Ta karta nie jest już w Archiwum — odświeżam"); openModal(id); return; }
    try {
      const purged = await api.purgeClient(id);        // warunkowy DELETE (tylko gdy nadal w Archiwum)
      if (!purged) { toast("Ta karta nie jest już w Archiwum — odświeżam"); openModal(id); return; }
      state.clients = state.clients.filter((x) => String(x.id) !== String(id));
      delete state.commentsByClient[id];
      closeModal(); renderTabs(); state.animateNextRender = true; renderBoard();
      toast("Usunięto na zawsze");
    } catch (err) { console.error(err); $(".confirm-del").textContent = "Nie udało się usunąć"; }
  });
}

// wymuś zapis pola, w którym jest kursor (auto-zapis 'change' nie odpala przy zamknięciu/przewinięciu myszą)
function flushActiveField(id) {
  const a = document.activeElement;
  if (id && a && a.dataset && a.dataset.key && (a.tagName === "INPUT" || a.tagName === "TEXTAREA")) {
    saveField(id, a.dataset.key, a.value);
  }
}

// kolejność kart do przewijania ‹ › — taka, jak na ekranie (Archiwum / tabela / kolumny kanban po kolei)
function navOrderedClients() {
  const list = visibleClients();
  if (state.viewMode === "archive")
    return [...list].sort((a, b) => String(b.deleted_at || "").localeCompare(String(a.deleted_at || "")));
  if (state.layout === "table") return list;
  const out = [];
  STATUSES.forEach((s) => list.filter((c) => normStatus(c) === s.key).forEach((c) => out.push(c)));
  return out;
}
// przejdź do poprzedniej/następnej karty (dir = -1 / +1) bez zamykania modala
function navigateCard(dir) {
  const id = state.openCardId;
  if (id == null) return;
  flushActiveField(id);
  const list = navOrderedClients();
  const idx = list.findIndex((c) => String(c.id) === String(id));
  if (idx === -1) return;
  const target = list[idx + dir];
  if (target) openModal(target.id);
}
// włącz/wyłącz ‹ › zależnie od pozycji aktualnej karty na liście
function updateNavButtons() {
  const prev = $("#modal-prev"), next = $("#modal-next");
  if (!prev || !next) return;
  const id = state.openCardId;
  const list = (id == null) ? [] : navOrderedClients();
  const idx = list.findIndex((c) => String(c.id) === String(id));
  prev.disabled = idx <= 0;
  next.disabled = idx === -1 || idx >= list.length - 1;
}

// faktyczne zamknięcie karty (DOM + stan) — bez ruszania historii przeglądarki
function teardownModal() {
  const id = state.openCardId;
  flushActiveField(id);
  state.openCardId = null;
  state.modalHistoryPushed = false;
  $("#modal-overlay").hidden = true;
  $(".modal").classList.remove("modal-full");   // reset pełnego ekranu
  $("#modal-body").innerHTML = "";
  // sprzątnij porzuconą, pustą nową kartę (żeby nie zaśmiecać lejka „Nowymi klientami")
  if (id && state.newCardIds.has(String(id))) cleanupEmptyNewCard(id);
}

// zamknięcie wywołane przez UI (X / Esc / klik w tło / „do archiwum" itp.)
function closeModal() {
  if ($("#modal-overlay").hidden) return;        // już zamknięte
  const hadHistory = state.modalHistoryPushed;
  teardownModal();
  // jeśli przy otwarciu dołożyliśmy wpis do historii — zdejmij go, żeby przycisk/gest „wstecz"
  // nie cofał potem o jeden krok za dużo. popstate zignorujemy flagą (zamknięcie już zrobione).
  if (hadHistory) { state.skipPopClose = true; history.back(); }
}
function cleanupEmptyNewCard(id) {
  state.newCardIds.delete(String(id));
  const c = state.clients.find((x) => String(x.id) === String(id));
  if (!c || c.deleted_at) return;   // już w Koszu (np. ktoś ją „usunął") → nie kasuj trwale, zostaw w Koszu
  // „pusta" = ŻADNE pole nie wypełnione (w tym quality/maps/follow_up) — żeby nie skasować karty z samym linkiem/datą
  const empty = (c.name === "Nowy klient" || !c.name) && !c.company && !c.phone && !c.email && !c.notes
    && !c.quality && !c.google_maps && !c.demo_url && !c.follow_up && !c.follow_up_note && !(state.commentsByClient[id] || []).length;
  if (!empty) return;
  // usuń z ekranu DOPIERO po potwierdzeniu z bazy — inaczej przy błędzie pusta karta „odrasta" przy odświeżeniu
  api.deleteClient(id).then(() => {
    state.clients = state.clients.filter((x) => String(x.id) !== String(id));
    delete state.commentsByClient[id];
    renderTabs(); state.animateNextRender = true; renderBoard();
  }).catch((e) => console.error("cleanup", e));
}

async function newCard(status) {
  const st = status || "lead";
  // nowa karta jest MOJA — upewnij się, że widzę siebie i jestem na tablicy (inaczej zostałaby odfiltrowana)
  if (!selectedOwnersSet().has(state.currentUser)) { const s = new Set(selectedOwnersSet()); s.add(state.currentUser); state.owners = s; persistOwners(); }
  state.viewMode = "owner:" + state.currentUser;   // pokaż nową kartę na MOJEJ zakładce
  // nowa karta na GÓRZE swojej kolumny (pozycja mniejsza niż najmniejsza istniejąca)
  const mins = activeClients().filter((c) => (c.status || "lead") === st && c.position != null).map((c) => Number(c.position));
  const topPos = mins.length ? Math.min(...mins) - 1000 : 1000;
  const obj = { name: "Nowy klient", company: "", phone: "", email: "", google_maps: "", demo_url: "", quality: "", status: st, follow_up: null, owner: state.currentUser, notes: "", position: topPos };
  try {
    const saved = await api.addClient(obj);
    state.newCardIds.add(String(saved.id));
    state.clients.push(saved); renderTabs(); state.animateNextRender = true; renderBoard();
    openModal(saved.id);
  } catch (err) { console.error(err); toast("Nie udało się dodać karty"); }
}

let toastTimer = null;
function toast(msg) {
  let t = $("#toast"); if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}
function flashSaved() { const w = $("#who"); if (w) { w.classList.add("saved"); setTimeout(() => w.classList.remove("saved"), 600); } }

/* ---------- Realtime → odśwież (debounced) ---------- */
let refreshTimer = null, refreshInFlight = false, refreshPending = false;
// wstrzymaj odświeżanie z bazy na chwilę po WŁASNEJ zmianie (żeby „echo" nie cofało jej na ekranie)
function holdRefresh(ms = 2000) { state.suppressUntil = Date.now() + ms; }
function scheduleRefresh() { clearTimeout(refreshTimer); refreshTimer = setTimeout(maybeRefresh, 250); }
function maybeRefresh() {
  const wait = (state.suppressUntil || 0) - Date.now();
  if (wait > 0) { clearTimeout(refreshTimer); refreshTimer = setTimeout(maybeRefresh, wait + 60); return; }
  refreshData();
}
async function refreshData() {
  if (refreshInFlight) { refreshPending = true; return; }  // nie nakładaj odświeżeń
  refreshInFlight = true;
  try {
    // oba niezależne pobrania równolegle (jeden round-trip mniej na każde odświeżenie)
    const [clients, comments] = await Promise.all([api.getClients(), api.getAllComments()]);
    let team = state.team;
    if (state.live) { try { team = (await api.getTeam()).map((t) => t.name); } catch {} }
    state.clients = clients; state.commentsByClient = comments; state.team = team;
    // nie przerysowuj, jeśli nic WIDOCZNEGO się nie zmieniło (koniec migania) — tani odcisk bez serializacji notatek
    const snap = clients.map((c) => c.id + ":" + c.updated_at).join("|") + "#" +
      Object.keys(comments).sort().map((k) => k + ":" + comments[k].length).join("|") + "#" +
      (Array.isArray(team) ? team.join(",") : "");
    if (snap === state.lastSnap) return;
    state.lastSnap = snap;
    renderTabs(); renderBoard();
    if (state.openCardId) {
      const fresh = state.clients.find((c) => String(c.id) === String(state.openCardId));
      if (!fresh) {
        // kartę TRWALE usunęła inna osoba — zamknij modal z komunikatem
        toast("Tę kartę usunął ktoś inny");
        closeModal();
      } else if (!!fresh.deleted_at !== state.openCardWasArchived) {
        // inna osoba przeniosła kartę do Archiwum / przywróciła ją, gdy mam ją otwartą →
        // przełącz modal na właściwy widok (zamiast trwać w starym, co groziło edycją/„Usuń trwale" na złym stanie)
        toast(fresh.deleted_at ? "Tę kartę przeniesiono do Archiwum" : "Tę kartę przywrócono z Archiwum");
        openModal(state.openCardId);
      } else {
        // NIGDY nie przebudowuj całego modala (gubi wpisywany komentarz, scroll, podpowiedź @) —
        // odśwież tylko feed (komentarze + status follow-up/demo) i licznik
        refreshFeed(state.openCardId);
        updateNavButtons();   // lista/kolejność mogła się zmienić → odśwież stan ‹ ›
      }
    }
  } catch (err) { console.error("refresh", err); }
  finally { refreshInFlight = false; if (refreshPending) { refreshPending = false; scheduleRefresh(); } }
}

let safetyStarted = false;
function startSafetyRefresh() {
  if (safetyStarted || !state.live) return;
  safetyStarted = true;
  // łap zmiany, które mogły umknąć realtime (uśpienie/wybudzenie, zerwany net) + backstop co 60s
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") scheduleRefresh(); });
  window.addEventListener("online", () => scheduleRefresh());
  setInterval(() => { if (document.visibilityState === "visible") scheduleRefresh(); }, 60000);
}

/* ---------- Start ---------- */
async function showApp() {
  $("#login-view").hidden = true; $("#app-view").hidden = false;
  $("#who").textContent = (state.live ? "" : "demo: ") + state.currentUser;
  $("#logout-btn").hidden = !state.live;
  state.clients = await api.getClients();
  state.commentsByClient = await api.getAllComments();
  // DOMYŚLNIE: każdy widzi tylko SWOJE karty; przez panel zespołu może dobrać innych / wszystkich
  const loaded = loadOwners(); state.ownersAll = loaded.all; state.owners = loaded.owners;
  migrateArchiwumStatus();
  renderTabs(); renderBoard();
  wireNotif(); renderBell();
  api.subscribe(scheduleRefresh);
  startSafetyRefresh();
}

// Jednorazowa migracja: dawny etap 'archiwum' (usunięty z lejka) → nowe Archiwum (schowek poza tablicą).
// Karty z status='archiwum' chowamy (deleted_at) i normalizujemy status na 'lead' (po przywróceniu wrócą do Leadów).
function migrateArchiwumStatus() {
  const old = state.clients.filter((c) => c.status === "archiwum" && !c.deleted_at);
  if (!old.length) return;
  const stamp = new Date().toISOString();
  old.forEach((c) => {
    c.deleted_at = stamp; c.status = "lead";
    if (state.live) api.updateClient(c.id, { deleted_at: stamp, status: "lead" }).catch((e) => console.error("migrate archiwum", e));
  });
}

const KNOWN_NAMES = { "krzychu.brzezi@gmail.com": "Krzysztof", "kozakiewicz.marceli@gmail.com": "Marceli", "kluchobiznes@gmail.com": "Szymon" };
function niceName(email) { const base = ((email || "").split("@")[0].split(/[._\-0-9]/)[0]) || "Uzytkownik"; return base.charAt(0).toUpperCase() + base.slice(1); }
async function loadTeamAndMe(user) {
  let team = await api.getTeam();
  let me = team.find((t) => t.email === user.email);
  const desired = KNOWN_NAMES[user.email] || niceName(user.email);
  if (!me) { me = await api.upsertMe(user.email, desired); team = await api.getTeam(); }
  else if (me.name !== desired && KNOWN_NAMES[user.email]) { me = await api.upsertMe(user.email, desired); team = await api.getTeam(); }
  state.team = team.map((t) => t.name); state.currentUser = me.name;
}

function wireChrome() {
  $("#modal-close").addEventListener("click", closeModal);
  $("#modal-prev").addEventListener("click", () => navigateCard(-1));
  $("#modal-next").addEventListener("click", () => navigateCard(1));
  // gest „wstecz" (dwa palce w bok na Macu) / przycisk wstecz → zamknij otwartą kartę zamiast opuszczać stronę
  window.addEventListener("popstate", () => {
    if (state.skipPopClose) { state.skipPopClose = false; return; }   // to nasz history.back() po zamknięciu z UI
    if (!$("#modal-overlay").hidden) { state.modalHistoryPushed = false; teardownModal(); }
  });
  // zamknij klikiem w tło TYLKO gdy gest myszy zaczął się na tle (nie zamykaj, gdy ktoś zaznaczał tekst w karcie i puścił myszą poza nią)
  let overlayMouseDownSelf = false;
  $("#modal-overlay").addEventListener("mousedown", (e) => { overlayMouseDownSelf = (e.target.id === "modal-overlay"); });
  $("#modal-overlay").addEventListener("click", (e) => { if (e.target.id === "modal-overlay" && overlayMouseDownSelf) closeModal(); overlayMouseDownSelf = false; });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!$("#modal-overlay").hidden) { closeModal(); return; }
      const pop = $("#owner-pop");
      if (pop && !pop.hidden) { closeOwnerPanel(); const t = $("#owner-toggle"); if (t) t.focus(); return; }
    }
    // ← / → przewijają karty po kolei — ale tylko gdy modal otwarty i NIE piszemy w polu (żeby nie ruszać kursora)
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !$("#modal-overlay").hidden && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const a = document.activeElement, tag = a && a.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (a && a.isContentEditable);
      if (!typing) { e.preventDefault(); navigateCard(e.key === "ArrowLeft" ? -1 : 1); return; }
    }
    if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); const s = $("#search"); if (s) { s.focus(); s.select(); } }
  });
  const renderBoardDeb = debounce(renderBoard, 140);
  const s = $("#search"); if (s) s.addEventListener("input", () => { state.search = s.value; renderBoardDeb(); });
  const nb = $("#new-card-btn"); if (nb) nb.addEventListener("click", () => newCard("lead"));
  // klik poza panelem zespołu zamyka jego rozwijaną listę
  document.addEventListener("click", (e) => {
    const pop = $("#owner-pop");
    if (pop && !pop.hidden && !e.target.closest(".owner-panel")) closeOwnerPanel();
  });
}

/* ============================================================
   POWIADOMIENIA — @oznaczenia (frontend-only, liczone z komentarzy;
   "przeczytane" trzymane lokalnie per zalogowana osoba). Zero zmian w bazie.
   ============================================================ */
function parseMentions(body) {
  const out = new Set(); const team = state.team || [];
  const re = /@([A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]+)/g; let m;
  while ((m = re.exec(body || ""))) {
    const nick = m[1].toLowerCase();
    const hit = team.find((t) => String(t).toLowerCase() === nick);
    if (hit) out.add(hit);
  }
  return out;
}
function notifReadKey() { return "crm_notif_read_" + (state.currentUser || "?"); }
function getNotifReadAt() {
  let v = localStorage.getItem(notifReadKey());
  if (!v) { v = new Date().toISOString(); localStorage.setItem(notifReadKey(), v); } // czyste konto: licz od teraz, nie zalewaj historią
  return v;
}
function buildNotifications() {
  const me = state.currentUser; const list = []; const byId = state.commentsByClient || {};
  for (const cid in byId) {
    const cl = state.clients.find((x) => String(x.id) === String(cid));
    if (!cl || cl.deleted_at) continue; // pomiń karty z Archiwum / usunięte — nie powiadamiaj o schowanych
    for (const cm of (byId[cid] || [])) {
      if (cm.author === me) continue;
      if (parseMentions(cm.body).has(me)) {
        list.push({ clientId: cid, clientName: (cl && (cl.name || cl.company)) || "karta", author: cm.author, body: cm.body, at: cm.created_at });
      }
    }
  }
  list.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return list;
}
function renderBell() {
  const bell = $("#notif-bell"); if (!bell) return;
  const readAt = getNotifReadAt();
  const unread = buildNotifications().filter((n) => String(n.at) > String(readAt)).length;
  const badge = $("#notif-badge");
  if (badge) { badge.textContent = unread > 9 ? "9+" : String(unread); badge.hidden = unread === 0; }
  bell.classList.toggle("has-unread", unread > 0);
}
function renderNotifPanel() {
  const panel = $("#notif-panel"); if (!panel) return;
  const readAt = getNotifReadAt();
  const all = buildNotifications().slice(0, 30);
  const head = `<div class="notif-head"><strong>Powiadomienia</strong>${all.length ? `<button id="notif-readall" class="notif-readall">Oznacz przeczytane</button>` : ""}</div>`;
  const body = all.length
    ? all.map((n) => {
        const unread = String(n.at) > String(readAt);
        return `<button class="notif-item${unread ? " unread" : ""}" data-cid="${esc(n.clientId)}">
          <div class="notif-it-top"><span class="notif-who">${esc(n.author)}</span> oznaczył(a) Cię · <span class="notif-cli">${esc(n.clientName)}</span></div>
          <div class="notif-it-body">${esc(n.body)}</div>
          <div class="notif-it-time">${esc(fmtDateTime(n.at))}</div>
        </button>`;
      }).join("")
    : `<div class="notif-empty">Brak powiadomień. Gdy ktoś oznaczy Cię <b>@${esc(state.currentUser || "")}</b> w komentarzu, pojawi się tutaj.</div>`;
  panel.innerHTML = head + `<div class="notif-list">${body}</div>`;
  const ra = $("#notif-readall"); if (ra) ra.addEventListener("click", (e) => { e.stopPropagation(); markAllNotifRead(); });
  panel.querySelectorAll(".notif-item").forEach((el) => el.addEventListener("click", () => {
    const cid = el.dataset.cid; markAllNotifRead(); panel.hidden = true; openModal(cid);
  }));
}
function markAllNotifRead() { localStorage.setItem(notifReadKey(), new Date().toISOString()); renderBell(); renderNotifPanel(); }
function wireNotif() {
  const bell = $("#notif-bell"); const panel = $("#notif-panel");
  if (!bell || !panel || bell.dataset.wired) return;
  bell.dataset.wired = "1";
  bell.addEventListener("click", (e) => { e.stopPropagation(); const show = panel.hidden; panel.hidden = !show; if (show) renderNotifPanel(); });
  document.addEventListener("click", (e) => { if (!panel.hidden && !panel.contains(e.target) && e.target !== bell) panel.hidden = true; });
}

function showLoginForm() {
  $("#login-view").hidden = false; $("#app-view").hidden = true; $("#recovery-view").hidden = true;
  const f = $("#login-form");
  if (f && !f.dataset.wired) {
    f.dataset.wired = "1";
    f.addEventListener("submit", async (e) => {
      e.preventDefault(); $("#login-error").textContent = "";
      try { await api.signIn($("#login-email").value.trim(), $("#login-password").value); const u = await api.getUser(); await loadTeamAndMe(u); await showApp(); }
      catch (err) { console.error(err); $("#login-error").textContent = "Błędny e-mail lub hasło."; }
    });
    // „Nie pamiętasz hasła?" — wyślij mail z linkiem resetu
    const forgot = $("#forgot-link");
    if (forgot) forgot.addEventListener("click", async () => {
      const email = $("#login-email").value.trim();
      const box = $("#login-error");
      if (!email) { box.textContent = "Wpisz najpierw swój e-mail w polu wyżej, potem kliknij ponownie."; return; }
      forgot.disabled = true; box.textContent = "Wysyłam link...";
      try { await api.resetPassword(email); box.style.color = "#16a34a"; box.textContent = "Sprawdź skrzynkę (" + email + ") - wysłaliśmy link do ustawienia nowego hasła. Sprawdź też SPAM."; }
      catch (err) { console.error(err); box.style.color = ""; box.textContent = "Nie udało się wysłać linku. Spróbuj jeszcze raz za chwilę."; }
      finally { forgot.disabled = false; }
    });
  }
}

// Ekran „Ustaw nowe hasło" — pokazywany po powrocie z linku resetu w mailu
function showRecoveryForm() {
  $("#login-view").hidden = true; $("#app-view").hidden = true; $("#recovery-view").hidden = false;
  const f = $("#recovery-form");
  if (f && !f.dataset.wired) {
    f.dataset.wired = "1";
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const box = $("#recovery-msg"); box.style.color = ""; box.textContent = "";
      const pw = $("#recovery-password").value;
      if (!pw || pw.length < 6) { box.textContent = "Hasło musi mieć co najmniej 6 znaków."; return; }
      const btn = $("#recovery-btn"); btn.disabled = true; box.textContent = "Zapisuję...";
      try {
        await api.updatePassword(pw);
        history.replaceState(null, "", location.origin + location.pathname);
        const u = await api.getUser(); await loadTeamAndMe(u); await showApp();
      } catch (err) { console.error(err); box.textContent = "Nie udało się zapisać hasła. Link mógł wygasnąć - poproś o nowy."; btn.disabled = false; }
    });
  }
}
async function init() {
  await api.init(); state.live = api.isLive(); wireChrome();
  if (!state.live) { $("#demo-banner").hidden = false; state.team = [...DEMO_OWNERS]; state.currentUser = "Krzysztof"; await showApp(); return; }
  $("#logout-btn").addEventListener("click", async () => { await api.signOut(); location.reload(); });
  // POWRÓT Z LINKU RESETU HASŁA: pokaż ekran „ustaw nowe hasło", nie wpuszczaj od razu do appki
  sb.auth.onAuthStateChange((event) => { if (event === "PASSWORD_RECOVERY") showRecoveryForm(); });
  if (location.hash.includes("type=recovery")) { showRecoveryForm(); return; }
  try {
    const user = await api.getUser();
    if (user) { await loadTeamAndMe(user); await showApp(); }
    else { showLoginForm(); }
  } catch (err) {
    console.error("init", err);
    showLoginForm();
    $("#login-error").textContent = "Problem z połączeniem — spróbuj zalogować się ponownie.";
  }
}

/* ---------- DANE DEMO (fikcyjne) ---------- */
const DEMO_CLIENTS = [
  { id: "d1", name: "Jan Kowalski", company: "Stolarstwo Dębowy Las", phone: "+48 600 100 201", email: "kontakt@debowylas.pl", google_maps: "https://google.com/maps", quality: "wysoka", status: "zainteresowany", follow_up: "2026-06-23", owner: "Krzysztof", notes: "Ma znajomego co robi strony, ale drogo. Pokazujemy demo.", position: 1000 },
  { id: "d2", name: "Marek Zieliński", company: "Auto-Serwis Zieliński", phone: "+48 600 100 202", email: "", google_maps: "", quality: "", status: "lead", follow_up: "2026-06-22", owner: "Krzysztof", notes: "", position: 1000 },
  { id: "d3", name: "Hydraulika Nowak", company: "Hydraulika Nowak", phone: "+48 600 100 204", email: "", google_maps: "", quality: "", status: "lead", follow_up: null, owner: "Marceli", notes: "", position: 2000 },
  { id: "d7", name: "Stolarnia Wiór", company: "Stolarnia Wiór", phone: "+48 600 100 203", email: "", google_maps: "", quality: "", status: "lead", follow_up: "2026-06-24", owner: "Krzysztof", notes: "", position: 3000 },
  { id: "d4", name: "Salon Bella", company: "Salon Fryzjerski Bella", phone: "+48 600 100 206", email: "", google_maps: "", quality: "", status: "umowiony", follow_up: "2026-06-25", owner: "Szymon", opiekun: "Krzysztof", notes: "Spotkanie czwartek 17:00.", position: 1000 },
  { id: "d5", name: "Kwiaciarnia Storczyk", company: "Kwiaciarnia Storczyk", phone: "+48 600 100 208", email: "", google_maps: "", quality: "", status: "oferta", follow_up: "2026-06-27", owner: "Piotr", notes: "Wysłana oferta.", position: 1000 },
  { id: "d6", name: "Fit Klub Active", company: "Fit Klub Active", phone: "+48 600 100 209", email: "", google_maps: "", quality: "", status: "konwersja", follow_up: null, owner: "Krzysztof", notes: "PODPISANE.", position: 1000 },
];
const DEMO_COMMENTS = {
  d1: [
    { author: "Marceli", body: "Dzwoniłem 19.06 — @Krzysztof weź follow-up, ma oddzwonić pon/wt.", created_at: "2026-06-19T10:00:00" },
    { author: "Krzysztof", body: "Spoko, biorę.", created_at: "2026-06-19T14:30:00" },
  ],
};

init();

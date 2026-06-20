/* ============================================================
   CRM — New Beginning   (vanilla JS, bez budowania)
   Tryb DEMO gdy config.js pusty; tryb na żywo gdy Supabase ustawiony.
   ============================================================ */

/* ---------- Etapy lejka (1:1 z Notion) ---------- */
const STATUSES = [
  { key: "lead",         label: "Lead",                  dot: "#9b9a97", bg: "#e8e8e6", fg: "#5a594f" },
  { key: "zainteresowany", label: "Zainteresowany",      dot: "#9a6dd7", bg: "#ede1f7", fg: "#6940a5" },
  { key: "umowiony",     label: "Umówiony na spotkanie", dot: "#529cca", bg: "#ddebf1", fg: "#2c6e8f" },
  { key: "po_spotkaniu", label: "po spotkaniu/sprzedaż", dot: "#e0837d", bg: "#fbe4e2", fg: "#a8362f" },
  { key: "oferta",       label: "Oferta/umowa",          dot: "#d9b54a", bg: "#faf3dd", fg: "#8a6d1a" },
  { key: "konwersja",    label: "Konwersja",             dot: "#6aa84f", bg: "#dbeddb", fg: "#3d6b2e" },
  { key: "archiwum",     label: "Archiwum",              dot: "#9b9a97", bg: "#e8e8e6", fg: "#5a594f" },
];
const statusOf = (k) => STATUSES.find((s) => s.key === k) || STATUSES[0];

/* ---------- Zespół (dynamiczny) ----------
   Lista właścicieli NIE jest na sztywno — w trybie na żywo wczytuje się z bazy
   (tabela team_members) i rośnie sama, gdy nowa osoba się zaloguje.
   DEMO_OWNERS to tylko obsada przykładowa do podglądu. */
const DEMO_OWNERS = ["Krzysztof", "Marceli", "Szymon", "Bartek", "Piotr"];
const ownerColor = (name) => {
  const palette = ["#2383e2", "#9a6dd7", "#6aa84f", "#e0837d", "#d9942a", "#0f9b8e", "#c2487a"];
  let h = 0; const s = String(name || "?");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
};
const initials = (name) => (name || "?").trim().charAt(0).toUpperCase();

/* ---------- Stan ---------- */
const state = {
  clients: [],
  commentsByClient: {},   // { clientId: [ {author, body, created_at} ] }
  team: [],               // lista imion członków zespołu (dynamiczna)
  currentTab: "all",      // "all" | nazwa właściciela
  currentUser: "Krzysztof", // kto jest zalogowany (w demo: Krzysztof)
  live: false,
};

/* ============================================================
   WARSTWA DANYCH  (demo  ↔  Supabase)
   ============================================================ */
let sb = null; // klient Supabase

const cfg = window.CRM_CONFIG || {};
const LIVE = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);

const api = {
  isLive: () => LIVE,

  async init() {
    if (LIVE) sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  },

  /* --- Auth --- */
  async getUser() {
    if (!LIVE) return { email: "demo@local" };
    const { data } = await sb.auth.getUser();
    return data.user;
  },
  async signIn(email, password) {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
  },
  async signOut() { if (LIVE) await sb.auth.signOut(); },

  /* --- Klienci --- */
  async getClients() {
    if (!LIVE) return structuredClone(DEMO_CLIENTS);
    const { data, error } = await sb.from("clients").select("*").order("created_at", { ascending: true });
    if (error) throw error;
    return data;
  },
  async updateClient(id, patch) {
    if (!LIVE) return; // demo: tylko lokalnie (już zmienione w stanie)
    const { error } = await sb.from("clients").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
  },
  async addClient(obj) {
    if (!LIVE) { obj.id = "demo-" + Date.now(); return obj; }
    const { data, error } = await sb.from("clients").insert(obj).select().single();
    if (error) throw error;
    return data;
  },

  /* --- Komentarze --- */
  async getComments(clientId) {
    if (!LIVE) return structuredClone(DEMO_COMMENTS[clientId] || []);
    const { data, error } = await sb.from("comments").select("*").eq("client_id", clientId).order("created_at", { ascending: true });
    if (error) throw error;
    return data;
  },
  async addComment(clientId, body) {
    const row = { client_id: clientId, author: state.currentUser, body, created_at: new Date().toISOString() };
    if (!LIVE) {
      (state.commentsByClient[clientId] = state.commentsByClient[clientId] || []).push(row);
      return row;
    }
    const { data, error } = await sb.from("comments").insert(row).select().single();
    if (error) throw error;
    return data;
  },

  /* --- Zespół --- */
  async getTeam() {
    if (!LIVE) return DEMO_OWNERS.map((name) => ({ email: name.toLowerCase() + "@demo", name }));
    const { data, error } = await sb.from("team_members").select("*").order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
  },
  async upsertMe(email, name) {
    if (!LIVE) return { email, name };
    const { data, error } = await sb.from("team_members").upsert({ email, name }, { onConflict: "email" }).select().single();
    if (error) throw error;
    return data;
  },
};

/* ============================================================
   POMOCNICZE
   ============================================================ */
const $ = (sel) => document.querySelector(sel);
const fmtDate = (d) => {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" });
};
const fmtDateTime = (d) => {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleString("pl-PL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};
const esc = (s) => (s == null ? "" : String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
const canEdit = (client) => client.owner === state.currentUser;

/* ============================================================
   RENDER — zakładki
   ============================================================ */
function renderTabs() {
  const tabs = $("#tabs");
  const counts = {};
  state.clients.forEach((c) => { counts[c.owner] = (counts[c.owner] || 0) + 1; });
  const items = [{ key: "all", label: "Wszyscy", count: state.clients.length }]
    .concat(state.team.map((o) => ({ key: o, label: o, count: counts[o] || 0 })));
  tabs.innerHTML = items.map((t) =>
    `<button class="tab ${state.currentTab === t.key ? "active" : ""}" data-tab="${esc(t.key)}">
       ${esc(t.label)}<span class="count">${t.count}</span>
     </button>`).join("");
  tabs.querySelectorAll(".tab").forEach((el) =>
    el.addEventListener("click", () => { state.currentTab = el.dataset.tab; renderTabs(); renderBoard(); }));
}

/* ============================================================
   RENDER — tablica
   ============================================================ */
function visibleClients() {
  return state.currentTab === "all" ? state.clients : state.clients.filter((c) => c.owner === state.currentTab);
}

function renderBoard() {
  const board = $("#board");
  const list = visibleClients();
  board.innerHTML = STATUSES.map((s) => {
    const cards = list.filter((c) => (c.status || "lead") === s.key);
    return `<section class="column" data-status="${s.key}">
      <div class="column-head">
        <span class="dot" style="background:${s.dot}"></span>
        <span>${esc(s.label)}</span>
        <span class="col-count">${cards.length}</span>
        <button class="add-card" data-status="${s.key}" title="Dodaj kartę">+</button>
      </div>
      <div class="cards" data-status="${s.key}">
        ${cards.map(renderCard).join("")}
      </div>
    </section>`;
  }).join("");

  // klik w kartę
  board.querySelectorAll(".card").forEach((el) =>
    el.addEventListener("click", () => openModal(el.dataset.id)));
  // dodaj kartę
  board.querySelectorAll(".add-card").forEach((el) =>
    el.addEventListener("click", (e) => { e.stopPropagation(); newCard(el.dataset.status); }));

  wireDragAndDrop();
}

function renderCard(c) {
  const cnt = (state.commentsByClient[c.id] || []).length;
  const editable = canEdit(c);
  return `<article class="card" data-id="${esc(c.id)}" draggable="${editable}">
    <div class="card-title">${esc(c.name)}</div>
    ${c.company ? `<div class="card-company">${esc(c.company)}</div>` : ""}
    <div class="card-meta">
      ${c.phone ? `<span class="chip">📞 ${esc(c.phone)}</span>` : ""}
    </div>
    <div class="card-foot">
      ${c.follow_up ? `<span class="chip">📅 ${esc(fmtDate(c.follow_up))}</span>` : ""}
      ${cnt ? `<span class="chip">💬 ${cnt}</span>` : ""}
      <span class="card-owner">
        <span class="avatar" style="background:${ownerColor(c.owner)}">${initials(c.owner)}</span>
      </span>
    </div>
  </article>`;
}

/* ---------- Drag & drop (zmiana etapu, tylko swoje karty) ---------- */
let dragId = null;
function wireDragAndDrop() {
  const board = $("#board");
  board.querySelectorAll('.card[draggable="true"]').forEach((card) => {
    card.addEventListener("dragstart", (e) => { dragId = card.dataset.id; card.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; });
    card.addEventListener("dragend", () => { dragId = null; card.classList.remove("dragging"); });
  });
  board.querySelectorAll(".cards").forEach((zone) => {
    zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("drag-over"); });
    zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
    zone.addEventListener("drop", async (e) => {
      e.preventDefault(); zone.classList.remove("drag-over");
      if (!dragId) return;
      const newStatus = zone.dataset.status;
      const c = state.clients.find((x) => String(x.id) === String(dragId));
      if (!c || c.status === newStatus) return;
      c.status = newStatus;
      renderBoard();
      try { await api.updateClient(c.id, { status: newStatus }); } catch (err) { alert("Nie udało się zapisać etapu: " + err.message); }
    });
  });
}

/* ============================================================
   MODAL — karta klienta
   ============================================================ */
async function openModal(id) {
  const c = state.clients.find((x) => String(x.id) === String(id));
  if (!c) return;
  const editable = canEdit(c);
  const comments = await api.getComments(c.id);
  state.commentsByClient[c.id] = comments;

  const field = (label, icon, key, type = "text") => {
    const val = c[key] || "";
    const input = editable
      ? `<input type="${type}" data-key="${key}" value="${esc(val)}" />`
      : `<div class="prop-value readonly">${esc(val) || "—"}</div>`;
    return `<div class="prop-label">${icon} ${label}</div><div class="prop-value">${input}</div>`;
  };

  const statusSelect = editable
    ? `<select data-key="status">${STATUSES.map((s) => `<option value="${s.key}" ${c.status === s.key ? "selected" : ""}>${esc(s.label)}</option>`).join("")}</select>`
    : `<div class="prop-value readonly"><span class="status-pill" style="background:${statusOf(c.status).bg};color:${statusOf(c.status).fg}"><span class="dot" style="background:${statusOf(c.status).dot}"></span>${esc(statusOf(c.status).label)}</span></div>`;

  const ownerOptions = Array.from(new Set([...state.team, c.owner].filter(Boolean)));
  const ownerSelect = editable
    ? `<select data-key="owner">${ownerOptions.map((o) => `<option value="${o}" ${c.owner === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`
    : `<div class="prop-value readonly">${esc(c.owner)}</div>`;

  const maps = c.google_maps ? `<a href="${esc(c.google_maps)}" target="_blank" rel="noopener">otwórz w Mapach</a>` : "—";

  $("#modal-body").innerHTML = `
    ${editable ? `<input class="title-input" data-key="name" value="${esc(c.name)}" />` : `<h2>${esc(c.name)}</h2>`}
    <div class="modal-sub">${comments.length} ${comments.length === 1 ? "komentarz" : "komentarzy"}</div>
    ${!editable ? `<div class="readonly-note">To karta innej osoby (${esc(c.owner)}). Możesz tylko dodać komentarz — pól nie edytujesz.</div>` : ""}

    <div class="props">
      ${field("Quality", "🔥", "quality")}
      ${field("Nazwa Firmy", "🏢", "company")}
      <div class="prop-label">🔗 Google Maps</div><div class="prop-value">${editable ? `<input data-key="google_maps" value="${esc(c.google_maps || "")}" placeholder="link" />` : maps}</div>
      ${field("Phone", "📞", "phone")}
      ${field("Email", "@", "email")}
      <div class="prop-label">◎ Status</div><div class="prop-value">${statusSelect}</div>
      ${field("Follow Up", "📅", "follow_up", "date")}
      <div class="prop-label">👤 Person</div><div class="prop-value">${ownerSelect}</div>
    </div>

    <hr class="section-divider" />
    <div class="notes-label">Notatki</div>
    ${editable
      ? `<textarea class="notes" data-key="notes" placeholder="notatki, historia rozmów...">${esc(c.notes || "")}</textarea>`
      : `<div class="prop-value readonly" style="white-space:pre-wrap">${esc(c.notes) || "—"}</div>`}

    <hr class="section-divider" />
    <div class="notes-label">Komentarze</div>
    <div class="comments-wrap" id="comments-wrap">${renderComments(comments)}</div>
    <div class="add-comment">
      <input id="new-comment" placeholder="Dodaj komentarz..." />
      <button id="send-comment">Wyślij</button>
    </div>

    ${editable ? `<div class="save-row"><button class="primary-btn" id="save-card">Zapisz zmiany</button></div>` : ""}
  `;

  $("#modal-overlay").hidden = false;

  // zapis pól
  const saveBtn = $("#save-card");
  if (saveBtn) saveBtn.addEventListener("click", () => saveCard(c.id));

  // komentarz
  const send = $("#send-comment"), inp = $("#new-comment");
  const doSend = async () => {
    const body = inp.value.trim();
    if (!body) return;
    inp.value = "";
    try {
      await api.addComment(c.id, body);
      const fresh = await api.getComments(c.id);
      state.commentsByClient[c.id] = fresh;
      $("#comments-wrap").innerHTML = renderComments(fresh);
      $(".modal-sub").textContent = `${fresh.length} ${fresh.length === 1 ? "komentarz" : "komentarzy"}`;
      renderBoard();
    } catch (err) { alert("Nie udało się dodać komentarza: " + err.message); }
  };
  send.addEventListener("click", doSend);
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") doSend(); });
}

function renderComments(list) {
  if (!list.length) return `<div style="color:var(--ink-soft);font-size:13px;padding:6px 0">Brak komentarzy.</div>`;
  return list.map((c) => `
    <div class="comment">
      <span class="avatar" style="background:${ownerColor(c.author)}">${initials(c.author)}</span>
      <div class="comment-main">
        <div class="comment-head"><span class="c-author">${esc(c.author)}</span><span class="c-time">${esc(fmtDateTime(c.created_at))}</span></div>
        <div class="comment-body">${esc(c.body)}</div>
      </div>
    </div>`).join("");
}

async function saveCard(id) {
  const c = state.clients.find((x) => String(x.id) === String(id));
  const patch = {};
  document.querySelectorAll("#modal-body [data-key]").forEach((el) => { patch[el.dataset.key] = el.value || null; });
  Object.assign(c, patch);
  try {
    await api.updateClient(id, patch);
    closeModal();
    renderTabs();
    renderBoard();
  } catch (err) { alert("Nie udało się zapisać: " + err.message); }
}

function closeModal() { $("#modal-overlay").hidden = true; $("#modal-body").innerHTML = ""; }

/* ---------- Nowa karta ---------- */
async function newCard(status) {
  const name = prompt("Nazwa nowego klienta / leada:");
  if (!name) return;
  const obj = { name, company: "", phone: "", email: "", google_maps: "", quality: "", status: status || "lead", follow_up: null, owner: state.currentUser, notes: "" };
  try {
    const saved = await api.addClient(obj);
    state.clients.push(saved);
    renderTabs(); renderBoard();
    openModal(saved.id);
  } catch (err) { alert("Nie udało się dodać karty: " + err.message); }
}

/* ============================================================
   LOGOWANIE / START
   ============================================================ */
async function showApp() {
  $("#login-view").hidden = true;
  $("#app-view").hidden = false;
  $("#who").textContent = state.live ? `Zalogowany: ${state.currentUser}` : `Tryb demo: ${state.currentUser}`;
  $("#logout-btn").hidden = !state.live;
  state.clients = await api.getClients();
  // wczytaj liczniki komentarzy dla kart (w demo z DEMO_COMMENTS)
  if (!state.live) state.commentsByClient = structuredClone(DEMO_COMMENTS);
  renderTabs();
  renderBoard();
}

async function init() {
  await api.init();
  state.live = api.isLive();

  // modal close
  $("#modal-close").addEventListener("click", closeModal);
  $("#modal-overlay").addEventListener("click", (e) => { if (e.target.id === "modal-overlay") closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

  if (!state.live) {
    $("#demo-banner").hidden = false;
    state.team = [...DEMO_OWNERS];
    state.currentUser = "Krzysztof";
    await showApp();
    return;
  }

  // tryb na żywo: logowanie
  $("#logout-btn").addEventListener("click", async () => { await api.signOut(); location.reload(); });
  const user = await api.getUser();
  if (user) {
    await loadTeamAndMe(user);
    await showApp();
  } else {
    $("#login-view").hidden = false;
    $("#login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      $("#login-error").textContent = "";
      try {
        await api.signIn($("#login-email").value.trim(), $("#login-password").value);
        const u = await api.getUser();
        await loadTeamAndMe(u);
        await showApp();
      } catch (err) { $("#login-error").textContent = "Błędny e-mail lub hasło."; }
    });
  }
}

// Wczytuje zespół z bazy i ustala, kim jest zalogowana osoba.
// Jeśli to jej pierwsze logowanie — pyta o imię i dopisuje do team_members.
async function loadTeamAndMe(user) {
  let team = await api.getTeam();
  let me = team.find((t) => t.email === user.email);
  if (!me) {
    const guess = (user.email || "").split("@")[0];
    const name = (prompt("Witaj! Jak masz się wyświetlać w CRM (imię)?", guess) || guess).trim() || guess;
    me = await api.upsertMe(user.email, name);
    team = await api.getTeam();
  }
  state.team = team.map((t) => t.name);
  state.currentUser = me.name;
}

/* ============================================================
   DANE DEMO  (z Waszego Notion — żeby było co oglądać)
   ============================================================ */
// UWAGA: to są DANE FIKCYJNE (przykładowe) — żeby publiczny podgląd niczego nie wystawiał.
// Prawdziwe karty wejdą wyłącznie do zalogowanej bazy Supabase.
const DEMO_CLIENTS = [
  { id: "d1", name: "Jan Kowalski", company: "Stolarstwo Dębowy Las — meble na wymiar", phone: "+48 600 100 201", email: "kontakt@debowylas.pl", google_maps: "https://google.com/maps", quality: "wysoka", status: "zainteresowany", follow_up: "2026-06-23", owner: "Krzysztof", notes: "Ma znajomego, który robi strony, ale drogo. Powiedziałem, że zrobimy demo i pokażemy jakość.\n\nUmówić się na rozmowę po obejrzeniu demo." },
  { id: "d2", name: "Marek Zieliński", company: "Auto-Serwis Zieliński", phone: "+48 600 100 202", email: "", google_maps: "", quality: "", status: "lead", follow_up: "2026-06-22", owner: "Krzysztof", notes: "" },
  { id: "d3", name: "Firma Elektryczna VOLT", company: "VOLT — usługi elektryczne", phone: "+48 600 100 203", email: "", google_maps: "", quality: "", status: "lead", follow_up: null, owner: "Krzysztof", notes: "" },
  { id: "d4", name: "Hydraulika Nowak", company: "Hydraulika Nowak", phone: "+48 600 100 204", email: "", google_maps: "", quality: "", status: "lead", follow_up: "2026-06-24", owner: "Marceli", notes: "" },
  { id: "d5", name: "Meble Kuchenne ARDO", company: "ARDO — meble kuchenne i biurowe", phone: "+48 600 100 205", email: "", google_maps: "", quality: "", status: "zainteresowany", follow_up: "2026-06-21", owner: "Marceli", notes: "" },
  { id: "d6", name: "Pani Aleksandra — Salon Bella", company: "Salon Fryzjerski Bella", phone: "+48 600 100 206", email: "", google_maps: "", quality: "", status: "umowiony", follow_up: "2026-06-25", owner: "Szymon", notes: "Spotkanie czwartek 17:00." },
  { id: "d7", name: "Gabinet Uśmiech", company: "Gabinet Stomatologiczny Uśmiech", phone: "+48 600 100 207", email: "", google_maps: "", quality: "", status: "po_spotkaniu", follow_up: "2026-06-26", owner: "Bartek", notes: "Po spotkaniu — czeka na wycenę." },
  { id: "d8", name: "Kwiaciarnia Storczyk", company: "Kwiaciarnia Storczyk", phone: "+48 600 100 208", email: "", google_maps: "", quality: "", status: "oferta", follow_up: "2026-06-27", owner: "Piotr", notes: "Wysłana oferta 9 stów." },
  { id: "d9", name: "Fit Klub Active", company: "Fit Klub Active — siłownia", phone: "+48 600 100 209", email: "", google_maps: "", quality: "", status: "konwersja", follow_up: null, owner: "Krzysztof", notes: "PODPISANE. Strona w realizacji." },
  { id: "d10", name: "Pizzeria Bella Italia", company: "Pizzeria Bella Italia", phone: "+48 600 100 210", email: "", google_maps: "", quality: "", status: "archiwum", follow_up: null, owner: "Szymon", notes: "Nie zainteresowani na ten moment." },
  { id: "d11", name: "Warsztat Opon Koło", company: "Wulkanizacja Koło", phone: "+48 600 100 211", email: "", google_maps: "", quality: "", status: "archiwum", follow_up: null, owner: "Bartek", notes: "" },
];

const DEMO_COMMENTS = {
  d1: [
    { author: "Marceli", body: "Dzwoniłem 19.06 — odebrał, ale nie zdążył obejrzeć demo. Ma oddzwonić pon/wt.", created_at: "2026-06-19T10:00:00" },
    { author: "Krzysztof", body: "Spoko, biorę follow-up na siebie.", created_at: "2026-06-19T14:30:00" },
  ],
};

/* start */
init();

/* ============================================================
   CRM — New Beginning   (vanilla JS, bez budowania)   v2
   Realtime + auto-zapis + @oznaczenia + "Poproś o demo" + wyszukiwarka.
   ============================================================ */

/* ---------- Etapy lejka (1:1 z Notion) ---------- */
const STATUSES = [
  { key: "lead",          label: "Lead",                  dot: "#9b9a97", bg: "#e8e8e6", fg: "#5a594f" },
  { key: "zainteresowany",label: "Zainteresowany",        dot: "#9a6dd7", bg: "#ede1f7", fg: "#6940a5" },
  { key: "umowiony",      label: "Umówiony na spotkanie",  dot: "#529cca", bg: "#ddebf1", fg: "#2c6e8f" },
  { key: "po_spotkaniu",  label: "po spotkaniu/sprzedaż",  dot: "#e0837d", bg: "#fbe4e2", fg: "#a8362f" },
  { key: "oferta",        label: "Oferta/umowa",           dot: "#d9b54a", bg: "#faf3dd", fg: "#8a6d1a" },
  { key: "konwersja",     label: "Konwersja",              dot: "#6aa84f", bg: "#dbeddb", fg: "#3d6b2e" },
  { key: "archiwum",      label: "Archiwum",               dot: "#9b9a97", bg: "#e8e8e6", fg: "#5a594f" },
];
const statusOf = (k) => STATUSES.find((s) => s.key === k) || STATUSES[0];

/* ---------- Zespół (dynamiczny) ---------- */
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
  clients: [], commentsByClient: {}, team: [],
  currentTab: "all", currentUser: "Krzysztof", search: "", live: false, openCardId: null,
};

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

  async getClients() {
    if (!LIVE) return structuredClone(DEMO_CLIENTS);
    const { data, error } = await sb.from("clients").select("*").order("created_at", { ascending: true });
    if (error) throw error; return data;
  },
  async updateClient(id, patch) {
    if (!LIVE) return;
    const { error } = await sb.from("clients").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
  },
  async addClient(obj) {
    if (!LIVE) { obj.id = "demo-" + Date.now(); return obj; }
    const { data, error } = await sb.from("clients").insert(obj).select().single();
    if (error) throw error; return data;
  },
  async deleteClient(id) { if (!LIVE) return; const { error } = await sb.from("clients").delete().eq("id", id); if (error) throw error; },

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
    const { data, error } = await sb.from("comments").insert({ client_id: clientId, author: state.currentUser, body }).select().single();
    if (error) throw error; return data;
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
    await sb.from("demo_requests").insert({ client_id: clientId, requested_by: state.currentUser, note: note || null });
    await sb.from("clients").update({ demo_requested: true }).eq("id", clientId);
  },

  subscribe(onChange) {
    if (!LIVE) return;
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
const esc = (s) => (s == null ? "" : String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
const canEdit = (client) => client.owner === state.currentUser;
const isDueSoon = (d) => { if (!d) return false; const dt = new Date(d); if (isNaN(dt)) return false; const t = new Date(); t.setHours(23, 59, 59, 999); return dt <= t; };

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
    `<button class="tab ${state.currentTab === t.key ? "active" : ""}" data-tab="${esc(t.key)}">${esc(t.label)}<span class="count">${t.count}</span></button>`).join("");
  tabs.querySelectorAll(".tab").forEach((el) =>
    el.addEventListener("click", () => { state.currentTab = el.dataset.tab; renderTabs(); renderBoard(); }));
}

/* ============================================================
   RENDER — tablica
   ============================================================ */
function visibleClients() {
  let list = state.currentTab === "all" ? state.clients : state.clients.filter((c) => c.owner === state.currentTab);
  const q = state.search.trim().toLowerCase();
  if (q) list = list.filter((c) => [c.name, c.company, c.phone, c.email].filter(Boolean).join(" ").toLowerCase().includes(q));
  return list;
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
      <div class="cards" data-status="${s.key}">${cards.map(renderCard).join("")}</div>
    </section>`;
  }).join("");

  board.querySelectorAll(".card").forEach((el) => el.addEventListener("click", () => openModal(el.dataset.id)));
  board.querySelectorAll(".add-card").forEach((el) => el.addEventListener("click", (e) => { e.stopPropagation(); newCard(el.dataset.status); }));
  wireDragAndDrop();
}

function renderCard(c) {
  const cnt = (state.commentsByClient[c.id] || []).length;
  const editable = canEdit(c);
  const due = isDueSoon(c.follow_up);
  return `<article class="card" data-id="${esc(c.id)}" draggable="${editable}">
    <div class="card-title">${esc(c.name)}</div>
    ${c.company ? `<div class="card-company">${esc(c.company)}</div>` : ""}
    <div class="card-meta">${c.phone ? `<span class="chip">📞 ${esc(c.phone)}</span>` : ""}</div>
    <div class="card-foot">
      ${c.follow_up ? `<span class="chip ${due ? "chip-due" : ""}">📅 ${esc(fmtDate(c.follow_up))}</span>` : ""}
      ${cnt ? `<span class="chip">💬 ${cnt}</span>` : ""}
      ${c.demo_requested ? `<span class="chip chip-demo">📩 demo</span>` : ""}
      <span class="card-owner"><span class="avatar" style="background:${ownerColor(c.owner)}">${initials(c.owner)}</span></span>
    </div>
  </article>`;
}

/* ---------- Drag & drop (cała kolumna; tylko swoje karty) ---------- */
let dragId = null;
function wireDragAndDrop() {
  const board = $("#board");
  board.querySelectorAll('.card[draggable="true"]').forEach((card) => {
    card.addEventListener("dragstart", (e) => { dragId = card.dataset.id; card.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", card.dataset.id); });
    card.addEventListener("dragend", () => { dragId = null; card.classList.remove("dragging"); });
  });
  board.querySelectorAll(".column").forEach((zone) => {
    zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("drag-over"); });
    zone.addEventListener("dragleave", (e) => { if (!zone.contains(e.relatedTarget)) zone.classList.remove("drag-over"); });
    zone.addEventListener("drop", async (e) => {
      e.preventDefault(); zone.classList.remove("drag-over");
      if (!dragId) return;
      const newStatus = zone.dataset.status;
      const c = state.clients.find((x) => String(x.id) === String(dragId));
      if (!c || c.status === newStatus) return;
      c.status = newStatus; renderBoard();
      try { await api.updateClient(c.id, { status: newStatus }); } catch (err) { console.error(err); toast("Nie udało się zapisać etapu"); }
    });
  });
}

/* ============================================================
   MODAL — karta (auto-zapis, bez przycisku "Zapisz")
   ============================================================ */
async function openModal(id) {
  const c = state.clients.find((x) => String(x.id) === String(id));
  if (!c) return;
  state.openCardId = id;
  const editable = canEdit(c);
  const comments = await api.getComments(id);
  state.commentsByClient[id] = comments;

  const field = (label, icon, key, type = "text") => {
    const val = c[key] || "";
    const input = editable ? `<input type="${type}" data-key="${key}" value="${esc(val)}" />` : `<div class="prop-value readonly">${esc(val) || "—"}</div>`;
    return `<div class="prop-label">${icon} ${label}</div><div class="prop-value">${input}</div>`;
  };
  const statusSelect = editable
    ? `<select data-key="status">${STATUSES.map((s) => `<option value="${s.key}" ${c.status === s.key ? "selected" : ""}>${esc(s.label)}</option>`).join("")}</select>`
    : `<div class="prop-value readonly"><span class="status-pill" style="background:${statusOf(c.status).bg};color:${statusOf(c.status).fg}"><span class="dot" style="background:${statusOf(c.status).dot}"></span>${esc(statusOf(c.status).label)}</span></div>`;
  const ownerOpts = Array.from(new Set([...state.team, c.owner].filter(Boolean)));
  const ownerSelect = editable
    ? `<select data-key="owner">${ownerOpts.map((o) => `<option value="${o}" ${c.owner === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`
    : `<div class="prop-value readonly">${esc(c.owner)}</div>`;
  const maps = c.google_maps ? `<a href="${esc(c.google_maps)}" target="_blank" rel="noopener">otwórz w Mapach</a>` : "—";

  $("#modal-body").innerHTML = `
    ${editable ? `<input class="title-input" data-key="name" value="${esc(c.name)}" />` : `<h2>${esc(c.name)}</h2>`}
    <div class="modal-sub"><span id="comment-count">${comments.length}</span> ${comments.length === 1 ? "komentarz" : "komentarzy"} · ${editable ? "zmiany zapisują się automatycznie" : "karta innej osoby — możesz komentować"}</div>
    ${!editable ? `<div class="readonly-note">To karta: ${esc(c.owner)}. Pól nie edytujesz, ale możesz dodać komentarz (z @oznaczeniem).</div>` : ""}

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

    <div class="demo-row">
      ${c.demo_requested ? `<span class="demo-flag">📩 Demo poproszone — w kolejce u Claude</span>` : `<button class="ghost-btn demo-btn" id="ask-demo">📩 Poproś o demo</button>`}
    </div>

    <hr class="section-divider" />
    <div class="notes-label">Notatki</div>
    ${editable ? `<textarea class="notes" data-key="notes" placeholder="notatki, historia rozmów...">${esc(c.notes || "")}</textarea>` : `<div class="prop-value readonly" style="white-space:pre-wrap">${esc(c.notes) || "—"}</div>`}

    <hr class="section-divider" />
    <div class="notes-label">Komentarze</div>
    <div class="comments-wrap" id="comments-wrap">${renderComments(comments)}</div>
    <div class="add-comment">
      <input id="new-comment" placeholder="Dodaj komentarz...  (@ aby oznaczyć osobę)" autocomplete="off" />
      <button id="send-comment">Wyślij</button>
      <div id="mention-pop" class="mention-pop" hidden></div>
    </div>

    ${editable ? `<div class="save-row"><button class="ghost-btn" id="delete-card">Usuń kartę</button></div>` : ""}
  `;
  $("#modal-overlay").hidden = false;

  if (editable) {
    document.querySelectorAll("#modal-body [data-key]").forEach((el) => {
      el.addEventListener("change", () => saveField(c.id, el.dataset.key, el.value));
    });
  }
  const delBtn = $("#delete-card"); if (delBtn) delBtn.addEventListener("click", () => askDeleteCard(c.id, delBtn));
  const askBtn = $("#ask-demo"); if (askBtn) askBtn.addEventListener("click", () => doRequestDemo(c.id));
  wireCommentBox(c.id);
}

async function saveField(id, key, value) {
  const c = state.clients.find((x) => String(x.id) === String(id));
  if (!c) return;
  const v = value === "" ? null : value;
  c[key] = v;
  try {
    await api.updateClient(id, { [key]: v });
    if (["status", "owner", "name", "follow_up", "company", "phone"].includes(key)) { renderTabs(); renderBoard(); }
    flashSaved();
  } catch (err) { console.error(err); toast("Nie udało się zapisać"); }
}

function renderComments(list) {
  if (!list.length) return `<div class="no-comments">Brak komentarzy.</div>`;
  return list.map((c) => `
    <div class="comment">
      <span class="avatar" style="background:${ownerColor(c.author)}">${initials(c.author)}</span>
      <div class="comment-main">
        <div class="comment-head"><span class="c-author">${esc(c.author)}</span><span class="c-time">${esc(fmtDateTime(c.created_at))}</span></div>
        <div class="comment-body">${highlightMentions(c.body)}</div>
      </div>
    </div>`).join("");
}
function highlightMentions(text) {
  return esc(text).replace(/@([A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż][\wĄĆĘŁŃÓŚŹŻąćęłńóśźż]*)/g, '<span class="mention">@$1</span>');
}

/* ---------- Komentarz + @mention ---------- */
function wireCommentBox(clientId) {
  const inp = $("#new-comment"), pop = $("#mention-pop");
  const send = async () => {
    const body = inp.value.trim();
    if (!body) return;
    inp.value = ""; pop.hidden = true;
    try {
      await api.addComment(clientId, body);
      const fresh = await api.getComments(clientId);
      state.commentsByClient[clientId] = fresh;
      $("#comments-wrap").innerHTML = renderComments(fresh);
      const cc = $("#comment-count"); if (cc) cc.textContent = fresh.length;
      renderBoard();
    } catch (err) { console.error(err); toast("Nie udało się dodać komentarza"); }
  };
  $("#send-comment").addEventListener("click", send);
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
    if (e.key === "Enter") send();
  });
  inp.addEventListener("input", () => {
    const m = inp.value.slice(0, inp.selectionStart).match(/@([\wĄĆĘŁŃÓŚŹŻąćęłńóśźż]*)$/);
    if (!m) { pop.hidden = true; return; }
    const q = m[1].toLowerCase();
    const matches = state.team.filter((n) => n.toLowerCase().includes(q)).slice(0, 6);
    if (!matches.length) { pop.hidden = true; return; }
    pop.innerHTML = matches.map((n, i) => `<div class="mention-item ${i === 0 ? "active" : ""}" data-name="${esc(n)}"><span class="avatar" style="background:${ownerColor(n)}">${initials(n)}</span>${esc(n)}</div>`).join("");
    pop.hidden = false;
    pop.querySelectorAll(".mention-item").forEach((it) => it.addEventListener("click", () => {
      const pos = inp.selectionStart;
      inp.value = inp.value.slice(0, pos).replace(/@([\wĄĆĘŁŃÓŚŹŻąćęłńóśźż]*)$/, "@" + it.dataset.name + " ") + inp.value.slice(pos);
      pop.hidden = true; inp.focus();
    }));
  });
}

async function doRequestDemo(id) {
  const c = state.clients.find((x) => String(x.id) === String(id));
  if (!c) return;
  c.demo_requested = true;
  try {
    await api.requestDemo(id);
    const row = $(".demo-row");
    if (row) row.innerHTML = `<span class="demo-flag">📩 Demo poproszone — Claude zrobi je po akceptacji Krzysztofa</span>`;
    renderBoard(); toast("Zgłoszono prośbę o demo");
  } catch (err) { console.error(err); toast("Nie udało się zgłosić"); }
}

async function askDeleteCard(id, btn) {
  const row = btn.parentElement;
  row.innerHTML = `<span class="confirm-del">Usunąć tę kartę na zawsze?</span>
     <button class="ghost-btn" id="del-no" style="margin-left:auto">Anuluj</button>
     <button class="primary-btn danger-btn" id="del-yes">Tak, usuń</button>`;
  $("#del-no").addEventListener("click", () => openModal(id));
  $("#del-yes").addEventListener("click", async () => {
    try {
      await api.deleteClient(id);
      state.clients = state.clients.filter((x) => String(x.id) !== String(id));
      delete state.commentsByClient[id];
      closeModal(); renderTabs(); renderBoard();
    } catch (err) { console.error(err); $(".confirm-del").textContent = "Nie udało się usunąć"; }
  });
}

function closeModal() { state.openCardId = null; $("#modal-overlay").hidden = true; $("#modal-body").innerHTML = ""; }

async function newCard(status) {
  const obj = { name: "Nowy klient", company: "", phone: "", email: "", google_maps: "", quality: "", status: status || "lead", follow_up: null, owner: state.currentUser, notes: "" };
  try { const saved = await api.addClient(obj); state.clients.push(saved); renderTabs(); renderBoard(); openModal(saved.id); }
  catch (err) { console.error(err); toast("Nie udało się dodać karty"); }
}

let toastTimer = null;
function toast(msg) {
  let t = $("#toast"); if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}
function flashSaved() { const w = $("#who"); if (w) { w.classList.add("saved"); setTimeout(() => w.classList.remove("saved"), 600); } }

/* ---------- Realtime → odśwież (debounced) ---------- */
let refreshTimer = null;
function scheduleRefresh() { clearTimeout(refreshTimer); refreshTimer = setTimeout(refreshData, 250); }
async function refreshData() {
  try {
    state.clients = await api.getClients();
    state.commentsByClient = await api.getAllComments();
    renderTabs(); renderBoard();
    if (state.openCardId && state.clients.some((c) => String(c.id) === String(state.openCardId))) {
      const wrap = $("#comments-wrap"); if (wrap) wrap.innerHTML = renderComments(state.commentsByClient[state.openCardId] || []);
    }
  } catch (err) { console.error("refresh", err); }
}

/* ---------- Start ---------- */
async function showApp() {
  $("#login-view").hidden = true; $("#app-view").hidden = false;
  $("#who").textContent = (state.live ? "" : "demo: ") + state.currentUser;
  $("#logout-btn").hidden = !state.live;
  state.clients = await api.getClients();
  state.commentsByClient = await api.getAllComments();
  renderTabs(); renderBoard();
  api.subscribe(scheduleRefresh);
}

const KNOWN_NAMES = { "krzychu.brzezi@gmail.com": "Krzysztof", "kozakiewicz.marceli@gmail.com": "Marceli" };
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
  $("#modal-overlay").addEventListener("click", (e) => { if (e.target.id === "modal-overlay") closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#modal-overlay").hidden) closeModal(); });
  const s = $("#search"); if (s) s.addEventListener("input", () => { state.search = s.value; renderBoard(); });
  const nb = $("#new-card-btn"); if (nb) nb.addEventListener("click", () => newCard("lead"));
}

async function init() {
  await api.init(); state.live = api.isLive(); wireChrome();
  if (!state.live) { $("#demo-banner").hidden = false; state.team = [...DEMO_OWNERS]; state.currentUser = "Krzysztof"; await showApp(); return; }
  $("#logout-btn").addEventListener("click", async () => { await api.signOut(); location.reload(); });
  const user = await api.getUser();
  if (user) { await loadTeamAndMe(user); await showApp(); }
  else {
    $("#login-view").hidden = false;
    $("#login-form").addEventListener("submit", async (e) => {
      e.preventDefault(); $("#login-error").textContent = "";
      try { await api.signIn($("#login-email").value.trim(), $("#login-password").value); const u = await api.getUser(); await loadTeamAndMe(u); await showApp(); }
      catch (err) { $("#login-error").textContent = "Błędny e-mail lub hasło."; }
    });
  }
}

/* ---------- DANE DEMO (fikcyjne) ---------- */
const DEMO_CLIENTS = [
  { id: "d1", name: "Jan Kowalski", company: "Stolarstwo Dębowy Las", phone: "+48 600 100 201", email: "kontakt@debowylas.pl", google_maps: "https://google.com/maps", quality: "wysoka", status: "zainteresowany", follow_up: "2026-06-23", owner: "Krzysztof", notes: "Ma znajomego co robi strony, ale drogo. Pokazujemy demo." },
  { id: "d2", name: "Marek Zieliński", company: "Auto-Serwis Zieliński", phone: "+48 600 100 202", email: "", google_maps: "", quality: "", status: "lead", follow_up: "2026-06-22", owner: "Krzysztof", notes: "" },
  { id: "d3", name: "Hydraulika Nowak", company: "Hydraulika Nowak", phone: "+48 600 100 204", email: "", google_maps: "", quality: "", status: "lead", follow_up: null, owner: "Marceli", notes: "" },
  { id: "d4", name: "Salon Bella", company: "Salon Fryzjerski Bella", phone: "+48 600 100 206", email: "", google_maps: "", quality: "", status: "umowiony", follow_up: "2026-06-25", owner: "Szymon", notes: "Spotkanie czwartek 17:00." },
  { id: "d5", name: "Kwiaciarnia Storczyk", company: "Kwiaciarnia Storczyk", phone: "+48 600 100 208", email: "", google_maps: "", quality: "", status: "oferta", follow_up: "2026-06-27", owner: "Piotr", notes: "Wysłana oferta." },
  { id: "d6", name: "Fit Klub Active", company: "Fit Klub Active", phone: "+48 600 100 209", email: "", google_maps: "", quality: "", status: "konwersja", follow_up: null, owner: "Krzysztof", notes: "PODPISANE." },
];
const DEMO_COMMENTS = {
  d1: [
    { author: "Marceli", body: "Dzwoniłem 19.06 — @Krzysztof weź follow-up, ma oddzwonić pon/wt.", created_at: "2026-06-19T10:00:00" },
    { author: "Krzysztof", body: "Spoko, biorę.", created_at: "2026-06-19T14:30:00" },
  ],
};

init();

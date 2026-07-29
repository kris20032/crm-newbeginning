/* ============================================================
   CRM Impulseo — LISTA WYSTAWIONYCH UMÓW
   Osobna podstrona CRM-u (menu „Umowy”). Pokazuje to, co widzi RLS:
   handlowiec swoje karty, admin wszystko — czyli nikt nie zobaczy tu
   umowy, której nie zobaczyłby na karcie klienta.

   Co można zrobić z wiersza:
     • pobrać PDF (to idzie do klienta i do Autenti),
     • pobrać DOCX (do poprawek; otwiera się w Google Docs),
     • „Popraw” — otwiera formularz z wypełnionymi danymi tej umowy i tworzy
       NOWĄ wersję. Starej nie ruszamy: raz wysłany plik musi zostać taki,
       jaki był. Poprzednia wersja zostaje na liście jako „zastąpiona”.
   ============================================================ */

const CFG = window.CRM_CONFIG || {};
const LIVE = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase);
const sb = LIVE ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY) : null;

const $ = (s) => document.querySelector(s);
const esc = (s) => (s == null ? "" : String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));

const WARIANTY = {
  rok_zgory:   { mies: 12, coMiesiac: false, label: "12 mies., z góry za rok" },
  rok_mies:    { mies: 12, coMiesiac: true,  label: "12 mies., co miesiąc" },
  polrok_mies: { mies: 6,  coMiesiac: true,  label: "6 mies., co miesiąc" },
};

// te same wzory co w formularzu i w generatorze PDF — liczymy w groszach
const bruttoGr = (ng) => Math.round(ng * 123 / 100);
const gr = (v) => Math.round(Number(v || 0) * 100);
const zGroszy = (g) => Math.floor(g / 100).toLocaleString("pl-PL") + "," + String(g % 100).padStart(2, "0");
const zl = (g) => zGroszy(g) + " zł";

const dataGodz = (d) => (d ? new Date(d).toLocaleString("pl-PL",
  { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

let umowy = [];
let zastapione = new Set();     // id umów, które doczekały się poprawionej wersji

function gate(msg) {
  $("#l-gate-msg").textContent = msg;
  $("#l-gate-btn").onclick = () => { location.href = "index.html"; };
  $("#l-gate").hidden = false;
  $("#l-app").hidden = true;
}

async function start() {
  if (!LIVE) return gate("Brak połączenia z bazą (config.js).");
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return gate("Zaloguj się najpierw w CRM.");

  const { data, error } = await sb.from("contracts")
    .select("*, clients(name, company)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("umowy", error);
    return gate(error.code === "42P01"
      ? "Umowy nie są jeszcze włączone w bazie."
      : "Nie udało się wczytać umów: " + (error.message || ""));
  }

  umowy = data || [];
  zastapione = new Set(umowy.map((u) => u.zastepuje_id).filter(Boolean).map(String));
  $("#l-app").hidden = false;
  $("#l-sub").textContent = umowy.length
    ? `${umowy.length} ${umowy.length === 1 ? "umowa" : (umowy.length < 5 ? "umowy" : "umów")} — najnowsze na górze.`
    : "";
  $("#l-search").addEventListener("input", rysuj);
  rysuj();
}

function rysuj() {
  const szukaj = ($("#l-search").value || "").trim().toLowerCase();
  const widoczne = szukaj
    ? umowy.filter((u) => [u.klient_nazwa, u.klient_nip, u.created_by,
        u.clients && (u.clients.company || u.clients.name)]
        .filter(Boolean).join(" ").toLowerCase().includes(szukaj))
    : umowy;

  if (!widoczne.length) {
    $("#l-lista").innerHTML = `<div class="l-pusto">${umowy.length
      ? "Nic nie pasuje do wyszukiwania."
      : "Nie ma jeszcze żadnej umowy. Umowę wystawia się z karty klienta, przyciskiem „Stwórz umowę”."}</div>`;
    return;
  }

  $("#l-lista").innerHTML = widoczne.map(wiersz).join("");

  $("#l-lista").querySelectorAll("[data-plik]").forEach((b) => {
    b.addEventListener("click", async () => {
      const stary = b.textContent;
      b.textContent = "otwieram…";
      try {
        const { data, error } = await sb.storage.from("umowy").createSignedUrl(b.dataset.plik, 3600);
        if (error || !data) throw error || new Error("brak linku");
        window.open(data.signedUrl, "_blank", "noopener");
      } catch (e) {
        console.error("link do pliku", e);
        b.insertAdjacentHTML("afterend", `<span class="l-blad">nie udało się otworzyć pliku</span>`);
      }
      b.textContent = stary;
    });
  });
}

function wiersz(u) {
  const w = WARIANTY[u.abonament] || WARIANTY.rok_mies;
  const s = gr(u.kwota_strona), a = gr(u.kwota_abon);
  const zaOkres = a * w.mies;
  const stara = zastapione.has(String(u.id));
  const naKarcie = u.clients ? (u.clients.company || u.clients.name || "") : "";

  const stan = u.status === "ready" ? `<span class="l-stan ready">gotowa</span>`
             : u.status === "error" ? `<span class="l-stan error">nie wyszła</span>`
             : `<span class="l-stan pending">składa się…</span>`;

  const akcje = [];
  if (u.status === "ready" && u.pdf_path)
    akcje.push(`<button type="button" class="primary-btn" data-plik="${esc(u.pdf_path)}">PDF</button>`);
  if (u.status === "ready" && u.docx_path)
    akcje.push(`<button type="button" class="ghost-btn" data-plik="${esc(u.docx_path)}">DOCX</button>`);
  akcje.push(`<a class="ghost-btn" href="umowa.html?client=${encodeURIComponent(u.client_id)}&from=${u.id}">Popraw i wygeneruj od nowa</a>`);
  akcje.push(`<a class="ghost-btn" href="index.html?card=${encodeURIComponent(u.client_id)}">Karta klienta</a>`);

  return `
    <div class="l-card ${stara ? "l-stara" : ""}">
      <div class="l-head">
        <div>
          <div class="l-firma">${esc(u.klient_nazwa)} ${stan}
            ${stara ? `<span class="l-plakietka">zastąpiona nowszą wersją</span>` : ""}
            ${u.zastepuje_id ? `<span class="l-plakietka">poprawka umowy nr ${u.zastepuje_id}</span>` : ""}</div>
          <div class="l-meta">nr ${u.id} · NIP ${esc(u.klient_nip)}${naKarcie && naKarcie !== u.klient_nazwa ? ` · karta: ${esc(naKarcie)}` : ""}</div>
        </div>
        <div class="l-meta">${esc(u.created_by)} · ${dataGodz(u.created_at)}</div>
      </div>
      <div class="l-kwoty">
        <span class="etk">Strona:</span> <b>${zl(s)}</b> netto / ${zl(bruttoGr(s))} brutto &nbsp;·&nbsp;
        <span class="etk">Utrzymanie:</span> <b>${zl(a)}</b> netto/mies. (${w.label})${
          w.coMiesiac ? "" : ` &nbsp;·&nbsp; <span class="etk">za rok z góry:</span> <b>${zl(zaOkres)}</b> netto / ${zl(bruttoGr(zaOkres))} brutto`}
        <br><span class="etk">Podstron:</span> ${u.liczba_podstron || 4} &nbsp;·&nbsp;
        <span class="etk">Podpisuje:</span> ${u.nasz_repr === "marceli" ? "Marceli" : "Krzysztof"}
        ${u.status === "error" ? `<br><span class="l-blad">${esc(u.error_msg || "")}</span>` : ""}
      </div>
      <div class="l-akcje">${akcje.join("")}</div>
    </div>`;
}

start().catch((e) => { console.error(e); gate("Coś poszło nie tak: " + e.message); });

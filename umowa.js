/* ============================================================
   CRM Impulseo — FORMULARZ UMOWY
   Wchodzi się tu z karty klienta (przycisk „Stwórz umowę”), więc adres
   zawsze ma ?client=<id>. Zalogowanie dziedziczymy z CRM-u (ta sama
   domena = ta sama sesja Supabase), handlowiec niczego nie wpisuje drugi raz.

   Co robi:
     1. wczytuje kartę klienta i wypełnia z niej, co się da
        (nazwa firmy, e-mail, kwoty z zakładki „Usługi”),
     2. przyjmuje resztę (adres, NIP, wariant abonamentu),
     3. zapisuje umowę w tabeli contracts (to baza sprawdza uprawnienia, nie ten plik),
     4. czeka, aż automat na Macu odłoży PDF, i podaje link.

   Kto co widzi pilnuje baza (schema-umowy.sql), nie ten plik.
   ============================================================ */

const CFG = window.CRM_CONFIG || {};
const LIVE = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase);
const sb = LIVE ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY) : null;

const $ = (s) => document.querySelector(s);
const clientId = new URLSearchParams(location.search).get("client");

const WARIANTY = {
  rok_zgory:   { mies: 12, platneCoMiesiac: false, label: "12 miesięcy, płatne z góry za rok" },
  rok_mies:    { mies: 12, platneCoMiesiac: true,  label: "12 miesięcy, co miesiąc" },
  polrok_mies: { mies: 6,  platneCoMiesiac: true,  label: "6 miesięcy, co miesiąc" },
};
const PODPISY = { krzysztof: "Krzysztof Brzeziński", marceli: "Marceli Kozakiewicz" };

let klient = null;      // wiersz z tabeli clients
let mojeImie = "";      // imię z team_members — tym podpisujemy wpis w bazie
let umowaId = null;     // id wiersza w contracts po wysłaniu

/* ---------- drobiazgi ---------- */
const zl = (v) => (Number(v) || 0).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " zł";
const brutto = (v) => Math.round((Number(v) || 0) * 123) / 100;

function gate(msg, wrocDoCrm) {
  $("#u-gate-msg").textContent = msg;
  $("#u-gate-btn").textContent = wrocDoCrm ? "Wróć do CRM" : "Zaloguj się";
  $("#u-gate-btn").onclick = () => { location.href = "index.html"; };
  $("#u-gate").hidden = false;
  $("#u-app").hidden = true;
}

function msg(text, zle) {
  const el = $("#u-msg");
  el.textContent = text || "";
  el.className = "u-msg" + (text ? (zle ? " bad" : " ok") : "");
}

/* ---------- podsumowanie kwot pod formularzem (żeby handlowiec widział, co podpisuje) ---------- */
function odswiezPodsumowanie() {
  const s = Number($("#f-strona").value) || 0;
  const a = Number($("#f-abon").value) || 0;
  const w = WARIANTY[$("#f-wariant").value] || WARIANTY.rok_mies;
  const mcDoZaplaty = w.platneCoMiesiac ? 1 : w.mies;
  const zaAbon = a * mcDoZaplaty;
  const opisAbon = w.platneCoMiesiac
    ? `${zl(a)} netto miesięcznie przez ${w.mies} mies.`
    : `${zl(zaAbon)} netto jednorazowo z góry (${mcDoZaplaty} mies. × ${zl(a)}), umowa na ${w.mies} mies.`;
  $("#u-sum").innerHTML =
    `Za stronę: <b>${zl(s)}</b> netto &nbsp;/&nbsp; <b>${zl(brutto(s))}</b> brutto<br>` +
    `Abonament: ${opisAbon}<br>` +
    `Na start klient płaci: <b>${zl(brutto(s) + (w.platneCoMiesiac ? 0 : brutto(zaAbon)))}</b> brutto`;
}

/* ---------- start ---------- */
async function start() {
  if (!LIVE) return gate("Brak połączenia z bazą (config.js). Umowy działają tylko na żywo.", true);
  if (!clientId) return gate("Ten adres trzeba otworzyć z karty klienta — przyciskiem „Stwórz umowę”.", true);

  const { data: { session } } = await sb.auth.getSession();
  if (!session) return gate("Zaloguj się najpierw w CRM, potem wróć na kartę klienta.", false);

  // moje imię — takie samo, jakim podpisują się komentarze
  const { data: me } = await sb.from("team_members").select("name").eq("email", session.user.email).maybeSingle();
  mojeImie = (me && me.name) || "";
  if (!mojeImie) return gate("Twoje konto nie jest jeszcze w zespole. Wejdź raz do CRM, to się doda samo.", true);

  // karta klienta — jeśli RLS jej nie pokaże, znaczy że nie jest twoja
  const { data: c, error } = await sb.from("clients").select("*").eq("id", clientId).maybeSingle();
  if (error || !c) return gate("Nie widzę tej karty klienta. Umowę tworzy handlowiec, do którego karta należy.", true);
  klient = c;

  $("#u-back").href = "index.html?card=" + encodeURIComponent(clientId);
  $("#u-back2").href = $("#u-back").href;
  $("#u-for").textContent = "Dla: " + (c.company || c.name || "—") + (c.company && c.name ? ` (${c.name})` : "");

  wypelnijZKarty(c);
  $("#u-app").hidden = false;

  ["#f-strona", "#f-abon", "#f-wariant"].forEach((s) => {
    $(s).addEventListener("input", odswiezPodsumowanie);
    $(s).addEventListener("change", odswiezPodsumowanie);
  });
  odswiezPodsumowanie();
  $("#u-form").addEventListener("submit", wyslij);
}

/* ---------- co da się wziąć z karty, bierzemy z karty ---------- */
function wypelnijZKarty(c) {
  $("#f-nazwa").value = c.company || c.name || "";
  $("#f-email").value = c.email || "";

  const sv = c.services || {};
  const strona = sv.strona || {};
  const obsluga = sv.obsluga || {};
  $("#f-strona").value = (strona.price === 0 || strona.price) ? strona.price : "";
  $("#f-abon").value = (obsluga.price === 0 || obsluga.price) ? obsluga.price : 49;

  // okres z zakładki „Usługi” podpowiada wariant; handlowiec i tak może zmienić
  const okres = obsluga.period || "";
  $("#f-wariant").value = okres === "6m" ? "polrok_mies" : "rok_zgory";

  // domyślnie podpisuje Krzysztof; Marceli, gdy sam wystawia umowę
  $("#f-podpis").value = mojeImie === "Marceli" ? "marceli" : "krzysztof";
}

/* ---------- walidacja: tylko to, co naprawdę psuje umowę ---------- */
function zlePole(el, powod) {
  el.classList.add("bad");
  el.focus();
  msg(powod, true);
  return false;
}
// NIP ma wbudowaną cyfrę kontrolną — dzięki niej literówka („5831234576" zamiast
// „5831234567") wychodzi OD RAZU, a nie dopiero u klienta na podpisanej umowie.
// Ostatnia cyfra = reszta z dzielenia ważonej sumy dziewięciu pierwszych przez 11.
function nipPoprawny(nip) {
  if (!/^\d{10}$/.test(nip)) return false;
  const wagi = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const suma = wagi.reduce((s, w, i) => s + w * Number(nip[i]), 0);
  const kontrolna = suma % 11;
  return kontrolna !== 10 && kontrolna === Number(nip[9]);
}

function sprawdz() {
  document.querySelectorAll(".bad").forEach((e) => e.classList.remove("bad"));
  const nip = $("#f-nip").value.replace(/[\s-]/g, "");
  if (!/^\d{10}$/.test(nip)) return zlePole($("#f-nip"), "NIP ma mieć 10 cyfr.");
  if (!nipPoprawny(nip)) return zlePole($("#f-nip"), "Ten NIP nie istnieje — sprawdź, czy nie ma literówki.");
  const krs = $("#f-krs").value.replace(/[\s-]/g, "");
  if (krs && !/^\d{1,10}$/.test(krs)) return zlePole($("#f-krs"), "KRS to same cyfry (albo zostaw puste).");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test($("#f-email").value.trim())) return zlePole($("#f-email"), "Sprawdź adres e-mail.");
  if (!(Number($("#f-strona").value) > 0)) return zlePole($("#f-strona"), "Wpisz kwotę za stronę.");
  if (!(Number($("#f-abon").value) >= 0)) return zlePole($("#f-abon"), "Wpisz kwotę abonamentu.");
  return true;
}

/* ---------- wysyłka ---------- */
async function wyslij(e) {
  e.preventDefault();
  if (!sprawdz()) return;

  const btn = $("#u-submit");
  btn.disabled = true;
  msg("Wysyłam...", false);

  const dane = {
    client_id:    clientId,
    created_by:   mojeImie,          // baza i tak pilnuje, że to MOJE imię
    klient_nazwa: $("#f-nazwa").value.trim(),
    klient_adres: $("#f-adres").value.trim(),
    klient_nip:   $("#f-nip").value.replace(/[\s-]/g, ""),
    klient_krs:   $("#f-krs").value.replace(/[\s-]/g, ""),
    klient_email: $("#f-email").value.trim(),
    klient_repr:  $("#f-repr").value.trim(),
    kwota_strona: Number($("#f-strona").value),
    kwota_abon:   Number($("#f-abon").value),
    abonament:    $("#f-wariant").value,
    nasz_repr:    $("#f-podpis").value,
  };

  // Zapis prosto do tabeli. Kto może i na czyjej karcie — rozstrzyga RLS
  // (schema-umowy.sql), więc nie ma czego omijać po stronie przeglądarki.
  const { data, error } = await sb.from("contracts").insert(dane).select("id").single();
  if (error || !data) {
    console.error("zapis umowy", error);
    btn.disabled = false;
    msg(czytelnyBlad(error), true);
    return;
  }
  umowaId = data.id;

  pokazPodglad(dane);
  $("#u-form").hidden = true;
  $("#u-after").hidden = false;
  czekajNaPdf();
}

function czytelnyBlad(err) {
  const kod = (err && err.code) || "";
  const t = String((err && (err.message || err.error)) || err);
  if (kod === "42P01") return "Umowy nie są jeszcze włączone w bazie. Daj znać Krzysztofowi.";
  if (kod === "42501" || /row-level|permission|forbidden/i.test(t))
    return "Nie masz uprawnień do tworzenia umowy na tej karcie — umowę wystawia handlowiec, do którego karta należy.";
  if (/Failed to fetch|NetworkError/i.test(t)) return "Brak połączenia — sprawdź internet i spróbuj jeszcze raz.";
  return "Nie udało się: " + t;
}

function pokazPodglad(d) {
  const w = WARIANTY[d.abonament];
  const wiersze = [
    ["Klient", d.klient_nazwa],
    ["Adres", d.klient_adres],
    ["NIP", d.klient_nip],
    d.klient_krs ? ["KRS", d.klient_krs] : null,
    ["E-mail", d.klient_email],
    d.klient_repr ? ["Reprezentant", d.klient_repr] : null,
    ["Za stronę", zl(d.kwota_strona) + " netto"],
    ["Abonament", zl(d.kwota_abon) + " netto / mies."],
    ["Okres", w.label],
    ["Podpisuje", PODPISY[d.nasz_repr]],
  ].filter(Boolean);
  $("#u-prev").innerHTML = wiersze
    .map(([k, v]) => `<li><span class="k">${k}</span><span class="v">${String(v).replace(/[<>&]/g, "")}</span></li>`)
    .join("");
}

/* ---------- czekanie na PDF ----------
   Automat ma około minuty. Pytamy co 4 s, poddajemy się po 5 minutach —
   ale nawet wtedy plik może dojść później i pokaże się na karcie klienta. */
async function czekajNaPdf() {
  const doKiedy = Date.now() + 5 * 60 * 1000;
  while (Date.now() < doKiedy) {
    await new Promise((r) => setTimeout(r, 4000));
    const { data } = await sb.from("contracts").select("status, pdf_path, error_msg").eq("id", umowaId).maybeSingle();
    if (!data) continue;
    if (data.status === "ready" && data.pdf_path) {
      const { data: link } = await sb.storage.from("umowy").createSignedUrl(data.pdf_path, 3600);
      $("#u-waiting").hidden = true;
      $("#u-ready").hidden = false;
      $("#u-pdf").href = (link && link.signedUrl) || "#";
      return;
    }
    if (data.status === "error") {
      $("#u-waiting").hidden = true;
      $("#u-failed").hidden = false;
      $("#u-failed").textContent = "Automat nie dał rady złożyć PDF-a: " + (data.error_msg || "nieznany błąd") +
        ". Dane umowy są zapisane — daj znać Krzysztofowi, da się powtórzyć bez wpisywania od nowa.";
      return;
    }
  }
  $("#u-waiting").innerHTML =
    "Automat marudzi dłużej niż zwykle. Dane są zapisane — gotowy PDF pojawi się na karcie klienta, " +
    "nawet jeśli zamkniesz tę stronę.";
}

start().catch((e) => { console.error(e); gate("Coś poszło nie tak: " + e.message, true); });

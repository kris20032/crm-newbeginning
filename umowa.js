/* ============================================================
   CRM Impulseo — FORMULARZ UMOWY
   Wchodzi się tu z karty klienta (przycisk „Stwórz umowę”), więc adres
   zawsze ma ?client=<id>. Zalogowanie dziedziczymy z CRM-u (ta sama
   domena = ta sama sesja Supabase), handlowiec niczego nie wpisuje drugi raz.

   Co robi:
     1. wczytuje kartę klienta i wypełnia z niej, co się da
        (nazwa firmy, e-mail, kwoty z zakładki „Usługi”),
     2. przyjmuje resztę (adres, NIP, kwoty, liczba podstron, wariant),
     3. zapisuje umowę w tabeli contracts (to baza sprawdza uprawnienia, nie ten plik),
     4. czeka, aż automat na Macu odłoży PDF i DOCX, i podaje linki.

   Adres ?from=<id umowy> = POPRAWIANIE istniejącej umowy: pola wypełniają się
   danymi tamtej, a wynikiem jest NOWA umowa wskazująca na poprzednią. Starej
   nie nadpisujemy — plik, który już gdzieś poszedł, nigdy nie może się zmienić.

   Kto co widzi pilnuje baza (schema-umowy.sql), nie ten plik.
   ============================================================ */

const CFG = window.CRM_CONFIG || {};
const LIVE = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase);
const sb = LIVE ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY) : null;

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const clientId = params.get("client");
const zUmowy = params.get("from");        // poprawiamy istniejącą umowę

const WARIANTY = {
  rok_zgory:   { mies: 12, platneCoMiesiac: false, label: "12 miesięcy, płatne z góry za rok" },
  rok_mies:    { mies: 12, platneCoMiesiac: true,  label: "12 miesięcy, co miesiąc" },
  polrok_mies: { mies: 6,  platneCoMiesiac: true,  label: "6 miesięcy, co miesiąc" },
};
const PODPISY = {
  krzysztof: "Krzysztof Brzeziński, Prezes Zarządu",
  marceli:   "Marceli Kozakiewicz, Członek Zarządu",
};
const MAX_PODSTRON = 10;

let klient = null;      // wiersz z tabeli clients
let mojeImie = "";      // imię z team_members — tym podpisujemy wpis w bazie
let umowaId = null;     // id wiersza w contracts po wysłaniu
let poprawiana = null;  // wiersz umowy, którą poprawiamy (tryb ?from=)

/* ============================================================
   PIENIĄDZE
   Wszystko liczymy w GROSZACH (liczby całkowite). Ułamki dziesiętne w
   komputerze bywają „prawie równe” (0,1 + 0,2 = 0,30000000000000004), więc
   liczenie na złotówkach potrafi zgubić grosz. Te same wzory są w generatorze
   PDF (umowa_wypelnij.py) — sprawdzone na 2 mln kwot, zero różnic.
   ============================================================ */
const bruttoGr = (ng) => Math.round(ng * 123 / 100);
const nettoGr  = (bg) => Math.round(bg * 100 / 123);

// „1 363,22” / „1363.22” / „1363” -> 136322 groszy. Zwraca null, gdy to nie liczba.
function naGrosze(txt) {
  const s = String(txt == null ? "" : txt).replace(/[\s ]/g, "").replace(",", ".");
  if (!s) return null;
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const [c, u = ""] = s.split(".");
  return Number(c) * 100 + Number((u + "00").slice(0, 2));
}
// 136322 -> „1 363,22”
function zGroszy(gr) {
  const zl = Math.floor(gr / 100), gs = String(gr % 100).padStart(2, "0");
  return zl.toLocaleString("pl-PL") + "," + gs;
}
const zlG = (gr) => zGroszy(gr) + " zł";

/* ---------- drobiazgi ---------- */
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

/* ============================================================
   PARA PÓL NETTO ⇄ BRUTTO
   Oba pola są do wpisania. Wpisujesz w jedno — drugie przelicza się od razu,
   w tym samym miejscu, bez klikania.

   Jedna rzecz, która potrafi zaskoczyć: przy VAT 23% NIE KAŻDA okrągła kwota
   brutto jest osiągalna. Równe 3 000,00 zł brutto nie wychodzi z żadnej kwoty
   netto (najbliżej: 2 999,99). Zamiast po cichu wpisać do umowy kwotę, która
   nie zgadza się z VAT-em, poprawiamy pole i mówimy o tym wprost.
   ============================================================ */
function paraKwot(idNetto, idBrutto, idNotki, poZmianie) {
  const n = $(idNetto), b = $(idBrutto), notka = $(idNotki);
  let ostatnio = "netto";              // w które pole handlowiec pisał ostatnio

  const pokazNotke = (txt) => {
    notka.textContent = txt || "";
    notka.hidden = !txt;
  };

  n.addEventListener("input", () => {
    ostatnio = "netto";
    const gr = naGrosze(n.value);
    b.value = gr == null ? "" : zGroszy(bruttoGr(gr));
    pokazNotke("");
    poZmianie();
  });

  b.addEventListener("input", () => {
    ostatnio = "brutto";
    const gr = naGrosze(b.value);
    n.value = gr == null ? "" : zGroszy(nettoGr(gr));
    pokazNotke("");
    poZmianie();
  });

  // wyjście z pola: ładny zapis + uczciwa korekta nieosiągalnej kwoty brutto
  const domknij = () => {
    const gn = naGrosze(n.value);
    if (gn == null) { poZmianie(); return; }
    if (ostatnio === "brutto") {
      const chciane = naGrosze(b.value);
      const realne = bruttoGr(gn);
      pokazNotke(chciane != null && chciane !== realne
        ? `Przy VAT 23% nie da się uzyskać równo ${zlG(chciane)} brutto — najbliżej jest ${zlG(realne)}. Tyle wchodzi do umowy.`
        : "");
    }
    n.value = zGroszy(gn);
    b.value = zGroszy(bruttoGr(gn));
    poZmianie();
  };
  n.addEventListener("blur", domknij);
  b.addEventListener("blur", domknij);

  return {
    ustaw(gr) {                        // wypełnienie z karty klienta / z poprawianej umowy
      if (gr == null) { n.value = ""; b.value = ""; return; }
      n.value = zGroszy(gr);
      b.value = zGroszy(bruttoGr(gr));
    },
    grosze() { return naGrosze(n.value); },
  };
}

let kwotaStrona, kwotaAbon;

/* ---------- podsumowanie pod formularzem (żeby handlowiec widział, co podpisuje) ---------- */
function odswiezPodsumowanie() {
  const s = kwotaStrona.grosze() || 0;
  const a = kwotaAbon.grosze() || 0;
  const w = WARIANTY[$("#f-wariant").value] || WARIANTY.rok_mies;
  const zaOkres = a * w.mies;

  const linie = [
    `Za stronę: <b>${zlG(s)}</b> netto &nbsp;/&nbsp; <b>${zlG(bruttoGr(s))}</b> brutto`,
    w.platneCoMiesiac
      ? `Utrzymanie: <b>${zlG(a)}</b> netto (<b>${zlG(bruttoGr(a))}</b> brutto) miesięcznie przez ${w.mies} mies.`
      : `Utrzymanie: <b>${zlG(a)}</b> netto miesięcznie, płatne z góry za ${w.mies} mies. ` +
        `= <b>${zlG(zaOkres)}</b> netto (<b>${zlG(bruttoGr(zaOkres))}</b> brutto)`,
  ];
  const naStart = bruttoGr(s) + (w.platneCoMiesiac ? 0 : bruttoGr(zaOkres));
  linie.push(`<span class="razem">Na start klient płaci: <b>${zlG(naStart)}</b> brutto</span>`);
  $("#u-sum").innerHTML = linie.join("<br>");
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

  // lista „ile podstron” — 4 to standard tego, co realnie buduje silnik stron
  $("#f-podstron").innerHTML = Array.from({ length: MAX_PODSTRON }, (_, i) =>
    `<option value="${i + 1}">${i + 1}</option>`).join("");

  kwotaStrona = paraKwot("#f-strona", "#f-strona-b", "#f-strona-note", odswiezPodsumowanie);
  kwotaAbon   = paraKwot("#f-abon",   "#f-abon-b",   "#f-abon-note",   odswiezPodsumowanie);

  if (zUmowy) await wypelnijZUmowy(zUmowy);
  else wypelnijZKarty(c);

  $("#u-app").hidden = false;
  ["#f-wariant", "#f-podstron"].forEach((s) => $(s).addEventListener("change", odswiezPodsumowanie));
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
  kwotaStrona.ustaw(naGrosze(strona.price));
  kwotaAbon.ustaw(naGrosze(obsluga.price) ?? 4900);

  // okres z zakładki „Usługi” podpowiada wariant; handlowiec i tak może zmienić
  const okres = obsluga.period || "";
  $("#f-wariant").value = okres === "6m" ? "polrok_mies" : "rok_zgory";
  $("#f-podstron").value = "4";

  // domyślnie podpisuje Krzysztof; Marceli, gdy sam wystawia umowę
  $("#f-podpis").value = mojeImie === "Marceli" ? "marceli" : "krzysztof";
}

/* ---------- poprawianie istniejącej umowy (?from=<id>) ---------- */
async function wypelnijZUmowy(id) {
  const { data: u } = await sb.from("contracts").select("*").eq("id", id).maybeSingle();
  if (!u || String(u.client_id) !== String(clientId)) {   // cudza albo z innej karty
    wypelnijZKarty(klient);
    return;
  }
  poprawiana = u;
  $("#u-tytul").textContent = "Popraw umowę";
  $("#u-wersja").hidden = false;
  $("#u-wersja").innerHTML =
    `Poprawiasz umowę nr ${u.id} z ${new Date(u.created_at).toLocaleDateString("pl-PL")}. ` +
    `Powstanie <b>nowa wersja</b> — poprzednia zostaje w historii i nie zmienia się ` +
    `(link, który już gdzieś poszedł, dalej działa).`;
  $("#u-submit").textContent = "Wygeneruj poprawioną umowę";

  $("#f-nazwa").value = u.klient_nazwa || "";
  $("#f-adres").value = u.klient_adres || "";
  $("#f-nip").value   = u.klient_nip || "";
  $("#f-krs").value   = u.klient_krs || "";
  $("#f-email").value = u.klient_email || "";
  $("#f-repr").value  = u.klient_repr || "";
  kwotaStrona.ustaw(naGrosze(u.kwota_strona));
  kwotaAbon.ustaw(naGrosze(u.kwota_abon));
  $("#f-wariant").value  = u.abonament || "rok_zgory";
  $("#f-podstron").value = String(Math.min(u.liczba_podstron || 4, MAX_PODSTRON));
  $("#f-podpis").value   = u.nasz_repr || "krzysztof";
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
  if (!$("#f-nazwa").value.trim()) return zlePole($("#f-nazwa"), "Wpisz nazwę klienta.");
  if (!$("#f-adres").value.trim()) return zlePole($("#f-adres"), "Wpisz adres siedziby.");
  const nip = $("#f-nip").value.replace(/[\s-]/g, "");
  if (!/^\d{10}$/.test(nip)) return zlePole($("#f-nip"), "NIP ma mieć 10 cyfr.");
  if (!nipPoprawny(nip)) return zlePole($("#f-nip"), "Ten NIP nie istnieje — sprawdź, czy nie ma literówki.");
  const krs = $("#f-krs").value.replace(/[\s-]/g, "");
  if (krs && !/^\d{1,10}$/.test(krs)) return zlePole($("#f-krs"), "KRS to same cyfry (albo zostaw puste).");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test($("#f-email").value.trim())) return zlePole($("#f-email"), "Sprawdź adres e-mail.");
  const s = kwotaStrona.grosze();
  if (!(s > 0)) return zlePole($("#f-strona"), "Wpisz kwotę za stronę.");
  const a = kwotaAbon.grosze();
  if (a == null) return zlePole($("#f-abon"), "Wpisz kwotę za utrzymanie (może być 0).");
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
    kwota_strona: kwotaStrona.grosze() / 100,
    kwota_abon:   kwotaAbon.grosze() / 100,
    liczba_podstron: Number($("#f-podstron").value),
    abonament:    $("#f-wariant").value,
    nasz_repr:    $("#f-podpis").value,
  };
  if (poprawiana) dane.zastepuje_id = poprawiana.id;

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
  $("#u-wersja").hidden = true;
  $("#u-after").hidden = false;
  czekajNaPliki();
}

function czytelnyBlad(err) {
  const kod = (err && err.code) || "";
  const t = String((err && (err.message || err.error)) || err);
  if (kod === "42P01") return "Umowy nie są jeszcze włączone w bazie. Daj znać Krzysztofowi.";
  if (kod === "42703") return "Baza nie ma jeszcze nowych pól umowy (podstrony). Daj znać Krzysztofowi.";
  if (kod === "42501" || /row-level|permission|forbidden/i.test(t))
    return "Nie masz uprawnień do tworzenia umowy na tej karcie — umowę wystawia handlowiec, do którego karta należy.";
  if (/Failed to fetch|NetworkError/i.test(t)) return "Brak połączenia — sprawdź internet i spróbuj jeszcze raz.";
  return "Nie udało się: " + t;
}

function pokazPodglad(d) {
  const w = WARIANTY[d.abonament];
  const s = Math.round(d.kwota_strona * 100), a = Math.round(d.kwota_abon * 100);
  const wiersze = [
    ["Klient", d.klient_nazwa],
    ["Adres", d.klient_adres],
    ["NIP", d.klient_nip],
    d.klient_krs ? ["KRS", d.klient_krs] : null,
    ["E-mail", d.klient_email],
    d.klient_repr ? ["Reprezentant", d.klient_repr] : null,
    ["Za stronę", `${zlG(s)} netto / ${zlG(bruttoGr(s))} brutto`],
    ["Utrzymanie", `${zlG(a)} netto / ${zlG(bruttoGr(a))} brutto mies.`],
    w.platneCoMiesiac ? null : ["Za cały okres", `${zlG(a * w.mies)} netto / ${zlG(bruttoGr(a * w.mies))} brutto`],
    ["Okres", w.label],
    ["Podstron", String(d.liczba_podstron)],
    ["Podpisuje", PODPISY[d.nasz_repr]],
  ].filter(Boolean);
  $("#u-prev").innerHTML = wiersze
    .map(([k, v]) => `<li><span class="k">${k}</span><span class="v">${String(v).replace(/[<>&]/g, "")}</span></li>`)
    .join("");
}

/* ---------- czekanie na pliki ----------
   Automat ma około minuty. Pytamy co 4 s, poddajemy się po 5 minutach —
   ale nawet wtedy pliki mogą dojść później i pokażą się na karcie klienta. */
async function czekajNaPliki() {
  const doKiedy = Date.now() + 5 * 60 * 1000;
  while (Date.now() < doKiedy) {
    await new Promise((r) => setTimeout(r, 4000));
    const { data } = await sb.from("contracts")
      .select("status, pdf_path, docx_path, error_msg").eq("id", umowaId).maybeSingle();
    if (!data) continue;
    if (data.status === "ready" && data.pdf_path) {
      $("#u-waiting").hidden = true;
      $("#u-ready").hidden = false;
      $("#u-pdf").href = await link(data.pdf_path);
      if (data.docx_path) $("#u-docx").href = await link(data.docx_path);
      else $("#u-docx").hidden = true;
      return;
    }
    if (data.status === "error") {
      $("#u-waiting").hidden = true;
      $("#u-failed").hidden = false;
      $("#u-failed").textContent = "Automat nie dał rady złożyć umowy: " + (data.error_msg || "nieznany błąd") +
        ". Dane umowy są zapisane — daj znać Krzysztofowi, da się powtórzyć bez wpisywania od nowa.";
      return;
    }
  }
  $("#u-waiting").innerHTML =
    "Automat marudzi dłużej niż zwykle. Dane są zapisane — gotowe pliki pojawią się na karcie klienta, " +
    "nawet jeśli zamkniesz tę stronę.";
}

// pliki leżą w prywatnym buckecie — link ważny godzinę, wystawiany na żądanie
async function link(sciezka) {
  const { data } = await sb.storage.from("umowy").createSignedUrl(sciezka, 3600);
  return (data && data.signedUrl) || "#";
}

start().catch((e) => { console.error(e); gate("Coś poszło nie tak: " + e.message, true); });

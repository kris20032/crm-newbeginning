/* ============================================================
   CRM Impulseo — WYSTAWIENIE ZAMÓWIENIA (checkout)

   Wchodzi się tu z karty klienta (?client=<id>), tak samo jak w formularz
   umowy. Różnica jest zasadnicza: umowa idzie do podpisu, a zamówienie
   ZASTĘPUJE podpis — klient akceptuje regulamin i płaci, i to jest zawarcie
   umowy. Dlatego ten formularz pilnuje dwóch rzeczy, których formularz umowy
   pilnować nie musiał:

     1. ZAKRES. Pozycje zamówienia zastępują §1 umowy. Opis pozycji to jedyne
        miejsce, w którym zapisuje się, co dokładnie klient kupił — puste
        opisy oznaczają, że w sporze nie ma czym wykazać zakresu.
     2. STATUS KONSUMENCKI. Spółce z KRS prawo odstąpienia nie przysługuje;
        JDG kupującej coś spoza swojej branży — tak. Od tej oceny zależy, czy
        klient zobaczy drugi checkbox i pouczenie o odstąpieniu.

   Zapis idzie przez Workera (platnosc.impulseo.pl), nie bezpośrednio do bazy:
   to on trzyma klucz serwisowy, tworzy płatność w Paynow i wysyła maila.
   Uprawnienie `orders.create` sprawdza baza, nie ten plik.
   ============================================================ */

const CFG = window.CRM_CONFIG || {};
const API = "https://platnosc.impulseo.pl";
const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const clientId = params.get("client");

let klient = null;
let mojeImie = "";

/* ── pieniądze: liczymy w groszach, żeby nie zgubić grosza na ułamkach ── */
const gr = (zl) => Math.round(Number(String(zl).replace(",", ".")) * 100);
const zl = (grosze) =>
  (grosze / 100).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d),)/g, " ");

/* ── pozycje ────────────────────────────────────────────────────────────── */

const POZYCJE_STARTOWE = [
  {
    nazwa: "Wykonanie strony internetowej",
    opis: "5 podstron, teksty i zdjęcia, wersja mobilna, formularz kontaktowy, jedna runda poprawek",
    rodzaj: "jednorazowa",
    kwota: "",
  },
  {
    nazwa: "Obsługa techniczna i utrzymanie",
    opis: "hosting, certyfikat SSL, kopie zapasowe, drobne poprawki · 49 zł netto/mies.",
    rodzaj: "ciagla",
    okres: 12,
    kwota: "",
  },
];

function wierszPozycji(p = {}) {
  const el = document.createElement("div");
  el.className = "z-poz";
  el.innerHTML = `
    <div class="z-poz-top">
      <select class="p-rodzaj">
        <option value="jednorazowa">jednorazowa</option>
        <option value="ciagla">ciągła</option>
      </select>
      <input class="p-okres" type="number" min="1" max="36" placeholder="mies." style="width:88px" hidden />
      <button type="button" class="z-poz-usun" title="Usuń pozycję">×</button>
    </div>
    <div class="u-field"><label>Nazwa</label><input class="p-nazwa" required /></div>
    <div class="u-field">
      <label>Zakres — co dokładnie obejmuje</label>
      <textarea class="p-opis" required></textarea>
      <p class="u-hint">To zastępuje §1 umowy. Napisz konkretnie: ile podstron, co wchodzi, ile poprawek.</p>
    </div>
    <div class="u-field u-money-in">
      <label>Kwota brutto</label>
      <input class="p-kwota" inputmode="decimal" required />
      <span class="suf">zł</span>
    </div>`;

  el.querySelector(".p-nazwa").value = p.nazwa || "";
  el.querySelector(".p-opis").value = p.opis || "";
  el.querySelector(".p-kwota").value = p.kwota || "";
  const rodzaj = el.querySelector(".p-rodzaj");
  const okres = el.querySelector(".p-okres");
  rodzaj.value = p.rodzaj || "jednorazowa";
  okres.value = p.okres || 12;

  const przelacz = () => { okres.hidden = rodzaj.value !== "ciagla"; };
  rodzaj.addEventListener("change", przelacz);
  przelacz();

  el.querySelector(".z-poz-usun").addEventListener("click", () => { el.remove(); przeliczSume(); });
  el.querySelector(".p-kwota").addEventListener("input", przeliczSume);
  return el;
}

const czytajPozycje = () =>
  [...document.querySelectorAll(".z-poz")].map((el, i) => ({
    nazwa: el.querySelector(".p-nazwa").value.trim(),
    opis: el.querySelector(".p-opis").value.trim(),
    rodzaj: el.querySelector(".p-rodzaj").value,
    okres_miesiecy: el.querySelector(".p-rodzaj").value === "ciagla"
      ? Number(el.querySelector(".p-okres").value) || 12
      : null,
    kwota_brutto: Number((gr(el.querySelector(".p-kwota").value || 0) / 100).toFixed(2)),
    ord: i,
  }));

function przeliczSume() {
  const suma = czytajPozycje().reduce((s, p) => s + gr(p.kwota_brutto), 0);
  const netto = Math.round(suma / 1.23);
  $("#suma").className = "u-sum" + (suma > 0 ? "" : " bad");
  $("#suma").innerHTML = suma > 0
    ? `Do zapłaty: <b>${zl(suma)} zł</b> brutto &nbsp;·&nbsp; ${zl(netto)} zł netto + ${zl(suma - netto)} zł VAT (23%)`
    : "Wpisz kwoty pozycji.";
}

/* ── ocena statusu konsumenckiego ───────────────────────────────────────── */
/* Spółka z KRS: ochrona nie przysługuje. JDG: przysługuje, chyba że zakup ma
   dla niej charakter zawodowy (art. 7aa u.p.k. w zw. z art. 385(5) KC) — a
   strona internetowa ma taki charakter właściwie tylko dla branż, które nią
   żyją: IT, marketing, reklama. Ocenę i jej powód zapisujemy przy zamówieniu. */

const PKD_ZAWODOWE = ["58.2", "62.0", "63.1", "63.9", "73.1", "73.2", "74.1"];

function ocenaOchrony() {
  const forma = $("#f-forma").value;
  const pkd = $("#f-pkd").value.trim();
  if (forma === "spolka") {
    return { chroniony: false, powod: "Spółka wpisana do KRS — przepisy konsumenckie nie mają zastosowania." };
  }
  const zawodowe = PKD_ZAWODOWE.some((p) => pkd.startsWith(p));
  if (zawodowe) {
    return {
      chroniony: false,
      powod: `PKD ${pkd} obejmuje działalność informatyczną lub marketingową — zakup strony ma charakter zawodowy.`,
    };
  }
  return {
    chroniony: true,
    powod: pkd
      ? `PKD ${pkd} to inna branża — zakup strony nie ma charakteru zawodowego, stosujemy przepisy konsumenckie.`
      : "Jednoosobowa działalność, brak przesłanek charakteru zawodowego — stosujemy przepisy konsumenckie.",
  };
}

function odswiezOchrone() {
  const o = ocenaOchrony();
  const box = $("#ochrona-info");
  box.className = "z-ochrona " + (o.chroniony ? "tak" : "nie");
  box.innerHTML = o.chroniony
    ? `<b>Klient traktowany jak konsument.</b> Zobaczy drugi checkbox (żądanie rozpoczęcia prac) i pouczenie o 14-dniowym odstąpieniu. ${o.powod}`
    : `<b>Bez ochrony konsumenckiej.</b> Jeden checkbox, bez pouczenia o odstąpieniu. ${o.powod}`;
  if (!$("#f-uzasadnienie").value.trim() || $("#f-uzasadnienie").dataset.auto === "1") {
    $("#f-uzasadnienie").value = o.powod;
    $("#f-uzasadnienie").dataset.auto = "1";
  }
  $("#f-pkd").closest(".u-field").hidden = $("#f-forma").value === "spolka";
}

/* ── start ──────────────────────────────────────────────────────────────── */

async function start() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { location.href = "index.html"; return; }

  const { data: me } = await sb.from("team_members").select("name").eq("email", session.user.email).maybeSingle();
  mojeImie = (me && me.name) || session.user.email;

  if (clientId) {
    const { data } = await sb.from("clients").select("*").eq("id", clientId).maybeSingle();
    klient = data;
    $("#wroc").href = `index.html#klient-${clientId}`;
  }

  if (klient) {
    $("#f-nazwa").value = klient.company || klient.name || "";
    $("#f-email").value = klient.email || "";
    $("#f-nip").value = klient.nip || "";
    $("#podtytul").textContent = `Zamówienie dla: ${klient.company || klient.name}`;
  }

  POZYCJE_STARTOWE.forEach((p) => $("#pozycje").append(wierszPozycji(p)));
  przeliczSume();
  odswiezOchrone();

  // Domyślny termin: 10 dni. Krótki link to mniej czasu na rozmyślanie
  // i mniej zamówień, które trzeba potem wygaszać.
  const za10 = new Date(Date.now() + 10 * 864e5);
  $("#f-waznosc").value = za10.toISOString().slice(0, 10);

  $("#dodaj-pozycje").addEventListener("click", () => { $("#pozycje").append(wierszPozycji()); przeliczSume(); });
  ["#f-forma", "#f-pkd"].forEach((s) => $(s).addEventListener("input", odswiezOchrone));
  $("#f-uzasadnienie").addEventListener("input", (e) => { e.target.dataset.auto = "0"; });
  $("#form").addEventListener("submit", wyslij);
}

async function wyslij(e) {
  e.preventDefault();
  const msg = $("#msg");
  const btn = $("#wyslij");
  const pozycje = czytajPozycje();

  if (pozycje.some((p) => !p.opis)) {
    msg.className = "u-msg bad";
    msg.textContent = "Każda pozycja musi mieć opisany zakres — to on zastępuje umowę.";
    return;
  }
  const suma = Number((pozycje.reduce((s, p) => s + gr(p.kwota_brutto), 0) / 100).toFixed(2));
  if (suma <= 0) {
    msg.className = "u-msg bad";
    msg.textContent = "Kwota zamówienia musi być większa od zera.";
    return;
  }

  btn.disabled = true;
  msg.className = "u-msg";
  msg.textContent = "Wystawiam…";

  const o = ocenaOchrony();
  const { data: { session } } = await sb.auth.getSession();

  try {
    const odp = await fetch(`${API}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        client_id: clientId,
        created_by: mojeImie,
        klient_nazwa: $("#f-nazwa").value.trim(),
        klient_adres: $("#f-adres").value.trim(),
        klient_nip: $("#f-nip").value.replace(/\D/g, ""),
        klient_krs: $("#f-krs").value.replace(/\D/g, "") || null,
        klient_email: $("#f-email").value.trim(),
        forma_prawna: $("#f-forma").value,
        pkd_glowne: $("#f-pkd").value.trim() || null,
        ochrona_konsumencka: o.chroniony,
        ochrona_uzasadnienie: $("#f-uzasadnienie").value.trim(),
        kwota_brutto: suma,
        termin_waznosci: $("#f-waznosc").value,
        termin_wykonania: $("#f-wykonanie").value.trim(),
        pozycje,
      }),
    });

    const dane = await odp.json();
    if (!odp.ok) throw new Error(dane.blad || `Błąd ${odp.status}`);

    $("#form").hidden = true;
    $("#gotowe").hidden = false;
    $("#gotowe").innerHTML = `
      <h2 style="margin-bottom:8px">Zamówienie wystawione</h2>
      <p style="margin-bottom:10px">Link poszedł mailem na <b>${$("#f-email").value.trim()}</b>.</p>
      <p style="margin-bottom:12px"><a href="${dane.url}" target="_blank" rel="noopener">${dane.url}</a></p>
      <p class="u-hint">Po zapłacie klient dostanie potwierdzenie z dokumentami, a zamówienie
      zmieni status na karcie klienta. Nic więcej nie trzeba robić.</p>`;
  } catch (err) {
    btn.disabled = false;
    msg.className = "u-msg bad";
    msg.textContent = err.message;
  }
}

start();

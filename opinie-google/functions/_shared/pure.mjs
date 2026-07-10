// Czysta logika (bez sieci, bez Deno) — wspólna dla Edge Functions (Deno)
// i testów lokalnych (Node). Trzymać tu wszystko, co da się testować na sucho.

// --- Normalizacja polskiego numeru do E.164 (+48...). null = to nie numer. ---
export function normalizePhonePL(raw) {
  const digits = String(raw).replace(/[^\d+]/g, "");
  if (/^\+48\d{9}$/.test(digits)) return digits;
  if (/^48\d{9}$/.test(digits)) return `+${digits}`;
  if (/^\d{9}$/.test(digits)) return `+48${digits}`;
  return null;
}

// --- Wyciągnięcie numeru telefonu z wolnego tekstu (wiadomość na WhatsApp). ---
// Łapie "600 123 456", "+48600123456", "tel: 600-123-456" itp.
// Granice cyfr (?<!\d)...(?!\d): 9-cyfrowy fragment NIP-u/numeru konta/paczki
// (dłuższy ciąg cyfr) NIE jest brany za telefon.
export function extractPhonePL(text) {
  const m = String(text).match(/(?<!\d)(?:\+?48[\s-]?)?(?:\d[\s-]?){9}(?!\d)/g);
  if (!m) return null;
  for (const cand of m) {
    const norm = normalizePhonePL(cand.replace(/[\s-]/g, ""));
    if (norm) return norm;
  }
  return null;
}

// --- Komenda STOP od fachowca w bocie: "STOP 600123456" / "wypisz 600 123 456". ---
// Zwraca {phone} do oznaczenia klienta jako opted_out, albo null gdy to nie STOP.
export function parseStopCommand(text) {
  const t = String(text ?? "").trim().toLowerCase();
  if (!/^(stop|wypisz|wypisuje|nie wysylaj|nie pisz|usun)\b/.test(t)) return null;
  const phone = extractPhonePL(t);
  return phone ? { phone } : null;
}

// --- Szablon wiadomości: {imie} i {link}. ---
export function fillTemplate(tpl, name, link) {
  return String(tpl)
    .replaceAll("{imie}", name ? ` ${name}` : "")
    .replaceAll("{link}", link ?? "")
    .replace(/\s+/g, " ").trim();
}

// --- Silnik timingu: prośba ~3h po zleceniu, tylko w oknie 9-21 lokalnie. ---
export function hourInTz(d, tz) {
  return parseInt(
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: tz }).format(d),
    10,
  );
}

export function computeScheduledAt(tz, from = new Date(), jitterMs = Math.floor(Math.random() * 20 * 60_000)) {
  let t = new Date(from.getTime() + 3 * 3600_000 + jitterMs);
  for (let i = 0; i < 96; i++) {
    const h = hourInTz(t, tz);
    if (h >= 9 && h < 21) return t;
    t = new Date(t.getTime() + 15 * 60_000);
  }
  return t;
}

// --- Fingerprint opinii: stabilne ID z Places (review.name) albo hash treści. ---
export function reviewFingerprint(review) {
  if (review?.name) return `gid:${review.name}`; // places/XXX/reviews/YYY — stabilne ID Google
  const raw = `${review?.authorAttribution?.displayName ?? ""}|${review?.publishTime ?? ""}|${review?.text?.text ?? ""}`;
  // Prosty FNV-1a (wystarcza do dedup, nie do kryptografii)
  let h = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `fnv:${h.toString(16)}:${raw.length}`;
}

// --- ID przycisków WhatsApp: og_<akcja>:<review_id>. ---
export function buttonId(action, reviewId) {
  return `og_${action}:${reviewId}`;
}
export function parseButtonId(id) {
  const m = /^og_(accept|edit|skip):([0-9a-f-]{36})$/.exec(String(id ?? ""));
  return m ? { action: m[1], reviewId: m[2] } : null;
}

// --- Zapasowy szkic odpowiedzi (gdy brak klucza AI / tryb na sucho). ---
export function fallbackReplyDraft(businessName, rating, authorName) {
  const imie = authorName ? ` ${String(authorName).split(" ")[0]}` : "";
  if (rating >= 4) {
    return `Dziekujemy${imie} za mila opinie i zaufanie! Pozdrawiamy, ${businessName}.`;
  }
  return `Dziekujemy${imie} za opinie. Przykro nam, ze cos poszlo nie tak. Prosimy o kontakt - chetnie Panstwa wysluchamy i porozmawiamy o szczegolach. ${businessName}.`;
}

// --- Okno 24h WhatsApp: czy można pisać zwykłą wiadomością (nie template)? ---
export function within24h(lastInteractionAt, now = new Date()) {
  if (!lastInteractionAt) return false;
  return now.getTime() - new Date(lastInteractionAt).getTime() < 24 * 3600_000;
}

// --- Walidacja szablonu SMS: zgodność Google (zakaz review-gatingu) + Omnibus
//     (zakaz zachęt majątkowych za opinię). Fachowiec edytuje szablon z panelu,
//     więc sprawdzamy tuż przed wysyłką. Zwraca {ok:true} albo {ok:false, reason}.
// Deny-lista skalibrowana tak, by NIE blokować dozwolonego "ocenisz nas"/"oceń nas":
// używamy "docen" (obietnica korzyści), nigdy "ocen".
export const TEMPLATE_DENY = [
  "gwiazdk", "5 gwiazd", "pozytywn",                      // sterowanie oceną (Google zakaz gatingu)
  "rabat", "znizk", "zniżk", "gratis", "prezent",        // zachęta majątkowa (Omnibus)
  "nagrod", "w zamian", "docen",
];
export function validateTemplate(tpl) {
  const t = String(tpl ?? "");
  if (!t.includes("{link}")) {
    return { ok: false, reason: "szablon musi zawierać {link} (bez linku SMS jest bezużyteczny)" };
  }
  const low = t.toLowerCase();
  const hit = TEMPLATE_DENY.find((p) => low.includes(p));
  if (hit) {
    return { ok: false, reason: `szablon zawiera niedozwoloną frazę ("${hit}") - zakaz proszenia o oceny/zachęt (Google + Omnibus)` };
  }
  if (t.length > 320) return { ok: false, reason: "szablon za długi (>320 znaków)" };
  return { ok: true };
}

// --- Stałoczasowe porównanie dwóch hexów (podpis HMAC): brak wycieku czasowego. ---
export function timingSafeEqualHex(a, b) {
  const x = String(a ?? ""), y = String(b ?? "");
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

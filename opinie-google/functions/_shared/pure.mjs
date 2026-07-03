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
export function extractPhonePL(text) {
  const m = String(text).match(/(?:\+?48[\s-]?)?(\d[\s-]?){9}/g);
  if (!m) return null;
  for (const cand of m) {
    const norm = normalizePhonePL(cand.replace(/[\s-]/g, ""));
    if (norm) return norm;
  }
  return null;
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
  return `Dziekujemy${imie} za opinie. Przykro nam, ze cos poszlo nie tak - prosimy o kontakt, chetnie to wyjasnimy i naprawimy. ${businessName}.`;
}

// --- Okno 24h WhatsApp: czy można pisać zwykłą wiadomością (nie template)? ---
export function within24h(lastInteractionAt, now = new Date()) {
  if (!lastInteractionAt) return false;
  return now.getTime() - new Date(lastInteractionAt).getTime() < 24 * 3600_000;
}

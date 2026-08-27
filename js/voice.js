// Entrada por voz. O parser e uma funcao pura, testavel sem microfone.
// O resultado NUNCA salva direto: preenche os campos e o usuario confirma.

import { parseValueInput } from './money.js';
import { todayIso, MONTH_NAMES } from './model.js';

// ---------- numerais escritos em portugues

const UNITS = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13,
  quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezasseis: 16,
  dezessete: 17, dezassete: 17, dezoito: 18, dezenove: 19, dezanove: 19,
};
const TENS = {
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, cincoenta: 50,
  sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
};
const HUNDREDS = {
  cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300,
  trezentas: 300, quatrocentos: 400, quatrocentas: 400, quinhentos: 500,
  quinhentas: 500, seiscentos: 600, seiscentas: 600, setecentos: 700,
  setecentas: 700, oitocentos: 800, oitocentas: 800, novecentos: 900,
  novecentas: 900,
};
const SCALES = { mil: 1000, milhao: 1e6, milhoes: 1e6 };

const PARCEL_WORDS = new Set(['vezes', 'vez', 'parcelas', 'parcela']);
const MONEY_WORDS = new Set(['reais', 'real']);
const CENT_WORDS = new Set(['centavos', 'centavo']);

export function stripAccents(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function normalizeToken(raw) {
  let s = stripAccents(String(raw).toLowerCase());
  s = s.replace(/^[.,;:!?()"'“”]+/, '');
  // Pontuacao final some, mas a virgula decimal de "100,00" fica.
  s = s.replace(/[.;:!?()"'“”]+$/, '');
  s = s.replace(/,$/, '');
  return s;
}

function isNumberWord(w) {
  return w in UNITS || w in TENS || w in HUNDREDS || w in SCALES;
}

function isPlainInteger(w) {
  return /^\d{1,4}$/.test(w);
}

// Converte uma sequencia de palavras em numero. "cento e vinte e cinco" -> 125
export function wordsToNumber(tokens) {
  let total = 0;
  let current = 0;
  let seen = false;
  for (const w of tokens) {
    if (w === 'e') continue;
    if (isPlainInteger(w)) { current += Number(w); seen = true; continue; }
    if (w in UNITS) { current += UNITS[w]; seen = true; continue; }
    if (w in TENS) { current += TENS[w]; seen = true; continue; }
    if (w in HUNDREDS) { current += HUNDREDS[w]; seen = true; continue; }
    if (w in SCALES) {
      total += (current || 1) * SCALES[w];
      current = 0;
      seen = true;
      continue;
    }
    return null;
  }
  return seen ? total + current : null;
}

// ---------- varredura por tokens
// Trabalhar com indices (e nao com replace em string) evita que um trecho ja
// consumido volte a casar e preserva os acentos da descricao original.

function tokenize(text) {
  const raw = String(text).trim().split(/\s+/).filter(Boolean);
  return { raw, norm: raw.map(normalizeToken), used: raw.map(() => false) };
}

function scannable(t, i) {
  return i >= 0 && i < t.norm.length && !t.used[i];
}

// Anda para tras a partir de `end` juntando numerais ("e" incluso).
function scanNumberBackwards(t, end) {
  if (!scannable(t, end)) return null;
  let start = end;
  while (scannable(t, start)
    && (isNumberWord(t.norm[start]) || isPlainInteger(t.norm[start]) || t.norm[start] === 'e')) {
    start -= 1;
  }
  start += 1;
  while (start <= end && t.norm[start] === 'e') start += 1;
  if (start > end) return null;
  const value = wordsToNumber(t.norm.slice(start, end + 1));
  return value == null ? null : { value, start, end };
}

function scanNumberForwards(t, start) {
  if (!scannable(t, start)) return null;
  let end = start;
  while (scannable(t, end)
    && (isNumberWord(t.norm[end]) || isPlainInteger(t.norm[end]) || (t.norm[end] === 'e' && end > start))) {
    end += 1;
  }
  end -= 1;
  while (end >= start && t.norm[end] === 'e') end -= 1;
  if (end < start) return null;
  const value = wordsToNumber(t.norm.slice(start, end + 1));
  return value == null ? null : { value, start, end };
}

function mark(t, start, end) {
  for (let i = start; i <= end; i += 1) t.used[i] = true;
}

// Contagens (parcelas, dia do mes) sao numeros curtos vizinhos a uma palavra
// chave. A varredura gulosa acabaria colando o valor da compra na contagem
// ("parcelado em 12 dois mil e quinhentos reais"), entao aqui ela e contida:
// digito isolado vale sozinho, e um resultado fora de escala cai no vizinho.
function scanCount(t, i, direction, max) {
  if (!scannable(t, i)) return null;
  if (isPlainInteger(t.norm[i])) {
    const value = Number(t.norm[i]);
    return value >= 1 && value <= max ? { value, start: i, end: i } : null;
  }
  const found = direction < 0 ? scanNumberBackwards(t, i) : scanNumberForwards(t, i);
  if (!found) return null;
  if (found.value >= 1 && found.value <= max) return found;
  const single = wordsToNumber([t.norm[i]]);
  return single != null && single >= 1 && single <= max
    ? { value: single, start: i, end: i }
    : null;
}

// ---------- 1. parcelas

function extractParcelas(t) {
  for (let i = 0; i < t.norm.length; i += 1) {
    if (t.used[i]) continue;
    const m = /^(\d{1,2})x$/.exec(t.norm[i]);
    if (m && Number(m[1]) >= 1) {
      mark(t, i, i);
      return Number(m[1]);
    }
  }
  for (let i = 0; i < t.norm.length; i += 1) {
    if (t.used[i] || (t.norm[i] !== 'x' && !PARCEL_WORDS.has(t.norm[i]))) continue;
    const found = scanCount(t, i - 1, -1, 60);
    if (!found) continue;
    mark(t, found.start, i);
    if (found.start > 0 && ['em', 'de'].includes(t.norm[found.start - 1])) {
      mark(t, found.start - 1, found.start - 1);
    }
    return found.value;
  }
  for (let i = 0; i < t.norm.length; i += 1) {
    if (t.used[i] || !['parcelado', 'dividido', 'parcelei'].includes(t.norm[i])) continue;
    let j = i + 1;
    if (t.norm[j] === 'em') j += 1;
    const found = scanCount(t, j, 1, 60);
    if (!found) continue;
    mark(t, i, found.end);
    return found.value;
  }
  return null;
}

// ---------- 2. data

function shiftDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function buildIso(year, month, day) {
  if (!(month >= 1 && month <= 12)) return null;
  const maxDay = new Date(year, month, 0).getDate();
  if (!(day >= 1 && day <= maxDay)) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function extractDate(t, today) {
  const [curYear, curMonth] = today.split('-').map(Number);

  for (let i = 0; i < t.norm.length; i += 1) {
    if (t.used[i]) continue;
    if (t.norm[i] === 'hoje') { mark(t, i, i); return today; }
    if (t.norm[i] === 'ontem') { mark(t, i, i); return shiftDays(today, -1); }
    if (t.norm[i] === 'anteontem') { mark(t, i, i); return shiftDays(today, -2); }
    if (t.norm[i] === 'amanha') { mark(t, i, i); return shiftDays(today, 1); }
  }

  // 27/08, 27-08-2026, 27/08/26
  for (let i = 0; i < t.norm.length; i += 1) {
    if (t.used[i]) continue;
    const m = /^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?$/.exec(t.norm[i]);
    if (!m) continue;
    let year = curYear;
    if (m[3]) year = m[3].length <= 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const iso = buildIso(year, Number(m[2]), Number(m[1]));
    if (!iso) continue;
    mark(t, i, i);
    return iso;
  }

  // "vinte e sete de agosto", "27 de agosto de 2026"
  for (let i = 0; i < t.norm.length; i += 1) {
    if (t.used[i] || i === 0) continue;
    const monthIndex = MONTH_NAMES.indexOf(t.norm[i]);
    if (monthIndex < 0) continue;
    const hasDe = t.norm[i - 1] === 'de';
    const found = scanCount(t, hasDe ? i - 2 : i - 1, -1, 31);
    if (!found) continue;
    let year = curYear;
    let end = i;
    if (t.norm[i + 1] === 'de' && /^\d{4}$/.test(t.norm[i + 2] || '')) {
      year = Number(t.norm[i + 2]);
      end = i + 2;
    }
    const iso = buildIso(year, monthIndex + 1, found.value);
    if (!iso) continue;
    mark(t, found.start, end);
    return iso;
  }

  // "dia 27"
  for (let i = 0; i < t.norm.length; i += 1) {
    if (t.used[i] || t.norm[i] !== 'dia') continue;
    const found = scanCount(t, i + 1, 1, 31);
    if (!found) continue;
    const iso = buildIso(curYear, curMonth, found.value);
    if (!iso) continue;
    mark(t, i, found.end);
    return iso;
  }

  return null;
}

// ---------- 3. valor

function digitValueAt(t, i) {
  if (!scannable(t, i)) return null;
  const cleaned = t.norm[i].replace(/^r\$/, '');
  if (!/^\d[\d.,]*$/.test(cleaned)) return null;
  return parseValueInput(cleaned);
}

function extractValue(t) {
  // 3a. "<numero> reais [e <numero> centavos]"
  for (let i = 0; i < t.norm.length; i += 1) {
    if (t.used[i] || !MONEY_WORDS.has(t.norm[i])) continue;
    let cents;
    let start;
    const digits = digitValueAt(t, i - 1);
    if (digits != null) {
      cents = digits;
      start = i - 1;
    } else {
      const found = scanNumberBackwards(t, i - 1);
      if (!found) continue;
      cents = found.value * 100;
      start = found.start;
    }
    let end = i;
    let j = t.norm[i + 1] === 'e' ? i + 2 : i + 1;
    const centDigits = digitValueAt(t, j);
    const centWords = centDigits == null ? scanNumberForwards(t, j) : null;
    const centValue = centDigits != null ? Math.round(centDigits / 100) : centWords?.value;
    const centEnd = centDigits != null ? j : centWords?.end;
    if (centValue != null && centValue < 100 && CENT_WORDS.has(t.norm[centEnd + 1])) {
      cents += centValue;
      end = centEnd + 1;
    }
    mark(t, start, end);
    return cents;
  }

  // 3b. "cinquenta centavos", sem parte inteira
  for (let i = 0; i < t.norm.length; i += 1) {
    if (t.used[i] || !CENT_WORDS.has(t.norm[i])) continue;
    const found = scanNumberBackwards(t, i - 1);
    if (!found || found.value >= 100) continue;
    mark(t, found.start, i);
    return found.value;
  }

  // 3c. numero em digitos solto: "100,00", "1.500", "R$ 89,90"
  let fallback = null;
  for (let i = 0; i < t.norm.length; i += 1) {
    const cents = digitValueAt(t, i);
    if (cents == null || cents <= 0) continue;
    if (t.norm[i].startsWith('r$') || t.norm[i - 1] === 'r$') {
      mark(t, i, i);
      return cents;
    }
    fallback = i;
  }
  if (fallback != null) {
    const cents = digitValueAt(t, fallback);
    mark(t, fallback, fallback);
    return cents;
  }

  // 3d. numero escrito solto: "cem"
  for (let i = 0; i < t.norm.length; i += 1) {
    if (t.used[i] || !isNumberWord(t.norm[i])) continue;
    const found = scanNumberForwards(t, i);
    if (!found || found.value <= 0) continue;
    mark(t, found.start, found.end);
    return found.value * 100;
  }

  return null;
}

// ---------- 4. descricao

const DROP_ANY = new Set(['reais', 'real', 'r$', 'centavos', 'centavo', 'sem',
  'juros', 'gastei', 'paguei', 'comprei', 'custou', 'gasto', 'parcelado',
  'dividido', 'parcelei', 'vezes', 'vez', 'parcela', 'parcelas', 'dia', 'x']);
const DROP_EDGE = new Set(['de', 'em', 'e', 'no', 'na', 'do', 'da', 'por',
  'com', 'a', 'o', 'os', 'as', 'um', 'uma', 'foi', 'para', 'pra']);

function extractDescription(t) {
  const kept = [];
  for (let i = 0; i < t.raw.length; i += 1) {
    if (t.used[i] || DROP_ANY.has(t.norm[i])) continue;
    const word = t.raw[i]
      .replace(/^[.,;:!?()"'“”]+/, '')
      .replace(/[.,;:!?()"'“”]+$/, '');
    if (word) kept.push({ word, norm: t.norm[i] });
  }
  while (kept.length && DROP_EDGE.has(kept[0].norm)) kept.shift();
  while (kept.length && DROP_EDGE.has(kept[kept.length - 1].norm)) kept.pop();
  const text = kept.map((k) => k.word).join(' ');
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

// ---------- entrada publica

export function parseFala(text, today = todayIso()) {
  const t = tokenize(text || '');
  const installments = extractParcelas(t);
  const date = extractDate(t, today);
  const totalCents = extractValue(t);
  const description = extractDescription(t);
  return {
    date: date || today,
    dateFromSpeech: !!date,
    description,
    totalCents,
    installments: installments && installments >= 1 ? Math.min(60, installments) : 1,
    transcript: String(text || '').trim(),
  };
}

// ---------- reconhecimento de fala

export function speechSupported() {
  return typeof window !== 'undefined'
    && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function createRecognizer({ onInterim, onFinal, onError, onEnd }) {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = 'pt-BR';
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  let finalText = '';
  rec.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const chunk = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += chunk;
      else interim += chunk;
    }
    onInterim?.((finalText + ' ' + interim).trim());
  };
  rec.onerror = (event) => onError?.(event.error);
  rec.onend = () => {
    if (finalText.trim()) onFinal?.(finalText.trim());
    onEnd?.();
  };

  return {
    start() {
      finalText = '';
      try { rec.start(); } catch (err) { onError?.(String(err)); }
    },
    stop() { try { rec.stop(); } catch { /* ja parado */ } },
    abort() { try { rec.abort(); } catch { /* ja parado */ } },
  };
}

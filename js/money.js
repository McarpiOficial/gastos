// Dinheiro sempre em centavos inteiros. Nenhum float encosta em valor.

const fmt = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCents(cents) {
  return fmt.format((cents || 0) / 100);
}

export function formatCentsSigned(cents) {
  const v = cents || 0;
  return (v < 0 ? '-' : '') + fmt.format(Math.abs(v) / 100);
}

// Aceita "1.234,56", "1234,56", "1234.56", "1.500", "100", "R$ 89,90".
export function parseValueInput(raw) {
  if (raw == null) return null;
  let s = String(raw).trim().toLowerCase();
  s = s.replace(/r\$/g, '').replace(/reais?/g, '').replace(/\s/g, '');
  if (!s) return null;
  const negative = s.startsWith('-');
  s = s.replace(/^[-+]/, '');
  if (!/^[\d.,]+$/.test(s)) return null;

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (hasDot) {
    // "1.500" e "1.234.567" sao separadores de milhar; "100.5" e decimal.
    const parts = s.split('.');
    const allGroupsOfThree = parts.slice(1).every((p) => p.length === 3);
    s = allGroupsOfThree && parts.length > 1 && parts[0].length <= 3
      ? parts.join('')
      : parts.slice(0, -1).join('') + '.' + parts[parts.length - 1];
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const cents = Math.round(n * 100);
  return negative ? -cents : cents;
}

// Divide o total em n parcelas. O resto inteiro fica na ULTIMA parcela,
// de modo que a soma das parcelas seja sempre exatamente o total.
// 10000 / 3 -> [3333, 3333, 3334]
export function splitInstallments(totalCents, n) {
  const count = Math.max(1, Math.trunc(n) || 1);
  const total = Math.trunc(totalCents || 0);
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const base = Math.floor(abs / count);
  const out = new Array(count).fill(base * sign);
  const remainder = abs - base * count;
  out[count - 1] = (base + remainder) * sign;
  return out;
}

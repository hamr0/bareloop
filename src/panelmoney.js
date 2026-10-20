// The panel's ONE money spelling (hamr's ruling 2026-10-19, PRD "Part 6 rulings" (3)):
//   - an amount of $0.01 or more: 2 decimals, rounded half-up ("$0.82", "$3.71");
//   - a REAL positive amount under a cent: 4 decimals ("$0.0054"), never "<$0.01" and never "$0.00"
//     (one too small for 4 decimals reads "<$0.0001"; one that rounds up to a cent reads "$0.01");
//   - exact zero: "$0.00"; null/undefined/non-finite: "unknown" (never a fabricated $0).
// `src/panel/index.html` carries a browser-script copy of this same function (`panelMoney`, it
// cannot import a module); tests/panel-page.test.js pins the two to identical output. The CLI's own
// 4-decimal `money()` (src/replay.js) is a different, unchanged spelling.

/**
 * @param {number|null|undefined} n a dollar amount
 * @returns {string}
 */
export function panelMoney2(n) {
  if (n === null || n === undefined) return 'unknown';
  const v = Number(n);
  if (!Number.isFinite(v)) return 'unknown';
  // clean to 6-decimal precision first (the precision src/text.js sums to) so a float sitting just
  // under an exact boundary is never mis-rounded
  const clean = Math.round(v * 1e6) / 1e6;
  if (clean > 0 && clean < 0.01) {
    const units = Math.round(clean * 1e4 + 1e-6);
    if (units <= 0) return '<$0.0001';
    if (units >= 100) return '$0.01';
    return `$${(units / 1e4).toFixed(4)}`;
  }
  const cents = Math.max(0, Math.round(clean * 100 + 1e-6));
  return `$${(cents / 100).toFixed(2)}`;
}

// $0 base-rate archaeology: apply Layer R's fixation definition retroactively
// to every archived multi-attempt run (all pre-Layer-R = OFF-arm rows).
// Pair (i, i+1), both red: fixated = write-sets overlap AND normalized kept
// red-sets equal. Classifies every eligible pair so nothing is papered over.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const norm = (l) => l.replace(/ \(\d+(?:\.\d+)?m?s\)\s*$/, '');
const parse = (f) => readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

const DIRS = [
  { dir: '/home/hamr/PycharmProjects/bareloop-patients/aurora-soar-bareloop', keep: /^TESTGEN / },
  { dir: '/home/hamr/PycharmProjects/bareloop-patients/mailproof-job2-bareloop', keep: /^not ok / },
];

const agg = { rows: 0, multiAttempt: 0, pairs: 0, fixated: 0, inaction: 0, moved: 0, differentFile: 0, noAudit: 0 };
for (const { dir, keep } of DIRS) {
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.jsonl') || f.includes('gate-audit') || f.includes('close-log')) continue;
    const spine = parse(join(dir, f));
    const iters = spine.filter((e) => e.type === 'iteration-start');
    const verdicts = spine.filter((e) => e.type === 'close-verdict');
    agg.rows += 1;
    if (iters.length < 2) continue;
    agg.multiAttempt += 1;
    const auditFile = join(dir, f.replace('.jsonl', '-gate-audit.jsonl'));
    if (!existsSync(auditFile)) { agg.noAudit += 1; continue; }
    const writes = parse(auditFile).filter((a) => a.phase === 'gate' && a.decision === 'allow'
      && (a.action?.type === 'write' || a.action?.type === 'edit') && typeof a.action.path === 'string');
    // attempt window by timestamp: [start_i, start_{i+1})
    const winWrites = (i) => {
      const t0 = Date.parse(iters[i - 1].ts);
      const t1 = i < iters.length ? Date.parse(iters[i].ts) : Infinity;
      return new Set(writes.filter((w) => { const t = Date.parse(w.ts); return t >= t0 && t < t1; }).map((w) => w.action.path));
    };
    const kept = (i) => {
      const v = verdicts.find((e) => e.iteration === i);
      if (!v) return null;
      return JSON.stringify([...new Set(String(v.gap ?? '').split('\n').filter((l) => keep.test(l)).map(norm))].sort());
    };
    const red = (i) => {
      const v = verdicts.find((e) => e.iteration === i);
      return v && v.verdict !== 'satisfied';
    };
    for (let i = 1; i < iters.length; i++) {
      if (!red(i) || !verdicts.find((e) => e.iteration === i + 1)) continue; // pair needs both attempts judged
      agg.pairs += 1;
      const w1 = winWrites(i), w2 = winWrites(i + 1);
      const overlap = [...w2].filter((p) => w1.has(p));
      const label = w2.size === 0 ? 'inaction'
        : overlap.length === 0 ? 'differentFile'
        : kept(i) === kept(i + 1) ? 'fixated' : 'moved';
      agg[label] += 1;
      if (label === 'fixated') console.log(`FIXATED  ${f} pair a${i}->a${i + 1}: ${overlap.join(', ')}`);
    }
  }
}
console.log('\n== base rate (all archived rows are OFF-arm) ==');
console.log(agg);

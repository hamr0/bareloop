// F356: the sumIf total reads a cell as a number only when it is a strict plain number.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sheetTotalLines } from '../src/sheetclaims.js';

const totalOf = (cells) => {
  const tables = { t: { header: ['Amount'], rows: cells.map((c, i) => ({ rowNumber: i + 2, cells: [c] })) } };
  const checks = [{ rule: 'cells', op: 'sumIf', table: 't', column: 'Amount', claim: 'c' }];
  const claims = { c: { rows: cells.map((_, i) => i + 2) } };
  return sheetTotalLines(checks, claims, tables)[0];
};

test('F356: a decimal comma is not a number, the total is not computed', () => {
  assert.match(totalOf(['12,50', '3,00']), /not computed \(row 2 has no number in the column "Amount"\)/);
});
test('F356: exponent and hex are not numbers', () => {
  assert.match(totalOf(['1e3']), /not computed \(row 2 /);
  assert.match(totalOf(['0x10']), /not computed \(row 2 /);
});
test('F356: thousands groups still sum', () => {
  assert.equal(totalOf(['1,234.50', ' 10 ']), 'Total of rows 2, 3: 1,244.50 (computed by code from the rows named)');
});

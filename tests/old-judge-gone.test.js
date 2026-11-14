// hamr 2026-11-14 (rubric vs deterministic split, piece 2): the old judge is gone -- the judge-card compile
// (src/cardauthor.js), calibration (src/calibrate.js and its signing gate) and the judged-repo floor path.
// Each assertion is a refusal or an absence; each failed before the removal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as lib from '../src/index.js';
import * as authorjob from '../src/authorjob.js';
import { classMenu } from '../src/authoring.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

test('the library root no longer exports the judge-card compile or the calibration gate', () => {
  for (const name of ['proposeJudgedArtifacts', 'signJudgedArtifacts', 'foldJudgedArtifacts', 'runCalibration', 'INJECTION_LOCATE_BATTERY', 'CASUALTY_AXES']) {
    assert.equal(name in lib, false, `${name} is gone from the root`);
  }
});

test('the modules themselves are gone, and so is the gate helper authorjob exported', () => {
  assert.equal(existsSync(join(SRC, 'cardauthor.js')), false);
  assert.equal(existsSync(join(SRC, 'calibrate.js')), false);
  assert.equal('seedProofIsCalibration' in authorjob, false);
});

test('no class menu offers judged-floor to a composer any more (the judged-repo floor has no way in)', () => {
  for (const cls of ['green', 'soft-green', 'hitl']) assert.equal(classMenu(cls).includes('judged-floor'), false, cls);
});

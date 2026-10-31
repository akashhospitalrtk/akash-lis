import test from 'node:test';
import assert from 'node:assert/strict';
import { matchingRange, resultFlag, referenceText } from '../dist/src/services/resultService.js';

const ranges = [
  { label: 'Adult', ageMin: 18, ageUnit: 'years', low: .5, high: 5 },
  { label: 'Infant', ageMin: 0, ageMax: 12, ageUnit: 'months', low: 1, high: 8 },
  { label: 'Neonate', ageMin: 0, ageMax: 28, ageUnit: 'days', low: 2, high: 10 },
  { label: 'Child', ageMin: 13, ageMax: 215, ageUnit: 'months', low: .7, high: 6 }
];
test('age units select narrowest matching range and drive flags', () => {
  for (const [value, unit, label] of [[0, 'days', 'Neonate'], [4, 'weeks', 'Neonate'], [6, 'months', 'Infant'], [5, 'years', 'Child'], [18, 'years', 'Adult']]) {
    const patient = { age_value: value, age_unit: unit };
    assert.equal(matchingRange(ranges, patient).label, label);
  }
  assert.equal(matchingRange(ranges, { age_years: 30 }).label, 'Adult');
  assert.equal(matchingRange(ranges, { age_years: null }), undefined);
  assert.equal(resultFlag('9', { result_kind: 'NUMERIC', reference_ranges: ranges }, { age_value: 6, age_unit: 'months' }), 'H');
  assert.equal(referenceText([{ low: .5, high: 5 }], { age_years: 1 }), '0.5 – 5');
  const sexRanges = [
    { label: 'Adult male', gender: 'Male', ageMin: 18, low: 13, high: 17 },
    { label: 'Adult female', gender: 'Female', ageMin: 18, low: 12, high: 15 }
  ];
  assert.equal(referenceText(sexRanges, { gender: 'F', age_years: 30 }), 'Adult male: 13 – 17\nAdult female: 12 – 15');
  assert.equal(referenceText(sexRanges, { gender: 'M', age_years: 30 }), 'Adult male: 13 – 17\nAdult female: 12 – 15');
  assert.equal(matchingRange(sexRanges, { gender: 'F', age_years: 30 }).high, 15);
  assert.equal(matchingRange(sexRanges, { gender: 'M', age_years: 30 }).high, 17);
  assert.equal(matchingRange([{ gender: 'Female', low: 0, high: 2 }, { low: 0, high: 3 }], { gender: 'Male' }).high, 3);
});

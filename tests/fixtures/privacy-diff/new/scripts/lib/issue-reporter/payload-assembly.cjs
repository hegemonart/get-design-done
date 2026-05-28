'use strict';
// Fixture: NEW payload-assembly.cjs disclaimer text — different from OLD.
// Exercises the "characters changed in disclaimer" summary path.

const DISCLAIMER_RU = 'NEW: Это псевдонимизация, не анонимизация. Финальный ревью на тебе.';
const DISCLAIMER_EN = 'NEW: This is pseudonymization, not anonymization. Final review is on you.';

module.exports = { DISCLAIMER_RU, DISCLAIMER_EN };

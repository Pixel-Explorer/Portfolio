// story/selftest-precommit.js
// Pre-commit static analysis for story mode beat data.
// Run with: node story/selftest-precommit.js
// Returns exit code 1 on failure.

const { readFileSync } = require('fs');

let exitCode = 0;
function assert(condition, msg) {
  if (!condition) {
    console.error(`FAIL: ${msg}`);
    exitCode = 1;
  }
}

function check() {
  // Parse all story JS files for structural issues
  const files = ['story/beat-data.js', 'story/audio-manifest.js', 'story/tuning.js'];

  for (const f of files) {
    try {
      const content = readFileSync(f, 'utf8');
      assert(content.length > 0, `${f} is not empty`);
    } catch (e) {
      console.error(`FAIL: Could not read ${f}: ${e.message}`);
      exitCode = 1;
    }
  }

  // Verify beat-data has valid structure via regex-based extraction
  const beatData = readFileSync('story/beat-data.js', 'utf8');

  // Extract all Beat IDs
  const idMatches = beatData.matchAll(/id:\s*'([^']+)'/g);
  const ids = [...idMatches].map(m => m[1]);
  assert(ids.length >= 14, `Expected >=14 beats, got ${ids.length}`);

  // Check for duplicate IDs
  const uniqueIds = new Set(ids);
  assert(uniqueIds.size === ids.length, `Duplicate beat IDs: ${ids.filter((id,i) => ids.indexOf(id) !== i).join(', ')}`);

  // Check all progressRanges sum to ~1.0 and each is valid
  const rangeMatches = beatData.matchAll(/progressRange:\s*\[([\d.]+),\s*([\d.]+)\]/g);
  let prevEnd = 0;
  let i = 0;
  for (const m of rangeMatches) {
    const start = parseFloat(m[1]);
    const end = parseFloat(m[2]);
    assert(start >= 0 && start <= 1, `Beat ${ids[i]}: start ${start} out of range`);
    assert(end >= 0 && end <= 1, `Beat ${ids[i]}: end ${end} out of range`);
    assert(end > start, `Beat ${ids[i]}: end ${end} <= start ${start}`);
    assert(Math.abs(start - prevEnd) < 0.001, `Beat ${ids[i]}: start ${start} !== prev end ${prevEnd}`);
    prevEnd = end;
    i++;
  }
  assert(Math.abs(prevEnd - 1.0) < 0.001, `Final progress end ${prevEnd} !== 1.0`);

  // Check audio-manifest has entries for all beat IDs (new beats may not have files yet)
  const manifest = readFileSync('story/audio-manifest.js', 'utf8');
  for (const id of ids) {
    const hasEntry = manifest.includes(`${id}:`);
    if (!hasEntry) {
      console.warn(`WARN: audio-manifest missing entry for beat '${id}' — will use TTS fallback`);
    }
  }

  // Check tuning.js has BEAT_TUNING entries for hero beats (tunable ones)
  const tuning = readFileSync('story/tuning.js', 'utf8');
  for (const id of ids) {
    const hasTuning = tuning.includes(`  ${id}:`);
    if (!hasTuning && !['boot', 'meta', 'aiesec', 'rabble', 'break', 'film_fall', 'cta'].includes(id)) {
      console.warn(`WARN: tuning.js missing BEAT_TUNING entry for '${id}'`);
    }
  }

  console.log(exitCode === 0 ? 'PASS: story precommit checks' : 'FAIL: story precommit checks');
  process.exit(exitCode);
}

check();

// tests/design-tokens.test.cjs — Plan 23-08 multi-source token reader
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const {
  read,
  readAll,
  detectFormat,
  readCssVars,
  readJsConst,
  readTailwind,
  readFigma,
} = require('../scripts/lib/design-tokens/index.cjs');

function tmp(prefix) {
  return mkdtempSync(join(tmpdir(), `gdd-tokens-${prefix}-`));
}

test('23-08: detectFormat picks css-vars for .css files', () => {
  assert.equal(detectFormat('foo.css'), 'css-vars');
  assert.equal(detectFormat('FOO.SCSS'), 'css-vars');
});

test('23-08: detectFormat picks tailwind for tailwind.config.js', () => {
  assert.equal(detectFormat('/path/to/tailwind.config.js'), 'tailwind');
  assert.equal(detectFormat('/path/to/tailwind.config.cjs'), 'tailwind');
});

test('23-08: css-vars extracts --tokens, strips dashes', () => {
  const dir = tmp('css');
  try {
    const fp = join(dir, 'tokens.css');
    writeFileSync(
      fp,
      `/* sample */
:root {
  --color-primary: #abc;
  --color-secondary: rgb(0, 0, 0);
  --space-1: 4px;
}
@media (min-width: 768px) {
  :root { --space-1: 8px; }  /* last-write-wins */
}`,
    );
    const r = readCssVars(fp);
    assert.equal(r.format, 'css-vars');
    assert.deepEqual(r.tokens, {
      'color-primary': '#abc',
      'color-secondary': 'rgb(0, 0, 0)',
      'space-1': '8px',
    });
    assert.deepEqual(r.warnings, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('23-08: css-vars warns on SCSS $vars', () => {
  const dir = tmp('scss');
  try {
    const fp = join(dir, 't.scss');
    writeFileSync(fp, `$brand: red;\n:root { --brand: blue; }\n`);
    const r = readCssVars(fp);
    assert.deepEqual(r.tokens, { brand: 'blue' });
    assert.ok(r.warnings.some((w) => /scss-vars-detected/.test(w)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('23-08: js-const reads CJS module.exports.tokens', () => {
  const dir = tmp('jsconst');
  try {
    const fp = join(dir, 'tokens.cjs');
    writeFileSync(
      fp,
      `module.exports = { tokens: { color: { primary: '#abc' }, space: { 1: 4 } } };`,
    );
    const r = readJsConst(fp);
    assert.equal(r.format, 'js-const');
    assert.equal(r.tokens['color.primary'], '#abc');
    assert.equal(r.tokens['space.1'], '4');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('23-08: js-const reads CJS plain map fallback', () => {
  const dir = tmp('jsbag');
  try {
    const fp = join(dir, 'bag.cjs');
    writeFileSync(fp, `module.exports = { brand: '#f00', radius: 8 };`);
    const r = readJsConst(fp);
    assert.equal(r.tokens['brand'], '#f00');
    assert.equal(r.tokens['radius'], '8');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('23-08: js-const reports harness failure as warning, not throw', () => {
  const dir = tmp('jsfail');
  try {
    const fp = join(dir, 'broken.cjs');
    writeFileSync(fp, `throw new Error('boom-from-config');`);
    const r = readJsConst(fp);
    assert.deepEqual(r.tokens, {});
    assert.ok(r.warnings.length > 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('23-08: tailwind merges theme + theme.extend per scale', () => {
  const dir = tmp('tw');
  try {
    const fp = join(dir, 'tailwind.config.cjs');
    writeFileSync(
      fp,
      `module.exports = {
  theme: {
    colors: { red: '#f00', blue: '#00f' },
    extend: {
      colors: { red: '#ff0000', brand: '#abc' },
      spacing: { '1': '4px' },
    },
  },
};`,
    );
    const r = readTailwind(fp);
    assert.equal(r.format, 'tailwind');
    // extend.red overrides base.red
    assert.equal(r.tokens['colors.red'], '#ff0000');
    assert.equal(r.tokens['colors.blue'], '#00f');
    assert.equal(r.tokens['colors.brand'], '#abc');
    assert.equal(r.tokens['spacing.1'], '4px');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('23-08: figma — variableCollections single mode', () => {
  const dir = tmp('figma');
  try {
    const fp = join(dir, 'tokens.json');
    writeFileSync(
      fp,
      JSON.stringify({
        variableCollections: {
          c1: {
            name: 'Brand',
            modes: { m1: { name: 'default' } },
            variables: {
              v1: {
                name: 'primary',
                valuesByMode: { m1: { r: 1, g: 0, b: 0 } },
              },
              v2: {
                name: 'radius',
                valuesByMode: { m1: 8 },
              },
            },
          },
        },
      }),
    );
    const r = readFigma(fp);
    assert.equal(r.format, 'figma');
    assert.equal(r.tokens['Brand.primary'], 'rgb(255, 0, 0)');
    assert.equal(r.tokens['Brand.radius'], '8');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('23-08: figma — multi-mode emits per-mode tokens', () => {
  const dir = tmp('figmamodes');
  try {
    const fp = join(dir, 'tokens.json');
    writeFileSync(
      fp,
      JSON.stringify({
        variableCollections: {
          c1: {
            name: 'Theme',
            modes: { light: { name: 'Light' }, dark: { name: 'Dark' } },
            variables: {
              v1: {
                name: 'bg',
                valuesByMode: {
                  light: { r: 1, g: 1, b: 1 },
                  dark: { r: 0, g: 0, b: 0 },
                },
              },
            },
          },
        },
      }),
    );
    const r = readFigma(fp);
    assert.equal(r.tokens['Theme.bg.Light'], 'rgb(255, 255, 255)');
    assert.equal(r.tokens['Theme.bg.Dark'], 'rgb(0, 0, 0)');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('23-08: figma — already-flattened bag passes through', () => {
  const dir = tmp('figmaflat');
  try {
    const fp = join(dir, 'flat.json');
    writeFileSync(fp, JSON.stringify({ brand: '#abc', space: 8 }));
    const r = readFigma(fp);
    assert.equal(r.tokens['brand'], '#abc');
    assert.equal(r.tokens['space'], '8');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('23-08: figma — bad JSON returns empty + warning', () => {
  const dir = tmp('figmabroken');
  try {
    const fp = join(dir, 'broken.json');
    writeFileSync(fp, '{not json');
    const r = readFigma(fp);
    assert.deepEqual(r.tokens, {});
    assert.ok(r.warnings.some((w) => /json-parse-failed/.test(w)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('23-08: read() facade dispatches by extension', () => {
  const dir = tmp('facade');
  try {
    const css = join(dir, 'a.css');
    writeFileSync(css, ':root { --x: 1px; }');
    const r = read(css);
    assert.equal(r.format, 'css-vars');
    assert.equal(r.tokens['x'], '1px');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('23-08: readAll handles mixed sources', () => {
  const dir = tmp('mixed');
  try {
    const css = join(dir, 'a.css');
    writeFileSync(css, ':root { --x: 1px; }');
    const fig = join(dir, 'b.json');
    writeFileSync(fig, JSON.stringify({ y: 2 }));
    const r = readAll([css, fig]);
    assert.equal(r.length, 2);
    assert.equal(r[0].format, 'css-vars');
    assert.equal(r[1].format, 'figma');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('23-08: readAll throws on non-array', () => {
  assert.throws(() => readAll('not-an-array'), /array/);
});

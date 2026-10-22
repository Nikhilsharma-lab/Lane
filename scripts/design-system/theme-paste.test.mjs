import { test } from 'node:test'
import assert from 'node:assert/strict'
import { replaceTweakcnHalf, tweakcnHalf } from './theme-paste.mjs'

const theme = `@import "tailwindcss";

:root {
  --background: oklch(0.97 0 0);
}

.dark {
  --background: oklch(0.2 0 0);
}

@theme inline {
  --color-background: var(--background);
}

/* Lane additions
   kept */
:root {
  --success: green;
}
`

const exported = `@import "tailwindcss";
:root {
  --background: oklch(0.9 0.02 250);
}
.dark {
  --background: oklch(0.15 0.02 250);
}
@theme inline {
  --color-background: var(--background);
}`

test('a pasted export replaces only the tweakcn half', () => {
  const next = replaceTweakcnHalf(theme, exported)
  assert.ok(next.startsWith(exported))
  assert.ok(next.includes('oklch(0.9 0.02 250)'))
  assert.ok(!next.includes('oklch(0.97 0 0)'))
  assert.ok(next.includes('/* Lane additions\n   kept */\n:root {\n  --success: green;'))
})

test('a paste without :root, .dark and @theme inline is refused', () => {
  assert.throws(() => replaceTweakcnHalf(theme, ':root { --background: red; }'), /doesn't look like a tweakcn export/)
})

test('pasting the whole theme file back is refused', () => {
  assert.throws(() => replaceTweakcnHalf(theme, theme), /already holds the Lane additions/)
})

test('a theme file without the Lane additions marker is refused', () => {
  assert.throws(() => replaceTweakcnHalf(exported, exported), /Lane additions/)
})

test('the tweakcn half is everything above the Lane additions', () => {
  const half = tweakcnHalf(theme)
  assert.ok(half.startsWith('@import "tailwindcss";'))
  assert.ok(half.endsWith('}'))
  assert.ok(!half.includes('Lane additions'))
  assert.ok(!half.includes('--success'))
})

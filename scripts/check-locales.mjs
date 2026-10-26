#!/usr/bin/env node
// Verifies every locale in a game's locales directory (argument, default src/locales of the current directory) has the
// same keys, the same {placeholders} per string, matching array lengths, and no empty strings. Exits with code 1 on any mismatch.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const localesDir = resolve(process.argv[2] ?? join('src', 'locales'))
const label = relative(join(import.meta.dirname, '..'), localesDir)
const reference = 'vi'

const flatten = (node, prefix = '', out = new Map()) => {
  if (typeof node === 'string' || Array.isArray(node)) {
    out.set(prefix, node)
    return out
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) flatten(value, prefix ? `${prefix}.${key}` : key, out)
    return out
  }
  out.set(prefix, node)
  return out
}

const placeholders = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort().join(',')

const locales = Object.fromEntries(
  readdirSync(localesDir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => [file.replace(/\.json$/, ''), flatten(JSON.parse(readFileSync(join(localesDir, file), 'utf8')))]),
)

const errors = []
const base = locales[reference]
if (!base) {
  console.error(`Missing reference locale ${reference}.json`)
  process.exit(1)
}

for (const [lang, entries] of Object.entries(locales)) {
  for (const [key, value] of entries) {
    if (typeof value !== 'string' && !Array.isArray(value)) errors.push(`${lang}: ${key} must be a string or string array`)
    const items = Array.isArray(value) ? value : [value]
    if (items.length === 0) errors.push(`${lang}: ${key} is an empty list`)
    items.forEach((item, index) => {
      if (typeof item !== 'string' || item.trim() === '') errors.push(`${lang}: ${key}${Array.isArray(value) ? `[${index}]` : ''} is empty`)
    })
  }
  if (lang === reference) continue
  for (const [key, value] of base) {
    if (!entries.has(key)) {
      errors.push(`${lang}: missing key ${key}`)
      continue
    }
    const other = entries.get(key)
    if (Array.isArray(value) !== Array.isArray(other)) {
      errors.push(`${lang}: ${key} must be ${Array.isArray(value) ? 'an array' : 'a string'} like ${reference}`)
      continue
    }
    if (Array.isArray(value)) {
      if (value.length !== other.length) errors.push(`${lang}: ${key} has ${other.length} lines, ${reference} has ${value.length}`)
      const expected = [...new Set(value.map(placeholders))].join('|')
      const actual = [...new Set(other.map(placeholders))].join('|')
      if (expected !== actual) errors.push(`${lang}: ${key} placeholders {${actual}} differ from {${expected}}`)
    } else if (placeholders(value) !== placeholders(other)) {
      errors.push(`${lang}: ${key} placeholders {${placeholders(other)}} differ from {${placeholders(value)}}`)
    }
  }
  for (const key of entries.keys()) {
    if (!base.has(key)) errors.push(`${lang}: extra key ${key} not in ${reference}`)
  }
}

if (errors.length) {
  console.error(`Locale check failed for ${label} (${errors.length}):\n${errors.map((error) => `  - ${error}`).join('\n')}`)
  process.exit(1)
}
console.log(`Locale check passed for ${label}: ${Object.keys(locales).join(', ')} share ${base.size} keys.`)

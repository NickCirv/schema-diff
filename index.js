#!/usr/bin/env node
/**
 * schema-diff — Diff JSON Schemas and SQL schemas.
 * Spot breaking API changes before they hit production.
 *
 * Zero dependencies. Node 18+. MIT.
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, extname } from 'path'
import { createRequire } from 'module'

// ─────────────────────────────────────────────
// CLI Argument Parsing
// ─────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2)
  const opts = {
    files: [],
    breaking: false,
    format: 'table',
    ignore: [],
    ai: false,
    help: false,
    version: false,
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--help' || arg === '-h') {
      opts.help = true
    } else if (arg === '--version' || arg === '-v') {
      opts.version = true
    } else if (arg === '--breaking' || arg === '-b') {
      opts.breaking = true
    } else if (arg === '--ai') {
      opts.ai = true
    } else if (arg === '--format' || arg === '-f') {
      opts.format = args[++i] || 'table'
    } else if (arg === '--ignore' || arg === '-i') {
      const val = args[++i]
      if (val) opts.ignore.push(val)
    } else if (!arg.startsWith('-')) {
      opts.files.push(arg)
    }
  }

  return opts
}

// ─────────────────────────────────────────────
// Help / Version
// ─────────────────────────────────────────────

function printHelp() {
  console.log(`
schema-diff v1.0.0
Diff JSON Schemas and SQL schemas. Spot breaking API changes before deploying.

USAGE
  schema-diff <schema1> <schema2> [options]
  sdiff <schema1> <schema2> [options]

ARGUMENTS
  schema1     Path to first schema file (.json or .sql)
  schema2     Path to second schema file (.json or .sql)

OPTIONS
  --breaking       Show only breaking changes
  --format         Output format: table (default), json, patch
  --ignore <path>  Ignore a specific property path (repeatable)
  --ai             AI summary via ANTHROPIC_API_KEY
  -h, --help       Show this help message
  -v, --version    Show version

EXAMPLES
  schema-diff v1.json v2.json
  schema-diff v1.json v2.json --breaking
  schema-diff v1.json v2.json --format json
  schema-diff v1.json v2.json --format patch
  schema-diff v1.sql v2.sql
  schema-diff v1.json v2.json --ignore properties.internal

EXIT CODES
  0   No breaking changes
  1   Breaking changes detected
  2   Error (file not found, parse error, etc.)
`.trim())
}

function printVersion() {
  console.log('1.0.0')
}

// ─────────────────────────────────────────────
// File Loading & Detection
// ─────────────────────────────────────────────

function loadFile(filePath) {
  const fullPath = resolve(filePath)
  if (!existsSync(fullPath)) {
    throw new Error(`File not found: ${filePath}`)
  }
  return readFileSync(fullPath, 'utf-8')
}

function detectType(filePath) {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.sql') return 'sql'
  if (ext === '.json') return 'json'
  // Try to detect by content
  const content = loadFile(filePath)
  if (content.trim().toLowerCase().startsWith('create')) return 'sql'
  return 'json'
}

// ─────────────────────────────────────────────
// JSON Schema: $ref Resolution
// ─────────────────────────────────────────────

function resolveRefs(schema, root) {
  if (typeof schema !== 'object' || schema === null) return schema
  if (Array.isArray(schema)) return schema.map(item => resolveRefs(item, root))

  if (schema.$ref && typeof schema.$ref === 'string') {
    const refPath = schema.$ref
    if (refPath.startsWith('#/')) {
      const parts = refPath.slice(2).split('/')
      let resolved = root
      for (const part of parts) {
        if (resolved == null) break
        resolved = resolved[decodeURIComponent(part.replace(/~1/g, '/').replace(/~0/g, '~'))]
      }
      if (resolved != null) {
        return resolveRefs({ ...resolved, ...Object.fromEntries(Object.entries(schema).filter(([k]) => k !== '$ref')) }, root)
      }
    }
    return schema
  }

  const result = {}
  for (const [key, val] of Object.entries(schema)) {
    result[key] = resolveRefs(val, root)
  }
  return result
}

// ─────────────────────────────────────────────
// JSON Schema Diffing
// ─────────────────────────────────────────────

/**
 * Flatten a JSON Schema into a map of path -> descriptor
 * Each descriptor: { type, required, format, enum, nullable, pattern, minimum, maximum, description }
 */
function flattenSchema(schema, path = '', required = [], parent = null, result = {}) {
  if (typeof schema !== 'object' || schema === null) return result

  const effectiveRequired = schema.required || required

  // Handle properties
  if (schema.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      const propPath = path ? `${path}.${key}` : `properties.${key}`
      const isRequired = effectiveRequired.includes(key)
      const descriptor = extractDescriptor(propSchema, isRequired)
      result[propPath] = descriptor

      // Recurse into nested objects
      if (propSchema.type === 'object' || propSchema.properties) {
        flattenSchema(propSchema, propPath, propSchema.required || [], propSchema, result)
      }

      // Recurse into array items
      if ((propSchema.type === 'array' || Array.isArray(propSchema.items)) && propSchema.items) {
        const itemsPath = `${propPath}.items`
        const itemDescriptor = extractDescriptor(propSchema.items, false)
        result[itemsPath] = itemDescriptor
        if (propSchema.items.type === 'object' || propSchema.items.properties) {
          flattenSchema(propSchema.items, itemsPath, propSchema.items.required || [], propSchema.items, result)
        }
      }
    }
  }

  // Handle additionalProperties
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
    const apPath = path ? `${path}.additionalProperties` : 'additionalProperties'
    result[apPath] = extractDescriptor(schema.additionalProperties, false)
  }

  return result
}

function extractDescriptor(schema, isRequired) {
  if (typeof schema !== 'object' || schema === null) return { type: String(schema), required: isRequired }

  // Normalize type — handle array types
  let type = schema.type
  if (Array.isArray(type)) {
    const nonNull = type.filter(t => t !== 'null')
    type = nonNull.length === 1 ? nonNull[0] : nonNull.join('|')
  }

  return {
    type: type || (schema.enum ? 'enum' : 'any'),
    required: isRequired,
    format: schema.format || null,
    enum: schema.enum ? [...schema.enum].sort() : null,
    nullable: schema.nullable || (Array.isArray(schema.type) && schema.type.includes('null')) || false,
    pattern: schema.pattern || null,
    minimum: schema.minimum ?? schema.minLength ?? null,
    maximum: schema.maximum ?? schema.maxLength ?? null,
    description: schema.description || null,
    default: schema.default !== undefined ? schema.default : undefined,
  }
}

/**
 * Classify a change as breaking or non-breaking.
 */
function classifyChange(kind, path, before, after) {
  // Removals are always breaking
  if (kind === 'removed') return true

  // Adding required property is breaking
  if (kind === 'added' && after.required) return true

  // Type change
  if (kind === 'changed' && before.type !== after.type) {
    // Widening (adding union types, any) — usually non-breaking
    // Narrowing — breaking
    if (after.type === 'any') return false
    return true
  }

  // Format change is breaking (affects validation)
  if (kind === 'changed' && before.format !== after.format) return true

  // Required change: false → true is breaking
  if (kind === 'changed' && !before.required && after.required) return true

  // Enum: removing values is breaking
  if (kind === 'changed' && before.enum && after.enum) {
    const removed = before.enum.filter(v => !after.enum.includes(v))
    if (removed.length > 0) return true
    return false
  }

  // Pattern becoming stricter — breaking (can't easily detect, treat as breaking)
  if (kind === 'changed' && before.pattern !== after.pattern && after.pattern !== null) return true

  // Minimum/Maximum becoming stricter
  if (kind === 'changed' && after.minimum !== null && (before.minimum === null || after.minimum > before.minimum)) return true
  if (kind === 'changed' && after.maximum !== null && (before.maximum === null || after.maximum < before.maximum)) return true

  return false
}

function diffJsonSchemas(schema1Text, schema2Text, ignoreList = []) {
  let raw1, raw2
  try {
    raw1 = JSON.parse(schema1Text)
  } catch (e) {
    throw new Error(`Failed to parse schema1 as JSON: ${e.message}`)
  }
  try {
    raw2 = JSON.parse(schema2Text)
  } catch (e) {
    throw new Error(`Failed to parse schema2 as JSON: ${e.message}`)
  }

  const s1 = resolveRefs(raw1, raw1)
  const s2 = resolveRefs(raw2, raw2)

  const flat1 = flattenSchema(s1)
  const flat2 = flattenSchema(s2)

  const schemaName = raw1.title || raw2.title || 'Schema'

  const changes = []
  const allPaths = new Set([...Object.keys(flat1), ...Object.keys(flat2)])

  for (const path of allPaths) {
    if (ignoreList.some(ignored => path === ignored || path.startsWith(ignored + '.'))) continue

    const inS1 = path in flat1
    const inS2 = path in flat2

    if (!inS1 && inS2) {
      const d = flat2[path]
      const breaking = classifyChange('added', path, null, d)
      changes.push({ kind: 'added', path, before: null, after: d, breaking })
    } else if (inS1 && !inS2) {
      const d = flat1[path]
      const breaking = classifyChange('removed', path, d, null)
      changes.push({ kind: 'removed', path, before: d, after: null, breaking })
    } else {
      const d1 = flat1[path]
      const d2 = flat2[path]
      const diffs = getFieldDiffs(d1, d2)
      if (diffs.length > 0) {
        const breaking = classifyChange('changed', path, d1, d2)
        changes.push({ kind: 'changed', path, before: d1, after: d2, diffs, breaking })
      }
    }
  }

  return { schemaName, changes, type: 'json' }
}

function getFieldDiffs(d1, d2) {
  const diffs = []
  const fields = ['type', 'required', 'format', 'enum', 'nullable', 'pattern', 'minimum', 'maximum']
  for (const f of fields) {
    const v1 = f === 'enum' ? JSON.stringify(d1[f]) : String(d1[f] ?? 'null')
    const v2 = f === 'enum' ? JSON.stringify(d2[f]) : String(d2[f] ?? 'null')
    if (v1 !== v2) diffs.push({ field: f, before: d1[f], after: d2[f] })
  }
  return diffs
}

// ─────────────────────────────────────────────
// SQL Schema Diffing
// ─────────────────────────────────────────────

/**
 * Parse CREATE TABLE statements from SQL.
 * Returns: Map<tableName, Map<columnName, descriptor>>
 */
function parseSql(sql) {
  const tables = new Map()
  // Match CREATE TABLE ... (...) with various modifiers
  const createTableRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?(\w+)[`"']?\s*\(([^;]+?)\)\s*;?/gis
  let match

  while ((match = createTableRegex.exec(sql)) !== null) {
    const tableName = match[1].toLowerCase()
    const body = match[2]
    const columns = parseColumns(body)
    tables.set(tableName, columns)
  }

  return tables
}

function parseColumns(body) {
  const columns = new Map()
  // Split on commas not inside parens
  const lines = splitColumnsRaw(body)

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Skip table-level constraints
    if (/^(PRIMARY\s+KEY|UNIQUE|INDEX|KEY|CONSTRAINT|CHECK|FOREIGN\s+KEY)/i.test(trimmed)) continue

    const col = parseColumn(trimmed)
    if (col) {
      columns.set(col.name.toLowerCase(), col)
    }
  }

  return columns
}

function splitColumnsRaw(body) {
  const result = []
  let depth = 0
  let current = ''

  for (const ch of body) {
    if (ch === '(') { depth++; current += ch }
    else if (ch === ')') { depth--; current += ch }
    else if (ch === ',' && depth === 0) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) result.push(current)
  return result
}

function parseColumn(line) {
  // column_name TYPE [constraints...]
  const m = line.match(/^[`"']?(\w+)[`"']?\s+(\S+(?:\([^)]*\))?)(.*)?$/i)
  if (!m) return null

  const name = m[1]
  const rawType = m[2].toUpperCase()
  const rest = (m[3] || '').toUpperCase()

  const notNull = /NOT\s+NULL/.test(rest) || /NOT\s+NULL/.test(rawType)
  const hasDefault = /DEFAULT\s+/.test(rest)
  const isPrimary = /PRIMARY\s+KEY/.test(rest) || /PRIMARY\s+KEY/.test(rawType)
  const isUnique = /UNIQUE/.test(rest)
  const autoIncrement = /AUTO_INCREMENT|AUTOINCREMENT|SERIAL/.test(rest) || /AUTO_INCREMENT|AUTOINCREMENT|SERIAL/.test(rawType)
  const references = rest.match(/REFERENCES\s+[`"']?(\w+)[`"']?\s*\([`"']?(\w+)[`"']?\)/i)

  // Extract base type without size
  const baseType = rawType.replace(/\([^)]*\)/, '').trim()
  const sizeMatch = rawType.match(/\(([^)]+)\)/)
  const size = sizeMatch ? sizeMatch[1] : null

  return {
    name,
    type: baseType,
    size,
    notNull,
    hasDefault,
    isPrimary,
    isUnique,
    autoIncrement,
    references: references ? `${references[1]}.${references[2]}` : null,
  }
}

function diffSqlSchemas(sql1Text, sql2Text, ignoreList = []) {
  const tables1 = parseSql(sql1Text)
  const tables2 = parseSql(sql2Text)

  const changes = []
  const allTables = new Set([...tables1.keys(), ...tables2.keys()])

  for (const table of allTables) {
    if (ignoreList.includes(table)) continue

    const has1 = tables1.has(table)
    const has2 = tables2.has(table)

    if (!has1 && has2) {
      changes.push({ kind: 'added', path: `table:${table}`, before: null, after: { type: 'table' }, breaking: false })
      continue
    }
    if (has1 && !has2) {
      changes.push({ kind: 'removed', path: `table:${table}`, before: { type: 'table' }, after: null, breaking: true })
      continue
    }

    const cols1 = tables1.get(table)
    const cols2 = tables2.get(table)
    const allCols = new Set([...cols1.keys(), ...cols2.keys()])

    for (const col of allCols) {
      const path = `${table}.${col}`
      if (ignoreList.some(ig => path === ig || path.startsWith(ig + '.'))) continue

      const c1 = cols1.get(col)
      const c2 = cols2.get(col)

      if (!c1 && c2) {
        const breaking = c2.notNull && !c2.hasDefault
        changes.push({ kind: 'added', path, before: null, after: c2, breaking })
      } else if (c1 && !c2) {
        changes.push({ kind: 'removed', path, before: c1, after: null, breaking: true })
      } else {
        const diffs = getSqlColumnDiffs(c1, c2)
        if (diffs.length > 0) {
          const breaking = isSqlChangeBreaking(diffs)
          changes.push({ kind: 'changed', path, before: c1, after: c2, diffs, breaking })
        }
      }
    }
  }

  return { schemaName: 'SQL Schema', changes, type: 'sql' }
}

function getSqlColumnDiffs(c1, c2) {
  const diffs = []
  const fields = ['type', 'size', 'notNull', 'isPrimary', 'isUnique', 'autoIncrement', 'references']
  for (const f of fields) {
    if (String(c1[f]) !== String(c2[f])) {
      diffs.push({ field: f, before: c1[f], after: c2[f] })
    }
  }
  return diffs
}

function isSqlChangeBreaking(diffs) {
  for (const d of diffs) {
    if (d.field === 'type') return true
    if (d.field === 'notNull' && d.after === true) return true
    if (d.field === 'size' && d.after !== null && d.before !== null) {
      // Shrinking size is breaking
      const before = parseInt(d.before)
      const after = parseInt(d.after)
      if (!isNaN(before) && !isNaN(after) && after < before) return true
    }
    if (d.field === 'references' && d.before !== null) return true
  }
  return false
}

// ─────────────────────────────────────────────
// Output Formatters
// ─────────────────────────────────────────────

const RESET = '\x1b[0m'
const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const CYAN = '\x1b[36m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'

function kindSymbol(kind) {
  if (kind === 'added') return GREEN + '+' + RESET
  if (kind === 'removed') return RED + '-' + RESET
  return CYAN + '~' + RESET
}

function formatTable(result, opts) {
  const { schemaName, changes } = result
  const filtered = opts.breaking ? changes.filter(c => c.breaking) : changes

  if (filtered.length === 0) {
    console.log(`\n${BOLD}schema-diff · ${schemaName}${RESET}`)
    console.log('━'.repeat(42))
    console.log(`${GREEN}No changes detected.${RESET}\n`)
    return
  }

  const breaking = filtered.filter(c => c.breaking)
  const nonBreaking = filtered.filter(c => !c.breaking)

  console.log(`\n${BOLD}schema-diff · ${schemaName}${RESET}`)
  console.log('━'.repeat(42))

  for (const change of filtered) {
    const sym = kindSymbol(change.kind)
    const warn = change.breaking ? ` ${RED}⚠ breaking${RESET}` : ''

    if (change.kind === 'added') {
      const d = change.after
      const desc = result.type === 'sql'
        ? `${d.type}${d.size ? `(${d.size})` : ''}${d.notNull ? ' NOT NULL' : ''}`
        : `${d.type}${d.required ? ' (required)' : ' (optional)'}`
      console.log(`${sym} ${BOLD}${change.path.padEnd(36)}${RESET} ${DIM}${desc}${RESET}${warn}`)
    } else if (change.kind === 'removed') {
      console.log(`${sym} ${BOLD}${change.path.padEnd(36)}${RESET} ${DIM}removed${RESET}${warn}`)
    } else {
      // Changed — show each sub-diff
      if (change.diffs && change.diffs.length === 1) {
        const d = change.diffs[0]
        const before = formatValue(d.before)
        const after = formatValue(d.after)
        console.log(`${sym} ${BOLD}${(change.path + '.' + d.field).padEnd(36)}${RESET} ${DIM}${before}${RESET} → ${DIM}${after}${RESET}${warn}`)
      } else if (change.diffs) {
        for (const d of change.diffs) {
          const before = formatValue(d.before)
          const after = formatValue(d.after)
          const subWarn = change.breaking ? ` ${RED}⚠ breaking${RESET}` : ''
          console.log(`${sym} ${BOLD}${(change.path + '.' + d.field).padEnd(36)}${RESET} ${DIM}${before}${RESET} → ${DIM}${after}${RESET}${subWarn}`)
        }
      }
    }
  }

  console.log('━'.repeat(42))

  const parts = []
  if (breaking.length > 0) parts.push(`${RED}${breaking.length} breaking${RESET}`)
  if (nonBreaking.length > 0) parts.push(`${GREEN}${nonBreaking.length} non-breaking${RESET}`)
  console.log(parts.join(' · ') + '\n')
}

function formatValue(val) {
  if (val === null || val === undefined) return 'null'
  if (Array.isArray(val)) return JSON.stringify(val)
  return String(val)
}

function formatJson(result, opts) {
  const { changes } = result
  const filtered = opts.breaking ? changes.filter(c => c.breaking) : changes
  console.log(JSON.stringify({
    schema: result.schemaName,
    type: result.type,
    summary: {
      total: filtered.length,
      breaking: filtered.filter(c => c.breaking).length,
      nonBreaking: filtered.filter(c => !c.breaking).length,
    },
    changes: filtered,
  }, null, 2))
}

/**
 * JSON Patch (RFC 6902) output for JSON Schema changes.
 */
function formatPatch(result, opts) {
  const { changes } = result
  const filtered = opts.breaking ? changes.filter(c => c.breaking) : changes
  const ops = []

  for (const change of filtered) {
    // Convert dot-notation path to JSON Pointer
    const pointer = '/' + change.path.replace(/\./g, '/')

    if (change.kind === 'added') {
      ops.push({ op: 'add', path: pointer, value: change.after })
    } else if (change.kind === 'removed') {
      ops.push({ op: 'remove', path: pointer })
    } else if (change.diffs) {
      for (const d of change.diffs) {
        const fieldPointer = pointer + '/' + d.field
        ops.push({ op: 'replace', path: fieldPointer, value: d.after })
      }
    }
  }

  console.log(JSON.stringify(ops, null, 2))
}

// ─────────────────────────────────────────────
// AI Summary (raw HTTPS, no SDK, no hardcoded keys)
// ─────────────────────────────────────────────

async function getAiSummary(result) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('--ai flag requires ANTHROPIC_API_KEY environment variable')
    return
  }

  const { changes, schemaName } = result
  const breaking = changes.filter(c => c.breaking)
  const nonBreaking = changes.filter(c => !c.breaking)

  const prompt = `You are a senior API engineer reviewing schema changes.

Schema: ${schemaName}
Type: ${result.type}

Breaking changes (${breaking.length}):
${breaking.map(c => `- ${c.kind}: ${c.path}`).join('\n') || 'None'}

Non-breaking changes (${nonBreaking.length}):
${nonBreaking.map(c => `- ${c.kind}: ${c.path}`).join('\n') || 'None'}

Write a concise 3-5 sentence summary for an engineering team.
Cover: what changed, what's at risk, migration advice if needed.
Be direct and technical.`

  try {
    const body = JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    })

    const url = new URL('https://api.anthropic.com/v1/messages')
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    }

    // Use native fetch (Node 18+)
    const response = await fetch(url.toString(), { ...options, body })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`API error ${response.status}: ${err}`)
    }

    const data = await response.json()
    const text = data?.content?.[0]?.text || ''

    console.log('\n' + BOLD + 'AI Summary' + RESET)
    console.log('─'.repeat(42))
    console.log(text)
    console.log()
  } catch (err) {
    console.error(`AI summary failed: ${err.message}`)
  }
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv)

  if (opts.help) {
    printHelp()
    process.exit(0)
  }

  if (opts.version) {
    printVersion()
    process.exit(0)
  }

  if (opts.files.length < 2) {
    console.error('Error: two schema files are required.\n')
    printHelp()
    process.exit(2)
  }

  if (!['table', 'json', 'patch'].includes(opts.format)) {
    console.error(`Error: invalid format "${opts.format}". Use table, json, or patch.`)
    process.exit(2)
  }

  let schema1Text, schema2Text
  try {
    schema1Text = loadFile(opts.files[0])
    schema2Text = loadFile(opts.files[1])
  } catch (err) {
    console.error(`Error: ${err.message}`)
    process.exit(2)
  }

  const type1 = detectType(opts.files[0])
  const type2 = detectType(opts.files[1])

  if (type1 !== type2) {
    console.error(`Error: cannot diff a ${type1} schema against a ${type2} schema.`)
    process.exit(2)
  }

  let result
  try {
    if (type1 === 'sql') {
      result = diffSqlSchemas(schema1Text, schema2Text, opts.ignore)
    } else {
      result = diffJsonSchemas(schema1Text, schema2Text, opts.ignore)
    }
  } catch (err) {
    console.error(`Error: ${err.message}`)
    process.exit(2)
  }

  switch (opts.format) {
    case 'json':
      formatJson(result, opts)
      break
    case 'patch':
      formatPatch(result, opts)
      break
    default:
      formatTable(result, opts)
  }

  if (opts.ai) {
    await getAiSummary(result)
  }

  const hasBreaking = result.changes.some(c => c.breaking)
  process.exit(hasBreaking ? 1 : 0)
}

main().catch(err => {
  console.error('Unexpected error:', err.message)
  process.exit(2)
})

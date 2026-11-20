// pgTAP runner for the hosted dev database (no Docker / `supabase test db` needed).
//   pnpm test:db                          # every supabase/tests/**/*.sql
//   pnpm test:db supabase/tests/005_status_now.test.sql
// Connects with DIRECT_URL from .env.local / .env. Each test file must wrap itself in
// `begin; … rollback;` so it leaves no data behind. Never point DIRECT_URL at production.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { config } from 'dotenv'
import pg from 'pg'

config({ path: ['.env.local', '.env'], quiet: true })

const url = process.env.DIRECT_URL
if (!url) {
  console.error('DIRECT_URL is not set (see .env.example).')
  process.exit(1)
}

const listSqlFiles = (path) =>
  statSync(path).isDirectory()
    ? readdirSync(path)
        .sort()
        .flatMap((name) => listSqlFiles(join(path, name)))
    : path.endsWith('.sql')
      ? [path]
      : []

const files = (process.argv.length > 2 ? process.argv.slice(2) : ['supabase/tests']).flatMap(
  listSqlFiles,
)
if (files.length === 0) {
  console.error('No .sql test files found.')
  process.exit(1)
}

const { hostname, port } = new URL(url)
console.log(`# pgTAP on ${hostname}:${port}\n`)

const isTap = (line) => /^(ok|not ok|1\.\.\d+|#)/.test(line)
let failedFiles = 0

for (const file of files) {
  const sql = readFileSync(file, 'utf8')
  const client = new pg.Client({ connectionString: url })
  const lines = []
  let error

  await client.connect()
  try {
    // Simple query protocol: runs the whole file and returns one result per statement.
    const results = [await client.query(sql)].flat()
    for (const result of results) {
      for (const row of result.rows ?? []) {
        for (const value of Object.values(row)) {
          if (typeof value === 'string') lines.push(...value.split('\n').filter(isTap))
        }
      }
    }
  } catch (e) {
    error = e
  } finally {
    await client.query('rollback').catch(() => {})
    await client.end()
  }

  const planned = Number(lines.find((l) => l.startsWith('1..'))?.slice(3) ?? NaN)
  const ran = lines.filter((l) => /^(ok|not ok)\b/.test(l)).length
  const notOk = lines.filter((l) => l.startsWith('not ok')).length
  const passed = !error && notOk === 0 && ran === planned

  console.log(`${passed ? 'PASS' : 'FAIL'} ${relative(process.cwd(), file)}`)
  if (!passed) {
    failedFiles++
    for (const line of lines) console.log(`  ${line}`)
    if (error) {
      const at = error.position ? sql.slice(0, Number(error.position)).split('\n').length : '?'
      console.log(`  ERROR at line ${at}: ${error.message}`)
    } else if (ran !== planned) {
      console.log(`  planned ${planned} tests but ran ${ran}`)
    }
  } else {
    console.log(`  ${ran} tests`)
  }
}

console.log(`\n# ${files.length - failedFiles}/${files.length} files passed`)
process.exit(failedFiles ? 1 : 0)

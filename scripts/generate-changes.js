#!/usr/bin/env node

/**
 * Change Metadata Generator for Hugo
 *
 * Scans git history for recently modified content files and generates
 * diff metadata (added/removed lines, affected sections) for use
 * in Hugo templates via data/changes.json.
 *
 * Usage: node generate-changes.js [--days=N] [--clean]
 *
 * Zero npm dependencies — uses only Node.js built-ins.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Resolve Hugo project root (3 levels up from themes/stack/scripts/)
const HUGO_ROOT = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(HUGO_ROOT, 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'changes.json');

// Parse CLI arguments
const args = process.argv.slice(2);
const cleanMode = args.includes('--clean');
const daysArg = args.find(a => a.startsWith('--days='));
const days = daysArg ? parseInt(daysArg.split('=')[1], 10) : 30;
if (isNaN(days) || days < 1) {
  console.error('Invalid --days value. Usage: --days=N (positive integer)');
  process.exit(1);
}

/**
 * Run a git command from the Hugo root and return stdout.
 * Returns empty string on failure.
 */
function git(cmd) {
  try {
    return execSync(`git ${cmd}`, { cwd: HUGO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

/**
 * Parse markdown headings from file content.
 * Returns array of { line, level, text } sorted by line number.
 */
function parseHeadings(content) {
  const headings = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,3})\s+(.+)$/);
    if (match) {
      // Clean markdown formatting: resolve [text](url) links, remove *, _, `, emoji
      const text = match[2]
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')  // [text](url) → text
        .replace(/[*_`]/g, '')
        .trim();
      headings.push({ line: i + 1, level: match[1].length, text });
    }
  }

  return headings;
}

/**
 * Find the nearest heading above a given line number.
 */
function findNearestHeading(headings, lineNum) {
  let nearest = null;

  for (const h of headings) {
    if (h.line <= lineNum) {
      nearest = h;
    } else {
      break;
    }
  }

  return nearest;
}

/**
 * Map diff hunks to section names using heading positions.
 * Returns deduplicated array of section names (max 3).
 */
function mapHunksToSections(diffOutput, headings) {
  const sections = new Set();

  // Parse @@ hunk headers — format: @@ -old,count +new,count @@
  const hunkRegex = /^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/gm;
  let match;

  while ((match = hunkRegex.exec(diffOutput)) !== null) {
    const newLineStart = parseInt(match[1], 10);
    const heading = findNearestHeading(headings, newLineStart);
    if (heading) {
      sections.add(heading.text);
    }
  }

  return Array.from(sections).slice(0, 3);
}

/**
 * Process a single file and return its change metadata.
 */
function processFile(filePath) {
  // Get last 2 commit hashes for this file
  const hashOutput = git(`log -2 --format="%H" -- "${filePath}"`);
  const hashes = hashOutput.split('\n').filter(Boolean);

  if (hashes.length === 0) return null;

  // Get commit date and message from the latest commit
  const commitInfo = git(`log -1 --format="%ai|%s" -- "${filePath}"`);
  const [rawDate, ...msgParts] = commitInfo.split('|');
  const commitDate = rawDate ? rawDate.slice(0, 10) : '';
  let commitMsg = msgParts.join('|').trim();
  if (commitMsg.length > 80) {
    commitMsg = commitMsg.slice(0, 77) + '...';
  }

  const absPath = path.join(HUGO_ROOT, filePath);

  if (hashes.length === 1) {
    // New file — only 1 commit
    let lineCount = 0;
    try {
      const content = fs.readFileSync(absPath, 'utf8');
      lineCount = content.split('\n').length;
    } catch {
      // File might have been deleted since the commit
    }

    return {
      type: 'new',
      added: lineCount,
      removed: 0,
      net: lineCount,
      sections: [],
      commitDate,
      commitMsg,
    };
  }

  // Modified file — 2+ commits
  const [latest, prev] = hashes;

  // Get numstat for added/removed counts
  const numstat = git(`diff --numstat ${prev}..${latest} -- "${filePath}"`);
  let added = 0;
  let removed = 0;

  if (numstat) {
    const parts = numstat.split('\t');
    // Binary files show '-' for both counts
    if (parts[0] === '-' || parts[1] === '-') return null;
    added = parseInt(parts[0], 10) || 0;
    removed = parseInt(parts[1], 10) || 0;
  }

  // Map hunks to sections
  let sections = [];
  try {
    const content = fs.readFileSync(absPath, 'utf8');
    const headings = parseHeadings(content);

    if (headings.length > 0) {
      const unifiedDiff = git(`diff -U0 ${prev}..${latest} -- "${filePath}"`);
      sections = mapHunksToSections(unifiedDiff, headings);
    }
  } catch {
    // File may not exist on disk (deleted) — sections stay empty
  }

  return {
    type: 'modified',
    added,
    removed,
    net: added - removed,
    sections,
    commitDate,
    commitMsg,
  };
}

/**
 * Main function
 */
function main() {
  console.log('Change Metadata Generator for Hugo');
  console.log('===================================');
  console.log(`Hugo root: ${HUGO_ROOT}`);
  console.log('');

  // Clean mode
  if (cleanMode) {
    if (fs.existsSync(OUTPUT_FILE)) {
      fs.unlinkSync(OUTPUT_FILE);
      console.log(`Removed ${OUTPUT_FILE}`);
    } else {
      console.log('Nothing to clean.');
    }
    return;
  }

  // Find content files modified in last N days
  console.log(`Scanning git history (last ${days} days)...`);
  const rawFiles = git(
    `log --since="${days} days ago" --name-only --diff-filter=ACMR --format="" -- "content/posts/*/index.md" "content/journals/*/index.md"`
  );

  if (!rawFiles) {
    console.log('  No modified content files found.');
    // Write empty output
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ _generated: true, files: {} }, null, 2));
    console.log(`Wrote ${OUTPUT_FILE} (empty)`);
    return;
  }

  // Deduplicate file paths
  const files = [...new Set(rawFiles.split('\n').filter(f => f.endsWith('.md')))];
  console.log(`  Found ${files.length} modified files`);

  // Process each file
  console.log('Processing changes...');
  const result = { _generated: true, files: {} };

  for (const file of files) {
    // Normalize path separators to forward slashes
    const normalizedPath = file.replace(/\\/g, '/');

    // Key is relative to content/ (strip "content/" prefix)
    const key = normalizedPath.replace(/^content\//, '');

    const metadata = processFile(normalizedPath);
    if (metadata) {
      result.files[key] = metadata;
      console.log(`  ${metadata.type === 'new' ? '+' : '~'} ${key} (+${metadata.added}/-${metadata.removed})`);
    }
  }

  // Write output
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));

  const fileCount = Object.keys(result.files).length;
  console.log('');
  console.log(`Done! Wrote ${fileCount} entries to ${OUTPUT_FILE}`);
}

main();

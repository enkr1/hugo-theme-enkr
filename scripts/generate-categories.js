#!/usr/bin/env node

/**
 * Nested Category Generator for Hugo
 *
 * Scans content files for nested array categories like ["A", "B", "C"]
 * and generates _index.md files at content/categories/a/b/c/
 *
 * Usage: node generate-categories.js [--content-dir=path] [--clean]
 */

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

// Configuration
const DEFAULT_CONTENT_DIR = path.resolve(__dirname, '../../../content');
const CATEGORIES_DIR = 'categories';

// Parse command line arguments
const args = process.argv.slice(2);
const cleanMode = args.includes('--clean');
const contentDirArg = args.find(a => a.startsWith('--content-dir='));
const contentDir = contentDirArg
  ? path.resolve(contentDirArg.split('=')[1])
  : DEFAULT_CONTENT_DIR;

const categoriesDir = path.join(contentDir, CATEGORIES_DIR);

/**
 * Recursively find all markdown files in a directory
 */
function findMarkdownFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip the categories directory to avoid processing generated files
      if (entry.name === CATEGORIES_DIR) continue;
      findMarkdownFiles(fullPath, files);
    } else if (entry.name.endsWith('.md') && entry.name !== '_index.md') {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Extract nested array categories from frontmatter
 */
function extractCategoryPaths(frontmatter) {
  const categories = frontmatter.categories || [];
  const paths = [];

  for (const cat of categories) {
    if (Array.isArray(cat) && cat.length > 0 && typeof cat[0] === 'string') {
      // This is a nested category path like ["A", "B", "C"]
      paths.push(cat);
    }
  }

  return paths;
}

/**
 * Convert a category name to a URL-safe slug
 */
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/['']/g, '')           // Remove apostrophes
    .replace(/&/g, '-')             // Replace & with -
    .replace(/\//g, '-')            // Replace / with - (e.g., UI/UX -> ui-ux)
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')  // Keep Chinese chars, replace others with -
    .replace(/^-+|-+$/g, '')        // Trim leading/trailing dashes
    .replace(/-+/g, '-');           // Collapse multiple dashes
}

/**
 * Build a map of all unique category paths and their metadata
 */
function buildCategoryTree(categoryPaths) {
  const tree = new Map(); // slug-path -> { names: [...], posts: count, children: Set }

  for (const pathArray of categoryPaths) {
    // Process each level of the path
    for (let depth = 1; depth <= pathArray.length; depth++) {
      const slice = pathArray.slice(0, depth);
      const slugPath = slice.map(slugify).join('/');
      const name = slice[slice.length - 1];
      const parentSlugPath = depth > 1 ? slice.slice(0, -1).map(slugify).join('/') : null;

      if (!tree.has(slugPath)) {
        tree.set(slugPath, {
          names: slice,
          slugPath,
          name,
          parentSlugPath,
          postCount: 0,
          children: new Set(),
        });
      }

      // Increment post count only for the full path (leaf)
      if (depth === pathArray.length) {
        tree.get(slugPath).postCount++;
      }

      // Add as child to parent
      if (parentSlugPath && tree.has(parentSlugPath)) {
        tree.get(parentSlugPath).children.add(slugPath);
      }
    }
  }

  // Second pass: link children to parents that might have been created later
  for (const [slugPath, node] of tree) {
    if (node.parentSlugPath && tree.has(node.parentSlugPath)) {
      tree.get(node.parentSlugPath).children.add(slugPath);
    }
  }

  return tree;
}

/**
 * Generate _index.md content for a category node
 */
function generateIndexContent(node) {
  const frontmatter = {
    title: node.name,
    type: 'nested-category',  // Use custom template
    categoryPath: node.names,
    slug: slugify(node.name),
    _generated: true,
    _generatedAt: new Date().toISOString(),
  };

  if (node.parentSlugPath) {
    frontmatter.parentPath = node.names.slice(0, -1);
  }

  return matter.stringify('', frontmatter);
}

/**
 * Clean up previously generated category files
 */
function cleanGeneratedFiles(dir) {
  if (!fs.existsSync(dir)) return;

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      cleanGeneratedFiles(fullPath);

      // Remove empty directories
      const remaining = fs.readdirSync(fullPath);
      if (remaining.length === 0) {
        fs.rmdirSync(fullPath);
        console.log(`  Removed empty dir: ${fullPath}`);
      }
    } else if (entry.name === '_index.md') {
      // Check if this is a generated file
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const { data } = matter(content);
        if (data._generated) {
          fs.unlinkSync(fullPath);
          console.log(`  Removed: ${fullPath}`);
        }
      } catch (e) {
        // Ignore errors reading files
      }
    }
  }
}

/**
 * Main function
 */
function main() {
  console.log('Nested Category Generator for Hugo');
  console.log('===================================');
  console.log(`Content directory: ${contentDir}`);
  console.log(`Categories directory: ${categoriesDir}`);
  console.log('');

  // Clean mode: remove generated files and exit
  if (cleanMode) {
    console.log('Cleaning generated category files...');
    cleanGeneratedFiles(categoriesDir);
    console.log('Done!');
    return;
  }

  // Find all markdown files
  console.log('Scanning content files...');
  const mdFiles = findMarkdownFiles(contentDir);
  console.log(`  Found ${mdFiles.length} markdown files`);

  // Extract all category paths
  const allCategoryPaths = [];

  for (const filePath of mdFiles) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const { data } = matter(content);
      const paths = extractCategoryPaths(data);
      allCategoryPaths.push(...paths);
    } catch (e) {
      console.warn(`  Warning: Could not parse ${filePath}: ${e.message}`);
    }
  }

  console.log(`  Found ${allCategoryPaths.length} category paths`);

  // Build category tree
  console.log('Building category tree...');
  const tree = buildCategoryTree(allCategoryPaths);
  console.log(`  Created ${tree.size} category nodes`);

  // Generate _index.md files
  console.log('Generating category pages...');
  let created = 0;
  let updated = 0;

  for (const [slugPath, node] of tree) {
    const dirPath = path.join(categoriesDir, slugPath);
    const indexPath = path.join(dirPath, '_index.md');

    // Create directory if needed
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    // Generate content
    const content = generateIndexContent(node);

    // Check if file exists and is different
    let shouldWrite = true;
    if (fs.existsSync(indexPath)) {
      const existing = fs.readFileSync(indexPath, 'utf8');
      const { data: existingData } = matter(existing);

      // Don't overwrite non-generated files
      if (!existingData._generated) {
        console.log(`  Skipped (manual): ${slugPath}`);
        shouldWrite = false;
      } else {
        updated++;
      }
    } else {
      created++;
    }

    if (shouldWrite) {
      fs.writeFileSync(indexPath, content);
    }
  }

  console.log('');
  console.log('Summary:');
  console.log(`  Created: ${created} new category pages`);
  console.log(`  Updated: ${updated} existing pages`);
  console.log(`  Total: ${tree.size} category pages`);
  console.log('');
  console.log('Done! Run `hugo server` to see your nested categories.');
}

// Run
main();

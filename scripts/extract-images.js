/**
 * Extract Images from Squarespace XML Export
 *
 * Parses the Squarespace/WordPress export XML file and extracts:
 * - All unique image URLs grouped by project
 * - Vimeo video embeds with their IDs
 *
 * Outputs a migration-manifest.json file for use by download-images.js
 */

import { readFile, writeFile } from 'fs/promises';
import { parseStringPromise } from 'xml2js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

// XML file path
const XML_FILE = join(ROOT_DIR, 'Squarespace-Wordpress-Export-01-09-2026.xml');
const OUTPUT_FILE = join(ROOT_DIR, 'migration-manifest.json');

// Pages to exclude from project extraction (non-gallery pages)
const EXCLUDED_SLUGS = [
  'home',
  'contact',
  'about',
  'jc-cv',
  'capturing-medieval-london',
  'parliament-hill-lido'
];

// Pages that are video-only (contain Vimeo embeds, no image galleries)
const VIDEO_PAGE_SLUGS = [
  'trick-or-treat',
  'jaunt',
  'the-heroes-within-zine',
  'i-am-sarajevan-video',
  'his-land-his-spirit-video'
];

/**
 * Extract image URLs from HTML content
 * @param {string} html - HTML content containing img tags
 * @returns {string[]} - Array of unique image URLs
 */
function extractImageUrls(html) {
  if (!html) return [];

  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  const urls = [];
  let match;

  while ((match = imgRegex.exec(html)) !== null) {
    const url = match[1];
    // Filter out blank slides, text overlays, and non-photo assets
    if (url &&
        !url.includes('blank_slide') &&
        !url.includes('Project_Text') &&
        !url.includes('_Text_') &&
        url.includes('squarespace-cdn.com')) {
      urls.push(url);
    }
  }

  // Remove duplicates while preserving order
  return [...new Set(urls)];
}

/**
 * Extract Vimeo video ID from iframe HTML
 * @param {string} html - HTML content containing Vimeo iframe
 * @returns {object|null} - Object with vimeoId and title, or null
 */
function extractVimeoEmbed(html) {
  if (!html) return null;

  const vimeoRegex = /vimeo\.com\/video\/(\d+)[^"']*["'][^>]*title=["']([^"']+)["']/i;
  const match = html.match(vimeoRegex);

  if (match) {
    return {
      vimeoId: match[1],
      title: match[2]
    };
  }

  // Alternative pattern without title in same element
  const simpleVimeoRegex = /vimeo\.com\/video\/(\d+)/i;
  const simpleMatch = html.match(simpleVimeoRegex);

  if (simpleMatch) {
    return {
      vimeoId: simpleMatch[1],
      title: null // Will be filled from page title
    };
  }

  return null;
}

/**
 * Create a URL-safe slug from a title
 * @param {string} title - The page title
 * @returns {string} - URL-safe slug
 */
function createSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/**
 * Main extraction function
 */
async function extractImages() {
  console.log('Reading XML file...');

  let xmlContent;
  try {
    xmlContent = await readFile(XML_FILE, 'utf-8');
  } catch (error) {
    console.error(`Error reading XML file: ${error.message}`);
    console.error(`Expected file at: ${XML_FILE}`);
    process.exit(1);
  }

  console.log('Parsing XML...');

  const result = await parseStringPromise(xmlContent, {
    explicitArray: false,
    trim: true
  });

  const channel = result.rss.channel;
  let items = channel.item;

  // Ensure items is an array
  if (!Array.isArray(items)) {
    items = [items];
  }

  console.log(`Found ${items.length} items in XML`);

  const projects = {};
  const videos = [];

  // Process each item
  for (const item of items) {
    const postType = item['wp:post_type'];
    const postName = item['wp:post_name'];
    const title = item.title;
    const content = item['content:encoded'];

    // Only process pages (not attachments)
    if (postType !== 'page') continue;

    // Skip excluded pages
    if (EXCLUDED_SLUGS.includes(postName)) {
      console.log(`  Skipping excluded page: ${postName}`);
      continue;
    }

    // Check for Vimeo videos
    const vimeoEmbed = extractVimeoEmbed(content);
    if (vimeoEmbed) {
      videos.push({
        title: vimeoEmbed.title || title,
        slug: postName,
        vimeoId: vimeoEmbed.vimeoId
      });

      // If this is a video-only page, skip image extraction
      if (VIDEO_PAGE_SLUGS.includes(postName)) {
        console.log(`  Found video page: ${postName} (Vimeo ID: ${vimeoEmbed.vimeoId})`);
        continue;
      }
    }

    // Extract images from content
    const imageUrls = extractImageUrls(content);

    if (imageUrls.length > 0) {
      // Use post_name as slug, with title for display
      const slug = postName || createSlug(title);

      projects[slug] = {
        title: title,
        images: imageUrls
      };

      console.log(`  Found project: ${title} (${slug}) - ${imageUrls.length} images`);
    }
  }

  // Create the manifest
  const manifest = {
    generated: new Date().toISOString(),
    source: 'Squarespace-Wordpress-Export-01-09-2026.xml',
    summary: {
      totalProjects: Object.keys(projects).length,
      totalImages: Object.values(projects).reduce((sum, p) => sum + p.images.length, 0),
      totalVideos: videos.length
    },
    projects,
    videos
  };

  // Write output file
  console.log('\nWriting migration manifest...');
  await writeFile(OUTPUT_FILE, JSON.stringify(manifest, null, 2));

  console.log(`\nExtraction complete!`);
  console.log(`  Projects: ${manifest.summary.totalProjects}`);
  console.log(`  Images: ${manifest.summary.totalImages}`);
  console.log(`  Videos: ${manifest.summary.totalVideos}`);
  console.log(`\nManifest saved to: ${OUTPUT_FILE}`);
}

// Run the extraction
extractImages().catch(error => {
  console.error('Extraction failed:', error);
  process.exit(1);
});

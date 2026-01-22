/**
 * Download Images from Migration Manifest
 *
 * Reads the migration-manifest.json file and downloads all images
 * to project-specific folders with sequential naming.
 *
 * Usage: node scripts/download-images.js [--project=slug]
 */

import { readFile, mkdir } from 'fs/promises';
import { createWriteStream, existsSync } from 'fs';
import { pipeline } from 'stream/promises';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import https from 'https';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

// File paths
const MANIFEST_FILE = join(ROOT_DIR, 'migration-manifest.json');
const PROJECTS_DIR = join(ROOT_DIR, 'projects');

// Download configuration
const DELAY_BETWEEN_DOWNLOADS = 500; // ms between downloads to avoid rate limiting
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // ms before retrying failed download

/**
 * Sleep for a specified number of milliseconds
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get file extension from URL or default to .jpg
 * @param {string} url - Image URL
 * @returns {string} - File extension with dot
 */
function getExtension(url) {
  try {
    const urlPath = new URL(url).pathname;
    const ext = extname(urlPath).toLowerCase();
    // Only allow common image extensions
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
      return ext;
    }
  } catch {
    // URL parsing failed
  }
  return '.jpg'; // Default to jpg
}

/**
 * Download a file from URL
 * @param {string} url - URL to download
 * @param {string} destPath - Destination file path
 * @returns {Promise<boolean>} - Success status
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    // Choose http or https based on URL
    const client = url.startsWith('https') ? https : http;

    const request = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'image/*,*/*',
        'Referer': 'https://www.jonathanclifford.com/'
      }
    }, (response) => {
      // Handle redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        downloadFile(response.headers.location, destPath)
          .then(resolve)
          .catch(reject);
        return;
      }

      // Check for successful response
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }

      // Create write stream and pipe response
      const fileStream = createWriteStream(destPath);

      pipeline(response, fileStream)
        .then(() => resolve(true))
        .catch(reject);
    });

    request.on('error', reject);
    request.setTimeout(30000, () => {
      request.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * Download file with retries
 * @param {string} url - URL to download
 * @param {string} destPath - Destination file path
 * @param {number} attempt - Current attempt number
 * @returns {Promise<boolean>} - Success status
 */
async function downloadWithRetry(url, destPath, attempt = 1) {
  try {
    await downloadFile(url, destPath);
    return true;
  } catch (error) {
    if (attempt < MAX_RETRIES) {
      console.log(`    Retry ${attempt}/${MAX_RETRIES} after error: ${error.message}`);
      await sleep(RETRY_DELAY * attempt);
      return downloadWithRetry(url, destPath, attempt + 1);
    }
    throw error;
  }
}

/**
 * Download all images for a project
 * @param {string} slug - Project slug
 * @param {object} project - Project data with title and images
 * @returns {Promise<object>} - Download results
 */
async function downloadProjectImages(slug, project) {
  const projectDir = join(PROJECTS_DIR, slug, 'original');

  // Create project directory
  await mkdir(projectDir, { recursive: true });

  console.log(`\nDownloading: ${project.title} (${slug})`);
  console.log(`  Directory: ${projectDir}`);
  console.log(`  Images: ${project.images.length}`);

  const results = {
    success: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };

  for (let i = 0; i < project.images.length; i++) {
    const url = project.images[i];
    const ext = getExtension(url);
    const filename = `${String(i + 1).padStart(2, '0')}${ext}`;
    const destPath = join(projectDir, filename);

    // Skip if file already exists
    if (existsSync(destPath)) {
      console.log(`  [${i + 1}/${project.images.length}] Skipped (exists): ${filename}`);
      results.skipped++;
      continue;
    }

    try {
      process.stdout.write(`  [${i + 1}/${project.images.length}] Downloading: ${filename}...`);
      await downloadWithRetry(url, destPath);
      console.log(' OK');
      results.success++;
    } catch (error) {
      console.log(` FAILED: ${error.message}`);
      results.failed++;
      results.errors.push({
        url,
        filename,
        error: error.message
      });
    }

    // Delay between downloads
    if (i < project.images.length - 1) {
      await sleep(DELAY_BETWEEN_DOWNLOADS);
    }
  }

  return results;
}

/**
 * Main download function
 */
async function downloadImages() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  let targetProject = null;

  for (const arg of args) {
    if (arg.startsWith('--project=')) {
      targetProject = arg.split('=')[1];
    }
  }

  console.log('Reading migration manifest...');

  let manifest;
  try {
    const content = await readFile(MANIFEST_FILE, 'utf-8');
    manifest = JSON.parse(content);
  } catch (error) {
    console.error(`Error reading manifest: ${error.message}`);
    console.error(`Expected file at: ${MANIFEST_FILE}`);
    console.error('\nRun "npm run extract" first to generate the manifest.');
    process.exit(1);
  }

  console.log(`Manifest loaded: ${manifest.summary.totalProjects} projects, ${manifest.summary.totalImages} images`);

  // Create projects directory
  await mkdir(PROJECTS_DIR, { recursive: true });

  // Filter projects if target specified
  let projectsToDownload = Object.entries(manifest.projects);

  if (targetProject) {
    projectsToDownload = projectsToDownload.filter(([slug]) => slug === targetProject);
    if (projectsToDownload.length === 0) {
      console.error(`\nProject not found: ${targetProject}`);
      console.error('\nAvailable projects:');
      for (const slug of Object.keys(manifest.projects)) {
        console.error(`  - ${slug}`);
      }
      process.exit(1);
    }
  }

  console.log(`\nDownloading ${projectsToDownload.length} project(s)...`);

  // Track overall results
  const overallResults = {
    success: 0,
    failed: 0,
    skipped: 0,
    projectErrors: []
  };

  // Download each project
  for (const [slug, project] of projectsToDownload) {
    try {
      const results = await downloadProjectImages(slug, project);
      overallResults.success += results.success;
      overallResults.failed += results.failed;
      overallResults.skipped += results.skipped;

      if (results.errors.length > 0) {
        overallResults.projectErrors.push({
          project: slug,
          errors: results.errors
        });
      }
    } catch (error) {
      console.error(`\nFailed to download project ${slug}: ${error.message}`);
      overallResults.projectErrors.push({
        project: slug,
        errors: [{ error: error.message }]
      });
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('Download Summary');
  console.log('='.repeat(50));
  console.log(`  Successful: ${overallResults.success}`);
  console.log(`  Skipped:    ${overallResults.skipped}`);
  console.log(`  Failed:     ${overallResults.failed}`);

  if (overallResults.projectErrors.length > 0) {
    console.log('\nErrors:');
    for (const { project, errors } of overallResults.projectErrors) {
      console.log(`\n  ${project}:`);
      for (const err of errors) {
        if (err.filename) {
          console.log(`    - ${err.filename}: ${err.error}`);
        } else {
          console.log(`    - ${err.error}`);
        }
      }
    }
  }

  // Exit with error code if there were failures
  if (overallResults.failed > 0) {
    process.exit(1);
  }
}

// Run the download
downloadImages().catch(error => {
  console.error('Download failed:', error);
  process.exit(1);
});

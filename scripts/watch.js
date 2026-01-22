/**
 * Watch script for development - auto-rebuilds on file changes
 *
 * Usage: npm run watch
 *
 * Watches:
 * - templates/*.njk - triggers full rebuild
 * - src/css/*.css - triggers asset-only rebuild (fast)
 * - src/js/*.js - triggers asset-only rebuild (fast)
 * - projects/*/project.json - triggers full rebuild
 * - homepage/*.jpg - triggers homepage image processing + page generation
 *
 * Features:
 * - Debounced rebuilds (300ms delay after last change)
 * - Partial rebuilds for CSS/JS changes (faster)
 * - Colored console output with timestamps
 * - Optional local server integration
 */

import chokidar from 'chokidar';
import { spawn, exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import CleanCSS from 'clean-css';
import { minify as terserMinify } from 'terser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// Configuration
const CONFIG = {
  debounceMs: 300,
  distDir: path.join(rootDir, 'dist'),
  srcCss: path.join(rootDir, 'src/css'),
  srcJs: path.join(rootDir, 'src/js'),
  serverPort: 3000
};

// ANSI colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m'
};

/**
 * Get formatted timestamp
 */
function timestamp() {
  return new Date().toLocaleTimeString('en-GB', { hour12: false });
}

/**
 * Log with color and timestamp
 */
function log(message, color = colors.reset) {
  console.log(`${colors.dim}[${timestamp()}]${colors.reset} ${color}${message}${colors.reset}`);
}

/**
 * Debounce function to prevent rapid rebuilds
 */
function debounce(fn, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Run the full build script
 */
async function runFullBuild() {
  return new Promise((resolve, reject) => {
    log('Starting full rebuild...', colors.yellow);
    const startTime = Date.now();

    const buildProcess = spawn('node', ['build.js'], {
      cwd: rootDir,
      stdio: 'inherit'
    });

    buildProcess.on('close', (code) => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      if (code === 0) {
        log(`Full rebuild completed in ${elapsed}s`, colors.green);
        resolve();
      } else {
        log(`Build failed with code ${code}`, colors.red);
        reject(new Error(`Build failed with code ${code}`));
      }
    });

    buildProcess.on('error', (err) => {
      log(`Build error: ${err.message}`, colors.red);
      reject(err);
    });
  });
}

/**
 * Quick CSS rebuild - just minify and copy CSS files
 */
async function rebuildCss() {
  log('Rebuilding CSS...', colors.cyan);
  const startTime = Date.now();

  try {
    if (!await fs.pathExists(CONFIG.srcCss)) {
      log('No src/css directory found', colors.yellow);
      return;
    }

    await fs.ensureDir(path.join(CONFIG.distDir, 'css'));
    const cssFiles = await fs.readdir(CONFIG.srcCss);
    const cleanCss = new CleanCSS({ level: 2 });

    for (const file of cssFiles) {
      if (file.endsWith('.css')) {
        const inputPath = path.join(CONFIG.srcCss, file);
        const outputPath = path.join(CONFIG.distDir, 'css', file);
        const content = await fs.readFile(inputPath, 'utf8');
        const minified = cleanCss.minify(content);

        if (minified.errors && minified.errors.length > 0) {
          log(`  CSS errors in ${file}: ${minified.errors.join(', ')}`, colors.red);
          await fs.copy(inputPath, outputPath);
        } else {
          await fs.writeFile(outputPath, minified.styles);
          const savings = ((1 - minified.styles.length / content.length) * 100).toFixed(1);
          log(`  ${file}: ${content.length} -> ${minified.styles.length} bytes (${savings}% smaller)`, colors.dim);
        }
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    log(`CSS rebuild completed in ${elapsed}s`, colors.green);
  } catch (err) {
    log(`CSS rebuild error: ${err.message}`, colors.red);
  }
}

/**
 * Quick JS rebuild - just minify and copy JS files
 */
async function rebuildJs() {
  log('Rebuilding JS...', colors.cyan);
  const startTime = Date.now();

  try {
    if (!await fs.pathExists(CONFIG.srcJs)) {
      log('No src/js directory found', colors.yellow);
      return;
    }

    await fs.ensureDir(path.join(CONFIG.distDir, 'js'));
    const jsFiles = await fs.readdir(CONFIG.srcJs);

    for (const file of jsFiles) {
      if (file.endsWith('.js')) {
        const inputPath = path.join(CONFIG.srcJs, file);
        const outputPath = path.join(CONFIG.distDir, 'js', file);
        const content = await fs.readFile(inputPath, 'utf8');

        try {
          const minified = await terserMinify(content, {
            compress: true,
            mangle: true
          });

          if (minified.code) {
            await fs.writeFile(outputPath, minified.code);
            const savings = ((1 - minified.code.length / content.length) * 100).toFixed(1);
            log(`  ${file}: ${content.length} -> ${minified.code.length} bytes (${savings}% smaller)`, colors.dim);
          } else {
            await fs.copy(inputPath, outputPath);
          }
        } catch (err) {
          log(`  JS minification error in ${file}: ${err.message}`, colors.red);
          await fs.copy(inputPath, outputPath);
        }
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    log(`JS rebuild completed in ${elapsed}s`, colors.green);
  } catch (err) {
    log(`JS rebuild error: ${err.message}`, colors.red);
  }
}

/**
 * Start a simple local server using npx serve
 */
function startServer() {
  log(`Starting local server on port ${CONFIG.serverPort}...`, colors.blue);

  const serverProcess = spawn('npx', ['serve', CONFIG.distDir, '-l', String(CONFIG.serverPort), '-s'], {
    stdio: 'pipe',
    shell: true
  });

  serverProcess.stdout.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) {
      log(`Server: ${msg}`, colors.dim);
    }
  });

  serverProcess.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg && !msg.includes('npm warn')) {
      log(`Server: ${msg}`, colors.dim);
    }
  });

  serverProcess.on('error', (err) => {
    log(`Server error: ${err.message}`, colors.red);
    log('Install serve globally with: npm install -g serve', colors.yellow);
  });

  return serverProcess;
}

/**
 * Main watch function
 */
async function watch() {
  console.log('\n' + colors.bright + colors.magenta + '='.repeat(50) + colors.reset);
  console.log(colors.bright + '  Watch Mode - Jonathan Clifford Portfolio' + colors.reset);
  console.log(colors.magenta + '='.repeat(50) + colors.reset + '\n');

  // Track if a build is currently running
  let isBuilding = false;
  let pendingBuildType = null;

  // Debounced build handlers
  const handleFullBuild = debounce(async () => {
    if (isBuilding) {
      pendingBuildType = 'full';
      return;
    }
    isBuilding = true;
    try {
      await runFullBuild();
    } catch (err) {
      // Error already logged
    }
    isBuilding = false;

    // Check if another build was requested while we were building
    if (pendingBuildType) {
      const type = pendingBuildType;
      pendingBuildType = null;
      if (type === 'full') {
        handleFullBuild();
      } else if (type === 'css') {
        handleCssBuild();
      } else if (type === 'js') {
        handleJsBuild();
      }
    }
  }, CONFIG.debounceMs);

  const handleCssBuild = debounce(async () => {
    if (isBuilding) {
      pendingBuildType = 'css';
      return;
    }
    isBuilding = true;
    try {
      await rebuildCss();
    } catch (err) {
      // Error already logged
    }
    isBuilding = false;
  }, CONFIG.debounceMs);

  const handleJsBuild = debounce(async () => {
    if (isBuilding) {
      pendingBuildType = 'js';
      return;
    }
    isBuilding = true;
    try {
      await rebuildJs();
    } catch (err) {
      // Error already logged
    }
    isBuilding = false;
  }, CONFIG.debounceMs);

  // File patterns to watch
  const watchPatterns = [
    path.join(rootDir, 'templates/**/*.njk'),
    path.join(rootDir, 'src/css/**/*.css'),
    path.join(rootDir, 'src/js/**/*.js'),
    path.join(rootDir, 'projects/*/project.json'),
    path.join(rootDir, 'homepage/*.jpg'),
    path.join(rootDir, 'homepage/*.jpeg'),
    path.join(rootDir, 'homepage/*.png'),
    path.join(rootDir, 'videos/videos.json'),
    path.join(rootDir, 'static/**/*')
  ];

  // Initialize watcher
  const watcher = chokidar.watch(watchPatterns, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 100
    }
  });

  // Handle file changes
  watcher.on('change', (filePath) => {
    const relativePath = path.relative(rootDir, filePath);
    log(`Changed: ${relativePath}`, colors.yellow);

    // Determine build type based on file changed
    if (filePath.includes('/src/css/') && filePath.endsWith('.css')) {
      // CSS change - quick rebuild
      handleCssBuild();
    } else if (filePath.includes('/src/js/') && filePath.endsWith('.js')) {
      // JS change - quick rebuild
      handleJsBuild();
    } else {
      // Template, project.json, or other changes - full rebuild
      handleFullBuild();
    }
  });

  watcher.on('add', (filePath) => {
    const relativePath = path.relative(rootDir, filePath);
    log(`Added: ${relativePath}`, colors.green);
    handleFullBuild();
  });

  watcher.on('unlink', (filePath) => {
    const relativePath = path.relative(rootDir, filePath);
    log(`Removed: ${relativePath}`, colors.red);
    handleFullBuild();
  });

  watcher.on('ready', () => {
    log('Watching for changes...', colors.blue);
    console.log('');
    console.log(colors.dim + '  Watched paths:' + colors.reset);
    console.log(colors.dim + '    - templates/*.njk (full rebuild)' + colors.reset);
    console.log(colors.dim + '    - src/css/*.css (fast CSS rebuild)' + colors.reset);
    console.log(colors.dim + '    - src/js/*.js (fast JS rebuild)' + colors.reset);
    console.log(colors.dim + '    - projects/*/project.json (full rebuild)' + colors.reset);
    console.log(colors.dim + '    - homepage/*.jpg (full rebuild)' + colors.reset);
    console.log(colors.dim + '    - videos/videos.json (full rebuild)' + colors.reset);
    console.log(colors.dim + '    - static/* (full rebuild)' + colors.reset);
    console.log('');
    console.log(colors.dim + '  Press Ctrl+C to stop' + colors.reset);
    console.log('');
  });

  watcher.on('error', (error) => {
    log(`Watcher error: ${error.message}`, colors.red);
  });

  // Check if --serve flag was passed
  const shouldServe = process.argv.includes('--serve') || process.argv.includes('-s');

  if (shouldServe) {
    // Run initial build first, then start server
    log('Running initial build...', colors.blue);
    try {
      await runFullBuild();
      startServer();
    } catch (err) {
      log('Initial build failed, server not started', colors.red);
    }
  }

  // Handle process termination
  process.on('SIGINT', () => {
    console.log('\n');
    log('Stopping watch mode...', colors.yellow);
    watcher.close();
    process.exit(0);
  });
}

// Run watcher
watch();

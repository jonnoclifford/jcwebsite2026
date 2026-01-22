import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import sharp from 'sharp';
import nunjucks from 'nunjucks';
import { fileURLToPath } from 'url';
import CleanCSS from 'clean-css';
import { minify as terserMinify } from 'terser';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
  srcDir: __dirname,
  distDir: path.join(__dirname, 'dist'),
  projectsDir: path.join(__dirname, 'projects'),
  templatesDir: path.join(__dirname, 'templates'),
  staticDir: path.join(__dirname, 'static'),
  homepageDir: path.join(__dirname, 'homepage'),
  srcCss: path.join(__dirname, 'src/css'),
  srcJs: path.join(__dirname, 'src/js'),
  criticalCss: path.join(__dirname, 'src/css/critical.css'),
  imageCachePath: path.join(__dirname, '.image-cache.json'),
  imageSizes: [400, 800, 1200],
  imageQuality: 85,
  avifQuality: 65,  // AVIF has better perceptual quality at lower settings
  siteUrl: 'https://jonathanclifford.com',
  siteName: 'Jonathan Clifford',
  siteDescription: 'Documentary & Portrait Photographer'
};

// Image cache for incremental builds
let imageCache = {};
let imageCacheUpdated = false;

// Configure Nunjucks
const nunjucksEnv = nunjucks.configure(CONFIG.templatesDir, {
  autoescape: true,
  noCache: true
});

// Add custom filters
nunjucksEnv.addFilter('date', (str) => new Date(str).getFullYear());
nunjucksEnv.addFilter('padStart', (str, length, char = '0') => String(str).padStart(length, char));
nunjucksEnv.addFilter('keys', (obj) => obj ? Object.keys(obj) : []);
nunjucksEnv.addFilter('striptags', (str) => str ? String(str).replace(/<[^>]*>/g, '') : '');
nunjucksEnv.addFilter('paragraphs', (str) => {
  if (!str) return '';
  return str.split(/\n\n+/).map(p => `<p>${p.trim()}</p>`).join('\n');
});

/**
 * Load image cache from disk
 */
async function loadImageCache() {
  try {
    if (await fs.pathExists(CONFIG.imageCachePath)) {
      imageCache = await fs.readJson(CONFIG.imageCachePath);
      console.log(`  Loaded image cache with ${Object.keys(imageCache).length} entries`);
    } else {
      imageCache = {};
      console.log('  No image cache found, will process all images');
    }
  } catch (err) {
    console.warn('  Warning: Could not load image cache:', err.message);
    imageCache = {};
  }
}

/**
 * Save image cache to disk
 */
async function saveImageCache() {
  if (!imageCacheUpdated) return;
  try {
    await fs.outputJson(CONFIG.imageCachePath, imageCache, { spaces: 2 });
    console.log(`  Saved image cache with ${Object.keys(imageCache).length} entries`);
  } catch (err) {
    console.error('  Error saving image cache:', err.message);
  }
}

/**
 * Generate hash for a file (used for cache invalidation)
 */
async function getFileHash(filePath) {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash('md5').update(buffer).digest('hex');
}

/**
 * Check if an image needs to be reprocessed
 */
function needsProcessing(cacheKey, fileHash, outputDir) {
  const cached = imageCache[cacheKey];
  if (!cached) return true;
  if (cached.hash !== fileHash) return true;
  // Cache hit
  return false;
}

/**
 * Image validation: check dimensions and report issues
 */
async function validateImage(filePath, filename) {
  const warnings = [];
  try {
    const metadata = await sharp(filePath).metadata();
    if (metadata.width < 1200) {
      warnings.push(`Warning: ${filename} is only ${metadata.width}px wide (recommended: 1200px+)`);
    }
    return { metadata, warnings };
  } catch (err) {
    warnings.push(`Error reading ${filename}: ${err.message}`);
    return { metadata: null, warnings };
  }
}

/**
 * Clean the dist directory
 * Preserves the images directory for incremental builds (caching)
 */
async function clean() {
  console.log('Cleaning dist directory...');

  // Get list of everything in dist
  if (await fs.pathExists(CONFIG.distDir)) {
    const items = await fs.readdir(CONFIG.distDir);

    // Remove everything EXCEPT the images directory (for incremental builds)
    for (const item of items) {
      if (item !== 'images') {
        await fs.remove(path.join(CONFIG.distDir, item));
      }
    }
  } else {
    await fs.ensureDir(CONFIG.distDir);
  }
}

/**
 * Load all project configurations
 */
async function loadProjects() {
  const projects = [];

  if (!await fs.pathExists(CONFIG.projectsDir)) {
    console.log('No projects directory found, skipping project loading');
    return projects;
  }

  const projectDirs = await fs.readdir(CONFIG.projectsDir);

  for (const dir of projectDirs) {
    const configPath = path.join(CONFIG.projectsDir, dir, 'project.json');

    if (await fs.pathExists(configPath)) {
      const config = await fs.readJson(configPath);
      const originalDir = path.join(CONFIG.projectsDir, dir, 'original');

      // Get images if they exist
      let images = [];
      if (await fs.pathExists(originalDir)) {
        const files = await fs.readdir(originalDir);
        const imageFiles = files.filter(f => /\.(jpg|jpeg|png)$/i.test(f));

        // Check if project.json specifies image order
        if (config.images && Array.isArray(config.images) && config.images.length > 0) {
          // Use explicit order from project.json
          const orderedFiles = config.images
            .map(i => i.file)
            .filter(f => imageFiles.includes(f));
          // Add any files not in the config (alphabetically)
          const unlistedFiles = imageFiles
            .filter(f => !orderedFiles.includes(f))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
          images = [...orderedFiles, ...unlistedFiles].map((file, index) => ({
            file,
            index: index + 1,
            size: config.images?.find(i => i.file === file)?.size || 'full'
          }));
        } else {
          // Alphabetical fallback with natural sorting (1, 2, 10 not 1, 10, 2)
          images = imageFiles
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
            .map((file, index) => ({
              file,
              index: index + 1,
              size: 'full'
            }));
        }
      }

      projects.push({
        ...config,
        slug: config.slug || dir,
        images,
        hasImages: images.length > 0
      });
    }
  }

  // Sort by order field, then alphabetically
  return projects.sort((a, b) => {
    if (a.order && b.order) return a.order - b.order;
    if (a.order) return -1;
    if (b.order) return 1;
    return a.title.localeCompare(b.title);
  });
}

/**
 * Load and minify critical CSS for inlining
 */
async function loadCriticalCss() {
  if (!await fs.pathExists(CONFIG.criticalCss)) {
    console.log('  No critical.css found, skipping critical CSS inlining');
    return '';
  }

  const content = await fs.readFile(CONFIG.criticalCss, 'utf8');
  const cleanCss = new CleanCSS({ level: 2 });
  const minified = cleanCss.minify(content);

  if (minified.errors && minified.errors.length > 0) {
    console.error('  Critical CSS minification errors:', minified.errors);
    return content; // Fall back to unminified
  }

  const originalSize = content.length;
  const minifiedSize = minified.styles.length;
  const savings = ((1 - minifiedSize / originalSize) * 100).toFixed(1);
  console.log(`  Critical CSS: ${originalSize} -> ${minifiedSize} bytes (${savings}% smaller)`);

  return minified.styles;
}

/**
 * Load video configuration
 */
async function loadVideos() {
  const videosConfig = path.join(__dirname, 'videos', 'videos.json');

  if (await fs.pathExists(videosConfig)) {
    const data = await fs.readJson(videosConfig);
    return data.videos || [];
  }

  return [];
}

/**
 * Load print store configuration
 */
async function loadPrints() {
  const printsConfig = path.join(__dirname, 'prints', 'prints.json');

  if (await fs.pathExists(printsConfig)) {
    const data = await fs.readJson(printsConfig);
    return data;
  }

  return { prints: [], defaultPaper: '', shippingNote: '', productionTime: '' };
}

/**
 * Extract dominant color from image for CLS prevention
 */
async function extractDominantColor(image) {
  try {
    const { dominant } = await image.clone()
      .resize(1, 1, { fit: 'cover' })
      .stats();

    // Convert to hex color
    const r = Math.round(dominant.r);
    const g = Math.round(dominant.g);
    const b = Math.round(dominant.b);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  } catch {
    return '#e8e8e6'; // Fallback to neutral color
  }
}

/**
 * Process a single image with Sharp
 * Generates responsive sizes (AVIF, WebP, JPEG), blur placeholder, dominant color, and aspect ratio
 * Supports incremental builds via caching
 */
async function processImage(inputPath, outputDir, filename, cacheKey = null) {
  const image = sharp(inputPath);
  const metadata = await image.metadata();

  await fs.ensureDir(outputDir);

  // Calculate aspect ratio for CLS prevention
  const aspectRatio = metadata.width / metadata.height;

  const results = {
    sizes: {},
    placeholder: null,
    aspectRatio,
    width: metadata.width,
    height: metadata.height,
    dominantColor: await extractDominantColor(image)
  };

  // Generate responsive sizes
  for (const width of CONFIG.imageSizes) {
    if (metadata.width >= width) {
      const sizePath = path.join(outputDir, `${width}`);

      // AVIF (best compression, highest priority)
      await image.clone()
        .resize(width)
        .avif({ quality: CONFIG.avifQuality })
        .toFile(`${sizePath}.avif`);

      // WebP (good compression, wide support)
      await image.clone()
        .resize(width)
        .webp({ quality: CONFIG.imageQuality })
        .toFile(`${sizePath}.webp`);

      // JPEG fallback (progressive for faster perceived loading)
      await image.clone()
        .resize(width)
        .jpeg({ quality: CONFIG.imageQuality, progressive: true })
        .toFile(`${sizePath}.jpg`);

      results.sizes[width] = true;
    }
  }

  // Generate blur placeholder (tiny, highly compressed for fast inline loading)
  const placeholderBuffer = await image.clone()
    .resize(20)
    .blur(10)
    .jpeg({ quality: 50 }) // Reduced from 60 for smaller base64
    .toBuffer();

  results.placeholder = `data:image/jpeg;base64,${placeholderBuffer.toString('base64')}`;

  // Copy original for lightbox
  await fs.copy(inputPath, path.join(outputDir, 'original.jpg'));

  return results;
}

/**
 * Process homepage slideshow images (numbered 1.jpg, 2.jpg, etc.)
 * Supports incremental builds via caching
 */
async function processHomepageImages() {
  console.log('Processing homepage images...');

  const homepageImages = {};
  let processedCount = 0;
  let skippedCount = 0;

  if (!await fs.pathExists(CONFIG.homepageDir)) {
    console.log('  No homepage folder found');
    return homepageImages;
  }

  const files = await fs.readdir(CONFIG.homepageDir);

  // Find numbered images (1.jpg, 2.jpg, etc.)
  const numberedImages = files
    .filter(f => /^\d+\.(jpg|jpeg|png)$/i.test(f))
    .sort((a, b) => {
      const numA = parseInt(path.basename(a, path.extname(a)));
      const numB = parseInt(path.basename(b, path.extname(b)));
      return numA - numB;
    });

  // Use CONFIG.imageSizes for homepage images too
  const homepageSizes = CONFIG.imageSizes;

  for (const file of numberedImages) {
    const num = parseInt(path.basename(file, path.extname(file)));
    const inputPath = path.join(CONFIG.homepageDir, file);
    const outputDir = path.join(CONFIG.distDir, 'images', 'homepage', String(num));
    const cacheKey = `homepage/${file}`;

    try {
      // Check if we need to reprocess this image
      const fileHash = await getFileHash(inputPath);
      const cached = imageCache[cacheKey];

      if (cached && cached.hash === fileHash && await fs.pathExists(outputDir)) {
        // Use cached data
        homepageImages[num] = cached.data;
        skippedCount++;
        process.stdout.write('.');
        continue;
      }

      const image = sharp(inputPath);
      const metadata = await image.metadata();

      await fs.ensureDir(outputDir);

      // Build srcset strings dynamically based on what sizes we can generate
      const avifSrcset = [];
      const webpSrcset = [];
      const jpgSrcset = [];

      // Generate responsive sizes
      for (const width of homepageSizes) {
        if (metadata.width >= width) {
          // AVIF (best compression)
          await image.clone()
            .resize(width)
            .avif({ quality: CONFIG.avifQuality })
            .toFile(path.join(outputDir, `${width}.avif`));
          avifSrcset.push(`/images/homepage/${num}/${width}.avif ${width}w`);

          // WebP
          await image.clone()
            .resize(width)
            .webp({ quality: CONFIG.imageQuality })
            .toFile(path.join(outputDir, `${width}.webp`));
          webpSrcset.push(`/images/homepage/${num}/${width}.webp ${width}w`);

          // JPEG fallback
          await image.clone()
            .resize(width)
            .jpeg({ quality: CONFIG.imageQuality, progressive: true })
            .toFile(path.join(outputDir, `${width}.jpg`));
          jpgSrcset.push(`/images/homepage/${num}/${width}.jpg ${width}w`);
        }
      }

      // Generate blur placeholder
      const placeholderBuffer = await image.clone()
        .resize(20)
        .blur(10)
        .jpeg({ quality: 50 })
        .toBuffer();

      // Extract dominant color for CLS prevention
      const dominantColor = await extractDominantColor(image);

      // Determine the best available size for src fallback
      const maxAvailableSize = Math.max(...homepageSizes.filter(s => metadata.width >= s));

      homepageImages[num] = {
        index: num,
        path: `/images/homepage/${num}`,
        srcset: {
          avif: avifSrcset.join(', '),
          webp: webpSrcset.join(', '),
          jpg: jpgSrcset.join(', ')
        },
        src: `/images/homepage/${num}/${maxAvailableSize}.jpg`,
        placeholder: `data:image/jpeg;base64,${placeholderBuffer.toString('base64')}`,
        aspectRatio: metadata.width / metadata.height,
        width: metadata.width,
        height: metadata.height,
        dominantColor
      };

      // Update cache
      imageCache[cacheKey] = {
        hash: fileHash,
        data: homepageImages[num]
      };
      imageCacheUpdated = true;
      processedCount++;

      process.stdout.write('+');
    } catch (err) {
      console.error(`\n  Error processing ${file}:`, err.message);
    }
  }

  // Convert to array sorted by index for easier template iteration
  const homepageArray = Object.values(homepageImages).sort((a, b) => a.index - b.index);

  // Write homepage.json for browser-side use if needed
  if (homepageArray.length > 0) {
    await fs.outputJson(path.join(CONFIG.distDir, 'homepage.json'), {
      images: homepageArray,
      total: homepageArray.length
    }, { spaces: 2 });
  }

  console.log(`\n  Homepage: ${processedCount} processed, ${skippedCount} cached (${homepageArray.length} total)`);

  return homepageImages;
}

/**
 * Process landing page images (Commercial and Personal)
 */
async function processLandingImages() {
  console.log('Processing landing page images...');

  const landingImages = {
    commercial: [],
    personal: []
  };

  const commercialDir = path.join(CONFIG.homepageDir, 'Commercial Home Images');
  const personalDir = path.join(CONFIG.homepageDir, 'Personal Home Images');
  const outputBase = path.join(CONFIG.distDir, 'images', 'landing');

  // Sizes for landing images
  const landingSizes = [800, 1200, 1800];

  async function processFolder(inputDir, outputDir, type) {
    if (!await fs.pathExists(inputDir)) {
      console.log(`  No ${type} landing folder found`);
      return [];
    }

    const files = await fs.readdir(inputDir);
    const imageFiles = files.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
    const results = [];

    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      const inputPath = path.join(inputDir, file);
      const baseName = `${type}-${i + 1}`;
      const imgOutputDir = path.join(outputBase, type, baseName);

      await fs.ensureDir(imgOutputDir);

      try {
        const image = sharp(inputPath);
        const metadata = await image.metadata();

        const srcset = { jpg: [], webp: [], avif: [] };

        for (const width of landingSizes) {
          if (metadata.width >= width) {
            // AVIF (best compression, highest priority)
            await image.clone()
              .resize(width, null, { withoutEnlargement: true })
              .avif({ quality: CONFIG.avifQuality })
              .toFile(path.join(imgOutputDir, `${width}.avif`));
            srcset.avif.push(`/images/landing/${type}/${baseName}/${width}.avif ${width}w`);

            // WebP
            await image.clone()
              .resize(width, null, { withoutEnlargement: true })
              .webp({ quality: 80 })
              .toFile(path.join(imgOutputDir, `${width}.webp`));
            srcset.webp.push(`/images/landing/${type}/${baseName}/${width}.webp ${width}w`);

            // JPEG fallback
            await image.clone()
              .resize(width, null, { withoutEnlargement: true })
              .jpeg({ quality: 82, progressive: true })
              .toFile(path.join(imgOutputDir, `${width}.jpg`));
            srcset.jpg.push(`/images/landing/${type}/${baseName}/${width}.jpg ${width}w`);
          }
        }

        // Fallback src (largest available)
        const maxSize = Math.max(...landingSizes.filter(s => metadata.width >= s));
        const src = `/images/landing/${type}/${baseName}/${maxSize}.jpg`;

        results.push({
          src,
          srcset: {
            avif: srcset.avif.join(', '),
            webp: srcset.webp.join(', '),
            jpg: srcset.jpg.join(', ')
          },
          width: metadata.width,
          height: metadata.height,
          aspectRatio: metadata.width / metadata.height
        });

        process.stdout.write('.');
      } catch (err) {
        console.error(`\n  Error processing ${file}: ${err.message}`);
      }
    }

    return results;
  }

  landingImages.commercial = await processFolder(commercialDir, outputBase, 'commercial');
  landingImages.personal = await processFolder(personalDir, outputBase, 'personal');

  console.log(`\n  Landing: ${landingImages.commercial.length} commercial, ${landingImages.personal.length} personal`);

  return landingImages;
}

/**
 * Process all project images
 * Includes validation, duplicate checking, incremental builds, and per-project stats
 */
async function processImages(projects) {
  console.log('Processing project images...');

  const imageData = {};
  const allFilenames = new Map(); // Track duplicates across projects
  const warnings = [];
  let totalProcessed = 0;
  let totalSkipped = 0;

  for (const project of projects) {
    if (!project.hasImages) continue;

    console.log(`  Processing ${project.title}...`);
    imageData[project.slug] = {};
    let projectProcessed = 0;
    let projectSkipped = 0;

    // Check for duplicate filenames
    for (const img of project.images) {
      const lowerFilename = img.file.toLowerCase();
      if (allFilenames.has(lowerFilename)) {
        warnings.push(`Duplicate filename: "${img.file}" in ${project.slug} (also in ${allFilenames.get(lowerFilename)})`);
      } else {
        allFilenames.set(lowerFilename, project.slug);
      }
    }

    for (const img of project.images) {
      const inputPath = path.join(CONFIG.projectsDir, project.slug, 'original', img.file);
      const outputDir = path.join(CONFIG.distDir, 'images', project.slug, String(img.index).padStart(2, '0'));
      const cacheKey = `${project.slug}/${img.file}`;

      try {
        // Validate image dimensions
        const validation = await validateImage(inputPath, `${project.slug}/${img.file}`);
        if (validation.warnings.length > 0) {
          warnings.push(...validation.warnings);
        }

        // Check if we need to reprocess this image
        const fileHash = await getFileHash(inputPath);
        const cached = imageCache[cacheKey];

        if (cached && cached.hash === fileHash && await fs.pathExists(outputDir)) {
          // Use cached data
          imageData[project.slug][img.index] = {
            ...cached.data,
            size: img.size
          };
          projectSkipped++;
          totalSkipped++;
          process.stdout.write('.');
          continue;
        }

        // Process the image
        const result = await processImage(inputPath, outputDir, img.file, cacheKey);
        imageData[project.slug][img.index] = {
          ...result,
          size: img.size
        };

        // Update cache
        imageCache[cacheKey] = {
          hash: fileHash,
          data: result
        };
        imageCacheUpdated = true;
        projectProcessed++;
        totalProcessed++;

        process.stdout.write('+');
      } catch (err) {
        console.error(`\n    Error processing ${img.file}:`, err.message);
      }
    }
    console.log(` (${projectProcessed} new, ${projectSkipped} cached, ${project.images.length} total)`);
  }

  // Print validation warnings
  if (warnings.length > 0) {
    console.log('\n  Image validation warnings:');
    warnings.forEach(w => console.log(`    - ${w}`));
  }

  console.log(`\n  Summary: ${totalProcessed} images processed, ${totalSkipped} cached`);

  return imageData;
}

/**
 * Generate HTML pages
 *
 * URL Structure:
 * - / (root): Landing page with commercial/personal split
 * - /personal/: Personal portfolio home (slideshow)
 * - /personal/work/: Personal projects grid
 * - /personal/projects/{slug}/: Individual personal projects
 * - /personal/about/: Personal about page
 * - /personal/contact/: Personal contact page
 * - /commercial/: Commercial portfolio home (category grid)
 * - /commercial/work/: All commercial work
 * - /commercial/about/: Commercial about page
 * - /commercial/contact/: Commercial contact page
 * - /prints/: Shared prints page
 * - /video/: Shared video page
 */
async function generatePages(projects, videos, printsData, imageData, homepageImages, landingImages, criticalCss) {
  console.log('Generating HTML pages...');

  const baseContext = {
    site: {
      name: CONFIG.siteName,
      description: CONFIG.siteDescription,
      url: CONFIG.siteUrl
    },
    currentYear: new Date().getFullYear(),
    criticalCss: criticalCss || ''
  };

  // Filter projects by portfolio type
  const personalProjects = projects.filter(p => p.portfolio === 'personal' || !p.portfolio);
  const commercialProjects = projects.filter(p => p.portfolio === 'commercial');

  // Featured projects for each portfolio
  const featuredPersonalProjects = personalProjects.filter(p => p.featured !== false);
  const featuredCommercialProjects = commercialProjects.filter(p => p.featured !== false);

  let pageCount = 0;

  // ============================================
  // ROOT LANDING PAGE (/)
  // ============================================
  const landingHtml = nunjucks.render('landing.njk', {
    ...baseContext,
    currentPage: 'landing',
    currentPath: '/',
    portfolio: null, // No portfolio context for landing
    title: 'Jonathan Clifford | Photographer',
    description: 'Commercial and personal photography by Jonathan Clifford. Documentary, portrait, editorial and commercial photography based in London.',
    keywords: 'photographer london, commercial photographer, documentary photographer, portrait photographer, jonathan clifford',
    variant: 4, // Use v4 variant as the main landing
    commercialImages: landingImages.commercial,
    personalImages: landingImages.personal
  });
  await fs.outputFile(path.join(CONFIG.distDir, 'index.html'), landingHtml);
  pageCount++;

  // ============================================
  // PERSONAL PORTFOLIO (/personal/)
  // ============================================

  // Personal home - slideshow with featured projects
  const personalHomeHtml = nunjucks.render('home.njk', {
    ...baseContext,
    currentPage: 'home',
    currentPath: '/personal/',
    portfolio: 'personal',
    title: `${CONFIG.siteName} - Documentary & Portrait Photographer London`,
    description: 'Jonathan Clifford is a documentary and portrait photographer based in London. Specialising in editorial, documentary, and fine art photography.',
    keywords: 'documentary photographer london, portrait photographer london, editorial photographer uk, jonathan clifford',
    projects: featuredPersonalProjects,
    homepageImages,
    imageData
  });
  await fs.outputFile(path.join(CONFIG.distDir, 'personal', 'index.html'), personalHomeHtml);
  pageCount++;

  // Personal work page - grid of all personal projects
  const personalWorkHtml = nunjucks.render('work.njk', {
    ...baseContext,
    currentPage: 'work',
    currentPath: '/personal/work/',
    portfolio: 'personal',
    title: `Personal Work | ${CONFIG.siteName}`,
    description: `Explore the documentary and portrait photography portfolio of Jonathan Clifford. ${personalProjects.length} personal projects featuring editorial and fine art work.`,
    keywords: 'photography portfolio, documentary photography projects, portrait photography london, jonathan clifford work',
    projects: personalProjects,
    imageData
  });
  await fs.outputFile(path.join(CONFIG.distDir, 'personal', 'work', 'index.html'), personalWorkHtml);
  pageCount++;

  // Personal project pages
  for (const project of personalProjects) {
    const projectImages = project.images.map(img => ({
      ...img,
      data: imageData[project.slug]?.[img.index] || null
    }));

    const projectDesc = project.description
      ? project.description.replace(/<[^>]*>/g, '').substring(0, 160)
      : `${project.title} - Documentary photography project${project.location ? ' from ' + project.location : ''} by Jonathan Clifford.`;

    // Personal project slideshow page
    const projectHtml = nunjucks.render('project.njk', {
      ...baseContext,
      currentPage: 'projects',
      currentPath: `/personal/projects/${project.slug}/`,
      portfolio: 'personal',
      title: `${project.title}${project.location ? ' - ' + project.location : ''} | ${CONFIG.siteName}`,
      description: projectDesc,
      keywords: `${project.title.toLowerCase()}, documentary photography${project.location ? ', ' + project.location.toLowerCase() + ' photography' : ''}, jonathan clifford`,
      project,
      images: projectImages,
      ogImage: projectImages[0]?.data ?
        `${CONFIG.siteUrl}/images/${project.slug}/01/1200.jpg` : null,
      ogImageAlt: `${project.title} - Documentary photography by Jonathan Clifford`
    });
    await fs.outputFile(
      path.join(CONFIG.distDir, 'personal', 'projects', project.slug, 'index.html'),
      projectHtml
    );
    pageCount++;

    // Personal project grid page
    const projectGridHtml = nunjucks.render('project-grid.njk', {
      ...baseContext,
      currentPage: 'projects',
      currentPath: `/personal/projects/${project.slug}/grid/`,
      portfolio: 'personal',
      title: `${project.title} - Photo Gallery | ${CONFIG.siteName}`,
      description: `View all ${projectImages.length} photographs from ${project.title}${project.location ? ' in ' + project.location : ''}.`,
      keywords: `${project.title.toLowerCase()} gallery, documentary photography${project.location ? ', ' + project.location.toLowerCase() : ''}, jonathan clifford`,
      project,
      images: projectImages,
      ogImage: projectImages[0]?.data ?
        `${CONFIG.siteUrl}/images/${project.slug}/01/1200.jpg` : null,
      ogImageAlt: `${project.title} - Photo gallery by Jonathan Clifford`
    });
    await fs.outputFile(
      path.join(CONFIG.distDir, 'personal', 'projects', project.slug, 'grid', 'index.html'),
      projectGridHtml
    );
    pageCount++;
  }

  // Personal about page
  const personalAboutHtml = nunjucks.render('about.njk', {
    ...baseContext,
    currentPage: 'about',
    currentPath: '/personal/about/',
    portfolio: 'personal',
    title: `About Jonathan Clifford | Documentary & Portrait Photographer London`,
    description: 'Jonathan Clifford is an Australian-raised, London-based documentary and portrait photographer.',
    keywords: 'jonathan clifford photographer, about, documentary photographer london, portrait photographer uk',
    ogImage: `${CONFIG.siteUrl}/images/portrait.jpg`,
    ogImageAlt: 'Jonathan Clifford - Documentary and Portrait Photographer',
    bio: `I'm an Australian-raised, London-based Photographer & Videographer working across commercial, documentary, and portrait photography.`,
    bioExtended: `Commissions, publications and collaborations include The New York Times, The British Journal of Photography, House & Garden, The U.S State Department, Woods Bagot, Nicola Harding, Pro:Direct Sport, and many other brands, restaurants, and designers, both nationally and abroad.`,
    clients: 'The New York Times, British Journal of Photography, House & Garden, U.S State Department, Woods Bagot, Nicola Harding, Pro:Direct Sport'
  });
  await fs.outputFile(path.join(CONFIG.distDir, 'personal', 'about', 'index.html'), personalAboutHtml);
  pageCount++;

  // Personal contact page
  const personalContactHtml = nunjucks.render('contact.njk', {
    ...baseContext,
    currentPage: 'contact',
    currentPath: '/personal/contact/',
    portfolio: 'personal',
    title: `Contact Jonathan Clifford | Documentary Photographer London`,
    description: 'Get in touch with Jonathan Clifford for documentary and portrait photography commissions.',
    keywords: 'contact documentary photographer, portrait photography booking, jonathan clifford contact',
    email: 'info@jonathanclifford.com',
    instagram: 'jonnoclifford',
    commercialSite: 'jonnoclifford.com'
  });
  await fs.outputFile(path.join(CONFIG.distDir, 'personal', 'contact', 'index.html'), personalContactHtml);
  pageCount++;

  // ============================================
  // COMMERCIAL PORTFOLIO (/commercial/)
  // ============================================

  // Commercial categories based on jonnoclifford.com
  const commercialCategories = [
    { title: 'Food & Drink', slug: 'food-drink', titleLine1: 'Food &', titleLine2: 'Drink', description: 'Restaurant, bar, and culinary photography' },
    { title: 'Interiors', slug: 'interiors', titleLine1: 'Interiors', titleLine2: '', description: 'Interior design and architectural photography' },
    { title: 'Product', slug: 'product', titleLine1: 'Product', titleLine2: '', description: 'Product and still life photography' },
    { title: 'Travel', slug: 'travel', titleLine1: 'Travel', titleLine2: '', description: 'Travel and destination photography' },
    { title: 'Sport & Lifestyle', slug: 'sport-lifestyle', titleLine1: 'Sport &', titleLine2: 'Lifestyle', description: 'Sports, fitness, and lifestyle photography' },
    { title: 'People', slug: 'people', titleLine1: 'People', titleLine2: '', description: 'Portrait and people photography' }
  ];

  // Build grid images from landing commercial images (placeholder until real commercial projects exist)
  // Need 6 images for the 6 categories in the 3x2 grid
  const commercialGridImages = landingImages.commercial.map((img, i) => ({
    path: img.src.replace(/\/\d+\.jpg$/, ''),
    placeholder: null,
    link: '/commercial/',
    alt: `Commercial photography ${i + 1}`
  }));

  // Ensure we have at least 6 images (repeat if necessary)
  while (commercialGridImages.length < 6 && landingImages.commercial.length > 0) {
    const idx = commercialGridImages.length % landingImages.commercial.length;
    const img = landingImages.commercial[idx];
    commercialGridImages.push({
      path: img.src.replace(/\/\d+\.jpg$/, ''),
      placeholder: null,
      link: '/commercial/',
      alt: `Commercial photography ${commercialGridImages.length + 1}`
    });
  }

  // Commercial home - category grid
  const commercialHomeHtml = nunjucks.render('work-commercial.njk', {
    ...baseContext,
    currentPage: 'home',
    currentPath: '/commercial/',
    portfolio: 'commercial',
    title: `Jonathan Clifford | Commercial Photographer London`,
    description: 'Commercial photography by Jonathan Clifford. Food & drink, interiors, product, travel, sport & lifestyle, and people photography for brands worldwide.',
    keywords: 'commercial photographer london, editorial photographer uk, brand photographer, advertising photography, jonathan clifford',
    categories: commercialCategories,
    categoryTitle: 'Food &',
    categorySubtitle: 'Drink',
    gridImages: commercialGridImages.slice(0, 6),
    projects: commercialProjects,
    imageData
  });
  await fs.outputFile(path.join(CONFIG.distDir, 'commercial', 'index.html'), commercialHomeHtml);
  pageCount++;

  // Commercial work page - same layout as home
  const commercialWorkHtml = nunjucks.render('work-commercial.njk', {
    ...baseContext,
    currentPage: 'work',
    currentPath: '/commercial/work/',
    portfolio: 'commercial',
    title: `Commercial Work | Jonathan Clifford`,
    description: `Commercial photography by Jonathan Clifford. Food & drink, interiors, product, travel, sport & lifestyle, and people photography.`,
    keywords: 'commercial photography portfolio, editorial photography, brand photography, jonathan clifford commercial work',
    categories: commercialCategories,
    categoryTitle: 'Food &',
    categorySubtitle: 'Drink',
    gridImages: commercialGridImages.slice(0, 6),
    projects: commercialProjects,
    imageData
  });
  await fs.outputFile(path.join(CONFIG.distDir, 'commercial', 'work', 'index.html'), commercialWorkHtml);
  pageCount++;

  // Commercial category pages - masonry portfolio grid
  for (const category of commercialCategories) {
    const categoryProjects = commercialProjects.filter(p => p.category === category.slug);

    // Build portfolio images for this category
    // Use all landing commercial images, cycling through for each category with offset
    const categoryIndex = commercialCategories.indexOf(category);
    const portfolioImages = [];

    // Create 9-12 portfolio images per category using landing images as placeholders
    const numImages = 9 + (categoryIndex % 4); // Vary count: 9-12 images
    for (let i = 0; i < numImages; i++) {
      const idx = (categoryIndex + i) % landingImages.commercial.length;
      const img = landingImages.commercial[idx];
      if (img) {
        portfolioImages.push({
          path: img.src.replace(/\/\d+\.jpg$/, ''),
          alt: `${category.title} photography - Image ${i + 1}`,
          aspectRatio: img.aspectRatio || 1.5,
          width: img.width,
          height: img.height
        });
      }
    }

    const categoryHtml = nunjucks.render('category-commercial.njk', {
      ...baseContext,
      currentPage: 'work',
      currentPath: `/commercial/${category.slug}/`,
      portfolio: 'commercial',
      title: `${category.title} Photography | Jonathan Clifford`,
      description: `${category.description} by Jonathan Clifford, London-based commercial photographer.`,
      keywords: `${category.title.toLowerCase()} photography, commercial ${category.slug} photographer, jonathan clifford`,
      categories: commercialCategories,
      categorySlug: category.slug,
      categoryTitle: category.title,
      portfolioImages: portfolioImages,
      projects: categoryProjects,
      imageData
    });
    await fs.outputFile(path.join(CONFIG.distDir, 'commercial', category.slug, 'index.html'), categoryHtml);
    pageCount++;
  }

  // Commercial project pages
  for (const project of commercialProjects) {
    const projectImages = project.images.map(img => ({
      ...img,
      data: imageData[project.slug]?.[img.index] || null
    }));

    const projectDesc = project.description
      ? project.description.replace(/<[^>]*>/g, '').substring(0, 160)
      : `${project.title} - Commercial photography${project.client ? ' for ' + project.client : ''}${project.location ? ' in ' + project.location : ''}.`;

    // Commercial project page
    const projectHtml = nunjucks.render('project.njk', {
      ...baseContext,
      currentPage: 'projects',
      currentPath: `/commercial/projects/${project.slug}/`,
      portfolio: 'commercial',
      title: `${project.title}${project.client ? ' for ' + project.client : ''} | Jonathan Clifford`,
      description: projectDesc,
      keywords: `${project.title.toLowerCase()}, commercial photography${project.client ? ', ' + project.client.toLowerCase() : ''}, jonathan clifford`,
      project,
      images: projectImages,
      ogImage: projectImages[0]?.data ?
        `${CONFIG.siteUrl}/images/${project.slug}/01/1200.jpg` : null,
      ogImageAlt: `${project.title} - Commercial photography by Jonathan Clifford`
    });
    await fs.outputFile(
      path.join(CONFIG.distDir, 'commercial', 'projects', project.slug, 'index.html'),
      projectHtml
    );
    pageCount++;

    // Commercial project grid page
    const projectGridHtml = nunjucks.render('project-grid.njk', {
      ...baseContext,
      currentPage: 'projects',
      currentPath: `/commercial/projects/${project.slug}/grid/`,
      portfolio: 'commercial',
      title: `${project.title} - Gallery | Jonathan Clifford`,
      description: `View all ${projectImages.length} photographs from ${project.title}.`,
      keywords: `${project.title.toLowerCase()} gallery, commercial photography, jonathan clifford`,
      project,
      images: projectImages,
      ogImage: projectImages[0]?.data ?
        `${CONFIG.siteUrl}/images/${project.slug}/01/1200.jpg` : null,
      ogImageAlt: `${project.title} - Photo gallery by Jonathan Clifford`
    });
    await fs.outputFile(
      path.join(CONFIG.distDir, 'commercial', 'projects', project.slug, 'grid', 'index.html'),
      projectGridHtml
    );
    pageCount++;
  }

  // Commercial about page - uses same template as personal for consistent design
  const commercialAboutHtml = nunjucks.render('about.njk', {
    ...baseContext,
    currentPage: 'about',
    currentPath: '/commercial/about/',
    portfolio: 'commercial',
    title: `About | Jonathan Clifford - Commercial Photographer London`,
    description: 'Jonathan Clifford is a London-based commercial photographer specialising in food & drink, interiors, product, travel, sport & lifestyle, and people photography.',
    keywords: 'jonathan clifford photographer, commercial photographer london, food photographer uk, interior photographer, product photographer',
    ogImage: `${CONFIG.siteUrl}/images/portrait.jpg`,
    ogImageAlt: 'Jonathan Clifford - Commercial Photographer',
    bio: `I'm an Australian-raised, London-based Photographer & Videographer working across commercial, documentary, and portrait photography.`,
    bioExtended: `Commissions, publications and collaborations include The New York Times, The British Journal of Photography, House & Garden, The U.S State Department, Woods Bagot, Nicola Harding, Pro:Direct Sport, and many other brands, restaurants, and designers, both nationally and abroad.`,
    clients: 'The New York Times, British Journal of Photography, House & Garden, U.S State Department, Woods Bagot, Nicola Harding, Pro:Direct Sport'
  });
  await fs.outputFile(path.join(CONFIG.distDir, 'commercial', 'about', 'index.html'), commercialAboutHtml);
  pageCount++;

  // Commercial contact page
  const commercialContactHtml = nunjucks.render('contact.njk', {
    ...baseContext,
    currentPage: 'contact',
    currentPath: '/commercial/contact/',
    portfolio: 'commercial',
    title: `Contact | Jonathan Clifford - Commercial Photographer London`,
    description: 'Get in touch with Jonathan Clifford for commercial photography commissions and collaborations.',
    keywords: 'hire commercial photographer london, contact photographer, jonathan clifford contact',
    email: 'info@jonathanclifford.com',
    instagram: 'jonnoclifford',
    commercialSite: 'jonnoclifford.com'
  });
  await fs.outputFile(path.join(CONFIG.distDir, 'commercial', 'contact', 'index.html'), commercialContactHtml);
  pageCount++;

  // ============================================
  // SHARED PAGES (/prints/, /video/)
  // ============================================

  // Video page (shared/legacy)
  const videoHtml = nunjucks.render('video.njk', {
    ...baseContext,
    currentPage: 'video',
    currentPath: '/video/',
    portfolio: null, // Shared page
    title: `Video Work | ${CONFIG.siteName}`,
    description: 'Film and video work by Jonathan Clifford, documentary and portrait photographer based in London.',
    keywords: 'video production london, documentary film, photographer videographer london, jonathan clifford',
    videos
  });
  await fs.outputFile(path.join(CONFIG.distDir, 'video', 'index.html'), videoHtml);
  pageCount++;

  // Commercial video page
  const commercialVideoHtml = nunjucks.render('video.njk', {
    ...baseContext,
    currentPage: 'video',
    currentPath: '/commercial/video/',
    portfolio: 'commercial',
    title: `Video | Jonathan Clifford - Commercial Photographer London`,
    description: 'Commercial video and film work by Jonathan Clifford, London-based photographer and videographer.',
    keywords: 'commercial video london, brand video production, photographer videographer london, jonathan clifford',
    videos
  });
  await fs.outputFile(path.join(CONFIG.distDir, 'commercial', 'video', 'index.html'), commercialVideoHtml);
  pageCount++;

  // Prints page (accessible from personal portfolio)
  const printsHtml = nunjucks.render('prints.njk', {
    ...baseContext,
    currentPage: 'prints',
    currentPath: '/prints/',
    portfolio: 'personal', // Shows Prints nav item
    title: `Fine Art Prints | ${CONFIG.siteName} - Documentary Photographer London`,
    description: 'Purchase limited edition fine art prints from Jonathan Clifford\'s documentary and portrait photography. Archival quality, signed and numbered editions.',
    keywords: 'fine art prints, photography prints, buy photography prints london, jonathan clifford prints, documentary photography prints',
    prints: printsData.prints,
    defaultPaper: printsData.defaultPaper,
    shippingNote: printsData.shippingNote,
    productionTime: printsData.productionTime
  });
  await fs.outputFile(path.join(CONFIG.distDir, 'prints', 'index.html'), printsHtml);
  pageCount++;

  // Prints success page
  const printsSuccessHtml = nunjucks.render('prints-success.njk', {
    ...baseContext,
    currentPage: 'prints',
    currentPath: '/prints/success/',
    portfolio: 'personal',
    title: `Order Confirmed | ${CONFIG.siteName}`,
    description: 'Thank you for your print order.',
    robots: 'noindex, nofollow'
  });
  await fs.outputFile(path.join(CONFIG.distDir, 'prints', 'success', 'index.html'), printsSuccessHtml);
  pageCount++;

  // ============================================
  // LEGACY/BACKWARDS COMPATIBILITY PAGES
  // ============================================

  // Legacy home page at root (redirects to /personal/ or shows landing)
  // Already handled by landing page at root

  // Legacy /work/ page - redirect or show all projects
  const legacyWorkHtml = nunjucks.render('work.njk', {
    ...baseContext,
    currentPage: 'work',
    currentPath: '/work/',
    portfolio: null, // Legacy page shows all
    title: `${CONFIG.siteName} - Documentary Photographer London`,
    description: `Explore the documentary and portrait photography portfolio of Jonathan Clifford. ${projects.length} projects featuring editorial, commercial, and personal work.`,
    keywords: 'photography portfolio, documentary photography projects, portrait photography london, jonathan clifford work',
    projects,
    imageData
  });
  await fs.outputFile(path.join(CONFIG.distDir, 'work', 'index.html'), legacyWorkHtml);
  pageCount++;

  // Legacy /about/ page
  const legacyAboutHtml = nunjucks.render('about.njk', {
    ...baseContext,
    currentPage: 'about',
    currentPath: '/about/',
    portfolio: null,
    title: `About Jonathan Clifford | Documentary & Portrait Photographer London`,
    description: 'Jonathan Clifford is an Australian-raised, London-based documentary and portrait photographer.',
    keywords: 'jonathan clifford photographer, about, documentary photographer london, portrait photographer uk',
    ogImage: `${CONFIG.siteUrl}/images/portrait.jpg`,
    ogImageAlt: 'Jonathan Clifford - Documentary and Portrait Photographer',
    bio: `I'm an Australian-raised, London-based Photographer & Videographer working across commercial, documentary, and portrait photography.`,
    bioExtended: `Commissions, publications and collaborations include The New York Times, The British Journal of Photography, House & Garden, The U.S State Department, Woods Bagot, Nicola Harding, Pro:Direct Sport, and many other brands, restaurants, and designers, both nationally and abroad.`,
    clients: 'The New York Times, British Journal of Photography, House & Garden, U.S State Department, Woods Bagot, Nicola Harding, Pro:Direct Sport'
  });
  await fs.outputFile(path.join(CONFIG.distDir, 'about', 'index.html'), legacyAboutHtml);
  pageCount++;

  // Legacy /contact/ page
  const legacyContactHtml = nunjucks.render('contact.njk', {
    ...baseContext,
    currentPage: 'contact',
    currentPath: '/contact/',
    portfolio: null,
    title: `Contact Jonathan Clifford | Hire a Documentary Photographer London`,
    description: 'Get in touch with Jonathan Clifford for documentary and portrait photography commissions.',
    keywords: 'hire photographer london, contact documentary photographer, portrait photography booking, jonathan clifford contact',
    email: 'info@jonathanclifford.com',
    instagram: 'jonnoclifford',
    commercialSite: 'jonnoclifford.com'
  });
  await fs.outputFile(path.join(CONFIG.distDir, 'contact', 'index.html'), legacyContactHtml);
  pageCount++;

  // Legacy /projects/{slug}/ pages for backwards compatibility
  for (const project of projects) {
    const projectImages = project.images.map(img => ({
      ...img,
      data: imageData[project.slug]?.[img.index] || null
    }));

    const projectDesc = project.description
      ? project.description.replace(/<[^>]*>/g, '').substring(0, 160)
      : `${project.title} - Photography project${project.location ? ' from ' + project.location : ''} by Jonathan Clifford.`;

    // Determine the portfolio for proper linking
    const projectPortfolio = project.portfolio || 'personal';

    // Legacy project slideshow page
    const projectHtml = nunjucks.render('project.njk', {
      ...baseContext,
      currentPage: 'projects',
      currentPath: `/projects/${project.slug}/`,
      portfolio: projectPortfolio,
      title: `${project.title}${project.location ? ' - ' + project.location : ''} | ${CONFIG.siteName}`,
      description: projectDesc,
      keywords: `${project.title.toLowerCase()}, documentary photography${project.location ? ', ' + project.location.toLowerCase() + ' photography' : ''}, jonathan clifford`,
      project,
      images: projectImages,
      ogImage: projectImages[0]?.data ?
        `${CONFIG.siteUrl}/images/${project.slug}/01/1200.jpg` : null,
      ogImageAlt: `${project.title} - Photography by Jonathan Clifford`
    });
    await fs.outputFile(
      path.join(CONFIG.distDir, 'projects', project.slug, 'index.html'),
      projectHtml
    );
    pageCount++;

    // Legacy project grid page
    const projectGridHtml = nunjucks.render('project-grid.njk', {
      ...baseContext,
      currentPage: 'projects',
      currentPath: `/projects/${project.slug}/grid/`,
      portfolio: projectPortfolio,
      title: `${project.title} - Photo Gallery | ${CONFIG.siteName}`,
      description: `View all ${projectImages.length} photographs from ${project.title}.`,
      keywords: `${project.title.toLowerCase()} gallery, documentary photography, jonathan clifford`,
      project,
      images: projectImages,
      ogImage: projectImages[0]?.data ?
        `${CONFIG.siteUrl}/images/${project.slug}/01/1200.jpg` : null,
      ogImageAlt: `${project.title} - Photo gallery by Jonathan Clifford`
    });
    await fs.outputFile(
      path.join(CONFIG.distDir, 'projects', project.slug, 'grid', 'index.html'),
      projectGridHtml
    );
    pageCount++;
  }

  // 404 error page
  const errorHtml = nunjucks.render('404.njk', {
    ...baseContext,
    currentPage: '404',
    currentPath: '/404.html',
    portfolio: null,
    title: `Page Not Found | ${CONFIG.siteName}`,
    description: 'The page you are looking for does not exist.',
    robots: 'noindex, nofollow'
  });
  await fs.outputFile(path.join(CONFIG.distDir, '404.html'), errorHtml);
  pageCount++;

  console.log(`  Generated ${pageCount} pages`);
}

/**
 * Bundle configuration for JavaScript files
 * Groups related JS files into logical bundles for better loading performance
 */
const JS_BUNDLES = {
  // Critical bundle - needed immediately on page load
  'critical.js': [
    'dark-mode.js',      // Theme detection (prevents FOUC)
    'navigation.js',     // Mobile menu functionality
    'lazyload.js'        // Image lazy loading
  ],
  // Interactive bundle - can be deferred (not needed until user interacts)
  'interactive.js': [
    'slideshow.js',      // Project slideshow
    'lightbox.js',       // Image lightbox
    'video-modal.js'     // Video embed modal
  ]
  // Note: print-store.js stays separate (only loaded on /prints/ page)
  // Note: sw.js stays separate (service worker, needs to be at root)
};

/**
 * Create JavaScript bundles by concatenating source files
 * Returns an object with bundle names and their combined source code
 */
async function createJsBundles() {
  console.log('Creating JavaScript bundles...');
  const bundles = {};

  for (const [bundleName, sourceFiles] of Object.entries(JS_BUNDLES)) {
    const sources = [];

    for (const file of sourceFiles) {
      const filePath = path.join(CONFIG.srcJs, file);
      if (await fs.pathExists(filePath)) {
        let content = await fs.readFile(filePath, 'utf8');

        // Remove ES module import/export statements for bundled files
        // These modules will be concatenated into a single file
        content = content
          // Remove import statements
          .replace(/^import\s+.*?from\s+['"].*?['"];?\s*$/gm, '')
          .replace(/^import\s+['"].*?['"];?\s*$/gm, '')
          // Convert named exports to plain function declarations
          .replace(/^export\s+(function|const|let|var|class)\s+/gm, '$1 ')
          // Remove default exports
          .replace(/^export\s+default\s+/gm, '')
          // Remove standalone export statements
          .replace(/^export\s*\{[^}]*\};?\s*$/gm, '');

        sources.push(`// === ${file} ===\n${content.trim()}`);
      } else {
        console.warn(`  Warning: Bundle source file not found: ${file}`);
      }
    }

    bundles[bundleName] = sources.join('\n\n');
    console.log(`  Bundle ${bundleName}: ${sourceFiles.length} files combined`);
  }

  return bundles;
}

/**
 * Copy and minify static assets
 */
async function copyAssets() {
  console.log('Copying and minifying assets...');

  // Minify CSS
  if (await fs.pathExists(CONFIG.srcCss)) {
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
          console.error(`  CSS minification errors in ${file}:`, minified.errors);
          await fs.copy(inputPath, outputPath); // Fall back to unminified
        } else {
          await fs.writeFile(outputPath, minified.styles);
          const originalSize = content.length;
          const minifiedSize = minified.styles.length;
          const savings = ((1 - minifiedSize / originalSize) * 100).toFixed(1);
          console.log(`  Minified ${file}: ${originalSize} -> ${minifiedSize} bytes (${savings}% smaller)`);
        }
      }
    }
  }

  // Create JavaScript bundles and minify
  if (await fs.pathExists(CONFIG.srcJs)) {
    await fs.ensureDir(path.join(CONFIG.distDir, 'js'));

    // Create bundles from source files
    const bundles = await createJsBundles();

    // Get list of files that are included in bundles (to skip individual processing)
    const bundledFiles = new Set();
    for (const sourceFiles of Object.values(JS_BUNDLES)) {
      sourceFiles.forEach(f => bundledFiles.add(f));
    }
    // Also skip main.js since we're replacing it with bundles
    bundledFiles.add('main.js');

    // Minify and write bundles
    for (const [bundleName, content] of Object.entries(bundles)) {
      const outputPath = path.join(CONFIG.distDir, 'js', bundleName);

      try {
        const minified = await terserMinify(content, {
          compress: true,
          mangle: true
        });

        if (minified.code) {
          await fs.writeFile(outputPath, minified.code);
          const originalSize = content.length;
          const minifiedSize = minified.code.length;
          const savings = ((1 - minifiedSize / originalSize) * 100).toFixed(1);
          console.log(`  Minified bundle ${bundleName}: ${originalSize} -> ${minifiedSize} bytes (${savings}% smaller)`);
        } else {
          await fs.writeFile(outputPath, content);
        }
      } catch (err) {
        console.error(`  JS bundle minification error in ${bundleName}:`, err.message);
        await fs.writeFile(outputPath, content); // Fall back to unminified
      }
    }

    // Process remaining individual JS files (sw.js, print-store.js)
    const jsFiles = await fs.readdir(CONFIG.srcJs);

    for (const file of jsFiles) {
      if (file.endsWith('.js') && !bundledFiles.has(file)) {
        const inputPath = path.join(CONFIG.srcJs, file);
        let content = await fs.readFile(inputPath, 'utf8');

        // Service worker goes to dist root (not /js/) for proper scope
        const outputPath = file === 'sw.js'
          ? path.join(CONFIG.distDir, 'sw.js')
          : path.join(CONFIG.distDir, 'js', file);

        try {
          const minified = await terserMinify(content, {
            compress: true,
            mangle: true
          });

          if (minified.code) {
            await fs.writeFile(outputPath, minified.code);
            const originalSize = content.length;
            const minifiedSize = minified.code.length;
            const savings = ((1 - minifiedSize / originalSize) * 100).toFixed(1);
            const location = file === 'sw.js' ? '(root)' : '(/js/)';
            console.log(`  Minified ${file} ${location}: ${originalSize} -> ${minifiedSize} bytes (${savings}% smaller)`);
          } else {
            await fs.copy(inputPath, outputPath);
          }
        } catch (err) {
          console.error(`  JS minification error in ${file}:`, err.message);
          await fs.copy(inputPath, outputPath); // Fall back to unminified
        }
      }
    }
  }

  // Copy static files (fonts, favicon, etc.)
  if (await fs.pathExists(CONFIG.staticDir)) {
    await fs.copy(CONFIG.staticDir, CONFIG.distDir);
  }

  // Copy Netlify _headers file for cache optimization
  const headersPath = path.join(__dirname, 'src', '_headers');
  if (await fs.pathExists(headersPath)) {
    await fs.copy(headersPath, path.join(CONFIG.distDir, '_headers'));
    console.log('  Copied _headers for Netlify cache optimization');
  }

  // Copy fonts directory (woff2 files)
  const fontsDir = path.join(__dirname, 'src', 'fonts');
  if (await fs.pathExists(fontsDir)) {
    await fs.ensureDir(path.join(CONFIG.distDir, 'fonts'));
    const fontFiles = await fs.readdir(fontsDir);
    const woff2Files = fontFiles.filter(f => f.endsWith('.woff2'));
    for (const file of woff2Files) {
      await fs.copy(
        path.join(fontsDir, file),
        path.join(CONFIG.distDir, 'fonts', file)
      );
    }
    console.log(`  Copied ${woff2Files.length} font files to dist/fonts/`);
  }
}

/**
 * Generate cache manifest for service worker
 * Lists all critical assets that should be cached on install
 */
async function generateCacheManifest(projects) {
  console.log('Generating cache manifest...');

  // Filter projects by portfolio type
  const personalProjects = projects.filter(p => p.portfolio === 'personal' || !p.portfolio);
  const commercialProjects = projects.filter(p => p.portfolio === 'commercial');

  const manifest = {
    version: new Date().toISOString(),
    static: [
      '/css/styles.css',
      '/js/critical.js',
      '/js/interactive.js',
      '/favicon.ico',
      '/favicon.svg',
      '/manifest.json'
    ],
    pages: [
      '/',
      // Personal portfolio
      '/personal/',
      '/personal/work/',
      '/personal/about/',
      '/personal/contact/',
      // Commercial portfolio
      '/commercial/',
      '/commercial/work/',
      '/commercial/about/',
      '/commercial/contact/',
      // Shared pages
      '/prints/',
      '/video/',
      // Legacy pages
      '/work/',
      '/about/',
      '/contact/',
      '/404.html'
    ],
    projects: {
      personal: personalProjects.map(p => `/personal/projects/${p.slug}/`),
      commercial: commercialProjects.map(p => `/commercial/projects/${p.slug}/`),
      legacy: projects.map(p => `/projects/${p.slug}/`)
    }
  };

  await fs.outputJson(path.join(CONFIG.distDir, 'cache-manifest.json'), manifest, { spaces: 2 });
  const projectCount = manifest.projects.personal.length + manifest.projects.commercial.length + manifest.projects.legacy.length;
  console.log(`  Generated cache manifest with ${manifest.static.length} static assets and ${manifest.pages.length + projectCount} pages`);
}

/**
 * Generate sitemap.xml with lastmod dates and changefreq
 */
async function generateSitemap(projects, videos) {
  console.log('Generating sitemap...');

  const today = new Date().toISOString().split('T')[0];

  // Filter projects by portfolio type
  const personalProjects = projects.filter(p => p.portfolio === 'personal' || !p.portfolio);
  const commercialProjects = projects.filter(p => p.portfolio === 'commercial');

  const urls = [
    // Landing page
    { loc: CONFIG.siteUrl + '/', priority: '1.0', changefreq: 'weekly', lastmod: today },

    // Personal portfolio pages
    { loc: CONFIG.siteUrl + '/personal/', priority: '1.0', changefreq: 'weekly', lastmod: today },
    { loc: CONFIG.siteUrl + '/personal/work/', priority: '0.9', changefreq: 'weekly', lastmod: today },
    { loc: CONFIG.siteUrl + '/personal/about/', priority: '0.8', changefreq: 'monthly', lastmod: today },
    { loc: CONFIG.siteUrl + '/personal/contact/', priority: '0.8', changefreq: 'monthly', lastmod: today },

    // Commercial portfolio pages
    { loc: CONFIG.siteUrl + '/commercial/', priority: '1.0', changefreq: 'weekly', lastmod: today },
    { loc: CONFIG.siteUrl + '/commercial/work/', priority: '0.9', changefreq: 'weekly', lastmod: today },
    { loc: CONFIG.siteUrl + '/commercial/about/', priority: '0.8', changefreq: 'monthly', lastmod: today },
    { loc: CONFIG.siteUrl + '/commercial/contact/', priority: '0.8', changefreq: 'monthly', lastmod: today },

    // Shared pages
    { loc: CONFIG.siteUrl + '/prints/', priority: '0.8', changefreq: 'monthly', lastmod: today },
    { loc: CONFIG.siteUrl + '/video/', priority: '0.8', changefreq: 'monthly', lastmod: today }
  ];

  // Commercial category pages
  const commercialCategorySlugs = ['food-drink', 'interiors', 'product', 'travel', 'sport-lifestyle', 'people'];
  for (const slug of commercialCategorySlugs) {
    urls.push({
      loc: `${CONFIG.siteUrl}/commercial/${slug}/`,
      priority: '0.85',
      changefreq: 'monthly',
      lastmod: today
    });
  }

  // Personal projects
  for (const project of personalProjects) {
    urls.push({
      loc: `${CONFIG.siteUrl}/personal/projects/${project.slug}/`,
      priority: '0.9',
      changefreq: 'monthly',
      lastmod: today
    });
    urls.push({
      loc: `${CONFIG.siteUrl}/personal/projects/${project.slug}/grid/`,
      priority: '0.7',
      changefreq: 'monthly',
      lastmod: today
    });
  }

  // Commercial projects
  for (const project of commercialProjects) {
    urls.push({
      loc: `${CONFIG.siteUrl}/commercial/projects/${project.slug}/`,
      priority: '0.9',
      changefreq: 'monthly',
      lastmod: today
    });
    urls.push({
      loc: `${CONFIG.siteUrl}/commercial/projects/${project.slug}/grid/`,
      priority: '0.7',
      changefreq: 'monthly',
      lastmod: today
    });
  }

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  await fs.outputFile(path.join(CONFIG.distDir, 'sitemap.xml'), sitemap);
}

/**
 * Generate robots.txt for search engine crawlers
 */
async function generateRobotsTxt() {
  console.log('Generating robots.txt...');

  const robotsTxt = `# robots.txt for ${CONFIG.siteUrl}
# Jonathan Clifford - Documentary & Portrait Photographer

User-agent: *
Allow: /

# Sitemap location
Sitemap: ${CONFIG.siteUrl}/sitemap.xml

# Crawl-delay for polite crawling (optional)
Crawl-delay: 1

# Disallow patterns (currently none - all content is public)
# Disallow: /private/

# Allow all image crawlers for Google Images
User-agent: Googlebot-Image
Allow: /images/

# Allow social media crawlers for rich previews
User-agent: Twitterbot
Allow: /

User-agent: facebookexternalhit
Allow: /

User-agent: LinkedInBot
Allow: /
`;

  await fs.outputFile(path.join(CONFIG.distDir, 'robots.txt'), robotsTxt);
}

/**
 * Main build function
 */
async function build() {
  const startTime = Date.now();
  console.log('\n Building Jonathan Clifford Portfolio\n');

  try {
    // Load image cache for incremental builds
    console.log('Loading image cache...');
    await loadImageCache();

    await clean();

    const projects = await loadProjects();
    console.log(`Found ${projects.length} projects`);

    const videos = await loadVideos();
    console.log(`Found ${videos.length} videos`);

    const printsData = await loadPrints();
    console.log(`Found ${printsData.prints.length} prints`);

    const imageData = await processImages(projects);
    const homepageImages = await processHomepageImages();
    const landingImages = await processLandingImages();
    const criticalCss = await loadCriticalCss();

    await generatePages(projects, videos, printsData, imageData, homepageImages, landingImages, criticalCss);
    await copyAssets();
    await generateCacheManifest(projects);
    await generateSitemap(projects, videos);
    await generateRobotsTxt();

    // Save updated image cache
    await saveImageCache();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n Build complete in ${elapsed}s\n`);
    console.log(`   Output: ${CONFIG.distDir}\n`);

  } catch (err) {
    console.error('\n Build failed:', err);
    process.exit(1);
  }
}

// Run build
build();

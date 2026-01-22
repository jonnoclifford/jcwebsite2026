/**
 * New Project Scaffolding Tool
 *
 * Creates a new project folder structure with template project.json
 *
 * Usage:
 *   npm run new-project "My Project Name"
 *   node scripts/new-project.js "My Project Name"
 */

import { mkdir, readdir, readFile, writeFile } from 'fs/promises';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');
const PROJECTS_DIR = join(ROOT_DIR, 'projects');

/**
 * Generate URL-safe slug from project name
 * @param {string} name - Project name
 * @returns {string} - URL-safe slug
 */
function generateSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Prompt user for input
 * @param {readline.Interface} rl - Readline interface
 * @param {string} question - Question to ask
 * @returns {Promise<string>} - User's answer
 */
function prompt(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Get the next available order number by reading all existing projects
 * @returns {Promise<number>} - Next order number
 */
async function getNextOrderNumber() {
  let maxOrder = 0;

  try {
    const entries = await readdir(PROJECTS_DIR, { withFileTypes: true });
    const projectDirs = entries.filter((entry) => entry.isDirectory());

    for (const dir of projectDirs) {
      const projectJsonPath = join(PROJECTS_DIR, dir.name, 'project.json');
      try {
        const content = await readFile(projectJsonPath, 'utf-8');
        const project = JSON.parse(content);
        if (typeof project.order === 'number' && project.order > maxOrder) {
          maxOrder = project.order;
        }
      } catch {
        // Skip if project.json doesn't exist or is invalid
      }
    }
  } catch {
    // Projects directory doesn't exist yet
  }

  return maxOrder + 1;
}

/**
 * Check if a project with the given slug already exists
 * @param {string} slug - Project slug to check
 * @returns {Promise<boolean>} - True if project exists
 */
async function projectExists(slug) {
  try {
    const projectPath = join(PROJECTS_DIR, slug);
    await readdir(projectPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Main scaffolding function
 */
async function createProject() {
  // Get project name from command line arguments
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Error: Project name is required');
    console.error('');
    console.error('Usage:');
    console.error('  npm run new-project "My Project Name"');
    console.error('  node scripts/new-project.js "My Project Name"');
    process.exit(1);
  }

  const projectName = args.join(' ');
  const slug = generateSlug(projectName);

  if (!slug) {
    console.error('Error: Invalid project name - could not generate slug');
    process.exit(1);
  }

  console.log('');
  console.log('Creating new project:');
  console.log(`  Title: ${projectName}`);
  console.log(`  Slug:  ${slug}`);
  console.log('');

  // Check if project already exists
  if (await projectExists(slug)) {
    console.error(`Error: A project with slug "${slug}" already exists`);
    process.exit(1);
  }

  // Set up readline for interactive prompts
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    // Prompt for optional fields
    console.log('Enter optional project details (press Enter to skip):');
    console.log('');

    const location = await prompt(rl, '  Location (e.g., "London, UK"): ');
    const year = await prompt(rl, '  Year (e.g., "2024"): ');
    const description = await prompt(rl, '  Description: ');

    rl.close();

    // Get next order number
    const order = await getNextOrderNumber();

    // Create folder structure
    const projectDir = join(PROJECTS_DIR, slug);
    const originalDir = join(projectDir, 'original');

    console.log('');
    console.log('Creating folder structure...');

    await mkdir(originalDir, { recursive: true });
    console.log(`  Created: projects/${slug}/`);
    console.log(`  Created: projects/${slug}/original/`);

    // Create project.json
    const projectData = {
      title: projectName,
      slug: slug,
      location: location || '',
      year: year || '',
      description: description || '',
      order: order
    };

    const projectJsonPath = join(projectDir, 'project.json');
    await writeFile(projectJsonPath, JSON.stringify(projectData, null, 2) + '\n');
    console.log(`  Created: projects/${slug}/project.json`);

    // Print success and instructions
    console.log('');
    console.log('Project created successfully!');
    console.log('');
    console.log('Next steps:');
    console.log(`  1. Add your original images to: projects/${slug}/original/`);
    console.log('  2. Run "npm run build" to process images and generate the project page');
    console.log('');
    console.log('Project configuration:');
    console.log(JSON.stringify(projectData, null, 2));
    console.log('');

  } catch (error) {
    rl.close();
    console.error('Error creating project:', error.message);
    process.exit(1);
  }
}

// Run the script
createProject().catch((error) => {
  console.error('Failed to create project:', error);
  process.exit(1);
});

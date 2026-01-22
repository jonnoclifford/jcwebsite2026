JONATHAN CLIFFORD PHOTOGRAPHY PORTFOLIO
=======================================

A simple static site for your photography portfolio.


QUICK START
-----------

    npm install        # First time only
    npm run build      # Build the site
    npm run serve      # View locally at http://localhost:3000


================================================================================
HOW TO UPDATE CONTENT
================================================================================


ADDING A NEW PROJECT
--------------------

1. Create a folder in projects/ with a URL-friendly name (lowercase, hyphens):

       projects/my-new-project/

2. Add your images to projects/my-new-project/original/:
   - Name them 01.jpg, 02.jpg, 03.jpg, etc.
   - Use sequential numbers (the order determines slideshow order)
   - JPG format recommended

3. Create projects/my-new-project/project.json:

       {
         "title": "My New Project",
         "slug": "my-new-project",
         "location": "London",
         "year": "2024",
         "description": "A short description of this project.",
         "order": 11
       }

4. Run: npm run build

Tip: You can also use "npm run new-project" for an interactive setup.


REORDERING PROJECTS
-------------------

Edit the "order" number in each project's project.json:
- Lower numbers appear first on the Work page
- Current order: 1 = I Am Sarajevan, 2 = Living With The Dead, etc.


ADDING/REMOVING/REORDERING IMAGES IN A PROJECT
----------------------------------------------

Go to projects/[project-name]/original/:

- Add images: Add new JPGs and renumber all files sequentially
- Remove images: Delete the file and renumber remaining files
- Reorder: Rename files to change the sequence

Images must be named 01.jpg, 02.jpg, 03.jpg, etc. (with leading zeros).

Run "npm run build" after changes.


EDITING PROJECT TEXT
--------------------

Edit projects/[project-name]/project.json:

    {
      "title": "Project Title",
      "slug": "project-slug",
      "location": "City, Country",
      "year": "2024",
      "description": "Your description here. Use \\n\\n for paragraph breaks."
    }


EDITING ABOUT PAGE
------------------

Open build.js and find the aboutData section (around line 680):

    bio: `Your main bio paragraph here.`,
    bioExtended: `Your second paragraph here.`,
    clients: 'Client 1, Client 2, Client 3'

To change your portrait photo, replace static/images/portrait.jpg.


EDITING CONTACT PAGE
--------------------

Open build.js and find the contactData section (around line 690):

    email: 'info@jonathanclifford.com',
    instagram: 'jonnoclifford',
    commercialSite: 'jonnoclifford.com'


UPDATING HOMEPAGE SLIDESHOW IMAGES
----------------------------------

The homepage shows a rotating slideshow of curated images.

1. Go to the homepage/ folder
2. Add/remove/replace images (named 1.jpg, 2.jpg, etc.)
3. Run: npm run build


ADDING/EDITING VIDEOS
---------------------

Edit videos/videos.json:

    {
      "videos": [
        {
          "title": "Video Title",
          "slug": "video-slug",
          "vimeoId": "123456789",
          "year": "2024",
          "description": "Short description"
        }
      ]
    }

The vimeoId is the number from your Vimeo URL (e.g., vimeo.com/123456789).


================================================================================
BUILDING & TESTING
================================================================================

Command              What it does
-------              ------------
npm run build        Build the site (outputs to dist/)
npm run serve        Start local server at http://localhost:3000
npm run watch        Auto-rebuild when files change
npm run watch:serve  Watch + serve together


================================================================================
DEPLOYING
================================================================================

The site is set up for Netlify. Push to your GitHub repository and Netlify
will automatically rebuild.

To deploy manually:
1. Run: npm run build
2. Upload the dist/ folder to your hosting


================================================================================
FOLDER STRUCTURE
================================================================================

    .
    |-- projects/           # Photography projects
    |   +-- project-name/
    |       |-- original/   # Source images (01.jpg, 02.jpg...)
    |       +-- project.json
    |-- videos/
    |   +-- videos.json     # Video configuration
    |-- homepage/           # Homepage slideshow images
    |-- static/images/      # Site images (portrait, favicon)
    |-- templates/          # HTML templates (advanced)
    |-- src/
    |   |-- css/            # Stylesheets (advanced)
    |   +-- js/             # JavaScript (advanced)
    |-- build.js            # Build script & site data
    +-- dist/               # Built site (don't edit directly)


================================================================================
IMAGE EXPORT SETTINGS
================================================================================

When exporting images from Lightroom, Capture One, or Photoshop:

RESOLUTION
- Export at 2400px on the longest edge (minimum 1200px)
- This allows the build to generate all responsive sizes for sharp display
  on retina/4K screens

FORMAT & QUALITY
- JPG format
- 90-95% quality (the build re-compresses to optimized WebP/AVIF)

COLOR
- sRGB color profile (standard for web)

FILE NAMING
- Name files sequentially: 01.jpg, 02.jpg, 03.jpg...
- Use leading zeros for proper sorting

WHAT THE BUILD GENERATES:
    400px  - mobile thumbnails
    800px  - mobile full, tablet thumbnails
    1200px - tablet full, desktop standard

The build only generates sizes up to your source image dimensions, so larger
source files = better quality on high-res displays.


================================================================================
TIPS
================================================================================

- IMAGE SIZES: The build automatically creates multiple sizes and formats
  (WebP, AVIF, JPG) for fast loading. Just add your full-resolution JPGs.

- CACHING: The build caches processed images in .image-cache.json.
  Delete this file to force reprocessing all images.

- FIRST BUILD: The first build takes several minutes because it processes
  all images. Subsequent builds are fast (under a minute) because of caching.


================================================================================
FAVICON & SOCIAL IMAGES
================================================================================

For complete SEO and social sharing, add these files to the static/ folder:

FAVICONS (browser tab icons):
- favicon.ico         - 32x32px (legacy browsers)
- favicon.svg         - Any size, scalable (modern browsers)
- apple-touch-icon.png - 180x180px (iOS home screen)
- icon-192.png        - 192x192px (Android/PWA)
- icon-512.png        - 512x512px (Android/PWA splash)

SOCIAL SHARING:
- images/og-default.jpg - 1200x630px (Facebook/Twitter preview for non-project pages)

Project pages automatically use the first project image for social sharing.

Tip: Create favicons from your logo at https://realfavicongenerator.net

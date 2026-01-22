# Jonathan Clifford Photography Portfolio

A simple static site for your photography portfolio.

## Quick Start

```bash
npm install        # First time only
npm run build      # Build the site
npm run serve      # View locally at http://localhost:3000
```

---

## How to Update Content

### Adding a New Project

1. Create a folder in `projects/` with a URL-friendly name (lowercase, hyphens):
   ```
   projects/my-new-project/
   ```

2. Add your images to `projects/my-new-project/original/`:
   - Name them `01.jpg`, `02.jpg`, `03.jpg`, etc.
   - Use sequential numbers (the order determines slideshow order)
   - JPG format recommended

3. Create `projects/my-new-project/project.json`:
   ```json
   {
     "title": "My New Project",
     "slug": "my-new-project",
     "location": "London",
     "year": "2024",
     "description": "A short description of this project.",
     "order": 11
   }
   ```

4. Run `npm run build`

**Tip:** You can also use `npm run new-project` for an interactive setup.

---

### Reordering Projects

Edit the `"order"` number in each project's `project.json`:
- Lower numbers appear first on the Work page
- Current order: 1 = I Am Sarajevan, 2 = Living With The Dead, etc.

---

### Adding/Removing/Reordering Images in a Project

Go to `projects/[project-name]/original/`:

- **Add images:** Add new JPGs and renumber all files sequentially
- **Remove images:** Delete the file and renumber remaining files
- **Reorder:** Rename files to change the sequence

Images must be named `01.jpg`, `02.jpg`, `03.jpg`, etc. (with leading zeros).

Run `npm run build` after changes.

---

### Editing Project Text

Edit `projects/[project-name]/project.json`:

```json
{
  "title": "Project Title",
  "slug": "project-slug",
  "location": "City, Country",
  "year": "2024",
  "description": "Your description here. Use \\n\\n for paragraph breaks."
}
```

---

### Editing About Page

Open `build.js` and find the `aboutData` section (around line 680):

```javascript
bio: `Your main bio paragraph here.`,
bioExtended: `Your second paragraph here.`,
clients: 'Client 1, Client 2, Client 3'
```

To change your portrait photo, replace `static/images/portrait.jpg`.

---

### Editing Contact Page

Open `build.js` and find the `contactData` section (around line 690):

```javascript
email: 'info@jonathanclifford.com',
instagram: 'jonnoclifford',
commercialSite: 'jonnoclifford.com'
```

---

### Updating Homepage Slideshow Images

The homepage shows a rotating slideshow of curated images.

1. Go to the `homepage/` folder
2. Add/remove/replace images (named `1.jpg`, `2.jpg`, etc.)
3. Run `npm run build`

---

### Adding/Editing Videos

Edit `videos/videos.json`:

```json
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
```

The `vimeoId` is the number from your Vimeo URL (e.g., vimeo.com/**123456789**).

---

## Building & Testing

| Command | What it does |
|---------|--------------|
| `npm run build` | Build the site (outputs to `dist/`) |
| `npm run serve` | Start local server at http://localhost:3000 |
| `npm run watch` | Auto-rebuild when files change |
| `npm run watch:serve` | Watch + serve together |

---

## Deploying

The site is set up for Netlify. Push to your GitHub repository and Netlify will automatically rebuild.

To deploy manually:
1. Run `npm run build`
2. Upload the `dist/` folder to your hosting

---

## Folder Structure

```
.
├── projects/           # Photography projects
│   └── project-name/
│       ├── original/   # Source images (01.jpg, 02.jpg...)
│       └── project.json
├── videos/
│   └── videos.json     # Video configuration
├── homepage/           # Homepage slideshow images
├── static/images/      # Site images (portrait, favicon)
├── templates/          # HTML templates (advanced)
├── src/
│   ├── css/           # Stylesheets (advanced)
│   └── js/            # JavaScript (advanced)
├── build.js           # Build script & site data
└── dist/              # Built site (don't edit directly)
```

---

## Image Export Settings

When exporting images from Lightroom, Capture One, or Photoshop:

**Resolution**
- Export at **2400px on the longest edge** (minimum 1200px)
- This allows the build to generate all responsive sizes for sharp display on retina/4K screens

**Format & Quality**
- **JPG** format
- **90-95% quality** (the build re-compresses to optimized WebP/AVIF)

**Color**
- **sRGB** color profile (standard for web)

**File Naming**
- Name files sequentially: `01.jpg`, `02.jpg`, `03.jpg`...
- Use leading zeros for proper sorting

**What the build generates:**
```
400px  - mobile thumbnails
800px  - mobile full, tablet thumbnails
1200px - tablet full, desktop standard
```

The build only generates sizes up to your source image dimensions, so larger source files = better quality on high-res displays.

---

## Tips

- **Image sizes:** The build automatically creates multiple sizes and formats (WebP, AVIF, JPG) for fast loading. Just add your full-resolution JPGs.

- **Caching:** The build caches processed images in `.image-cache.json`. Delete this file to force reprocessing all images.

- **First build:** The first build takes several minutes because it processes all images. Subsequent builds are fast (under a minute) because of caching.

---

## Favicon & Social Images

For complete SEO and social sharing, add these files to the `static/` folder:

**Favicons (browser tab icons):**
- `favicon.ico` - 32x32px (legacy browsers)
- `favicon.svg` - Any size, scalable (modern browsers)
- `apple-touch-icon.png` - 180x180px (iOS home screen)
- `icon-192.png` - 192x192px (Android/PWA)
- `icon-512.png` - 512x512px (Android/PWA splash)

**Social Sharing:**
- `images/og-default.jpg` - 1200x630px (Facebook/Twitter preview for non-project pages)

Project pages automatically use the first project image for social sharing.

**Tip:** You can create favicons from your logo at https://realfavicongenerator.net

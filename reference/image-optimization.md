<!-- Source: Phase 18 — get-design-done -->

# Image Optimization Reference

Practical reference for responsive images, modern formats, loading strategies, and CDN transform patterns. Written for AI agents and developers working on web performance.

---

## 1. Format Choice Matrix

### When to Use Each Format

| Format | Browser Support | Compression vs JPEG | Encode Time | Alpha | Animation | Best Use Case |
|--------|----------------|---------------------|-------------|-------|-----------|---------------|
| **JPEG** | Universal (100%) | Baseline | Fast | No | No | Legacy fallback, wide compatibility required |
| **WebP** | 97%+ (all modern) | 25–35% smaller | Fast | Yes | Yes | Default for photos, general web images today |
| **AVIF** | 90%+ (Chrome 85+, Firefox 93+, Safari 16+) | 40–55% smaller than JPEG | Slow (CPU-heavy) | Yes | Yes | Photos where quality-per-byte is critical; static assets |
| **JPEG XL** | Limited (Chrome 91–109 behind flag; Safari 17+) | 20–60% smaller | Medium | Yes | No | Future-proofing; not yet viable as primary format |
| **PNG** | Universal (100%) | Lossless only | Fast | Yes | No | Logos, UI icons needing lossless or transparency |
| **SVG** | Universal (100%) | Vector = tiny | N/A | Yes | Yes | Icons, logos, illustrations with clean paths |
| **GIF** | Universal (100%) | Poor | Fast | 1-bit | Yes | Avoid — use WebP or video instead |

### Decision Rules

- **Default for photos**: serve AVIF with WebP fallback, JPEG last resort.
- **Default for UI assets with transparency**: WebP with PNG fallback.
- **Icons/logos**: SVG always; PNG fallback only for email.
- **Animated content**: WebP animated or `<video autoplay muted loop>` — never GIF.
- **JPEG XL**: Do not use as primary format until Safari + Chrome stable support lands.

```html
<!-- Standard format stack via <picture> -->
<picture>
  <source srcset="hero.avif" type="image/avif">
  <source srcset="hero.webp" type="image/webp">
  <img src="hero.jpg" alt="Hero image" width="1200" height="630">
</picture>
```

---

## 2. `srcset` and `sizes` Math

### Width Descriptors (w descriptors)

Width descriptors tell the browser the intrinsic pixel width of each candidate. The browser picks the best one based on the `sizes` attribute and device pixel ratio.

```html
<img
  srcset="
    image-480w.jpg   480w,
    image-960w.jpg   960w,
    image-1440w.jpg 1440w,
    image-1920w.jpg 1920w
  "
  sizes="
    (max-width: 480px)  480px,
    (max-width: 960px)  960px,
    (max-width: 1440px) 1440px,
    1920px
  "
  src="image-1920w.jpg"
  alt="Responsive photo"
  width="1920"
  height="1080"
>
```

### How to Calculate Descriptor Values

1. **Identify breakpoints** where layout changes (e.g., 480, 768, 960, 1280, 1920).
2. **For each breakpoint**, determine the rendered CSS width of the image.
3. **Multiply by the highest expected DPR** (typically 2x) to get the source pixel width.
4. **Round to the nearest common size** and generate that asset.

Example: image renders at 480px on mobile at 2x DPR → need a 960px source → label it `960w`.

### Sizes Attribute Math

`sizes` is evaluated left-to-right; first matching condition wins. Express as CSS `calc()` when the image is a fraction of the viewport:

```html
<!-- Image is full-width on mobile, 50vw on tablet, 33vw on desktop -->
<img
  srcset="photo-400.jpg 400w, photo-800.jpg 800w, photo-1200.jpg 1200w, photo-1600.jpg 1600w"
  sizes="(max-width: 600px) 100vw, (max-width: 1024px) 50vw, 33vw"
  src="photo-1200.jpg"
  alt="Gallery photo"
>
```

Breakpoint widths to always generate sources for:
- `480w` — small mobile
- `768w` — large mobile / portrait tablet
- `960w` — landscape tablet / small desktop
- `1280w` — standard desktop
- `1920w` — full HD desktop
- `2560w` — retina desktop / 2x of 1280

### Density Descriptors (x descriptors)

Use `x` descriptors only when the image always renders at a fixed CSS size (e.g., a fixed-width avatar or logo). Do not mix `w` and `x` in the same `srcset`.

```html
<!-- Fixed 80×80px avatar — use density descriptors -->
<img
  srcset="avatar.jpg 1x, avatar@2x.jpg 2x, avatar@3x.jpg 3x"
  src="avatar.jpg"
  alt="User avatar"
  width="80"
  height="80"
>
```

**Rule of thumb**: use `w` descriptors + `sizes` for fluid/responsive images; use `x` descriptors for fixed-size images.

---

## 3. Responsive Art Direction

Art direction changes the image content (crop, composition, subject) at different viewport sizes — not just resolution. Use `<picture>` with `media` attributes.

### `<picture>` + `<source>` Pattern

```html
<picture>
  <!-- Portrait crop for mobile -->
  <source
    media="(max-width: 600px)"
    srcset="hero-portrait-600.webp 600w, hero-portrait-1200.webp 1200w"
    sizes="100vw"
    type="image/webp"
  >
  <source
    media="(max-width: 600px)"
    srcset="hero-portrait-600.jpg 600w, hero-portrait-1200.jpg 1200w"
    sizes="100vw"
  >

  <!-- Landscape crop for desktop -->
  <source
    media="(min-width: 601px)"
    srcset="hero-landscape-1200.webp 1200w, hero-landscape-1920.webp 1920w"
    sizes="100vw"
    type="image/webp"
  >
  <source
    media="(min-width: 601px)"
    srcset="hero-landscape-1200.jpg 1200w, hero-landscape-1920.jpg 1920w"
    sizes="100vw"
  >

  <!-- Fallback <img> — always required, used when no <source> matches -->
  <img
    src="hero-landscape-1200.jpg"
    alt="Team working in studio"
    width="1200"
    height="630"
  >
</picture>
```

### Source Order Rules

1. `<source>` elements are evaluated top-to-bottom; first match wins.
2. Place mobile/narrow sources first when using `max-width` media queries.
3. Always end with a plain `<img>` — it is the fallback AND the element browsers use for accessibility attributes.
4. The `type` attribute on `<source>` enables format negotiation without JS.

### Combining Art Direction + Format Negotiation

```html
<picture>
  <!-- Mobile: square crop, AVIF -->
  <source media="(max-width: 480px)" srcset="product-sq.avif" type="image/avif">
  <source media="(max-width: 480px)" srcset="product-sq.webp" type="image/webp">
  <source media="(max-width: 480px)" srcset="product-sq.jpg">

  <!-- Desktop: wide crop, AVIF -->
  <source srcset="product-wide.avif" type="image/avif">
  <source srcset="product-wide.webp" type="image/webp">

  <img src="product-wide.jpg" alt="Product on white background" width="1200" height="600">
</picture>
```

---

## 4. Placeholder Strategies (LQIP / BlurHash / ThumbHash)

Placeholders prevent layout shift and give perceived performance improvement during image load.

### LQIP (Low-Quality Image Placeholder)

A tiny JPEG (typically 20–40px wide) embedded as a base64 data URI, displayed blurred via CSS until the full image loads.

**Implementation:**

```html
<div class="img-wrapper">
  <img
    class="lqip"
    src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBD..."
    aria-hidden="true"
    alt=""
  >
  <img
    class="full"
    src="photo.jpg"
    srcset="photo-480.jpg 480w, photo-960.jpg 960w"
    sizes="(max-width: 600px) 100vw, 50vw"
    alt="Studio workspace"
    loading="lazy"
    onload="this.previousElementSibling.style.opacity=0"
  >
</div>
```

```css
.img-wrapper { position: relative; overflow: hidden; }
.lqip { position: absolute; inset: 0; width: 100%; height: 100%;
        object-fit: cover; filter: blur(20px); transition: opacity 0.3s; }
.full { display: block; width: 100%; }
```

**Trade-offs**: Simple, no JS library needed. Base64 adds ~33% size overhead. LQIP JPEG should be under 300 bytes (20–40px wide, quality 20).

### BlurHash

A compact string (20–30 chars) encoding a blurred preview. Decoded client-side via the `blurhash` library into a canvas or CSS gradient.

**Implementation:**

```js
import { decode } from 'blurhash';

function renderBlurHash(hash, width = 32, height = 32) {
  const pixels = decode(hash, width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(width, height);
  imageData.data.set(pixels);
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL();
}
```

```html
<!-- Store hash in data attribute; render via JS -->
<img
  data-blurhash="LEHV6nWB2yk8pyo0adR*.7kCMdnj"
  src="photo.jpg"
  alt="Photo"
  loading="lazy"
>
```

**Trade-offs**: Smaller than LQIP (string vs base64 blob). Requires JS to decode. Good for CMS-driven images where hashes are stored in metadata. Generate server-side with `sharp` + `blurhash` npm package.

### ThumbHash

Newer algorithm (2023). Preserves aspect ratio in the hash, better color accuracy for fine details and alpha channels. Drop-in replacement for BlurHash.

```js
import { thumbHashToDataURL } from 'thumbhash';

// hash is a Uint8Array stored alongside image metadata
const placeholderURL = thumbHashToDataURL(hash);
img.src = placeholderURL; // set before lazy-load fires
```

**Trade-offs**: Slightly larger hash (~28 bytes binary vs BlurHash string) but visually superior. Choose ThumbHash for new projects; BlurHash for existing integrations.

### Comparison Table

| Strategy | Size overhead | JS required | Alpha support | Aspect ratio encoded | Best for |
|----------|---------------|-------------|---------------|----------------------|----------|
| LQIP | ~200–400 bytes base64 | No | No | No | Simple static sites |
| BlurHash | ~20–30 char string | Yes | No | No | CMS/dynamic images |
| ThumbHash | ~28 bytes binary | Yes | Yes | Yes | New projects, transparent images |

---

## 5. Lazy Loading

### `loading="lazy"` Attribute

Native browser lazy loading. Defers fetching images outside the viewport.

```html
<!-- Apply to all non-critical images -->
<img src="photo.jpg" alt="Gallery item" loading="lazy" width="800" height="600">
```

**Critical rule**: Never apply `loading="lazy"` to the LCP (Largest Contentful Paint) image. The LCP image must be fetched immediately. Identify it as the largest above-the-fold image — hero, product shot, or article lead image.

### Intersection Observer Pattern

For fine-grained control or browsers that need older support:

```js
const lazyImages = document.querySelectorAll('img[data-src]');

const observer = new IntersectionObserver((entries, obs) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const img = entry.target;
    img.src = img.dataset.src;
    if (img.dataset.srcset) img.srcset = img.dataset.srcset;
    img.removeAttribute('data-src');
    img.removeAttribute('data-srcset');
    obs.unobserve(img);
  });
}, {
  rootMargin: '200px 0px',  // Start loading 200px before entering viewport
  threshold: 0
});

lazyImages.forEach(img => observer.observe(img));
```

```html
<!-- Use data-src / data-srcset to prevent immediate fetch -->
<img
  data-src="photo.jpg"
  data-srcset="photo-480.jpg 480w, photo-960.jpg 960w"
  sizes="(max-width: 600px) 100vw, 50vw"
  alt="Gallery photo"
  width="960"
  height="640"
>
```

### Lazy Loading Rules Summary

- `loading="lazy"` on all below-the-fold images.
- Never on LCP image — use `fetchpriority="high"` instead.
- Set explicit `width` and `height` on every `<img>` to prevent layout shift (CLS).
- `rootMargin: '200px'` is a safe default for IntersectionObserver to preload slightly early.

---

## 6. `decoding="async"`

### What It Does

`decoding="async"` tells the browser it can decode the image off the main thread, allowing other rendering work to proceed in parallel. Without it, browsers may block rendering while decoding a large image.

```html
<img src="photo.jpg" alt="Decoded async" decoding="async" width="1200" height="800">
```

### When to Apply

- Apply to all large images that are not LCP-critical.
- **Do not** apply to the LCP image — synchronous decoding ensures the image renders as soon as it loads, which improves LCP score.
- Combine with `loading="lazy"` on below-the-fold images.

```html
<!-- LCP image: no async decoding, no lazy loading -->
<img
  src="hero.jpg"
  alt="Hero"
  fetchpriority="high"
  width="1920"
  height="1080"
>

<!-- Below-fold images: async decoding + lazy loading -->
<img
  src="card.jpg"
  alt="Card"
  decoding="async"
  loading="lazy"
  width="400"
  height="300"
>
```

---

## 7. `fetchpriority="high"`

### What It Does

`fetchpriority="high"` elevates the image's network priority in the browser's resource scheduler. Applied to the LCP image, it reduces the time the browser spends waiting for it, directly improving LCP Core Web Vital.

```html
<!-- Boost the LCP image -->
<img
  src="hero.jpg"
  srcset="hero-960.jpg 960w, hero-1920.jpg 1920w"
  sizes="100vw"
  alt="Hero"
  fetchpriority="high"
  width="1920"
  height="1080"
>
```

### Rules

- Apply to **exactly one** image per page — the LCP candidate.
- Do not use on multiple images; it degrades priority scheduling.
- Use `fetchpriority="low"` on decorative or off-screen images you know will not be needed soon.
- Works on `<img>`, `<link rel="preload">`, and `fetch()` calls.

```html
<!-- Preload LCP image in <head> for maximum early fetch -->
<link
  rel="preload"
  as="image"
  href="hero.jpg"
  imagesrcset="hero-960.jpg 960w, hero-1920.jpg 1920w"
  imagesizes="100vw"
  fetchpriority="high"
>
```

---

## 8. CDN Transform Patterns

### Cloudinary

Uses URL-based transformation parameters. `f_auto` selects the best format; `q_auto` selects optimal quality.

```html
<!-- Base URL structure: https://res.cloudinary.com/{cloud_name}/image/upload/{transformations}/{public_id} -->

<!-- Auto format + auto quality -->
<img
  src="https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/sample.jpg"
  alt="Auto-optimized"
>

<!-- Responsive srcset with Cloudinary transforms -->
<img
  srcset="
    https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_480/sample.jpg  480w,
    https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_960/sample.jpg  960w,
    https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_1920/sample.jpg 1920w
  "
  sizes="(max-width: 600px) 100vw, 50vw"
  src="https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_1200/sample.jpg"
  alt="Cloudinary responsive"
>
```

Key Cloudinary params: `f_auto` (format), `q_auto` (quality), `w_N` (width), `h_N` (height), `c_fill` (crop mode), `g_auto` (smart gravity/focus).

### imgix

Similar URL-based API. `auto=format` selects best format; `auto=compress` applies smart compression.

```html
<!-- Auto format + compress -->
<img
  src="https://yoursite.imgix.net/photo.jpg?auto=format,compress"
  alt="imgix optimized"
>

<!-- Responsive srcset with imgix -->
<img
  srcset="
    https://yoursite.imgix.net/photo.jpg?auto=format,compress&w=480  480w,
    https://yoursite.imgix.net/photo.jpg?auto=format,compress&w=960  960w,
    https://yoursite.imgix.net/photo.jpg?auto=format,compress&w=1920 1920w
  "
  sizes="(max-width: 600px) 100vw, 50vw"
  src="https://yoursite.imgix.net/photo.jpg?auto=format,compress&w=1200"
  alt="imgix responsive"
>
```

Key imgix params: `auto=format` (WebP/AVIF negotiation), `auto=compress`, `w`, `h`, `fit=crop`, `fp-x`/`fp-y` (focal point).

### Vercel / Next.js Image (`next/image`)

The `<Image>` component handles `srcset`, lazy loading, format negotiation, and the `/_next/image` optimization endpoint automatically.

```jsx
import Image from 'next/image';

// Responsive image — fill container
<div style={{ position: 'relative', width: '100%', aspectRatio: '16/9' }}>
  <Image
    src="/photos/hero.jpg"
    alt="Hero"
    fill
    sizes="(max-width: 600px) 100vw, (max-width: 1200px) 50vw, 33vw"
    priority          // equivalent to fetchpriority="high" — use for LCP image
    quality={85}      // default is 75; 80–90 for hero images
  />
</div>

// Fixed-size image
<Image
  src="/avatars/user.jpg"
  alt="User avatar"
  width={80}
  height={80}
  quality={80}
/>
```

Next.js generates transform URLs like: `/_next/image?url=%2Fphotos%2Fhero.jpg&w=1920&q=85`

### CDN Comparison

| Feature | Cloudinary | imgix | Vercel (next/image) |
|---------|-----------|-------|---------------------|
| Auto format (WebP/AVIF) | `f_auto` | `auto=format` | Automatic |
| Auto quality | `q_auto` | `auto=compress` | `quality` prop (default 75) |
| Art direction / crop | `c_fill`, `g_auto` | `fit=crop`, `fp-x` | `object-fit` via CSS |
| Responsive srcset | Manual URL params | Manual URL params | Automatic via `sizes` |
| Setup required | Cloudinary account | imgix source | Next.js project |

---

## 9. Image Budget Enforcement

### Maximum File Sizes by Image Type

| Image Type | Max Compressed Size | Max Dimensions | Notes |
|------------|--------------------|--------------------|-------|
| Hero / full-width banner | 200 KB | 1920 × 1080px | WebP/AVIF; 1x size, rely on srcset for 2x |
| Article / blog lead image | 100 KB | 1200 × 630px | Open Graph dimensions; dual purpose |
| Card / thumbnail | 40 KB | 600 × 400px | At displayed size, not source size |
| Avatar / profile photo | 15 KB | 200 × 200px | Square; serve WebP |
| Product image | 150 KB | 1000 × 1000px | White background; support zoom |
| Icon (raster fallback) | 5 KB | 64 × 64px | Prefer SVG; PNG only for emoji/photo icons |
| LQIP placeholder | 0.5 KB | 20–40px wide | Base64-embedded; blur via CSS |
| Logo (raster) | 20 KB | 400 × 200px | SVG strongly preferred |

### Tooling

**Build-time optimization:**

```bash
# sharp (Node.js) — resize + convert
npx sharp-cli --input "src/**/*.{jpg,png}" --output dist/images \
  --format webp --quality 82 --width 1920

# squoosh-cli — AVIF + WebP batch encoding
npx @squoosh/cli --avif '{"quality":60}' --webp '{"quality":82}' src/*.jpg

# imagemin — plugin-based pipeline
npx imagemin src/images/* --out-dir=dist/images \
  --plugin=imagemin-webp --plugin=imagemin-mozjpeg
```

**CI enforcement (example GitHub Actions step):**

```yaml
- name: Check image sizes
  run: |
    find dist/images -name "*.jpg" -size +200k -print | while read f; do
      echo "FAIL: $f exceeds 200KB hero budget"
      exit 1
    done
```

**Audit tools:**

- Lighthouse `uses-optimized-images` and `uses-webp-images` audits
- `next/image` built-in warnings for missing `width`/`height`
- `imagesize` npm package for build-time dimension checks
- Squoosh web app for manual before/after quality comparison

### Enforcement Checklist

- [ ] All hero images: AVIF + WebP + JPEG stack via `<picture>`
- [ ] Every `<img>` has explicit `width` and `height` attributes (prevents CLS)
- [ ] LCP image: `fetchpriority="high"`, no `loading="lazy"`, preload in `<head>`
- [ ] All below-fold images: `loading="lazy"` + `decoding="async"`
- [ ] No image exceeds budget for its type (see table above)
- [ ] CDN delivers `Content-Type: image/avif` or `image/webp` where supported
- [ ] Placeholders (LQIP or hash) on images with visible load time
- [ ] `sizes` attribute present on all images using `w` descriptors in `srcset`

# Performance — Reference Guide

Performance is a design constraint, not an engineering afterthought. Every millisecond of delay in LCP is a measurable reduction in conversion rate; every layout shift during page load erodes user trust. This reference establishes authoritative performance budgets, measurement targets, and implementation rules for all project types handled by the get-design-done framework.

---

## 1. Core Web Vitals Targets by Project Type

Google's Core Web Vitals are the industry-standard performance metrics for user experience. They measure loading (LCP), interactivity (INP), and visual stability (CLS). Understanding the thresholds and how they vary by project type is essential for setting appropriate design constraints during the planning phase.

### Universal Thresholds

| Metric | Good | Needs Improvement | Poor |
|--------|------|-------------------|------|
| LCP (Largest Contentful Paint) | ≤2.5s | 2.5–4.0s | >4.0s |
| INP (Interaction to Next Paint) | ≤200ms | 200–500ms | >500ms |
| CLS (Cumulative Layout Shift) | ≤0.1 | 0.1–0.25 | >0.25 |
| TTFB (Time to First Byte) | ≤800ms | 800ms–1.8s | >1.8s |

### SaaS / Dashboard Applications

Authenticated dashboard applications carry more JavaScript, more real-time data subscriptions, and more complex component trees than public pages. LCP tolerance is relaxed to ≤3.0s because users have a high motivation to wait (they are trying to accomplish a work task) and the LCP element is often a data-heavy chart or table that legitimately takes time to render. However, INP must be held to ≤200ms strictly — dashboards involve dense interaction patterns (filter, sort, paginate, drill down) and a sluggish response loop destroys the power-user experience.

### Marketing / Landing Pages

Conversion-critical pages have zero tolerance for perceived slowness. LCP must reach ≤2.0s because first impressions determine bounce rate, and bounce rate directly impacts conversion. CLS must be ≤0.05 (half the general threshold) because layout pop during hero section rendering — caused by web font loading, lazy image dimensions, or server-side-rendered content shifting — destroys the premium impression marketing pages are designed to create. Every 100ms of LCP improvement correlates with measurable conversion lift in e-commerce and SaaS trials.

### E-Commerce

| Metric | Target | Rationale |
|--------|--------|-----------|
| LCP | ≤2.5s | Product images are the LCP element — optimize aggressively |
| CLS | ≤0.1 | Price and "Add to Cart" button must not jump as images load |
| INP | ≤200ms | Cart interactions, quantity updates, and variant selection must feel instant |

Cart and checkout flows are revenue-critical paths where a 500ms interaction delay demonstrably increases abandonment. Prioritize INP on product pages and checkout funnels above other optimization work.

### Documentation Sites

| Metric | Target | Rationale |
|--------|--------|-----------|
| LCP | ≤3.0s | Docs users are high-intent; tolerate slightly longer loads |
| CLS | ≤0.1 | Code blocks and long-form content must not reflow after load |
| TTFB | ≤600ms | Docs are often statically generated — TTFB should approach CDN speed |

Documentation sites benefit from aggressive static generation and CDN distribution. TTFB at ≤600ms is achievable with proper static export (Next.js, Astro, Docusaurus) and CDN edge caching.

---

## 2. Critical CSS Strategy

The browser must parse and execute CSS before it can paint pixels. CSS that blocks rendering is the most impactful optimization target after eliminating render-blocking JavaScript. The goal is to get the above-the-fold experience to paint within the first TCP round trip (≤14KB compressed).

**Inline above-the-fold styles:** Identify the CSS rules that affect visible content within the initial viewport — typically layout grid, hero component, navigation bar, and typography declarations. Inline these rules in a `<style>` block in the `<head>`. Keep this block under 14KB compressed, which corresponds to approximately 40–60KB uncompressed depending on your gzip ratio.

**Defer non-critical CSS with preload:** Load the full stylesheet asynchronously to prevent it from blocking rendering:

```html
<link rel="preload" href="/styles/main.css" as="style" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="/styles/main.css"></noscript>
```

This pattern preloads the stylesheet at high priority (ensuring it is fetched before it is needed) while not blocking rendering. The `onload` handler promotes the `rel` from `preload` to `stylesheet` once the file is ready, applying styles without a flash of unstyled content.

**CSS containment for performance isolation:** Use `contain: layout style` on components that are visually self-contained (cards, sidebars, modals). Containment tells the browser that layout and style changes inside the component cannot affect elements outside it, enabling the browser to skip recalculation of the rest of the page tree when internal changes occur. This is particularly valuable for frequently-updated dashboard widgets and animated components.

---

## 3. Image Budgets

Images are typically the single largest contributor to LCP and total page weight. Every image decision — format, dimensions, lazy-loading strategy, and priority — directly affects Core Web Vitals.

**Format requirements:**
- **Photos and complex rasters:** WebP as primary format, AVIF as progressive enhancement where browser support allows. Never ship JPEG or PNG for photos in new projects. AVIF achieves 20–50% smaller file sizes than WebP at equivalent visual quality; use it where CMS and CDN pipelines support it.
- **Icons and logos:** SVG only. Never rasterize icons for web delivery — SVGs are resolution-independent, style-inheriting, and typically smaller than equivalent PNG at display sizes.
- **Illustrations:** SVG if illustration complexity allows; WebP for complex multi-color illustrations that would produce large SVG files.

**Responsive images with `srcset`:**

```html
<img
  src="/images/hero.webp"
  srcset="/images/hero-480.webp 480w, /images/hero-960.webp 960w, /images/hero-1920.webp 1920w"
  sizes="(max-width: 640px) 100vw, (max-width: 1280px) 80vw, 1200px"
  alt="[descriptive alt text]"
  width="1920"
  height="1080"
/>
```

Always specify `width` and `height` attributes. These allow the browser to reserve the correct space before the image loads, eliminating CLS from image loading. The `sizes` attribute tells the browser what display size to expect at each breakpoint so it can select the optimal `srcset` candidate.

**Lazy loading below-the-fold images:** Apply `loading="lazy"` to all images that are not visible in the initial viewport. This defers their network requests until the user scrolls toward them, reducing initial page weight significantly on image-heavy pages.

**The LCP image must never be lazy-loaded.** The LCP image — typically the hero image or first product image — must load as fast as possible. Apply `fetchpriority="high"` to signal the browser to deprioritize other resources in favor of this image:

```html
<img
  src="/images/hero.webp"
  fetchpriority="high"
  loading="eager"
  alt="[descriptive alt text]"
  width="1200"
  height="600"
/>
```

---

## 4. Animation Frame Budget

Smooth animation requires a consistent 60 frames per second, which means each frame must complete in ≤16.67 milliseconds. Exceeding this budget causes visible frame drops ("jank") that make interfaces feel cheap and unresponsive.

**Frame budget allocation:**

| Phase | Budget | What fits |
|-------|--------|-----------|
| JavaScript execution | ≤10ms | Style recalculation triggers, event handlers, React renders |
| Rendering pipeline | ≤6ms | Layout, paint, composite |
| **Total** | **≤16.67ms** | One 60fps frame |

**Never animate layout-triggering properties.** Properties like `width`, `height`, `margin`, `padding`, `top`, `left`, `right`, `bottom`, `border-width`, and `font-size` force the browser to recalculate layout for the entire affected subtree on every animation frame. This is guaranteed to exceed the 10ms JS budget on all but the simplest pages.

**Only animate `transform` and `opacity`.** These two properties are composited by the GPU independently of the browser's main thread layout system. An animation that only changes `transform` and `opacity` does not trigger layout or paint — it executes entirely on the compositor thread, achieving smooth 60fps even when the main thread is busy:

```css
/* DO: GPU-composited, no layout cost */
.card-enter {
  animation: card-enter 200ms ease-out;
}
@keyframes card-enter {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* DO NOT: forces layout recalculation every frame */
@keyframes card-enter-bad {
  from { margin-top: 8px; }
  to   { margin-top: 0; }
}
```

Use `will-change: transform, opacity` on elements that will be animated to promote them to their own compositor layer before the animation begins. Use this property sparingly — each compositor layer consumes GPU memory, and overuse causes memory pressure on mobile devices.

---

## 5. JavaScript Bundle Budgets

Bundle size is a proxy for parse time and execution time, both of which block interactivity. Every kilobyte of JavaScript must be justified against its user-visible value.

**Initial load budget:** The JavaScript required to render the first meaningful page interaction must be ≤170KB gzipped. This budget includes the framework runtime, routing, and any above-the-fold component logic. At average mobile connection speeds (≈1.5 Mbps download), 170KB gzipped represents approximately 900ms of transfer time — already a significant portion of a 2.5s LCP budget before parse and execution time is counted.

**Code splitting strategy:**
- **Route-level splitting:** Each page/route is a separate async chunk. Users only download code for the pages they visit.
- **Vendor chunk isolation:** Isolate `node_modules` dependencies into a separate chunk that can be cached independently of application code. Application code changes on every deploy; library code changes rarely.
- **Lazy component loading:** Use `React.lazy()` with `Suspense` for components that are not required for the initial render (modals, drawers, complex charts):

```tsx
const DataChart = React.lazy(() => import('./DataChart'));

function Dashboard() {
  return (
    <Suspense fallback={<ChartSkeleton />}>
      <DataChart />
    </Suspense>
  );
}
```

**Never use synchronous `import()` in a render path.** Dynamic `import()` inside a React render function will fire on every render, creating network requests during rendering. Load dynamic imports in effects, event handlers, or route loaders.

**Icon library tree-shaking:** Icon libraries are the most common source of unintentional bundle bloat. A single barrel import (`import * as Icons from 'lucide-react'`) will include all 1,000+ icons in the bundle. Always use named imports: `import { ChevronRight, Search } from 'lucide-react'`. Configure your bundler to use `sideEffects: false` in `package.json` for icon packages to enable full tree-shaking.

---

## 6. Font Budgets

Web fonts are blocking resources in the critical rendering path. Every additional font family, weight, and style file adds to the payload that must load before text can be rendered.

**Maximum two font families per product.** One for headings/display, one for body and UI. This constraint is both a performance budget and a typographic discipline — every additional font family increases visual complexity and requires justification against a clear aesthetic goal.

**`font-display: swap` is required.** This CSS property instructs the browser to use a system fallback font immediately and swap in the web font when it loads. Without `swap`, text is invisible during font loading (FOIT — Flash of Invisible Text), which directly hurts LCP and user experience:

```css
@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter-variable.woff2') format('woff2-variations');
  font-display: swap;
  font-weight: 100 900;
}
```

**Preload critical font weights:** The most visually prominent weight of the body font (typically 400) and the primary heading weight (600 or 700) should be preloaded:

```html
<link rel="preload" href="/fonts/inter-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/inter-700.woff2" as="font" type="font/woff2" crossorigin>
```

**Variable fonts for 3+ weights:** If a project uses three or more weights of a single typeface, use a variable font rather than separate weight files. One variable font file covers the entire weight axis and is typically smaller than three separate weight files combined. Variable fonts also enable smooth weight animations (`font-weight` transitions).

**Unicode subsetting:** Use the `unicode-range` descriptor to split fonts into subsets that load only when the characters in that range appear on the page:

```css
@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter-latin.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153;
}
```

**Total font payload target:** ≤100KB across all font files for the initial page load. Variable fonts for Latin character sets typically fall in the 50–80KB range for a single family.

---

## 7. Lighthouse CI Integration

Automated performance regression testing prevents gradual budget creep — small performance regressions accumulate unnoticed through routine development until the product is significantly slower than its target.

**GitHub Actions workflow:** Create `.github/workflows/lighthouse.yml` to run Lighthouse CI on every pull request against a staging deployment:

```yaml
name: Lighthouse CI
on:
  pull_request:
    branches: [main]
jobs:
  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Lighthouse CI
        uses: treosh/lighthouse-ci-action@v11
        with:
          urls: |
            ${{ env.STAGING_URL }}
            ${{ env.STAGING_URL }}/products
          budgetPath: ./lighthouse-budget.json
          uploadArtifacts: true
```

**Budget configuration in `lighthouse-budget.json`:**

```json
[{
  "path": "/*",
  "timings": [
    { "metric": "largest-contentful-paint", "budget": 2500 },
    { "metric": "interactive", "budget": 3500 },
    { "metric": "cumulative-layout-shift", "budget": 0.1 }
  ],
  "resourceSizes": [
    { "resourceType": "script", "budget": 170 },
    { "resourceType": "font", "budget": 100 }
  ],
  "resourceCounts": [
    { "resourceType": "third-party", "budget": 10 }
  ]
}]
```

**Block PRs on regression:** Configure the CI step to fail (blocking merge) when LCP regresses by more than 500ms compared to the base branch, or when the overall Lighthouse Performance score drops below 90. Regressions in accessibility and best practices scores below 90 should also be treated as blocking failures.

---

## 8. React Runtime Performance

React's rendering model is optimized by default, but naive usage patterns — particularly around object identity, memoization, and context — can introduce significant re-render cascades that degrade INP and animation smoothness.

**Source: nextlevelbuilder/ui-ux-pro-max-skill (MIT)**

### `React.memo()`

Use `React.memo()` only when the React DevTools Profiler demonstrates that a component re-renders with identical props and the render takes ≥50ms. `React.memo()` adds overhead — a shallow prop comparison on every parent render — that only pays for itself when the avoided render cost exceeds the comparison cost. Never memoize components that receive primitive values (strings, numbers, booleans) as props; React's reconciler handles these efficiently without memoization.

### `useMemo()`

Use `useMemo()` for computationally expensive derivations — sorting or filtering large arrays, running statistical calculations, or building complex objects from raw data — where the computation takes more than 1ms and the dependencies are stable across most renders. Do not use `useMemo()` to memoize simple object creation for the purpose of maintaining reference identity; instead, move the object outside the component or into a `useRef` if it is genuinely static.

### `useCallback()`

Use `useCallback()` when a function is passed as a prop to a memoized child component and the function's creation would invalidate the child's memo on every parent render. `useCallback()` is not needed for event handlers attached directly to DOM elements (`onClick`, `onChange`) — the DOM does not compare function references. The cost of useCallback (closure creation + dependency comparison) is only justified when it prevents a measurable re-render cascade.

### Re-render Root Causes

The two most common causes of unnecessary re-renders are (1) new object and array references created inline in JSX, and (2) Context value changes propagating to all consumers. Avoid `value={{ key: value }}` inline in Context providers — this creates a new object reference on every parent render, re-rendering all consumers. Memoize the context value with `useMemo()` or split contexts so consumers only subscribe to the slice of state they need.

Avoid anonymous arrow functions as props to performance-critical components: `<List onItemClick={() => handleClick(id)} />` creates a new function reference on every render of the parent.

### Suspense Boundaries

Place Suspense boundaries at two levels: route-level (wrapping each page's lazy-loaded component tree) and per-expensive-async-boundary (wrapping individual data-fetching components that have independent loading states). The fallback UI must match the approximate layout dimensions of the loaded content — a fallback that occupies significantly different space than the loaded component will cause CLS when the content arrives.

### React Server Components vs. Client Components

Use RSC (React Server Components) for data fetching, static markup generation, and components that do not require browser APIs or user interaction. RSC output is streamed as HTML — it adds zero JavaScript to the client bundle. Use client components (`'use client'`) only when browser APIs (localStorage, geolocation, IntersectionObserver) or event handlers (onClick, onChange) are required. Co-locate client components as deep in the component tree as possible so that only the interactive leaf nodes are included in the client bundle, not their entire parent subtrees.

### Virtualization

Never render more than 100 list items into the DOM simultaneously. Beyond this threshold, DOM node count degrades scroll performance, memory consumption, and garbage collection pauses. Use `react-window` for fixed-size list virtualization or `@tanstack/virtual` for variable-height items, table virtualization, and grid layouts. Virtualization renders only the items currently visible in the viewport plus a configurable overscan buffer, keeping DOM node count constant regardless of list length.

---

*Performance budgets defined here are enforced as acceptance criteria in `.design/STATE.md` must-haves for all phases involving UI implementation.*

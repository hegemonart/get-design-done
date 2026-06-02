# Data Visualization - Chart Selection and Best Practices

Source: nextlevelbuilder/ui-ux-pro-max-skill (MIT) - data/charts.csv

Charts are not decorations - they are arguments. Every chart type encodes a specific analytical claim, and choosing the wrong encoding forces the reader to decode the wrong claim. This reference provides decision rules for selecting chart types, configuring them accessibly, and avoiding the most common misuses.

---

## 1. Chart-Choice Matrix - Decision Framework

Every chart serves one of six analytical purposes: **comparison** (how do values rank against each other?), **composition** (how does a whole break into parts?), **distribution** (how are values spread?), **relationship** (do two or more variables correlate or influence each other?), **trend** (how does a value change over time?), or **geographic** (how does a value vary by location?). Identifying the purpose before choosing a chart eliminates most bad chart decisions.

### Comparison

| Chart type | When to use | When to avoid |
|---|---|---|
| Bar (vertical) | Comparing discrete categories; up to ~15 categories | When category labels are long - they collide |
| Bar (horizontal) | Long category labels; ranked lists; > 8 categories | When comparing time series - use line instead |
| Bullet | Comparing a value against a target range (KPI context) | For more than ~8 metrics on one screen |
| Slope | Showing how two time points changed relative to each other; showing rank reversal | More than two time points - use a line chart |

### Composition

| Chart type | When to use | When to avoid |
|---|---|---|
| Pie | Part-of-whole with ≤ 5 slices; slices differ substantially in size | > 5 categories; comparing slice sizes precisely |
| Donut | Same as pie; center space holds a summary number (total, %) | Any context where the center number distracts from part-whole reading |
| Stacked Bar | Part-of-whole across multiple categories or time points | When the interior segments (not just the bottom) need to be compared - interior comparison is unreliable |
| Treemap | Hierarchical part-of-whole; sizes span orders of magnitude | Showing change over time; fewer than ~8 leaf nodes (bar is clearer) |
| Sunburst | Hierarchical part-of-whole when hierarchy depth matters (2-3 levels) | More than 3 hierarchy levels; when labels must be legible for all segments |
| Waterfall | How a starting value reaches an ending value through additions and subtractions | Non-sequential cumulative data; when intermediate steps have no story value |

### Distribution

| Chart type | When to use | When to avoid |
|---|---|---|
| Histogram | Shape of a single continuous variable's distribution | Comparing two distributions directly - use overlaid density or faceted charts |
| Box Plot | Comparing distributions across groups; showing median, IQR, outliers | Audiences unfamiliar with statistical notation - explain quartiles in the chart subtitle |
| Violin Plot | Same as box plot, but when the shape of the distribution matters (bimodal, skewed) | Small samples (n < 30) - the smoothed density curve is misleading |
| Heatmap | Distribution of a value across two categorical dimensions; calendar patterns | When precise values matter - heatmap encodes value via color, which is imprecise |

### Relationship

| Chart type | When to use | When to avoid |
|---|---|---|
| Scatter | Correlation between two continuous variables | Overplotting with > 5,000 points - use hexbin or density contours instead |
| Bubble | Three-variable relationship where the third variable is proportional in magnitude | When bubble areas differ < 2× - the size difference is imperceptible |
| Chord | Flows or relationships between the same set of entities (e.g., trade between countries) | Directed flows where magnitude matters - Sankey is clearer |
| Sankey | Directed flows between nodes; volume is encoded in link width | Cyclic flows; more than ~10 nodes (hairball effect) |
| Network/Force-directed | Topology of connections between nodes; cluster detection | Quantifying relationships - edge weight is visually unreliable |

### Trend

| Chart type | When to use | When to avoid |
|---|---|---|
| Line | Single or multiple continuous values over time | Unordered categorical data - use bar |
| Area | Cumulative volume over time; emphasis on magnitude not rate of change | Multiple series with overlapping areas - use line chart with fills instead |
| Sparkline | Compact trend indicator embedded in a table or KPI card | Any context requiring axis labels or precise value reading |
| Candlestick | OHLC financial data; price range and direction per period | Non-financial time series - the OHLC convention is opaque to general audiences |

### Progress/Goal

| Chart type | When to use | When to avoid |
|---|---|---|
| Gauge | Single KPI versus a target or threshold; dashboard hero metric | Multiple gauges side by side - comparison is very hard with radial encodings |
| Funnel | Conversion or attrition across sequential stages | Stages that are not strictly sequential or mutually exclusive |

### Geographic

| Chart type | When to use | When to avoid |
|---|---|---|
| Geographic / Choropleth | Value distribution across geographic regions; regional comparison | When region size distorts perception - large low-population regions dominate (use cartogram instead) |

### Project Timelines

| Chart type | When to use | When to avoid |
|---|---|---|
| Gantt | Task scheduling, duration, and dependency visualization over time | Real-time progress tracking without frequent data updates - stale Gantt charts mislead |

---

## 2. Complete Chart Catalog (25 Types - GDD Decision Format)

### Comparison

**Bar (Vertical)**
Use a vertical bar chart when comparing discrete, unordered categories and the category labels fit horizontally beneath each bar. It is the default choice for most categorical comparison tasks because readers compare bar heights intuitively from a shared baseline. Recommended library: Recharts `<BarChart>` for React. Never use when you have more than 15 categories or when the chart width cannot accommodate all labels without rotation.

**Bar (Horizontal)**
Use a horizontal bar chart when category labels are long (> 15 characters), when rankings are the story, or when you have more than 8 categories. Horizontal orientation gives labels room to breathe and makes rank order easy to read top-to-bottom. Recommended library: Recharts `<BarChart layout="vertical">` for React. Never use when your data represents a time series - line charts handle ordered time data far better.

**Bullet Chart**
Use a bullet chart when you need to show a single measure against one or more qualitative thresholds (poor / satisfactory / good) and a target marker, typically in a KPI or performance dashboard. It was designed by Stephen Few as a compact replacement for gauges and meter charts. Recommended library: Nivo `@nivo/bullet` for React. Never use when the audience needs to compare more than eight metrics simultaneously - the encoding becomes too dense.

**Slope Chart**
Use a slope chart when you want to show how values changed between exactly two time points and which entities rose, fell, or crossed each other. The crossing lines make rank reversal immediately visible. Recommended library: D3 with a custom `line` generator in React. Never use when you have more than two time points or more than ~10 entities - the chart becomes unreadable.

---

### Composition

**Pie Chart**
Use a pie chart when showing how a whole divides into parts, the parts are mutually exclusive and exhaustive, and there are five or fewer slices with meaningfully different sizes. Readers are reliable at judging the largest and smallest slices but not intermediate ones. Recommended library: Recharts `<PieChart>` for React. Never use when you have more than five categories or when precise comparison between slices is required.

**Donut Chart**
Use a donut chart in the same scenarios as a pie chart, with the added benefit that the hollow center can display a summary value (total, percentage of the largest segment, or a label). The reduced ink in the center slightly improves the legibility of the arc. Recommended library: Recharts `<PieChart>` with `innerRadius` set for React. Never use when the center callout number would distract from the part-whole message or when the chart is very small.

**Stacked Bar Chart**
Use a stacked bar chart when you need to show both total magnitude and part-of-whole composition across multiple groups or time points simultaneously. The bottom segment is comparable across groups; interior segments are not - readers cannot align them to a common baseline. Recommended library: Recharts `<BarChart>` with `stackId` for React. Never use when comparing the sizes of interior stack segments is the primary analytical task.

**Treemap**
Use a treemap when showing hierarchical composition and sizes span a wide range - the nested rectangles make relative size comparisons across magnitudes legible at a glance. Treemaps handle dozens to hundreds of leaf nodes without becoming unreadable, provided the labels are sized to fit. Recommended library: Nivo `@nivo/treemap` for React. Never use when the data has fewer than eight leaf nodes (a bar chart communicates the same information with less decoding effort) or when showing change over time.

**Sunburst**
Use a sunburst chart when hierarchical part-of-whole data has two or three meaningful levels and the reader needs to trace the contribution of sub-categories to their parent. Each ring represents one level of the hierarchy. Recommended library: Nivo `@nivo/sunburst` for React. Never use when hierarchy depth exceeds three levels, as inner rings become too small to label legibly and the chart degrades into an art object.

**Waterfall Chart**
Use a waterfall chart when explaining how an initial value reaches a final value through a series of positive and negative contributions - profit-and-loss bridges, budget variance analysis, and step-by-step change attribution are the canonical use cases. Each bar floats from the accumulated prior value. Recommended library: Recharts with custom `<Bar>` using transparent bottom segments to create the floating effect, or Nivo `@nivo/bar` for React. Never use when the intermediate steps are not sequentially meaningful or when the audience cannot tolerate the decoding effort of floating bars.

---

### Distribution

**Histogram**
Use a histogram when revealing the shape of a single continuous variable's distribution - whether it is normal, skewed, bimodal, or has outliers. The key design choice is bin width: too few bins hides structure; too many bins creates noise. Recommended library: Nivo `@nivo/bar` with manually computed bins, or Victory `<VictoryHistogram>` for React. Never use when comparing two distributions on the same axis - overlapping histograms are hard to read; use a ridgeline or faceted approach instead.

**Box Plot**
Use a box plot (box-and-whisker) when comparing the distribution of a continuous variable across multiple groups. It summarizes median, interquartile range (IQR), and outliers in a compact glyph that scales to dozens of groups. Recommended library: Victory `<VictoryBoxPlot>` for React. Never use with audiences unfamiliar with statistical notation - always include a subtitle that explains that the box spans the middle 50% of values.

**Violin Plot**
Treat a violin plot as an enhanced box plot that additionally shows the full density shape of the distribution via a mirrored kernel density estimate. Use it when the distribution shape is the analytical point - bimodality, heavy tails, or gaps in the data that a box plot's five-number summary would hide. Recommended library: D3 with a custom density estimate rendered as a `<path>` in React. Never use with samples smaller than 30 observations - the smoothed curve implies precision the data does not support.

**Heatmap**
Use a heatmap when showing the distribution of a value across two categorical dimensions simultaneously - website traffic by hour and day of week, gene expression across samples and conditions, or feature correlation matrices. Color encodes the value; spatial position encodes the two categories. Recommended library: Nivo `@nivo/heatmap` for React. Never use when the audience needs to read precise values - color is an imprecise channel; pair with tooltips or an adjacent data table.

---

### Relationship

**Scatter Plot**
Use a scatter plot when investigating correlation, clustering, or outliers between two continuous variables. Each point represents one observation; position encodes both values against shared axes. Recommended library: Recharts `<ScatterChart>` for React. Never use when overplotting obscures the pattern - with more than 5,000 points, switch to a hexbin aggregation or 2D density contour chart.

**Bubble Chart**
Use a bubble chart when a third continuous variable can be meaningfully encoded as the area of each scatter point - market share plus revenue plus growth rate, for example. Area encoding is less precise than position, so the third variable should be the least precise claim in the story. Recommended library: Recharts `<ScatterChart>` with a custom dot renderer for React. Never use when the range of the third variable is less than 2× - the size difference is imperceptible and the extra encoding adds confusion without insight.

**Chord Diagram**
Use a chord diagram when showing bidirectional flows or relationships between members of the same set - migration between cities, trade flows between countries, or co-occurrence between categories. The arc length encodes the total flow for each node; the chord width encodes the flow between two specific nodes. Recommended library: D3 `d3-chord` with custom React SVG rendering. Never use when the flows are directed and their asymmetry is the story - Sankey handles directed flows with visible volume much more clearly.

**Sankey Diagram**
Use a Sankey diagram when showing directed flows with volume through a network of nodes - user journey funnels, energy systems, budget allocations, and supply chain flows are classic cases. Link width is proportional to flow volume. Recommended library: Nivo `@nivo/sankey` for React. Never use with cyclic flows or more than approximately ten nodes - the diagram quickly becomes a hairball that defeats the purpose of the visualization.

**Network / Force-Directed Graph**
Use a force-directed network graph when the topology of connections between entities is the story - who is connected to whom, cluster structure, centrality, and isolated nodes. Force simulation positions densely connected clusters near each other. Recommended library: D3 `d3-force` with custom React SVG for full control. Never use when you need to compare edge weights or node values precisely - quantitative encoding via edge thickness or node size is unreliable in a force layout.

---

### Trend

**Line Chart**
Use a line chart when showing how one or more continuous values change over an ordered time series. The connecting line implies continuity between measurements, so only use it when intermediate values would logically exist. Recommended library: Recharts `<LineChart>` for React. Never use for unordered categorical data - a bar chart is correct when there is no meaningful order between data points.

**Area Chart**
Use an area chart when the cumulative volume or magnitude beneath the line is part of the story - total revenue over time, cumulative downloads, or stacked contribution of multiple series. Filling the area below the line emphasizes quantity more than rate of change. Recommended library: Recharts `<AreaChart>` for React. Never use with multiple overlapping series that share the same baseline - the overlaps become confusing; use a line chart with area fills per series that do not overlap, or switch to a stacked area.

**Sparkline**
Use a sparkline as a compact inline trend indicator embedded within a table cell, a KPI card, or dense prose - the shape of the trend is the signal, not individual values. They are designed to be read without axes or labels. Recommended library: Recharts `<LineChart>` at very small dimensions with all axes and padding removed, or Victory `<VictoryLine>` for React. Never use when the reader needs to identify specific values, compare two sparklines precisely, or understand the scale of the change.

**Candlestick Chart**
Use a candlestick chart for financial OHLC (open, high, low, close) data where the price range and direction within each period are both meaningful - daily stock prices, hourly crypto trades, and options expiry analysis. The body color (typically green/red) encodes whether the close was above or below the open. Recommended library: a specialized financial library such as `lightweight-charts` (TradingView), or D3 with custom React SVG for full control. Never use for non-financial time series where the OHLC convention would confuse general audiences who do not know the encoding.

---

### Progress / Goal

**Gauge Chart**
Use a gauge (also called a dial or speedometer chart) for a single KPI that has a meaningful threshold or target - CPU usage, customer satisfaction score, or a completion percentage. The radial encoding is immediately legible to general audiences as a progress metaphor. Recommended library: Nivo `@nivo/pie` with a semi-circle clipping mask, or a custom D3 arc in React. Never use for multiple gauges displayed side by side - radial comparison is cognitively expensive; use a bullet chart array instead.

**Funnel Chart**
Use a funnel chart when showing attrition or conversion across a fixed sequence of stages - e-commerce checkout steps, sales pipeline stages, or onboarding flows. Each stage is narrower than the previous, encoding drop-off volume. Recommended library: Nivo `@nivo/funnel` for React. Never use when the stages are not strictly sequential, not mutually exclusive, or when users can re-enter earlier stages - the funnel metaphor implies a one-way flow and will mislead.

---

### Geographic

**Geographic / Choropleth Map**
Use a choropleth map when comparing a statistical variable across geographic regions - unemployment by county, election results by state, or population density by country. Color encodes the variable; spatial position provides geographic context. Recommended library: D3 with `d3-geo` projections and TopoJSON boundary data, or Nivo `@nivo/geo` for React. Never use when large low-population regions visually dominate the map while small high-population regions are barely visible - this is a known perceptual bias of choropleths; consider a cartogram or a bar chart with a small map inset.

---

### Project Timelines

**Gantt Chart**
Use a Gantt chart when visualizing task scheduling, durations, dependencies, and resource allocation across a project timeline. Horizontal bars represent task duration; vertical position groups tasks by resource or phase. Recommended library: custom D3 rendering or specialized libraries such as `react-google-charts` (Gantt type) for React. Never use when the underlying data is not kept current - a stale Gantt chart actively misleads stakeholders about project status.

---

## 3. Color-Blind-Safe Palettes

Approximately 8% of males and 0.5% of females have some form of color vision deficiency. Using a color-blind-safe palette is not optional for any chart that reaches a general audience.

### Okabe-Ito (Categorical - 8 colors)

Developed by Masataka Okabe and Kei Ito and published in "Color Universal Design (CUD): How to make figures and presentations that are friendly to colorblind people" (J-Stage, 2008). This palette is distinguishable under all major types of color vision deficiency: deuteranopia, protanopia, tritanopia, and achromatopsia.

| Swatch | Name | Hex |
|---|---|---|
| Black | Black | `#000000` |
| Orange | Orange | `#E69F00` |
| Sky Blue | Sky Blue | `#56B4E9` |
| Bluish Green | Bluish Green | `#009E73` |
| Yellow | Yellow | `#F0E442` |
| Blue | Blue | `#0072B2` |
| Vermillion | Vermillion | `#D55E00` |
| Reddish Purple | Reddish Purple | `#CC79A7` |

Use Okabe-Ito as the default categorical palette for all new charts unless a client brand palette takes precedence. When brand colors are required, simulate deuteranopia using tools such as Coblis or Viz Palette before shipping.

### Viridis (Sequential - Continuous)

Viridis is a perceptually uniform sequential colormap developed by Nathaniel Smith and Stefan van der Walt for matplotlib (SciPy 2015). It is safe for deuteranopia and protanopia, prints legibly in greyscale, and is monotonically increasing in perceived brightness - meaning that higher values are always visually distinct from lower values. Use Viridis for heatmaps, choropleths, and any continuous sequential data.

CSS custom property suggestion: use the `viridis` scale from the `d3-scale-chromatic` package - `d3.scaleSequential(d3.interpolateViridis)`.

### Cividis (Sequential - Blue-Yellow Optimized)

Cividis is a variant of Viridis specifically optimized for blue-yellow (tritanopia) color blindness, developed by Jamie Nuñez, Christopher Anderton, and Ryan Renslow (PLOS ONE, 2018). It transitions from dark blue through grey to yellow and is designed to appear nearly identical to individuals with and without color vision deficiency. Use Cividis when your audience includes users with tritanopia, or as a general-purpose alternative to Viridis.

CSS: `d3.scaleSequential(d3.interpolateCividis)` from `d3-scale-chromatic`.

### Plasma (Sequential - High Contrast)

Plasma is a high-contrast perceptually uniform sequential palette that transitions from dark purple through bright orange-yellow. Use Plasma for sequential data where Viridis reads as too green-dominant or where high contrast between low and high values is needed in print. It is safe for deuteranopia and protanopia.

CSS: `d3.scaleSequential(d3.interpolatePlasma)` from `d3-scale-chromatic`.

### Red-Green Ban

**Never use red and green as the primary visual distinction in any chart.** Red-green color blindness (deuteranopia/protanopia) affects approximately 8% of males. This means that in any reasonably sized user group, a significant fraction of your male users cannot distinguish a chart that uses red for "negative" and green for "positive." Replace red-green with a blue-orange or purple-green pairing, or use position and shape as the primary encoding with color as a secondary channel.

---

## 4. Pie Chart Rules

The pie chart is the most misused chart type in business contexts. These rules are non-negotiable.

- **Use pie only for part-of-whole data with five or fewer slices.** The human visual system is reliable at reading pie slices only when the slices are few and substantially different in size. Beyond five slices, switch to a horizontal bar chart sorted by value.
- **Never use 3D pie charts.** The perspective projection warps the apparent size of slices - a slice in the foreground appears larger than an identical slice in the background. A 3D pie chart is not a stylistic choice; it is a lie about the data. Remove it from any design system component library.
- **For more than five categories, use a bar chart or treemap.** A horizontal bar chart sorted descending gives every category a position on a shared baseline and is orders of magnitude more readable than a twelve-slice pie.
- **Label slices directly when there are five or fewer slices.** Place the label and value inside or adjacent to each slice. Legends force the reader to shuttle their eyes back and forth between the legend and the chart - this is cognitive overhead that direct labeling eliminates. When slices are too small to label directly, use a leader line.

---

## 5. Axis Conventions

Axes are the scaffolding of interpretation. Misusing them is one of the most common ways charts mislead.

### Zero Baseline

Always start bar chart and area chart Y-axes at zero. A bar whose height encodes a value depends entirely on that bar's length relative to the baseline - truncating the baseline inflates the visual difference between bars. A chart showing two bars of 98 and 99 that is truncated to start at 97 makes them appear vastly different; starting at zero makes them appear nearly identical, which is the truth. This rule is absolute for bar and area charts.

### Line Chart Truncation Exception

Line charts showing change over time may truncate the Y axis when the absolute values are large but the change is small and meaningful - for example, a body temperature chart ranging from 36.0°C to 38.5°C is more useful than one ranging from 0°C to 40°C. **When you truncate a line chart Y-axis, you must include a break indicator (⁃⁃) on the axis to signal that the baseline is not zero.** Without the break indicator, the chart misleads.

### Dual Y-Axis

Avoid dual Y-axis charts. A dual Y-axis allows the designer to manipulate the apparent correlation between two variables by independently scaling each axis - any two unrelated trends can be made to appear correlated. There is almost always a better alternative: separate charts sharing an X-axis (small multiples), an index chart normalizing both series to 100 at a common start point, or a scatter plot if correlation is what you are trying to show.

### Log Scale

A logarithmic scale is valid and appropriate when data spans multiple orders of magnitude - population by country, income distribution, or exponential growth curves. A log scale compresses the high end and expands the low end, making growth rates comparable across the full range. **Always label a log-scale axis explicitly as "log scale."** Readers who do not notice they are looking at a log axis will dramatically misread the rate of change between data points.

---

## 6. Annotation Patterns

Annotations are the editorial layer of a chart - they tell the reader which data points are most important and why.

### Direct Labeling vs. Legend

Direct labeling on the chart is more readable than a legend when the chart has five or fewer series. A legend requires the reader to locate the matching color or shape key and then return to the chart; direct labeling at the end of each line or within each bar segment eliminates that round trip. Use a legend only when there are six or more series or when lines overlap so densely that labels cannot be placed without collision.

### Callouts for Notable Data Points

Use callout annotations to mark data points with editorial significance - a record high or low, a policy change, an anomaly, a product launch, or an external event that explains a discontinuity. A callout typically consists of a small circle or dot on the data point, a leader line, and a text label. Callout text should be **one sentence maximum**, left-aligned on the callout, and written in plain language that states what happened, not what the reader can already see ("Revenue fell 22% in March after the supply chain disruption" is useful; "Value decreases here" is not).

### Annotation Placement

Place annotations so they do not overlap the most important data series. Use white or semi-transparent backgrounds behind annotation text boxes to ensure legibility against the chart background. On small screens, consider reducing annotation density or making annotations accessible via a tooltip rather than always-visible text.

---

## 7. Accessibility

Data visualizations present unique accessibility challenges because they communicate through a visual channel that is unavailable to screen reader users and partially unavailable to users with color vision deficiency.

### Data Table Alternative

Always provide a data table as an accessible alternative to complex charts. WCAG 1.1.1 (Level A) requires non-text content to have a text alternative that presents the same information. For a line chart, this means an HTML `<table>` with the same data used to generate the chart - it can be visually hidden and shown on demand, included below the chart, or linked as a download. The chart title and description should also be conveyed in the chart's `<title>` and `<desc>` SVG elements or in an `aria-label` on the chart container.

### ARIA Live Regions for Dynamic Charts

Charts that update in real time - stock price tickers, live analytics dashboards, server monitoring - must use ARIA live regions to announce changes to screen reader users. Set `aria-live="polite"` on a visually hidden element that receives a text update each time the chart data changes. Use `aria-live="assertive"` only for urgent alerts (threshold breach, system failure). Avoid updating the live region more than once every few seconds, as rapid updates interrupt screen reader speech.

### Keyboard Navigation

Interactive charts that support brushing, zooming, or selecting data ranges must be keyboard accessible. The selected data range must have a visible focus ring that meets WCAG 2.4.7 (focus visible). Users should be able to move the selection with arrow keys, reset with Escape, and confirm a selection with Enter. This applies to date range pickers embedded in dashboards, scatter plot lasso selections, and histogram brush controls.

### Sonification

Sonification - encoding data as sound (pitch, tempo, or timbre) - is an experimental but promising alternative for screen reader users who cannot interpret visual charts even with text alternatives. Libraries such as Highcharts Sonification Studio and Astronify provide this capability. Sonification is not currently a WCAG requirement, but it is worth noting for products that serve visually impaired users as a primary audience. Do not substitute sonification for a data table; provide both.

---

## 8. Dashboard Patterns

A dashboard is a collection of charts, and the design principles that apply to individual charts apply with compounding force to dashboards - bad individual chart choices become bad dashboard experiences.

### Overview First, Filter Late, Drill Down

Follow Shneiderman's Visual Information-Seeking Mantra: **overview first, zoom and filter, then details on demand.** The dashboard's first view should give the reader the big picture - total performance, trend direction, anomalies. Filtering controls (date range, segment selector) narrow the overview. Drill-down links or expandable panels reveal underlying detail. Reversing this order - starting with granular data - overwhelms users and prevents them from forming a correct mental model of the system.

### KPI Cards Above the Fold

The most important single number belongs above the fold as a KPI card. A well-designed KPI card contains three elements: the **current value** (large, high-contrast), the **trend direction** (up/down arrow with percentage change), and a **comparison to the prior period** (last week, last month, last year). These three elements answer the three questions every stakeholder asks first: what is it, is it good or bad, and is it getting better or worse?

### Progressive Disclosure

Structure dashboard information in three layers: **summary** (KPI cards and headline charts above the fold), **detail** (supporting charts visible on scroll), and **raw data** (accessible via a link, export, or drill-down table). This mirrors how users actually read dashboards - most users stop at the summary layer most of the time; power users drill into detail; analysts need the raw data. Putting all three layers on the same screen simultaneously creates visual noise for the majority of users.

### Cognitive Load Budget

Apply a strict cognitive load budget above the fold: **no more than five distinct visual elements** (KPI cards, charts, filter controls) should compete for attention in the initial viewport. Every additional element above five increases cognitive load non-linearly - users experience "dashboard blindness" and stop reading the dashboard at all. If you have eight KPIs, group them into two rows of four with clear visual hierarchy that directs attention to the top two. If you have twelve charts, use tabs or sections to reveal them progressively rather than displaying them simultaneously.

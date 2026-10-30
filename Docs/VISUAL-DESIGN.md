# Calm neural visuals and practical page layouts

## Visual contract

### Focus

Focus shows a procedural 3D brain (`BrainScene.ts`) with a fixed camera. The view shows the left hemisphere from the side, slightly from the front and from above.

- **Anatomy.** Two hemispheres with flat medial walls meet at a narrow longitudinal fissure. A lateral (Sylvian) fissure separates the temporal lobe. A cerebellum with thin parallel folia and a short brainstem sit below the occipital lobes.
- **Folds.** Gyri and sulci come from displaced geometry, not from a texture or a model file. The sulci are evenly spaced contour bands of domain-warped Perlin noise with a fixed seed, so every launch builds the same brain. Vertex colors darken the sulci and the medial wall.
- **Progress.** The session progress lights the cortex in the same on-screen direction as the progress bar: from the frontal pole on the left to the occipital pole and the cerebellum on the right. At 0% the brain is a quiet neutral grey. At 100% all of it is lit. A thin glowing band marks the edge of the lit area, and the lit gyral crests carry small sparks.
- **Color.** Purple for focus, blue for breaks. The light theme tints the lit cortex. The dark theme also adds a glow (emissive light).
- **Meaning.** The brain is a metaphor for session progress. The progress value comes from the existing timer projection. It does not measure attention. It does not change timer accounting.
- **Motion.** During a running session, the brain sways and breathes slightly, the sparks twinkle and soft pulses travel through the lit area. Animation time advances only while the scene moves, so a pause freezes the pose. A paused, reduced-motion or hidden scene renders one still frame and stops its loop.

### Session gauge (optional Focus visual)

When `settings.focusVisual` is `instrument`, Focus shows an isometric SVG dial indicator (`figures/session-gauge/`) instead of the brain. The drawing follows the Anatomy skill: a real object made of many small solid parts, four neutral tones and one lit part.

- **Object.** A surface plate on feet with a ruler strip and a label plate, a magnetic stand with a post, a clamp and an arm, a dial indicator with a knurled bezel, and a screw jack under the plunger. The parts are about 60 solids and lines.
- **Meaning.** One needle turn is one 10-minute milestone (`BRAIN_MILESTONE_MS`). The small dial counts turns up to 12 (`BRAIN_MILESTONES`, 2 hours), so the gauge and the floating brain keep the same pace. The marker outside the small dial shows `plannedMs`; before a session it follows the prepared duration. The jack lifts the anvil and the plunger by one world unit for each turn, so the plunger height and the needle come from the same value.
- **Truth.** `model.ts` reads only `elapsedMs` and `plannedMs` from the main-process snapshot. The figure does not measure time.
- **Colour.** The needle and the plunger are the lit part: `--accent` for focus and `--blue` for breaks, through `--figure-lit` on the SVG.
- **Motion.** While the timer runs, the moving parts ease toward each new snapshot value in about 0.35 s and then stop the frame loop. They draw at 30 frames per second at most. A paused, hidden, reduced-motion or animation-off figure jumps to the value without a loop. Only the needle, the small hand, the wheel index, the screw and the lifted group change; they are written through refs, so a timer update does not re-render the static art.
- **Geometry.** `geometry.ts` builds every static path once at module load with `iso/iso-kit.ts`. The exposed part of the jack screw is the only solid that is rebuilt per frame.

### Floating timer

The floating timer shows a constellation of neurons in the shape of a brain (`NeuronScene.ts`), seen from the left side. It uses the same 108 × 90 slot as the old brain sprite. The canvas is transparent.

- **Constellation.** About 180 neurons sit along the brain lines, plus faint stars that fill the cerebrum and the cerebellum. Before the first milestone, all neurons show as faint stars and the first neuron is lit.
- **Formation.** At each 10-minute milestone of elapsed timer time, lines draw from neuron to neuron and trace the brain. A neuron lights up when a line reaches it. The drawing order is: the cerebrum silhouette, the cerebellum, the brainstem, the lateral fissure, the central sulcus, the other sulci and the cerebellar folia.
- **Pacing.** Each 10-minute milestone adds a fixed share of 1/12 and draws it over 2 minutes of timer time. Thus the brain is complete after 12 milestones, at 2 hours and 2 minutes. The planned duration and the timing mode do not change the pace. A shorter session ends with part of the brain. Breaks are 10 minutes at most, so a break shows the faint constellation. `brainFormation` in `shared/timer-display.ts` calculates the value.
- **Meaning.** Formation uses `elapsedMs` from the main-process timer snapshot. A paused timer holds the brain still. A reopened window shows the same brain, without a replay. The scene does not change timer accounting.
- **Color.** Purple for focus, blue for breaks. A thin white shadow keeps the brain readable on dark and light desktops.
- **Motion.** While the timer runs, the brain sways slowly, lit neurons breathe, unlit stars twinkle and a faint signal travels along the formed lines in drawing order. Reduced motion and disabled animations give a still frame that updates only when the timer state changes.

### Neural World

Neural World is a 2D overview on one canvas (`WorldCanvas.ts`). `world-map.ts` builds the map from records with `shared/goal-world.ts`, and `shared/achievements.ts` gives the achievements and palettes. The page does not use Three.js.

- **Layout.** You are at the centre (0, 0). Areas sit on a circle around you, in creation order. Goals sit on a fan at the outer edge of their area: 7 on the first arc, the rest on a second arc. Positions come from identities and creation order, never from totals. The canvas fits the extent of the map at any aspect ratio.
- **Sizes.** The core, the areas and the goals grow with recorded time on a log scale that saturates (500 h, 300 h and 100 h).
- **Life.** Each finished session is a mote that orbits its goal, or its area without a goal (16 per goal and 28 per area at most). Motes of the last 7 days are brighter. Pulses go from the core to an area or goal at a rate that follows its time in the last 28 days. A running focus session streams pulses to its target. The core, the regions and the next roadmap step breathe slowly.
- **Status.** Draft: translucent, dashed. Paused: muted. Achieved: golden ring. Archived: not drawn.
- **Replay.** Replay plays every included session in time order over 9 s. Sizes come from the sessions up to the replay time, and areas and goals appear when they are created or get their first session.
- **Achievements.** Earned achievements that are not collected orbit the core as golden gems. A click on a gem plays a burst and collects it.
- **Colour.** Area colours identify areas, goals and motes. The palette tints the sky, the core and the progress ring. With a selection, other areas and goals are muted.
- **Camera.** Drag pans. Ctrl or ⌘ with the wheel zooms around the pointer; plain wheel scrolls the page. A selection eases the camera to it over about 0.4 s. Reduced motion and disabled animations jump to the end state.
- **HTML.** The side panel, the area and goal list, the tooltip and the replay date are HTML. The canvas is `aria-hidden`; every target also has a button.
- **Truth.** The page reads records only. The canvas does not measure time.

## UX decisions

- **Focus** starts with the field, timing mode, duration and an optional intention. Goal, activity mode and energy are in **Optional details**. Preparation that already exists from Goals or Tasks shows as a compact linked summary.
- **Tasks** starts with creation, search and the list. Task details, advanced filters and category management are disclosures. On wide layouts, session preparation is next to the list. On smaller layouts, it is below the list.
- **Calendar** shows the calendar before the planned actions of the selected day. Plans and the heat of recorded time keep different meanings.
- **Goals** empty states use less vertical space.
- **Patterns** keeps its chart hierarchy. Its filters wrap.
- **Settings** has three groups: defaults, appearance and feedback, and activity and shortcuts. It has a sticky area that shows the save button and the unsaved state. The existing reconciliation of drafts stays.

## Rendering and fallback

Three.js loads as a separate local renderer chunk. The default desktop launch permits hardware acceleration.

The app shows the existing SVG in these cases:

- WebGL 2 is not available.
- Scene initialization fails.
- The graphics context is lost.

In all these cases, all HTML controls stay usable. After a context failure, the fallback applies to that mounted scene only. If you go to another page and come back, the app can create a new scene. Focus stays mounted during navigation, so its preparation stays.

### Software rendering

Use software rendering if a computer has problems with graphics or with the compositor.

1. Fully quit Focus Guide.
2. Do one of these steps:
   - Run `Start-Software-Rendering.cmd` in `Aplicativo/`.
   - Start `FocusGuide.exe --software-rendering`.

This mode disables hardware acceleration before startup. It does not create WebGL scenes. A scene fallback alone cannot repair a compositor problem that affects the full window. The read-only field `AppState.graphicsMode` shows the launch mode. It is not a saved preference and not a backup field.

In software rendering, or when its scene fails, the floating window shows its transparent brain sprite. Its controls stay usable. A change to Electron acceleration affects both windows. Thus graphics tests must include the floating window.

## Lifecycle and budgets

- **Frame rate.** Focus and Neural World render 30 frames per second at most. The WebGL pixel ratio is 1.5 at most; the Neural World canvas uses 2 at most.
- **Hidden views.** Scene frames stop in these cases: a hidden route, a hidden or minimized native window, or a hidden document.
- **Reduced motion.** Reduced motion and disabled animations give a still scene. Controls that you use on purpose continue to operate. Visual updates from the timer can render a frame when the displayed state changes.
- **Resize and cleanup.** `ResizeObserver` controls the projection aspect and the canvas size. Cleanup cancels frames, stops observation, removes listeners, and disposes unique geometries, materials and renderer resources.
- **Focus budget.** The brain uses 5 draw calls (4 surface meshes with one shared material, and one point cloud) and about 94,000 triangles. The canvas is small (at most 400 × 250 CSS pixels), so this count is safe for low-power GPUs. The geometry is built once when the scene mounts. This takes about 170 ms on the development computer. Building and merging the hemisphere sphere is the slowest step, so both hemispheres share one sphere. The camera distance fits the brain to the canvas at every aspect ratio.
- **Floating budget.** The brain constellation uses 2 draw calls (one merged line mesh and one instanced mesh for the neurons) and about 29,000 triangles. The geometry is built once. It renders 20 frames per second at most, because it stays on screen while you work. A return marker animates the scene in place. It does not remount the scene.
- **World budget.** The Neural World canvas draws 24 goals, 16 motes per goal, 28 motes per area, 8 gems and 160 pulses at most. Without animation it draws only when its input changes.
- **Test data.** Development and test tools can read these canvas attributes: `data-scene`, `data-frames`, `data-draw-calls`, `data-triangles` and `data-geometries`. The stage shows the camera yaw, pitch and zoom. Reset view and disabled motion give deterministic captures.

## Verification

The release runner includes this suite together with the existing checks for the timer, goals, backups, graphics and the floating window. Measurements on one computer do not prove compatibility with every Windows driver.

## Stylesheet layers

`src/renderer/src/app.css` is the only entry point for renderer styles. It does these things:

- Declares `@layer theme, tokens, base, legacy, components, utilities`.
- Imports the Tailwind v4 theme variables and utilities. Tailwind scans only `src/renderer/src`.
- Imports `tokens.css` into the `tokens` layer.
- Puts the existing `styles.css` in the `legacy` layer.

As a result, utilities override legacy rules without `!important`. To migrate a component, add utilities next to its existing class. The existing class stays as a stable styling hook. The `dark:` variant follows the existing `data-theme="dark"` attribute.

The app does not import Tailwind Preflight yet. This is intentional. Preflight resets `border`, the display of `svg` and `canvas`, and buttons. These resets would change legacy layouts. The legacy layouts must be adjusted first.

## Design tokens

`tokens.css` is the only place that defines appearance values.

- Its base `:root` block and its dark block apply to the floating window.
- `:root:not(.floating-window)` and its dark counterpart adjust the values for the main window.
- Legacy CSS continues to read the original variable names, for example `--panel`, `--text` and `--accent`.

`app.css` shows only semantic Tailwind tokens. It clears the default scales for color, radius, shadow and font size. Thus arbitrary palettes cannot appear.

| Token group | Values |
|---|---|
| Colors (`@theme inline`, resolved at runtime for each theme) | `canvas`, `surface`, `surface-raised`, `ink`, `ink-muted`, `accent`, `accent-hover`, `accent-soft`, `on-accent`, `info`, `info-soft`, `line`, `line-strong`, `danger`, `danger-soft`, `success`, `success-soft` |
| Radius | `rounded-chip` (6px: tags, small badges, check boxes in lists), `rounded-control` (10px), `rounded-card` (18px, the current main-window panel), `rounded-pill`. Legacy CSS uses the same values through `var(--radius-*)`. Only data marks (2–4px) and circles (50%) keep raw values. |
| Type | `text-badge` 12, `text-caption` 13 (smallest readable text), `text-label` 14, `text-body` 15, `text-title` 16, `text-heading` 20, `text-display` 28, `text-timer` 64 |
| Elevation | `shadow-elevation-1` (panels), `shadow-elevation-2` (overlays) |
| Motion | `--motion-control` 180ms, `--motion-page` 280ms, with `ease-standard` |
| Mono and lift | `font-mono` (plates and engraved figure text), `shadow-elevation-lift` (plates) |
| Isometric figures | `--anatomy-paper`, `--anatomy-shade-0`…`3`, `--anatomy-hi`, `--anatomy-mid`, `--anatomy-lo`, `--anatomy-faint`, mixed from `--panel` and `--text`. `iso/iso.css` derives `--anatomy-lit` per figure from `--figure-lit` (default `--accent`). |

Color rule: purple `accent` marks actions and selection. Blue `info` marks data and information.

Text pairs have a contrast of 4.5:1 at minimum. Control borders have 3:1 at minimum. These limits apply in both windows and both themes. For this reason, the main light `--control-line` is #918FA5 and `--blue` is #2F62D9.

In figures, `--anatomy-hi` and `--anatomy-mid` have 3:1 at minimum against `--anatomy-paper` (measured: light 15.1 and 3.5, dark 11.3 and 4.2). `--anatomy-lo` and `--anatomy-faint` are lower on purpose, because they draw minor ticks, grooves and seams only.

## Base components

`ui.tsx` contains the Radix wrappers and the base components. `icons.tsx` contains the stroke icon set. `components.tsx` exports the icons again. Each component keeps a legacy class as a stable hook. Its new appearance comes from token utilities.

| Component | Hook class | Notes |
|---|---|---|
| `Button` | `primary`, `secondary`, `text-button` (ghost), `danger-button` | Props: `variant`, `size` (`md` is a 44px target, `sm` is 36px), optional leading `icon`. Secondary uses `line-strong` borders and `ink` text, so it does not look disabled. |
| `IconButton` | `icon-button` | The required `label` becomes the `aria-label` and the tooltip. Use `tone="danger"` for destructive actions. |
| `Card` | `panel`, `section-title` | Optional `title`, `icon`, `actions`, `headingLevel`. |
| `Plate` | `plate`, `panel` | A figure-plate frame: `Fig n` and the `title` heading at the top, a `hint` and a `readout` at the bottom (`data-readout`, not a live region). It keeps the legacy `.panel` base, so page rules such as `.focus-stage` still apply. Used by the Focus card and the first three Patterns charts. |
| `PageHeader` | `page-heading` | Title, optional one-line description and actions. |
| `Field` | `field` | Links the label, hint and error to its single control (`id`, `aria-describedby`, `aria-invalid`). |
| `Badge` | `badge` | Tones `neutral`, `accent`, `info`, `success`, `danger`. The contrast test includes every tone pair. |
| `EmptyState` | `empty-state` | Compact row with an icon, text and an optional action. Every page uses it. The older, centered `Empty` and its legacy rules are removed. |

Select chevrons, the checks in selects and checkboxes, disclosure arrows and the dialog close button use SVG icons, not Unicode glyphs.

## Shell and page headers

### Top bar

The top bar shows these items, in this order:

1. The date.
2. During a session only: a timer chip that shows the time and the state. Select the chip to open Focus.
3. During a session only: a **Pause timer** or **Resume timer** icon button, next to the chip.
4. The theme toggle.
5. **Floating timer**.

The top-bar labels are different from the **Pause** and **Resume** buttons on the Focus page. Thus queries for an exact name find only one control.

During an attention check-in only, a banner shows below the bar. See [Attention check-ins](#attention-check-ins).

### Navigation

- Navigation items use token colors, `text-label` and `rounded-control`.
- The active item keeps `aria-current="page"` and the inset accent bar. The extra dot is removed.
- The sidebar layout, widths and collapse rules stay in legacy CSS. Thus the responsive rail does not change.

### Page headers

Every page uses `PageHeader`. Focus, Goals, Patterns and Neural World keep a one-line description at caption size. Tasks, Calendar and Settings have no description, to give more space to their content. The headings keep their names because tests and the entrance animation use them.

## Page migration: Focus

- The session controls use `Button`: **Begin focus**, **Pause** / **Resume**, **Finish**, **I'm back**, **Mark interruption**, **Save thought** and **Exclude session**. Their names and hook classes (`start-focus`, `exclude-active`) did not change.
- Durations are a grid of four columns with equal 64px boxes. The custom box has the same size as the presets. It gets the selected style when its value is not 25, 50 or 90.
- The activity status and the stage note are now one centered caption block (13px). Before, they were two lines of 11px.
- Fix: the separator in the prepared summary had an invalid Latin-1 byte from an earlier version. It showed as a replacement character. It is now a UTF-8 middle dot.

## Page migration: Tasks

- One toolbar contains search, status, sort and a **More filters** toggle.
  - The toggle shows a count badge for the active goal, field, category and priority filters.
  - These four controls open in the next row of the toolbar.
- `Fold` has a new `variant="inline"`, with optional `icon`, `badge`, `className` and `contentClassName`.
  - Its root uses `display: contents`. Thus the trigger is in a parent grid, and the DOM ancestry does not change. The test helper that opens the `.disclosure` of a control needs this ancestry.
  - Task details uses the same variant next to **Add task**. This removes two stacked cards from the list.
- Row actions are icon buttons with tooltips: **Edit** and **Archive** / **Restore**. They keep their full accessible names. Tasks have only two actions, so a menu is not used.
- Priority shows a `Badge` for high and plain text for low. Normal priority shows nothing.
- An empty list uses `EmptyState`.
- Category actions are together, next to their field.
- The legacy rule `.disclosure-trigger[data-state="open"] > span` rotates every direct child span. For this reason, `Fold` puts badges in a `transform-none` span.

## Page migration: Settings

- Preferences, focus fields and data are in `Card` components. The local-data marker is a success `Badge`.
- **Save preferences** is enabled only while the draft is different from the saved settings. The comparison checks each key separately. Thus, if a settings object has its keys in a different order, the app does not report it as unsaved. This can occur, for example, after you use the theme toggle in the top bar.
- Each focus field is one row: color, name, and icon actions for **Archive** / **Restore** and **Delete** (danger tone). The name of each action includes the field name.
  - **Save** shows only while that field has edits.
  - At every width, the row keeps its actions next to the name. This overrides the legacy container rule that wrapped the old text actions.
- Destructive confirmations (**Delete activity**, **Back up & delete field**) use the `danger` button. Restore and backup actions use `Button`.
- The shortcut recorder uses `Button`. It keeps its `shortcut-record` hook.

## Page migration: Patterns

- The filter toolbar has the same structure as in Tasks:
  1. A `Segments` date-range control: **7 days**, **30 days**, **All time**.
  2. From and to dates, styled as controls.
  3. Goal and field filters.
- The app calculates the selected range from the dates. Thus a custom range selects no shortcut.
- KPI labels use sentence case at caption size. Values use `text-display` with tabular figures.
- The three main charts (areas, weekdays, activity modes) use `Plate` as Fig 1–3. Each readout shows the total or the largest row. The other charts, correlations, the weekly review and the weekly intention use `Card`. Rho is in the correlation header. Interruption tags are neutral `Badge` components.
- While the example shows, **Explore an example** changes to a primary **Return to my dataset** button.
- `Card` headers align to the start. Thus the legacy rule `.charts-grid .section-title` (space-between) no longer moves an icon away from its title.

## Insights tab

Patterns has two tabs below the filter toolbar: **Overview** and **Insights**. The `Tabs` control in `ui.tsx` (Radix Tabs) draws them. The active tab has an accent underline. Only the selected panel is mounted, so Insights reads its data when you open it. The filters apply to both tabs.

### Layout

- The first card, **The data behind these insights**, is a strip of five values and a list of notes.
- The figures follow in a grid of two columns. The first figure uses both columns. The grid has one column when the workspace container is 860px wide or less.
- The five figures use `Plate` as Fig 1–5. The model and the suggestions use `Card`.
- A figure that is not eligible shows one dashed box with the reason and the count of what is missing. It shows no empty chart.
- While the app reads again, the panel is at 60% opacity with `aria-busy`. A status line says "Updating insights…". If a read fails, the earlier result stays, with an alert and **Try again**.

### Figure rules

- The charts are inline SVG. They are drawn at the measured width of their container (at least 240px). Thus 12px axis text stays 12px.
- Data marks use `--blue`. An interval is a band (14% opacity, 20% in dark mode) or a whisker. A reference curve is gray.
- A missing value is a gap. A line stops at the gap. A missing value never draws as zero.
- Columns have a 4px rounded data end and a square baseline. Grid lines are hairlines in `--line`. Each chart has one y scale.
- Each hour, block or step has a transparent hit area with a tooltip title. The tooltip repeats the numbers.
- Heat tables (weekday by time of day, states by activity mode) mix `--blue` into the cell up to 40%. An empty cell shows a dash.
- The survival curve is a step line with a step band. A median has a vertical marker. An open upper limit of the median reads "or longer".
- The model effects are a forest plot. Each row has a label, a small SVG with a zero line, a whisker and a dot, and the value with its interval. On narrow containers (560px or less), the label takes its own line. The dot and the whisker are placed separately, because a percentile interval can leave out its estimate.
- A suggestion shows a `Badge`: neutral for **Tentative** and info for **Moderate evidence**.

### Accessibility

- Every chart is an `svg` with `role="img"`. Its `aria-label` states the main result, for example the highest hour with its interval.
- The three chart figures (day rhythm, attention span, session shape) have a **Show values** disclosure with a table of the same numbers. The table uses `th` with `scope`. Gaps show as a dash. The other figures show their numbers as text, lists or labelled tables.
- The heat tables have an `aria-label`. Lists of rows use `role="list"`.
- No meaning depends on color alone. Values are in text, titles and tables.
- The tabs, the group control for the survival curve and the disclosures use Radix controls with keyboard operation and visible focus.

## Attention check-ins

The check-in is a prompt, not a dialog. It never takes keyboard focus, and it never moves the content under the pointer.

- **Main window.** `ProbePrompt` is inside the sticky top bar. It is placed `top: calc(100% + 8px)` with `left: 0` and `right: 0`, so it floats over the page below the bar, also when the bar wraps. It shows the question "Where is your attention right now?" and three small secondary `Button` controls: **On the task**, **Drifting**, **Somewhere else**. It has a soft background, a border that mixes 30% accent, and a 14px radius. It shows on every page.
- **Floating window.** `probe-mini` sits at 40px from the top, 6px from each side, and covers only the lower part of the brain. Thus the brain stays draggable, and **I'm back** and the timer controls stay usable. It has three icon buttons of 26px height (focus, thought and world icons). Each button has an `aria-label` and a `title` with its answer. The small question text is `aria-hidden`. The buttons use `no-drag`. It comes after `mini-drag` in the DOM and stays above it with `z-index`: Electron applies `app-region` rects in DOM order, so a drag rect that comes later covers an earlier `no-drag` one and turns its clicks into window drags.
- **Live region.** `ProbeAnnouncer` stays mounted for the whole focus session in both windows. It is a `role="status"` region with `aria-live="polite"`. It gets its text when a check-in appears, so a screen reader announces it. Focus does not move.
- **While saving**, the buttons are disabled. A second click cannot send a second answer.
- **Reflection questions.** The two questions after a session use single-choice toggle groups with pill-shaped options. The word "optional" and **Clear** are on the line of the question. Thus a new **Clear** does not move the options.
- **Focus hints.** Hints for length and time of day are rows on a `--blue-soft` background below the duration. They are read-only text, with one button for the length.

## Page migration: Calendar

- The measure control is a `Segments` radio group: **Recorded time**, **Sessions**, **Self-rated focus**. It uses the shared toolbar style, next to the field filter.
- Month navigation uses a ghost **Today** button and labelled previous and next icon buttons.
- Each recorded session has small buttons: **Edit**, **Exclude** / **Include again** and **Delete**.
  - The accessible name of each button includes the start time, for example "Delete session at 08:00".
  - **Delete** uses the danger tone.
- Excluded and Recovered show as badges.
- An empty day uses `EmptyState`.
- Planned actions and the year overview use `Card`. Labels that were uppercase now use sentence case.

## Page migration: Goals

- All action buttons on Goals and in the goal, action and check-in forms use `Button`. There are 43 in total.
  - Submit buttons keep their explicit `type="submit"`.
  - The default type of `Button` is `type="button"`. No converted button without a type was inside a form. Thus this default changes no submission.
- Check-in status buttons (**Done**, **Did the smaller version**, **Skip**) get their pressed appearance again through `aria-pressed:` utilities. This is necessary because button utilities override the legacy rule `.goal-check-in .secondary[aria-pressed="true"]`.
- Goal status is a `Badge`: accent for active, success for achieved, neutral for all other statuses.
- Labels that were uppercase now use sentence case. Empty states use `EmptyState`.
- Goal panels keep their legacy section markup. This markup already uses the shared tokens.

## Page migration: Neural World

- World controls, palette cards and achievement progress use the active palette color (`--world-color`), not the action accent. Goal and area buttons, the side panel and roadmap steps use the area colour (`--area-color`). Earned medals are gold.
- Labels use sentence case. Constellation controls, field buttons, palette cards and field-progress rows use caption text (13px).

## Legacy CSS cleanup

- The contents of `visual-design.css` were moved to the end of `styles.css`. This kept the cascade order. Its import was removed. The legacy layer is now one file.
- 19 rules and 3 entries in selector lists were removed. They needed classes that renderer source no longer contains: `add-task`, `compact`, `danger-text`, `destructive-text`, `nav-dot`, `offline-badge`, `primary-task-tag`, `range-shortcuts`, `task-empty`, `task-item`, `task-list`, `task-panel`.
  - Every identifier that appears in source counted as used.
  - Classes inside `:not()` were ignored.
  - Thus the removal is conservative.
- The remaining legacy rules still match live elements. Migrated components keep their legacy class as a hook. The Focus stage, calendar, constellation and charts still use these rules. To make the legacy layer smaller, move these rules into utilities, one component at a time.
- A comparison of the computed styles of 7,412 elements found no differences caused by CSS. It covered all seven pages in both themes, and the floating window. The only differences came from runtime state: the readiness of the WebGL fallback and the measurement of the Radix switch.

## Standardization pass (3.7.0)

- **Radius scale.** The legacy layer had 20 different radius values. They now map to the token scale: 5–7px to `--radius-chip`, 8–13px to `--radius-control`, 14–24px to `--radius-card` and larger values to `--radius-pill`. The floating window uses the same scale. The floating-bar panel and check-in use `--radius-float` (22px, from 3.5.0), so they read as one soft shape over the desktop. No stylesheet has a raw radius of 5px or more.
- **Type scale.** Every font size in the legacy layer now comes from a type token. Text at 10–12px moved to `--text-caption` (13px). Badges, keycaps, calendar-cell and axis labels, and unit labels in fixed-size buttons use `--text-badge` (12px). Off-scale headings and values map to the nearest step (`--text-heading` 20px, `--text-display` 28px). The clock has three named variants of `--text-timer`: `--text-timer-quiet` (80px), `--text-timer-compact` (58px) and `--text-timer-quiet-compact` (65px). Only the compact floating window keeps raw sizes (its 11px labels and 23px clock).
- **Glyphs.** Agent proposal rows show an SVG check box and a dot, not `☐`, `☑` and `•` text.
- **Goal cards.** The content of each card starts at the top, and the summary line sits at the bottom, so the badges and titles of a row align. Cards show a hover border.
- **Durations.** The Neural World header shows recorded time in the same format as the side panel (for example `51h 12m`), not as decimal hours.
- **Dead rules.** Rules for `.stage-top`, `.goal-milestone`, `.goal-detail`, `.goal-detail-columns`, `.goal-behaviour-table` and `.goal-behaviour-row` are removed. No source contains these classes. The `Disclosure` alias is removed. Pages import `Fold` from `ui.tsx`.
- **Patterns filters.** The goal and area pickers keep at least 200px. At the minimum window width (1050px) the toolbar wraps them to the next row instead of squeezing them to 96px.
- **Check.** At 1366 × 840 and at 1050 × 650, no page overflows horizontally. The only shortened text is the long goal-filter label, which ends with an ellipsis in its picker.

## App icon

The icon is the brain-and-eye glyph in white on a rounded tile. The tile has a diagonal gradient from #7B5CFF to `--blue` (#2F62D9). The filled tile keeps the icon visible on light and dark surfaces: the sidebar in both themes, the taskbar, the tray and notifications.

- `build/icon.ico` holds 16, 20, 24, 32, 40, 48, 64, 128 and 256 pixel frames. Windows picks the frame for the display scale.
- At 16 to 24 pixels, the detail of the brain is not readable. These frames show only the eye: an almond outline and the pupil.
- `src/renderer/public/icon.ico` is a copy of `build/icon.ico`. The main process uses it for the windows, the tray and notifications.
- `src/renderer/public/icon.png` (256 pixels) is the favicon and the sidebar mark. `Docs/images/icon.png` is the same image for the README.


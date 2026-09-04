from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new)


# index.html
index_path = Path("index.html")
index = index_path.read_text(encoding="utf-8")
index = replace_once(
    index,
    '<button class="button secondary" id="global-events-button" type="button">Timeline</button>',
    '<button class="button secondary" id="global-events-button" type="button">Settings</button>',
    "header Settings label",
)
index = replace_once(
    index,
    '<div><span class="eyebrow">Across the timeline</span><h2>Timeline settings</h2></div>',
    '<div><span class="eyebrow">Timeline</span><h2>Settings</h2></div>',
    "dialog Settings heading",
)
old_controls = '''        <div class="timeline-as-of-setting">
          <label for="timeline-as-of-year">Historical snapshot</label>
          <div class="timeline-as-of-controls"><input id="timeline-as-of-year" type="text" inputmode="numeric" placeholder="Year"><button id="set-timeline-as-of" type="button">Set</button><button id="clear-timeline-as-of" type="button">Present</button></div>
        </div>'''
new_controls = '''        <div class="timeline-toggle-setting">
          <span class="timeline-toggle-label">Historical snapshot<small>Click or drag the ruler to choose a year</small></span>
          <button class="timeline-setting-toggle" id="timeline-as-of-toggle" type="button" aria-pressed="false">Off</button>
        </div>
        <div class="timeline-toggle-setting">
          <span class="timeline-toggle-label">Decade background<small>Alternating white and light-gray decades</small></span>
          <button class="timeline-setting-toggle" id="timeline-background-toggle" type="button" aria-pressed="true">On</button>
        </div>'''
index = replace_once(index, old_controls, new_controls, "toggle controls")
index = replace_once(
    index,
    '<p class="dialog-intro">The ruler always keeps five-year marks. Global events appear behind every profile.</p>',
    '<p class="dialog-intro">Click or drag the ruler to choose the snapshot year. Global events appear behind every profile.</p>',
    "settings guidance",
)
index = replace_once(index, "./styles.css?v=69", "./styles.css?v=70", "styles cache key")
index = replace_once(index, "./app.js?v=122", "./app.js?v=123", "app cache key")
index_path.write_text(index, encoding="utf-8")


# styles.css
styles_path = Path("styles.css")
styles = styles_path.read_text(encoding="utf-8")
old_styles = '''.timeline-as-of-setting { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding-bottom: 8px; border-bottom: 1px solid #ddd; color: #222; font-size: 11px; font-weight: 600; }
.timeline-as-of-controls { width: 190px; display: grid; grid-template-columns: 58px 44px 1fr; gap: 4px; }
.timeline-as-of-controls input, .timeline-as-of-controls button { box-sizing: border-box; height: 30px; border: 1px solid #999; border-radius: 6px; background: #fff; color: #111; font-size: 9px; }
.timeline-as-of-controls input { min-width: 0; padding: 5px 7px; }
.timeline-as-of-controls button { padding: 0 6px; cursor: pointer; }
.timeline-as-of-controls button:hover:not(:disabled) { background: #eee; }
.timeline-as-of-controls button:disabled { color: #aaa; cursor: default; }'''
new_styles = '''.timeline-toggle-setting { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding-bottom: 8px; border-bottom: 1px solid #ddd; color: #222; font-size: 11px; font-weight: 600; }
.timeline-toggle-label { display: grid; gap: 2px; }
.timeline-toggle-label small { color: #777; font-size: 8px; font-weight: 400; line-height: 1.35; }
.timeline-setting-toggle { box-sizing: border-box; min-width: 64px; height: 30px; padding: 0 12px; border: 1px solid #999; border-radius: 999px; background: #fff; color: #555; cursor: pointer; font-size: 9px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
.timeline-setting-toggle:hover { border-color: #222; background: #eee; color: #111; }
.timeline-setting-toggle[aria-pressed="true"] { border-color: #111; background: #111; color: #fff; }
.timeline-setting-toggle[aria-pressed="true"]:hover { background: #333; }'''
styles = replace_once(styles, old_styles, new_styles, "settings toggle styles")
styles_path.write_text(styles, encoding="utf-8")


# app.js
app_path = Path("app.js")
app = app_path.read_text(encoding="utf-8")
app = replace_once(
    app,
    """  asOfYear: null,
  treeFilter: '',""",
    """  asOfYear: null,
  lastAsOfYear: null,
  showDecadeBands: true,
  treeFilter: '',""",
    "settings state defaults",
)
app = replace_once(
    app,
    "  'events-dialog', 'close-events-dialog', 'timeline-as-of-year', 'set-timeline-as-of', 'clear-timeline-as-of', 'timeline-scale-down',",
    "  'events-dialog', 'close-events-dialog', 'timeline-as-of-toggle', 'timeline-background-toggle', 'timeline-scale-down',",
    "settings element IDs",
)
app = replace_once(
    app,
    """  state.globalEvents = createBritishHistoryEvents();
  state.asOfYear = null;
  state.rootId = britishRoyalStarterRootId();""",
    """  state.globalEvents = createBritishHistoryEvents();
  state.asOfYear = null;
  state.lastAsOfYear = null;
  state.rootId = britishRoyalStarterRootId();""",
    "starter snapshot reset",
)
app = replace_once(
    app,
    "    asOfYear: state.asOfYear, treeFilter: state.treeFilter, relationVisibility: state.relationVisibility,",
    """    asOfYear: state.asOfYear, lastAsOfYear: state.lastAsOfYear,
    showDecadeBands: state.showDecadeBands, treeFilter: state.treeFilter, relationVisibility: state.relationVisibility,""",
    "tree snapshot settings",
)
app = replace_once(
    app,
    """  state.asOfYear = numericYear(saved.asOfYear);
  state.treeFilter = clean(saved.treeFilter);""",
    """  state.asOfYear = numericYear(saved.asOfYear);
  state.lastAsOfYear = numericYear(saved.lastAsOfYear ?? saved.asOfYear);
  state.showDecadeBands = saved.showDecadeBands !== false;
  state.treeFilter = clean(saved.treeFilter);""",
    "restore settings",
)
app = replace_once(
    app,
    """  state.globalEvents = [];
  state.asOfYear = null;
  state.rootId = '';""",
    """  state.globalEvents = [];
  state.asOfYear = null;
  state.lastAsOfYear = null;
  state.showDecadeBands = true;
  state.rootId = '';""",
    "new tree settings defaults",
)

old_sync = '''function syncTimelineSettingControls() {
  const sync = (options, value, output, down, up) => {
    const index = options.findIndex(([candidate]) => candidate === value);
    output.textContent = options[index]?.[1] || String(value);
    down.disabled = index <= 0;
    up.disabled = index < 0 || index >= options.length - 1;
  };
  sync(TIMELINE_YEAR_WIDTH_OPTIONS, state.timelineYearWidth, els['timeline-scale-value'], els['timeline-scale-down'], els['timeline-scale-up']);
  sync(TIMELINE_NODE_HEIGHT_OPTIONS, state.timelineNodeHeight, els['timeline-height-value'], els['timeline-height-down'], els['timeline-height-up']);
  els['timeline-as-of-year'].value = state.asOfYear ?? '';
  els['clear-timeline-as-of'].disabled = state.asOfYear == null;
}

function applyHistoricalYear() {
  const year = numericYear(els['timeline-as-of-year'].value);
  if (year == null) return toast('Enter a year for the historical snapshot.', true);
  state.asOfYear = year;
  persist(`Historical snapshot set to ${year}`);
  render();
  syncTimelineSettingControls();
}
'''
new_sync = '''function syncTimelineSettingControls() {
  const sync = (options, value, output, down, up) => {
    const index = options.findIndex(([candidate]) => candidate === value);
    output.textContent = options[index]?.[1] || String(value);
    down.disabled = index <= 0;
    up.disabled = index < 0 || index >= options.length - 1;
  };
  const syncToggle = (button, enabled) => {
    button.setAttribute('aria-pressed', String(enabled));
    button.textContent = enabled ? 'On' : 'Off';
  };
  sync(TIMELINE_YEAR_WIDTH_OPTIONS, state.timelineYearWidth, els['timeline-scale-value'], els['timeline-scale-down'], els['timeline-scale-up']);
  sync(TIMELINE_NODE_HEIGHT_OPTIONS, state.timelineNodeHeight, els['timeline-height-value'], els['timeline-height-down'], els['timeline-height-up']);
  syncToggle(els['timeline-as-of-toggle'], state.asOfYear != null);
  syncToggle(els['timeline-background-toggle'], state.showDecadeBands);
}

function defaultHistoricalSnapshotYear() {
  const currentYear = new Date().getFullYear();
  const candidateYears = [...activeDescendantScope().allowedIds].map(id => {
    const person = state.people[id];
    if (!person) return null;
    if (person.isLiving) return currentYear;
    return numericYear(person.deathYear) ?? numericYear(person.birthYear);
  }).filter(Number.isFinite);
  const latestYear = Math.max(...candidateYears);
  return Number.isFinite(latestYear) ? Math.min(currentYear, latestYear) : currentYear;
}

function toggleHistoricalSnapshot() {
  if (state.asOfYear == null) {
    state.asOfYear = numericYear(state.lastAsOfYear) ?? defaultHistoricalSnapshotYear();
    state.lastAsOfYear = state.asOfYear;
    persist(`Historical snapshot turned on at ${state.asOfYear}`);
  } else {
    state.lastAsOfYear = state.asOfYear;
    state.asOfYear = null;
    persist('Historical snapshot turned off');
  }
  render();
  syncTimelineSettingControls();
}

function toggleDecadeBackground() {
  state.showDecadeBands = !state.showDecadeBands;
  persist(`Decade background turned ${state.showDecadeBands ? 'on' : 'off'}`);
  render();
  syncTimelineSettingControls();
}
'''
app = replace_once(app, old_sync, new_sync, "settings synchronization and toggles")

listener_start = app.index("els['set-timeline-as-of'].addEventListener('click', applyHistoricalYear);")
listener_end = app.index("els['timeline-scale-down'].addEventListener", listener_start)
listener_replacement = """els['timeline-as-of-toggle'].addEventListener('click', toggleHistoricalSnapshot);
els['timeline-background-toggle'].addEventListener('click', toggleDecadeBackground);
"""
app = app[:listener_start] + listener_replacement + app[listener_end:]

app = replace_once(
    app,
    """  state.asOfYear = year;
  els['timeline-as-of-year'].value = year;
  persist(`Historical snapshot set to ${year}`);
  render();""",
    """  state.asOfYear = year;
  state.lastAsOfYear = year;
  persist(`Historical snapshot set to ${year}`);
  render();
  syncTimelineSettingControls();""",
    "ruler click snapshot",
)
app = replace_once(
    app,
    """  state.asOfYear = year;
  els['timeline-as-of-year'].value = year;
  render();""",
    """  state.asOfYear = year;
  state.lastAsOfYear = year;
  render();
  syncTimelineSettingControls();""",
    "ruler drag snapshot",
)

old_bands = '''  decadeBandRects(minYear, maxYear, { yearWidth, xForYear }).forEach(({ decade, x, width: bandWidth, tone }) => {
    const bandAttributes = {
      x,
      width: bandWidth,
      class: `timeline-decade-band tone-${tone}`,
      'data-decade': decade
    };
    decadeBackground.append(svg('rect', { ...bandAttributes, y: eventTop, height: eventBottom - eventTop }));
    rulerDecadeBackground.append(svg('rect', { ...bandAttributes, y: 0, height: rulerHeight }));
  });'''
new_bands = '''  if (state.showDecadeBands) {
    decadeBandRects(minYear, maxYear, { yearWidth, xForYear }).forEach(({ decade, x, width: bandWidth, tone }) => {
      const bandAttributes = {
        x,
        width: bandWidth,
        class: `timeline-decade-band tone-${tone}`,
        'data-decade': decade
      };
      decadeBackground.append(svg('rect', { ...bandAttributes, y: eventTop, height: eventBottom - eventTop }));
      rulerDecadeBackground.append(svg('rect', { ...bandAttributes, y: 0, height: rulerHeight }));
    });
  }'''
app = replace_once(app, old_bands, new_bands, "conditional decade bands")

for obsolete in ["timeline-as-of-year", "set-timeline-as-of", "clear-timeline-as-of"]:
    if obsolete in app:
        raise SystemExit(f"obsolete settings control still referenced: {obsolete}")
app_path.write_text(app, encoding="utf-8")

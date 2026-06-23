(function () {
  "use strict";

  const V_ZOOM_LEVELS = [
    { name: "XS",  rowH: 24, barH: 16 },
    { name: "S",   rowH: 30, barH: 18 },
    { name: "M",   rowH: 36, barH: 22 },
    { name: "L",   rowH: 48, barH: 32 },
    { name: "XL",  rowH: 64, barH: 46 },
    { name: "XXL", rowH: 84, barH: 62 },
  ];
  let vZoomIdx = 2;
  let ROW_H = 36;
  let BAR_H = 22;
  let BAR_PAD = (ROW_H - BAR_H) / 2;
  const EDGE = 8;

  const FONT_LEVELS = [
    { name: "XS", scale: 0.75 },
    { name: "S",  scale: 0.85 },
    { name: "M",  scale: 1.0 },
    { name: "L",  scale: 1.15 },
    { name: "XL", scale: 1.3 },
  ];
  let fontIdx = 2;

  function applyFontZoom() {
    const fl = FONT_LEVELS[fontIdx];
    document.documentElement.style.setProperty("--font-scale", fl.scale);
    $("#font-label").textContent = fl.name;
  }

  function applyVZoom() {
    const vz = V_ZOOM_LEVELS[vZoomIdx];
    ROW_H = vz.rowH;
    BAR_H = vz.barH;
    BAR_PAD = (ROW_H - BAR_H) / 2;
    document.documentElement.style.setProperty("--row-h", ROW_H + "px");
    $("#vzoom-label").textContent = vz.name;
  }
  const ZOOM_LEVELS = [
    { name: "Day", days: 1, colW: 36 },
    { name: "3-Day", days: 3, colW: 50 },
    { name: "Week", days: 7, colW: 70 },
    { name: "2-Week", days: 14, colW: 90 },
    { name: "Month", days: 30, colW: 100 },
  ];
  const PRESET_COLORS = [
    "#4a86c8", "#e8743b", "#19a979", "#e74c3c", "#9b59b6",
    "#f39c12", "#1abc9c", "#3498db", "#2ecc71", "#e91e63",
    "#00bcd4", "#ff9800", "#8bc34a", "#795548", "#607d8b",
    "#673ab7", "#ff5722", "#009688", "#cddc39", "#ffc107",
  ];
  const MAX_RECENTS = 8;

  const BUILTIN_THEMES = {
    midnight: {
      name: "Midnight", builtin: true,
      vars: { "--bg": "#1a1a2e", "--surface": "#16213e", "--surface2": "#0f3460",
              "--border": "#1a4080", "--text": "#e0e0e0", "--text-dim": "#8899aa",
              "--accent": "#4a86c8", "--danger": "#e74c3c" },
    },
    dark: {
      name: "Dark", builtin: true,
      vars: { "--bg": "#1e1e1e", "--surface": "#2d2d2d", "--surface2": "#383838",
              "--border": "#505050", "--text": "#d4d4d4", "--text-dim": "#888888",
              "--accent": "#569cd6", "--danger": "#f44747" },
    },
    light: {
      name: "Light", builtin: true,
      vars: { "--bg": "#f5f5f5", "--surface": "#ffffff", "--surface2": "#e8e8e8",
              "--border": "#d0d0d0", "--text": "#1e1e1e", "--text-dim": "#666666",
              "--accent": "#2563eb", "--danger": "#dc2626" },
    },
    warm: {
      name: "Warm Light", builtin: true,
      vars: { "--bg": "#faf8f5", "--surface": "#ffffff", "--surface2": "#f0ebe4",
              "--border": "#d9cfc2", "--text": "#2c2418", "--text-dim": "#7a6e60",
              "--accent": "#c06020", "--danger": "#c0392b" },
    },
  };
  const THEME_STORAGE_KEY = "rp_custom_themes";
  let customThemes = loadCustomThemes();
  let currentTheme = "midnight";

  function loadCustomThemes() {
    try { return JSON.parse(localStorage.getItem(THEME_STORAGE_KEY) || "{}"); }
    catch { return {}; }
  }
  function saveCustomThemes() {
    try { localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(customThemes)); } catch {}
  }
  function getAllThemes() {
    const all = {};
    for (const [k, v] of Object.entries(BUILTIN_THEMES)) all[k] = v;
    for (const [k, v] of Object.entries(customThemes)) all[k] = v;
    return all;
  }
  function getTheme(key) { return getAllThemes()[key]; }

  function isLightTheme(vars) {
    const bg = vars["--bg"] || "#000000";
    const r = parseInt(bg.slice(1, 3), 16);
    const g = parseInt(bg.slice(3, 5), 16);
    const b = parseInt(bg.slice(5, 7), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 128;
  }

  let lightMode = false;

  function applyTheme(name) {
    const theme = getTheme(name);
    if (!theme) return;
    currentTheme = name;
    lightMode = isLightTheme(theme.vars);
    const root = document.documentElement;
    for (const [k, v] of Object.entries(theme.vars)) root.style.setProperty(k, v);
    document.body.classList.toggle("theme-light", lightMode);
    if (tasks.length) render();
    saveUIState();
  }

  let zoomIdx = 0;

  let tasks = [];
  let resources = [];
  let deps = [];
  let projects = [];
  let blockedDays = [];
  let currentProjectId = null;
  let viewMode = "tasks"; // "tasks" or "resources"
  let timeOrigin;
  let timeCols;
  let recentColors = loadRecentColors();

  // Resource view data: computed per render
  let resViewRows = [];

  const $ = (s) => document.querySelector(s);
  const api = async (url, method = "GET", body) => {
    const opts = { method, headers: { "Content-Type": "application/json" } };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(url, opts);
    if (r.status === 204) return null;
    return r.json();
  };

  function renderMarkdown(md) {
    const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const lines = md.split("\n");
    let html = "", inCode = false, inList = false, inTable = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith("```")) {
        if (inCode) { html += "</code></pre>"; inCode = false; }
        else { html += "<pre><code>"; inCode = true; }
        continue;
      }
      if (inCode) { html += esc(line) + "\n"; continue; }
      if (/^\|(.+)\|$/.test(line)) {
        if (!inTable) { html += "<table>"; inTable = true; }
        if (/^\|[\s-:|]+\|$/.test(line)) continue;
        const cells = line.slice(1, -1).split("|").map((c) => c.trim());
        const tag = !html.includes("<tr>") || (i > 0 && /^\|[\s-:|]+\|$/.test(lines[i + 1] || "")) ? "th" : "td";
        const isHeader = i + 1 < lines.length && /^\|[\s-:|]+\|$/.test(lines[i + 1]);
        const t = isHeader ? "th" : "td";
        html += "<tr>" + cells.map((c) => `<${t}>${inline(c)}</${t}>`).join("") + "</tr>";
        continue;
      }
      if (inTable) { html += "</table>"; inTable = false; }
      if (/^#{1,3}\s/.test(line)) {
        if (inList) { html += "</ul>"; inList = false; }
        const lvl = line.match(/^#+/)[0].length;
        const text = line.replace(/^#+\s*/, "");
        html += `<h${lvl}>${inline(text)}</h${lvl}>`;
      } else if (/^\s*[-*]\s/.test(line)) {
        if (!inList) { html += "<ul>"; inList = true; }
        html += `<li>${inline(line.replace(/^\s*[-*]\s*/, ""))}</li>`;
      } else if (line.trim() === "") {
        if (inList) { html += "</ul>"; inList = false; }
        html += " ";
      } else {
        if (inList) { html += "</ul>"; inList = false; }
        html += `<p>${inline(line)}</p>`;
      }
    }
    if (inList) html += "</ul>";
    if (inTable) html += "</table>";
    if (inCode) html += "</code></pre>";
    return html;
    function inline(s) {
      return esc(s)
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/`(.+?)`/g, "<code>$1</code>")
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    }
  }

  // ── Undo stack ──────────────────────────────────────────
  const undoStack = [];
  const redoStack = [];
  const MAX_UNDO = 50;

  function pushUndo(action) {
    undoStack.push(action);
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack.length = 0;
  }

  async function undo() {
    const action = undoStack.pop();
    if (!action) return;
    switch (action.type) {
      case "task-update": {
        const cur = tasks.find((x) => x.id === action.id);
        const curState = cur ? {
          name: cur.name, description: cur.description,
          start_date: cur.start_date, end_date: cur.end_date,
          progress: cur.progress, color: cur.color,
          resource_ids: cur.resources.map((r) => ({ id: r.id, allocation: r.allocation, role: r.role || undefined })),
          parent_id: cur.parent_id, project_id: cur.project_id,
        } : null;
        await api(`/api/tasks/${action.id}`, "PUT", action.before);
        redoStack.push({ type: "task-update", id: action.id, before: curState });
        break;
      }
      case "task-update-cascade": {
        await api(`/api/tasks/${action.id}`, "PUT", action.before);
        for (const c of (action.cascaded || [])) {
          await api(`/api/tasks/${c.id}`, "PUT", c.before);
        }
        redoStack.push({ type: "task-update-cascade", id: action.id, before: action.before, after: action.after, cascaded: action.cascaded });
        break;
      }
      case "task-create": {
        const cur = tasks.find((x) => x.id === action.id);
        const curData = cur ? {
          name: cur.name, description: cur.description,
          start_date: cur.start_date, end_date: cur.end_date,
          progress: cur.progress, color: cur.color,
          resource_ids: cur.resources.map((r) => ({ id: r.id, allocation: r.allocation, role: r.role || undefined })),
          parent_id: cur.parent_id, project_id: cur.project_id,
          sort_order: cur.sort_order,
        } : null;
        await api(`/api/tasks/${action.id}`, "DELETE");
        redoStack.push({ type: "task-delete-redo", data: curData });
        break;
      }
      case "task-delete": {
        const t = await api("/api/tasks", "POST", action.data);
        const newDeps = [];
        for (const d of (action.deps || [])) {
          const depData = { ...d };
          if (depData.predecessor_id === action.oldId) depData.predecessor_id = t.id;
          if (depData.successor_id === action.oldId) depData.successor_id = t.id;
          const created = await api("/api/dependencies", "POST", depData);
          if (created && created.id) newDeps.push(created.id);
        }
        redoStack.push({ type: "task-create-redo", id: t.id, depIds: newDeps });
        break;
      }
      case "dep-create": {
        const dep = deps.find((d) => d.id === action.id);
        const depData = dep ? { predecessor_id: dep.predecessor_id, successor_id: dep.successor_id, dep_type: dep.dep_type, lag: dep.lag } : null;
        await api(`/api/dependencies/${action.id}`, "DELETE");
        redoStack.push({ type: "dep-delete-redo", data: depData });
        break;
      }
      case "dep-delete": {
        const result = await api("/api/dependencies", "POST", action.data);
        redoStack.push({ type: "dep-create-redo", id: result.id });
        break;
      }
      case "dep-create-shift": {
        const dep = deps.find((d) => d.id === action.depId);
        const depData = dep ? { predecessor_id: dep.predecessor_id, successor_id: dep.successor_id, dep_type: dep.dep_type, lag: dep.lag } : null;
        const cur = tasks.find((x) => x.id === action.taskId);
        const curDates = cur ? { start_date: cur.start_date, end_date: cur.end_date } : null;
        await api(`/api/dependencies/${action.depId}`, "DELETE");
        if (action.taskBefore) {
          await api(`/api/tasks/${action.taskId}`, "PUT", action.taskBefore);
        }
        redoStack.push({ type: "dep-create-shift-redo", depData, taskId: action.taskId, taskAfter: curDates });
        break;
      }
      case "reorder": {
        const curOrder = tasks.map((t) => t.id);
        for (let i = 0; i < action.oldOrder.length; i++) {
          await api(`/api/tasks/${action.oldOrder[i]}`, "PUT", { sort_order: i });
        }
        redoStack.push({ type: "reorder", oldOrder: curOrder });
        break;
      }
    }
    await loadAll();
  }

  async function redo() {
    const action = redoStack.pop();
    if (!action) return;
    switch (action.type) {
      case "task-update": {
        const cur = tasks.find((x) => x.id === action.id);
        const curState = cur ? {
          name: cur.name, description: cur.description,
          start_date: cur.start_date, end_date: cur.end_date,
          progress: cur.progress, color: cur.color,
          resource_ids: cur.resources.map((r) => ({ id: r.id, allocation: r.allocation, role: r.role || undefined })),
          parent_id: cur.parent_id, project_id: cur.project_id,
        } : null;
        await api(`/api/tasks/${action.id}`, "PUT", action.before);
        undoStack.push({ type: "task-update", id: action.id, before: curState });
        break;
      }
      case "task-update-cascade": {
        await api(`/api/tasks/${action.id}`, "PUT", action.after);
        for (const c of (action.cascaded || [])) {
          await api(`/api/tasks/${c.id}`, "PUT", c.after);
        }
        undoStack.push({ type: "task-update-cascade", id: action.id, before: action.before, after: action.after, cascaded: action.cascaded });
        break;
      }
      case "task-delete-redo": {
        if (action.data) {
          const t = await api("/api/tasks", "POST", action.data);
          undoStack.push({ type: "task-create", id: t.id });
        }
        break;
      }
      case "task-create-redo": {
        const cur = tasks.find((x) => x.id === action.id);
        const curData = cur ? {
          name: cur.name, description: cur.description,
          start_date: cur.start_date, end_date: cur.end_date,
          progress: cur.progress, color: cur.color,
          resource_ids: cur.resources.map((r) => ({ id: r.id, allocation: r.allocation, role: r.role || undefined })),
          parent_id: cur.parent_id, project_id: cur.project_id,
          sort_order: cur.sort_order,
        } : null;
        for (const depId of (action.depIds || [])) {
          await api(`/api/dependencies/${depId}`, "DELETE");
        }
        await api(`/api/tasks/${action.id}`, "DELETE");
        undoStack.push({ type: "task-delete", oldId: action.id, data: curData, deps: [] });
        break;
      }
      case "dep-delete-redo": {
        if (action.data) {
          const result = await api("/api/dependencies", "POST", action.data);
          undoStack.push({ type: "dep-create", id: result.id });
        }
        break;
      }
      case "dep-create-redo": {
        const dep = deps.find((d) => d.id === action.id);
        const depData = dep ? { predecessor_id: dep.predecessor_id, successor_id: dep.successor_id, dep_type: dep.dep_type, lag: dep.lag } : null;
        await api(`/api/dependencies/${action.id}`, "DELETE");
        undoStack.push({ type: "dep-delete", data: depData });
        break;
      }
      case "dep-create-shift-redo": {
        if (action.depData) {
          const result = await api("/api/dependencies", "POST", action.depData);
          if (action.taskAfter) {
            await api(`/api/tasks/${action.taskId}`, "PUT", action.taskAfter);
          }
          undoStack.push({ type: "dep-create-shift", depId: result.id, taskId: action.taskId, taskBefore: action.taskAfter ? { start_date: tasks.find((x) => x.id === action.taskId)?.start_date, end_date: tasks.find((x) => x.id === action.taskId)?.end_date } : null });
        }
        break;
      }
      case "reorder": {
        const curOrder = tasks.map((t) => t.id);
        for (let i = 0; i < action.oldOrder.length; i++) {
          await api(`/api/tasks/${action.oldOrder[i]}`, "PUT", { sort_order: i });
        }
        undoStack.push({ type: "reorder", oldOrder: curOrder });
        break;
      }
    }
    await loadAll();
  }

  // ── Recent colors (localStorage) ─────────────────────

  function loadRecentColors() {
    try { return JSON.parse(localStorage.getItem("rp_recent_colors") || "[]"); }
    catch { return []; }
  }

  function saveRecentColor(color) {
    color = color.toLowerCase();
    recentColors = recentColors.filter((c) => c !== color);
    recentColors.unshift(color);
    if (recentColors.length > MAX_RECENTS) recentColors.length = MAX_RECENTS;
    localStorage.setItem("rp_recent_colors", JSON.stringify(recentColors));
  }

  // ── Color picker widget ───────────────────────────────

  function initColorPickers() {
    document.querySelectorAll(".color-picker-group").forEach((group) => {
      const input = group.querySelector('input[type="color"]');
      const swatchesEl = group.querySelector(".color-swatches");
      swatchesEl.innerHTML = "";
      for (const c of PRESET_COLORS) {
        const sw = document.createElement("div");
        sw.className = "color-swatch";
        sw.style.background = c;
        sw.dataset.color = c;
        sw.addEventListener("click", () => {
          input.value = c;
          input.dispatchEvent(new Event("input"));
          markActive(group, c);
        });
        swatchesEl.appendChild(sw);
      }
      renderRecents(group);
      input.addEventListener("input", () => markActive(group, input.value));
    });
  }

  function renderRecents(group) {
    const input = group.querySelector('input[type="color"]');
    const recentsEl = group.querySelector(".color-recents");
    recentsEl.innerHTML = "";
    for (const c of recentColors) {
      const sw = document.createElement("div");
      sw.className = "color-swatch";
      sw.style.background = c;
      sw.dataset.color = c;
      sw.addEventListener("click", () => {
        input.value = c;
        input.dispatchEvent(new Event("input"));
        markActive(group, c);
      });
      recentsEl.appendChild(sw);
    }
  }

  function refreshAllRecents() {
    document.querySelectorAll(".color-picker-group").forEach(renderRecents);
  }

  function markActive(group, color) {
    color = color.toLowerCase();
    group.querySelectorAll(".color-swatch").forEach((sw) => {
      sw.classList.toggle("active", sw.dataset.color === color);
    });
  }

  function syncPickerToValue(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const group = input.closest(".color-picker-group");
    if (group) markActive(group, input.value);
  }

  // ── Data fetching ─────────────────────────────────────

  async function loadAll() {
    const taskUrl = currentProjectId ? `/api/tasks?project_id=${currentProjectId}` : "/api/tasks";
    const depUrl = currentProjectId ? `/api/dependencies?project_id=${currentProjectId}` : "/api/dependencies";
    [tasks, resources, deps, projects, blockedDays] = await Promise.all([
      api(taskUrl), api("/api/resources"), api(depUrl), api("/api/projects"), api("/api/blocked-days"),
    ]);
    populateProjectSelect();
    computeTimeline();
    render();
  }

  async function loadConfig() {
    const cfg = await api("/api/config");
    const name = cfg.app_name || "Resource Planner";
    const version = cfg.app_version || "";
    const title = version ? `${name} ${version}` : name;
    $("#app-title").textContent = title;
    document.title = title;
  }

  function populateProjectSelect() {
    const sel = $("#project-select");
    sel.innerHTML = '<option value="">All Projects</option>';
    for (const p of projects) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      sel.appendChild(opt);
    }
    sel.value = currentProjectId || "";
    $("#btn-edit-project").style.display = currentProjectId ? "inline-block" : "none";
    $("#btn-export-project").style.display = currentProjectId ? "inline-block" : "none";
  }

  function computeTimeline() {
    if (tasks.length === 0) {
      const today = new Date();
      timeOrigin = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2);
      timeCols = 30;
      return;
    }
    let minD = Infinity, maxD = -Infinity;
    for (const t of tasks) {
      const s = parseLocal(t.start_date).getTime();
      const e = parseLocal(t.end_date).getTime();
      if (s < minD) minD = s;
      if (e > maxD) maxD = e;
    }
    const z = ZOOM_LEVELS[zoomIdx];
    const leftPadCols = 2;
    const rightPadCols = 10;
    const leftPadMs = leftPadCols * z.days * 86400000;
    const rightPadMs = rightPadCols * z.days * 86400000;
    timeOrigin = new Date(minD - leftPadMs);
    timeOrigin.setHours(0, 0, 0, 0);
    const span = maxD + rightPadMs - timeOrigin.getTime();
    timeCols = Math.ceil(span / (z.days * 86400000)) + 1;
  }

  function expandTimelineForDrag() {
    if (!dragTask) return;
    const z = ZOOM_LEVELS[zoomIdx];
    const bufferCols = 2;
    const bufferMs = bufferCols * z.days * 86400000;
    const taskStart = parseLocal(dragTask.start_date).getTime();
    const taskEnd = parseLocal(dragTask.end_date).getTime();
    const curEnd = timeOrigin.getTime() + timeCols * z.days * 86400000;
    let changed = false;

    if (taskEnd + bufferMs > curEnd) {
      timeCols = Math.ceil((taskEnd + bufferMs - timeOrigin.getTime()) / (z.days * 86400000)) + 1;
      changed = true;
    }
    if (taskStart - bufferMs < timeOrigin.getTime()) {
      const oldOrigin = timeOrigin.getTime();
      const newOrigin = new Date(taskStart - bufferMs);
      newOrigin.setHours(0, 0, 0, 0);
      const shiftMs = oldOrigin - newOrigin.getTime();
      const shiftPx = (shiftMs / (z.days * 86400000)) * z.colW;
      timeOrigin = newOrigin;
      timeCols += Math.ceil(shiftMs / (z.days * 86400000));
      dragStartX += shiftPx;
      changed = true;
    }
    if (changed) renderHeader();
  }

  // ── Resource view data ────────────────────────────────

  function buildResourceView() {
    resViewRows = [];
    const DAY_MS = 86400000;
    for (const r of resources) {
      const rTasks = tasks.filter((t) => t.resource_ids.includes(r.id));
      if (currentProjectId && rTasks.length === 0) continue;
      // Build individual assignments (one per role entry, not collapsed)
      const assignments = [];
      for (const t of rTasks) {
        const allocs = (t.resources || []).filter((x) => x.id === r.id);
        if (allocs.length === 0) {
          assignments.push({ task: t, allocation: 100, role: "" });
        } else {
          for (const a of allocs) {
            assignments.push({ task: t, allocation: a.allocation, role: a.role || "" });
          }
        }
      }
      const taskAllocs = rTasks.map((t) => {
        const allocs = (t.resources || []).filter((x) => x.id === r.id);
        const totalAlloc = allocs.reduce((sum, x) => sum + x.allocation, 0);
        return { task: t, allocation: totalAlloc || 100 };
      });

      // Build per-day utilization map and find overloaded spans
      const dayUtil = {};
      let peakUtil = 0;
      for (const { task: t, allocation } of taskAllocs) {
        const startD = parseLocal(t.start_date);
        const endD = parseLocal(t.end_date);
        const cur = new Date(startD.getFullYear(), startD.getMonth(), startD.getDate());
        while (cur <= endD) {
          const key = cur.getTime();
          dayUtil[key] = (dayUtil[key] || 0) + allocation;
          if (dayUtil[key] > peakUtil) peakUtil = dayUtil[key];
          cur.setDate(cur.getDate() + 1);
        }
      }
      const dayVals = Object.values(dayUtil);
      const minUtil = dayVals.length > 0 ? Math.min(...dayVals) : 0;

      // Find contiguous overloaded spans (>100%)
      const overloaded = [];
      const days = Object.keys(dayUtil).map(Number).sort((a, b) => a - b);
      let spanStart = null;
      for (let di = 0; di < days.length; di++) {
        const day = days[di];
        if (dayUtil[day] > 100) {
          if (spanStart === null) spanStart = day;
        } else {
          if (spanStart !== null) {
            overloaded.push({ start: spanStart, end: days[di - 1], util: 0 });
            spanStart = null;
          }
        }
      }
      if (spanStart !== null) {
        overloaded.push({ start: spanStart, end: days[days.length - 1], util: 0 });
      }
      // Annotate each span with peak util in that range
      for (const span of overloaded) {
        let peak = 0;
        for (const d of days) {
          if (d >= span.start && d <= span.end && dayUtil[d] > peak) peak = dayUtil[d];
        }
        span.util = peak;
      }

      resViewRows.push({ resource: r, tasks: rTasks, assignments, taskAllocs, overloaded, peakUtil, minUtil, dayUtil });
    }
  }

  // ── Blocked days utilities ─────────────────────────────

  function isDateBlocked(dateStr, resourceId, projectId) {
    for (const bd of blockedDays) {
      if (dateStr < bd.start_date || dateStr > bd.end_date) continue;
      if (bd.scope === "global") return true;
      if (bd.scope === "resource" && bd.resource_id === resourceId) return true;
      if (bd.scope === "project" && bd.project_id === projectId) return true;
    }
    return false;
  }

  function isDateBlockedForTask(dateStr, task) {
    for (const bd of blockedDays) {
      if (dateStr < bd.start_date || dateStr > bd.end_date) continue;
      if (bd.scope === "global") return true;
      if (bd.scope === "project" && bd.project_id === task.project_id) return true;
      if (bd.scope === "resource") {
        const allBlocked = (task.resource_ids || []).length > 0 &&
          (task.resource_ids || []).every((rid) => {
            for (const b of blockedDays) {
              if (dateStr < b.start_date || dateStr > b.end_date) continue;
              if (b.scope === "resource" && b.resource_id === rid) return true;
            }
            return false;
          });
        if (allBlocked) return true;
      }
    }
    return false;
  }

  function countWorkingDays(startDate, endDate, task) {
    let count = 0;
    const cur = parseLocal(startDate);
    const end = parseLocal(endDate);
    while (cur <= end) {
      const ds = formatDateISO(cur);
      if (!isDateBlockedForTask(ds, task)) count++;
      cur.setDate(cur.getDate() + 1);
    }
    return count;
  }

  function addWorkingDays(startDate, workDays, task) {
    const cur = parseLocal(startDate);
    while (isDateBlockedForTask(formatDateISO(cur), task)) {
      cur.setDate(cur.getDate() + 1);
    }
    let remaining = workDays - 1;
    while (remaining > 0) {
      cur.setDate(cur.getDate() + 1);
      if (!isDateBlockedForTask(formatDateISO(cur), task)) remaining--;
    }
    return formatDateISO(cur);
  }

  function adjustTaskForBlockedDays(task) {
    const workDays = countWorkingDays(task.start_date, task.end_date, task);
    if (workDays <= 0) return false;
    let start = parseLocal(task.start_date);
    while (isDateBlockedForTask(formatDateISO(start), task)) {
      start.setDate(start.getDate() + 1);
    }
    const newStart = formatDateISO(start);
    const newEnd = addWorkingDays(newStart, workDays, task);
    if (newStart !== task.start_date || newEnd !== task.end_date) {
      task.start_date = newStart;
      task.end_date = newEnd;
      return true;
    }
    return false;
  }

  function formatDateISO(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  async function adjustAllTasksForBlockedDays(prevBlockedDays) {
    // prevBlockedDays = blocked days state BEFORE the change
    // blockedDays (current) = state AFTER the change
    // We count working days under the previous state, then recompute dates under the new state
    const prev = prevBlockedDays || [];
    let changed = false;
    const adjusted = [];
    for (const t of tasks) {
      // Count working days under previous blocked days
      const saved = blockedDays;
      blockedDays = prev;
      const workDays = countWorkingDays(t.start_date, t.end_date, t);
      blockedDays = saved;
      if (workDays <= 0) continue;
      // Recompute start (skip current blocked days)
      let newStart = parseLocal(t.start_date);
      while (isDateBlockedForTask(formatDateISO(newStart), t)) {
        newStart.setDate(newStart.getDate() + 1);
      }
      const newStartStr = formatDateISO(newStart);
      const newEndStr = addWorkingDays(newStartStr, workDays, t);
      if (newStartStr !== t.start_date || newEndStr !== t.end_date) {
        const oldEnd = t.end_date;
        t.start_date = newStartStr;
        t.end_date = newEndStr;
        await api(`/api/tasks/${t.id}`, "PUT", { start_date: t.start_date, end_date: t.end_date });
        const delta = Math.round((parseLocal(t.end_date) - parseLocal(oldEnd)) / 86400000);
        adjusted.push({ task: t, delta });
        changed = true;
      }
    }
    if (changed) {
      await loadAll();
      for (const { task, delta } of adjusted) {
        const fresh = tasks.find((x) => x.id === task.id) || task;
        await enforceDepsFrom(fresh, delta);
      }
      await loadAll();
      // Final pass: ensure no task starts on a blocked day
      let fixedAny = false;
      for (const t of tasks) {
        if (!isDateBlockedForTask(t.start_date, t)) continue;
        const calDays = Math.round((parseLocal(t.end_date) - parseLocal(t.start_date)) / 86400000) + 1;
        let ns = parseLocal(t.start_date);
        while (isDateBlockedForTask(formatDateISO(ns), t)) {
          ns.setDate(ns.getDate() + 1);
        }
        const nsStr = formatDateISO(ns);
        const neStr = addWorkingDays(nsStr, calDays, t);
        if (nsStr !== t.start_date || neStr !== t.end_date) {
          t.start_date = nsStr;
          t.end_date = neStr;
          await api(`/api/tasks/${t.id}`, "PUT", { start_date: t.start_date, end_date: t.end_date });
          fixedAny = true;
        }
      }
      if (fixedAny) await loadAll();
    }
  }

  function getBlockedDaysForColumn(dateStr) {
    const applicable = [];
    for (const bd of blockedDays) {
      if (dateStr < bd.start_date || dateStr > bd.end_date) continue;
      if (bd.scope === "global") { applicable.push(bd); continue; }
      if (bd.scope === "project" && (!currentProjectId || bd.project_id === currentProjectId)) {
        applicable.push(bd); continue;
      }
      if (bd.scope === "resource") applicable.push(bd);
    }
    return applicable;
  }

  function drawBlockedOverlay(ctx, totalW, totalH) {
    const z = ZOOM_LEVELS[zoomIdx];
    const pxPerDay = z.colW / z.days;
    const originMs = timeOrigin.getTime();
    const totalDays = Math.ceil(totalW / pxPerDay);

    for (const bd of blockedDays) {
      if (bd.scope === "resource") continue;
      if (bd.scope === "project" && currentProjectId && bd.project_id !== currentProjectId) continue;
      const bStart = parseLocal(bd.start_date);
      const bEnd = parseLocal(bd.end_date);
      const x1 = dateToPx(bd.start_date);
      const x2 = dateToPx(bd.end_date) + pxPerDay;
      if (x2 < 0 || x1 > totalW) continue;
      const clampX = Math.max(0, x1);
      const clampW = Math.min(totalW, x2) - clampX;

      ctx.fillStyle = bd.color + "18";
      ctx.fillRect(clampX, 0, clampW, totalH);

      ctx.save();
      ctx.beginPath();
      ctx.rect(clampX, 0, clampW, totalH);
      ctx.clip();
      ctx.strokeStyle = bd.color + "30";
      ctx.lineWidth = 1;
      const step = 12;
      for (let i = -totalH; i < clampW + totalH; i += step) {
        ctx.beginPath();
        ctx.moveTo(clampX + i, totalH);
        ctx.lineTo(clampX + i + totalH, 0);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawBlockedOverlayResource(ctx, totalW) {
    const z = ZOOM_LEVELS[zoomIdx];
    const pxPerDay = z.colW / z.days;
    const resBDs = blockedDays.filter((bd) => bd.scope === "resource");
    if (resBDs.length === 0) return;

    for (let ri = 0; ri < resViewRows.length; ri++) {
      const rv = resViewRows[ri];
      const rowY = resRowOffsets[ri];
      const rowH = rv._rowH || ROW_H;
      for (const bd of resBDs) {
        if (bd.resource_id !== rv.resource.id) continue;
        const x1 = dateToPx(bd.start_date);
        const x2 = dateToPx(bd.end_date) + pxPerDay;
        if (x2 < 0 || x1 > totalW) continue;
        const clampX = Math.max(0, x1);
        const clampW = Math.min(totalW, x2) - clampX;

        ctx.fillStyle = bd.color + "18";
        ctx.fillRect(clampX, rowY, clampW, rowH);

        ctx.save();
        ctx.beginPath();
        ctx.rect(clampX, rowY, clampW, rowH);
        ctx.clip();
        ctx.strokeStyle = bd.color + "30";
        ctx.lineWidth = 1;
        const step = 12;
        for (let i = -rowH; i < clampW + rowH; i += step) {
          ctx.beginPath();
          ctx.moveTo(clampX + i, rowY + rowH);
          ctx.lineTo(clampX + i + rowH, rowY);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }

  // ── Rendering ─────────────────────────────────────────

  function render() {
    if (viewMode === "tasks") {
      renderSidebar();
      renderHeader();
      renderBars();
      renderDeps();
    } else {
      buildResourceView();
      computeResRowLayout();
      renderResourceSidebar();
      renderHeader();
      renderResourceBars();
      renderResourceOverlaps();
    }
    applyColWidths();
    hoveredRowIdx = -1;
    drawRowHighlight();
  }

  let reorderDrag = null;
  let resReorderDrag = null;

  function renderSidebar() {
    const body = $("#sidebar-body");
    body.innerHTML = "";
    for (let idx = 0; idx < tasks.length; idx++) {
      const t = tasks[idx];
      const row = document.createElement("div");
      row.className = "sidebar-row";
      row.dataset.id = t.id;
      row.dataset.rowIdx = idx;
      const indent = t.parent_id ? "padding-left:20px;" : "";
      const dots = (t.resources || []).map(
        (r) => `<span class="task-dot" style="background:${r.color}" title="${esc(r.name)}"></span>`
      ).join("");
      const names = t.resource_name || "\u2014";
      row.innerHTML = `
        <span class="col-name" style="${indent}" title="${esc(t.name)}">
          <span class="resource-dots">${dots || `<span class="task-dot" style="background:${t.color}"></span>`}</span>
          ${esc(t.name)}
        </span>
        <span class="col-dates" title="Start: ${t.start_date}">${fmtDate(t.start_date)}</span>
        <span class="col-dates" title="End: ${t.end_date}">${fmtDate(t.end_date)}</span>
        <span class="col-resource" title="Resource: ${esc(names)}">${esc(names)}</span>`;
      row.addEventListener("click", (e) => { if (!reorderDrag) openTaskModal(t); });
      row.addEventListener("contextmenu", (e) => showCtxMenu(e, t));
      row.addEventListener("mouseenter", () => { if (!reorderDrag) setHoveredRow(idx); });
      row.addEventListener("mouseleave", () => { if (!reorderDrag) setHoveredRow(-1); });
      row.addEventListener("mousedown", (e) => startReorderDrag(e, idx));
      body.appendChild(row);
    }
  }

  function startReorderDrag(e, fromIdx) {
    if (e.button !== 0 || viewMode !== "tasks") return;
    e.preventDefault();
    const startY = e.clientY;
    let active = false;
    let toIdx = fromIdx;
    const body = $("#sidebar-body");
    const rows = Array.from(body.children);
    const rowH = rows[0] ? rows[0].getBoundingClientRect().height : ROW_H;
    let ghost = null;

    const onMove = (ev) => {
      const dy = ev.clientY - startY;
      if (!active && Math.abs(dy) < 5) return;
      if (!active) {
        active = true;
        reorderDrag = { fromIdx };
        rows[fromIdx].classList.add("reorder-dragging");
        document.body.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
        // Create floating ghost
        ghost = rows[fromIdx].cloneNode(true);
        ghost.className = "sidebar-row reorder-ghost";
        ghost.style.position = "fixed";
        ghost.style.width = rows[fromIdx].getBoundingClientRect().width + "px";
        ghost.style.left = rows[fromIdx].getBoundingClientRect().left + "px";
        ghost.style.top = ev.clientY - rowH / 2 + "px";
        ghost.style.zIndex = "1000";
        ghost.style.pointerEvents = "none";
        document.body.appendChild(ghost);
      }
      if (ghost) ghost.style.top = ev.clientY - rowH / 2 + "px";
      const offset = Math.round(dy / rowH);
      toIdx = Math.max(0, Math.min(tasks.length - 1, fromIdx + offset));
      rows.forEach((r, i) => {
        r.classList.remove("reorder-above", "reorder-below");
        if (i === toIdx && toIdx !== fromIdx) {
          r.classList.add(toIdx < fromIdx ? "reorder-above" : "reorder-below");
        }
      });
    };

    const onUp = async () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (!active) { reorderDrag = null; return; }
      rows[fromIdx].classList.remove("reorder-dragging");
      rows.forEach((r) => r.classList.remove("reorder-above", "reorder-below"));
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (ghost) { ghost.remove(); ghost = null; }
      reorderDrag = null;
      if (toIdx !== fromIdx) {
        const oldOrder = tasks.map((t) => t.id);
        const [moved] = tasks.splice(fromIdx, 1);
        tasks.splice(toIdx, 0, moved);
        const updates = tasks.map((t, i) => ({ id: t.id, sort_order: i }));
        for (const u of updates) {
          await api(`/api/tasks/${u.id}`, "PUT", { sort_order: u.sort_order });
        }
        pushUndo({ type: "reorder", oldOrder });
        await loadAll();
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function renderResourceSidebar() {
    const hdr = $(".sidebar-header");
    hdr.innerHTML = `<span class="col-name" data-col="0" title="Resource">Resource<span class="col-resize-handle"></span></span><span class="col-resource" data-col="1" title="Role">Role<span class="col-resize-handle"></span></span><span class="col-dates" data-col="2" title="Assignments">Assign.<span class="col-resize-handle"></span></span><span class="col-dates" data-col="3" title="Min Utilization">Min<span class="col-resize-handle"></span></span><span class="col-dates" data-col="4" title="Peak Utilization">Peak</span>`;
    const body = $("#sidebar-body");
    body.innerHTML = "";
    for (let idx = 0; idx < resViewRows.length; idx++) {
      const rv = resViewRows[idx];
      const r = rv.resource;
      const overloaded = rv.peakUtil > 100;
      const row = document.createElement("div");
      row.className = "sidebar-row" + (overloaded ? " overload-row" : "");
      row.dataset.rowIdx = idx;
      if (rv._rowH && rv._rowH !== ROW_H) {
        row.style.height = rv._rowH + "px";
      }
      const peakLabel = rv.peakUtil > 0 ? rv.peakUtil + "%" : "\u2014";
      const minLabel = rv.assignments.length > 0 ? rv.minUtil + "%" : "\u2014";
      const roles = [...new Set(rv.assignments.map(a => a.role).filter(Boolean))];
      const roleStr = roles.length ? roles.join(", ") : r.role || "\u2014";
      row.innerHTML = `
        <span class="col-name" title="Resource: ${esc(r.name)}">
          <span class="task-dot" style="background:${r.color}"></span>
          ${esc(r.name)}
        </span>
        <span class="col-resource" title="Role: ${esc(roleStr)}">${esc(roleStr)}</span>
        <span class="col-dates" title="Assignments: ${rv.assignments.length}">${rv.assignments.length}</span>
        <span class="col-dates" title="Min Utilization: ${minLabel}">${minLabel}</span>
        <span class="col-dates" title="Peak Utilization: ${peakLabel}" ${overloaded ? 'style="color:var(--danger);font-weight:600"' : ""}>${peakLabel}</span>`;
      row.addEventListener("click", () => { if (!resReorderDrag) openResourceModal(r, false); });
      row.addEventListener("mouseenter", () => { if (!resReorderDrag) setHoveredRow(idx); });
      row.addEventListener("mouseleave", () => { if (!resReorderDrag) setHoveredRow(-1); });
      row.addEventListener("mousedown", (e) => startResReorderDrag(e, idx));
      body.appendChild(row);
    }
  }

  function startResReorderDrag(e, fromIdx) {
    if (e.button !== 0 || viewMode !== "resources") return;
    e.preventDefault();
    const startY = e.clientY;
    let active = false;
    let toIdx = fromIdx;
    const body = $("#sidebar-body");
    const rows = Array.from(body.children);
    const rowH = rows[fromIdx] ? rows[fromIdx].getBoundingClientRect().height : ROW_H;
    let ghost = null;

    const onMove = (ev) => {
      const dy = ev.clientY - startY;
      if (!active && Math.abs(dy) < 5) return;
      if (!active) {
        active = true;
        resReorderDrag = { fromIdx };
        rows[fromIdx].classList.add("reorder-dragging");
        document.body.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
        ghost = rows[fromIdx].cloneNode(true);
        ghost.className = "sidebar-row reorder-ghost";
        ghost.style.position = "fixed";
        ghost.style.width = rows[fromIdx].getBoundingClientRect().width + "px";
        ghost.style.left = rows[fromIdx].getBoundingClientRect().left + "px";
        ghost.style.top = ev.clientY - rowH / 2 + "px";
        ghost.style.zIndex = "1000";
        ghost.style.pointerEvents = "none";
        document.body.appendChild(ghost);
      }
      if (ghost) ghost.style.top = ev.clientY - rowH / 2 + "px";
      // Use row midpoints for variable-height rows
      toIdx = fromIdx;
      for (let i = 0; i < rows.length; i++) {
        const rRect = rows[i].getBoundingClientRect();
        const mid = rRect.top + rRect.height / 2;
        if (ev.clientY < mid) { toIdx = i; break; }
        toIdx = i;
      }
      toIdx = Math.max(0, Math.min(resources.length - 1, toIdx));
      rows.forEach((r, i) => {
        r.classList.remove("reorder-above", "reorder-below");
        if (i === toIdx && toIdx !== fromIdx) {
          r.classList.add(toIdx < fromIdx ? "reorder-above" : "reorder-below");
        }
      });
    };

    const onUp = async () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (!active) { resReorderDrag = null; return; }
      rows[fromIdx].classList.remove("reorder-dragging");
      rows.forEach((r) => r.classList.remove("reorder-above", "reorder-below"));
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (ghost) { ghost.remove(); ghost = null; }
      resReorderDrag = null;
      if (toIdx !== fromIdx) {
        const [moved] = resources.splice(fromIdx, 1);
        resources.splice(toIdx, 0, moved);
        const updates = resources.map((r, i) => ({ id: r.id, sort_order: i }));
        for (const u of updates) {
          await api(`/api/resources/${u.id}`, "PUT", { sort_order: u.sort_order });
        }
        await loadAll();
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function renderHeader() {
    const hdr = $("#chart-header");
    hdr.innerHTML = "";
    const z = ZOOM_LEVELS[zoomIdx];
    for (let i = 0; i < timeCols; i++) {
      const d = new Date(timeOrigin.getTime() + i * z.days * 86400000);
      const col = document.createElement("div");
      col.className = "col-header";
      col.style.width = z.colW + "px";
      col.style.minWidth = z.colW + "px";
      if (z.days <= 1) {
        col.innerHTML = `<span class="ch-top">${d.getDate()}</span><span class="ch-bot">${MONTHS[d.getMonth()]}</span>`;
      } else if (z.days <= 7) {
        col.innerHTML = `<span class="ch-top">${MONTHS[d.getMonth()]} ${d.getDate()}</span>`;
      } else {
        col.innerHTML = `<span class="ch-top">${MONTHS[d.getMonth()]} ${d.getDate()}</span><span class="ch-bot">${d.getFullYear()}</span>`;
      }
      hdr.appendChild(col);
    }
  }

  function renderBars(hoverInfo) {
    const z = ZOOM_LEVELS[zoomIdx];
    const canvas = $("#gantt-canvas");
    let totalW = timeCols * z.colW;
    const totalH = tasks.length * ROW_H;

    // Ensure canvas is wide enough for all bars
    for (const t of tasks) {
      const barEnd = dateToPx(t.end_date) + oneDayPx() + 20;
      if (barEnd > totalW) totalW = Math.ceil(barEnd);
    }

    canvas.width = totalW;
    canvas.height = totalH;
    canvas.style.width = totalW + "px";
    canvas.style.height = totalH + "px";

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, totalW, totalH);

    drawGrid(ctx, totalW, totalH, z);
    drawBlockedOverlay(ctx, totalW, totalH);
    drawToday(ctx, totalW, totalH, z);

    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      const x1 = dateToPx(t.start_date);
      const x2 = dateToPx(t.end_date) + oneDayPx();
      const y = i * ROW_H + BAR_PAD;
      const w = Math.max(x2 - x1, 8);

      const barLabel = sidebarCollapsed && t.resources && t.resources.length
        ? t.name + " \u2014 " + t.resources.map((r) => r.role ? `${r.name} [${r.role}]` : r.name).join(", ")
        : t.name;
      const unstaffed = !t.resource_ids || t.resource_ids.length === 0;
      drawBar(ctx, x1, y, w, t.color, t.progress, barLabel, null, unstaffed);

      // resource dots on the bar
      const dotR = Math.max(2, Math.min(BAR_H * 0.12, 4));
      if (t.resources && t.resources.length > 0) {
        const dotY = y + BAR_H - dotR - 1;
        for (let d = 0; d < t.resources.length; d++) {
          const dotX = x1 + 8 + d * (dotR * 2 + 2);
          if (dotX + dotR > x1 + w - 4) break;
          ctx.fillStyle = t.resources[d].color;
          ctx.beginPath();
          ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (hoverInfo && hoverInfo.taskIdx === i && !dragTask && !linkDrag) {
        drawResizeHandles(ctx, x1, y, w, hoverInfo.edge);
      }

      // Connector circles for dependency linking (shown on hover)
      if (hoverInfo && hoverInfo.taskIdx === i && !dragTask) {
        const cr = 5;
        const cy = y + BAR_H / 2;
        // Left connector (start)
        ctx.fillStyle = lightMode ? "#333333dd" : "#ffffffdd";
        ctx.strokeStyle = t.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x1, cy, cr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        // Right connector (end)
        ctx.beginPath(); ctx.arc(x1 + w, cy, cr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }

      // Highlight target bar during link drag
      if (linkDrag && linkDrag.targetIdx === i) {
        ctx.strokeStyle = lightMode ? "#333c" : "#fffc";
        ctx.lineWidth = 2;
        ctx.beginPath(); roundRect(ctx, x1 - 1, y - 1, w + 2, BAR_H + 2, 5); ctx.stroke();
      }

      t._x1 = x1; t._x2 = x1 + w; t._y = y;
    }

    resizeSvg(totalW, totalH);
  }

  const UTIL_CHART_H = 28;

  function computeResRowLayout() {
    const minBarH = Math.max(14, BAR_H * 0.6);
    resRowOffsets = [0];
    for (let ri = 0; ri < resViewRows.length; ri++) {
      const rv = resViewRows[ri];
      const asns = rv.assignments;

      const lanes = new Array(asns.length).fill(0);
      let maxLane = 0;
      for (let i = 0; i < asns.length; i++) {
        const si = parseLocal(asns[i].task.start_date).getTime();
        const ei = parseLocal(asns[i].task.end_date).getTime();
        const usedLanes = new Set();
        for (let j = 0; j < i; j++) {
          const sj = parseLocal(asns[j].task.start_date).getTime();
          const ej = parseLocal(asns[j].task.end_date).getTime();
          if (si <= ej && ei >= sj) usedLanes.add(lanes[j]);
        }
        let lane = 0;
        while (usedLanes.has(lane)) lane++;
        lanes[i] = lane;
        if (lane > maxLane) maxLane = lane;
      }

      const laneCount = maxLane + 1;
      const hasUtil = Object.keys(rv.dayUtil).length > 0;
      const utilH = hasUtil ? UTIL_CHART_H : 0;
      const rowH = Math.max(ROW_H, laneCount * (minBarH + 2) + BAR_PAD * 2) + utilH;
      rv._lanes = lanes;
      rv._laneCount = laneCount;
      rv._rowH = rowH;
      rv._utilH = utilH;
      rv._laneH = (rowH - BAR_PAD * 2 - utilH) / laneCount;
      resRowOffsets.push(resRowOffsets[ri] + rowH);
    }
  }

  let resRowOffsets = [];

  function renderResourceBars() {
    const z = ZOOM_LEVELS[zoomIdx];
    const canvas = $("#gantt-canvas");
    let totalW = timeCols * z.colW;

    const totalH = resRowOffsets[resRowOffsets.length - 1] || 0;

    for (const t of tasks) {
      const barEnd = dateToPx(t.end_date) + oneDayPx() + 20;
      if (barEnd > totalW) totalW = Math.ceil(barEnd);
    }

    canvas.width = totalW;
    canvas.height = totalH;
    canvas.style.width = totalW + "px";
    canvas.style.height = totalH + "px";

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, totalW, totalH);

    drawGridVariable(ctx, totalW, totalH, z);
    drawBlockedOverlay(ctx, totalW, totalH);
    drawBlockedOverlayResource(ctx, totalW);
    drawToday(ctx, totalW, totalH, z);

    for (let ri = 0; ri < resViewRows.length; ri++) {
      const rv = resViewRows[ri];
      const rowY = resRowOffsets[ri];
      const asns = rv.assignments;
      const laneH = rv._laneH;
      const gap = rv._laneCount > 1 ? 1 : 0;

      for (let i = 0; i < asns.length; i++) {
        const a = asns[i];
        const t = a.task;
        const x1 = dateToPx(t.start_date);
        const x2 = dateToPx(t.end_date) + oneDayPx();
        const w = Math.max(x2 - x1, 8);
        const barH = laneH - gap;
        const y = rowY + BAR_PAD + rv._lanes[i] * laneH;
        const meta = a.role && a.allocation !== 100 ? ` (${a.role} | ${a.allocation}%)` : a.role ? ` (${a.role})` : a.allocation !== 100 ? ` (${a.allocation}%)` : "";
        const label = t.name + meta;
        drawBar(ctx, x1, y, w, t.color, t.progress, label, barH);
      }

      // Utilization sparkline at bottom of row
      if (rv._utilH > 0) {
        drawUtilChart(ctx, rv, rowY + rv._rowH - rv._utilH, rv._utilH, totalW);
      }
    }

    resizeSvg(totalW, totalH);
  }

  function drawUtilChart(ctx, rv, chartY, chartH, totalW) {
    const dayUtil = rv.dayUtil;
    const days = Object.keys(dayUtil).map(Number).sort((a, b) => a - b);
    if (days.length === 0) return;

    const dangerColor = cssVar("--danger") || "#e74c3c";
    const accentColor = cssVar("--accent") || "#4a86c8";
    const borderColor = cssVar("--border") || "#1a4080";
    const dimColor = cssVar("--text-dim") || "#8899aa";
    const DAY_MS = 86400000;

    const maxVis = Math.max(100, rv.peakUtil, 150);

    // Reference lines at 50% and 100%
    const ref100Y = chartY + chartH * (1 - 100 / maxVis);
    const ref50Y = chartY + chartH * (1 - 50 / maxVis);
    ctx.strokeStyle = borderColor + "40";
    ctx.lineWidth = 0.5;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(0, ref50Y); ctx.lineTo(totalW, ref50Y);
    ctx.stroke();
    ctx.strokeStyle = borderColor + "80";
    ctx.beginPath();
    ctx.moveTo(0, ref100Y); ctx.lineTo(totalW, ref100Y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Scale labels on left edge
    ctx.font = "8px -apple-system, sans-serif";
    ctx.fillStyle = dimColor + "99";
    ctx.textBaseline = "middle";
    ctx.fillText("100%", 2, ref100Y);
    ctx.fillText("50%", 2, ref50Y);

    // Build path points, inserting zero segments for gaps
    const points = [];
    for (let di = 0; di < days.length; di++) {
      const day = days[di];
      // Detect gap from previous day
      if (di > 0) {
        const prevDay = days[di - 1];
        const prevDate = new Date(prevDay);
        const expectedNext = new Date(prevDate.getFullYear(), prevDate.getMonth(), prevDate.getDate() + 1).getTime();
        if (day > expectedNext) {
          const gapX = timeToPx(expectedNext);
          const gapXEnd = timeToPx(day);
          points.push({ x: gapX, xEnd: gapXEnd, y: chartY + chartH, util: 0 });
        }
      }
      const x = timeToPx(day);
      const nextDate = new Date(day);
      nextDate.setDate(nextDate.getDate() + 1);
      const xEnd = timeToPx(nextDate.getTime());
      const util = dayUtil[day];
      const ratio = Math.min(util / maxVis, 1);
      const y = chartY + chartH * (1 - ratio);
      points.push({ x, xEnd, y, util });
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, chartY, totalW, chartH);
    ctx.clip();

    // Filled area as step chart
    ctx.beginPath();
    ctx.moveTo(points[0].x, chartY + chartH);
    for (const p of points) {
      ctx.lineTo(p.x, p.y);
      ctx.lineTo(p.xEnd, p.y);
    }
    ctx.lineTo(points[points.length - 1].xEnd, chartY + chartH);
    ctx.closePath();
    ctx.fillStyle = accentColor + "25";
    ctx.fill();

    // Overloaded regions with danger fill
    for (const p of points) {
      if (p.util > 100) {
        ctx.fillStyle = dangerColor + "35";
        ctx.fillRect(p.x, p.y, p.xEnd - p.x, ref100Y - p.y);
      }
    }

    // Step line with per-segment color
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      ctx.strokeStyle = p.util > 100 ? dangerColor + "cc" : accentColor + "bb";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.xEnd, p.y);
      ctx.stroke();
      // Vertical step to next segment
      if (i < points.length - 1) {
        const next = points[i + 1];
        ctx.strokeStyle = next.util > 100 ? dangerColor + "cc" : accentColor + "bb";
        ctx.beginPath();
        ctx.moveTo(next.x, p.y);
        ctx.lineTo(next.x, next.y);
        ctx.stroke();
      }
    }

    // Percentage labels on segments that are wide enough
    ctx.font = "bold 8px -apple-system, sans-serif";
    ctx.textBaseline = "bottom";
    for (const p of points) {
      const segW = p.xEnd - p.x;
      if (segW > 24) {
        ctx.fillStyle = p.util > 100 ? dangerColor : dimColor;
        ctx.fillText(p.util + "%", p.x + 2, p.y - 1);
      }
    }

    ctx.restore();
  }

  function drawGridVariable(ctx, totalW, totalH, z) {
    const border = cssVar("--border") || "#1a4080";
    ctx.strokeStyle = border + "30";
    ctx.lineWidth = 1;
    for (let i = 0; i <= timeCols; i++) {
      const x = i * z.colW;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, totalH); ctx.stroke();
    }
    for (let i = 0; i <= resViewRows.length; i++) {
      const y = resRowOffsets[i] || totalH;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(totalW, y); ctx.stroke();
    }
  }

  function renderResourceOverlaps() {
    const svg = $("#dep-svg");
    svg.innerHTML = "";

    for (let ri = 0; ri < resViewRows.length; ri++) {
      const rv = resViewRows[ri];
      const rowY = resRowOffsets[ri];
      const rowH = rv._rowH;
      for (const span of rv.overloaded) {
        const x1 = timeToPx(span.start);
        const x2 = timeToPx(span.end) + oneDayPx();
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", x1);
        rect.setAttribute("y", rowY);
        rect.setAttribute("width", Math.max(x2 - x1, 4));
        rect.setAttribute("height", rowH);
        const danger = cssVar("--danger") || "#e74c3c";
        rect.setAttribute("fill", danger + "33");
        rect.setAttribute("stroke", danger + "88");
        rect.setAttribute("stroke-width", "1");
        rect.setAttribute("rx", "3");
        svg.appendChild(rect);

        const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
        txt.setAttribute("x", x1 + 4);
        txt.setAttribute("y", rowY + rowH - 4);
        txt.setAttribute("fill", danger + "cc");
        txt.setAttribute("font-size", "9");
        txt.setAttribute("font-family", "-apple-system, sans-serif");
        txt.textContent = span.util + "%";
        svg.appendChild(txt);
      }
    }
  }

  // ── Shared drawing helpers ────────────────────────────

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function drawGrid(ctx, totalW, totalH, z, rowCount) {
    const border = cssVar("--border") || "#1a4080";
    ctx.strokeStyle = border + "30";
    ctx.lineWidth = 1;
    for (let i = 0; i <= timeCols; i++) {
      const x = i * z.colW;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, totalH); ctx.stroke();
    }
    const rows = rowCount || tasks.length;
    for (let i = 0; i <= rows; i++) {
      const y = i * ROW_H;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(totalW, y); ctx.stroke();
    }
  }

  function drawToday(ctx, totalW, totalH, z) {
    const todayX = dateToPx(todayStr());
    if (todayX >= 0 && todayX <= totalW) {
      const danger = cssVar("--danger") || "#e74c3c";
      ctx.fillStyle = danger + "22";
      ctx.fillRect(todayX, 0, oneDayPx(), totalH);
      ctx.strokeStyle = danger + "88";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(todayX, 0); ctx.lineTo(todayX, totalH); ctx.stroke();
    }
  }

  function drawBar(ctx, x, y, w, color, progress, label, h, unstaffed) {
    const barH = h || BAR_H;
    ctx.fillStyle = color + "55";
    ctx.beginPath(); roundRect(ctx, x, y, w, barH, 4); ctx.fill();
    if (progress > 0) {
      ctx.fillStyle = color + "cc";
      ctx.beginPath(); roundRect(ctx, x, y, (w * progress) / 100, barH, 4); ctx.fill();
    }
    if (unstaffed) {
      ctx.save();
      ctx.beginPath(); roundRect(ctx, x, y, w, barH, 4); ctx.clip();
      const hatchColor = cssVar("--danger") || "#e74c3c";
      ctx.strokeStyle = hatchColor + "60";
      ctx.lineWidth = 2;
      const step = 8;
      for (let i = -barH; i < w + barH; i += step) {
        ctx.beginPath();
        ctx.moveTo(x + i, y + barH);
        ctx.lineTo(x + i + barH, y);
        ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = hatchColor;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); roundRect(ctx, x, y, w, barH, 4); ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath(); roundRect(ctx, x, y, w, barH, 4); ctx.stroke();
    }
    ctx.fillStyle = lightMode ? "#1e1e1e" : "#fff";
    const fontSize = Math.max(8, Math.min(barH * 0.6, 16));
    ctx.font = `${fontSize}px -apple-system, sans-serif`;
    ctx.textBaseline = "middle";
    const maxTextW = w - 8;
    if (maxTextW > 20 && barH >= 10) {
      ctx.save();
      ctx.beginPath(); ctx.rect(x + 4, y, maxTextW, barH); ctx.clip();
      ctx.fillText(label, x + 6, y + barH / 2);
      ctx.restore();
    }
  }

  function drawResizeHandles(ctx, x1, y, w, edge) {
    const handleW = 4, handleH = BAR_H - 6, handleY = y + 3;
    ctx.fillStyle = lightMode ? "#333333bb" : "#ffffffbb";
    if (edge === "start" || edge === "both") {
      ctx.beginPath(); roundRect(ctx, x1 + 2, handleY, handleW, handleH, 2); ctx.fill();
    }
    if (edge === "end" || edge === "both") {
      ctx.beginPath(); roundRect(ctx, x1 + w - handleW - 2, handleY, handleW, handleH, 2); ctx.fill();
    }
  }

  function resizeSvg(totalW, totalH) {
    for (const id of ["#dep-svg", "#link-svg"]) {
      const svg = $(id);
      svg.setAttribute("width", totalW);
      svg.setAttribute("height", totalH);
      svg.style.width = totalW + "px";
      svg.style.height = totalH + "px";
    }
  }

  function renderDeps() {
    const svg = $("#dep-svg");
    svg.innerHTML = "";
    const hitSvg = $("#link-svg");
    if (!linkDrag) hitSvg.innerHTML = "";
    const taskIdx = {};
    tasks.forEach((t, i) => { taskIdx[t.id] = i; });

    const arrowColor = lightMode ? "#33333388" : "#e0e0e088";
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML = `<marker id="arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6 z" fill="${arrowColor}"/></marker>
      <marker id="arrow-hover" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6 z" fill="#ff6666"/></marker>`;
    svg.appendChild(defs);

    for (const d of deps) {
      const pi = taskIdx[d.predecessor_id];
      const si = taskIdx[d.successor_id];
      if (pi === undefined || si === undefined) continue;
      const pred = tasks[pi], succ = tasks[si];
      let x1, y1, x2, y2;
      if (d.dep_type === "FS") { x1 = pred._x2; y1 = pred._y + BAR_H/2; x2 = succ._x1; y2 = succ._y + BAR_H/2; }
      else if (d.dep_type === "SS") { x1 = pred._x1; y1 = pred._y + BAR_H/2; x2 = succ._x1; y2 = succ._y + BAR_H/2; }
      else if (d.dep_type === "FF") { x1 = pred._x2; y1 = pred._y + BAR_H/2; x2 = succ._x2; y2 = succ._y + BAR_H/2; }
      else { x1 = pred._x1; y1 = pred._y + BAR_H/2; x2 = succ._x2; y2 = succ._y + BAR_H/2; }
      const midX = x1 + (x2 - x1) / 2;
      const pathD = `M${x1},${y1} C${midX},${y1} ${midX},${y2} ${x2},${y2}`;

      // Visible arrow
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pathD);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", arrowColor);
      path.setAttribute("stroke-width", "1.5");
      path.setAttribute("marker-end", "url(#arrow)");
      path.dataset.depId = d.id;
      svg.appendChild(path);

      // Wide invisible hit area for clicking
      const hitPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      hitPath.setAttribute("d", pathD);
      hitPath.setAttribute("fill", "none");
      hitPath.setAttribute("stroke", "transparent");
      hitPath.setAttribute("stroke-width", "12");
      hitPath.classList.add("dep-hit");
      hitPath.dataset.depId = d.id;
      hitPath.dataset.predName = pred.name;
      hitPath.dataset.succName = succ.name;
      hitPath.dataset.depType = d.dep_type;

      hitPath.addEventListener("mouseenter", () => {
        path.setAttribute("stroke", "#ff6666");
        path.setAttribute("stroke-width", "2.5");
        path.setAttribute("marker-end", "url(#arrow-hover)");
      });
      hitPath.addEventListener("mouseleave", () => {
        path.setAttribute("stroke", arrowColor);
        path.setAttribute("stroke-width", "1.5");
        path.setAttribute("marker-end", "url(#arrow)");
      });
      hitPath.addEventListener("click", async (e) => {
        e.stopPropagation();
        const depId = hitPath.dataset.depId;
        const label = `${hitPath.dataset.predName} → ${hitPath.dataset.succName} (${hitPath.dataset.depType})`;
        if (confirm(`Delete dependency?\n${label}`)) {
          const dep = deps.find((d) => d.id === parseInt(depId));
          await api(`/api/dependencies/${depId}`, "DELETE");
          if (dep) pushUndo({ type: "dep-delete", data: { predecessor_id: dep.predecessor_id, successor_id: dep.successor_id, dep_type: dep.dep_type, lag: dep.lag } });
          await loadAll();
        }
      });
      if (!linkDrag) hitSvg.appendChild(hitPath);
    }

  }

  // ── Hover handling on canvas ──────────────────────────

  function hitTest(mx, my) {
    if (viewMode !== "tasks") return null;
    const rowIdx = Math.floor(my / ROW_H);
    if (rowIdx < 0 || rowIdx >= tasks.length) return null;
    const t = tasks[rowIdx];
    if (mx < t._x1 - 2 || mx > t._x2 + 2) return null;
    const nearStart = mx - t._x1 < EDGE;
    const nearEnd = t._x2 - mx < EDGE;
    let edge = null;
    if (nearStart && nearEnd) edge = "both";
    else if (nearStart) edge = "start";
    else if (nearEnd) edge = "end";
    return { taskIdx: rowIdx, edge };
  }

  function setupCanvasHover() {
    const canvas = $("#gantt-canvas");
    let lastHover = null;
    canvas.addEventListener("mousemove", (e) => {
      if (dragTask || linkDrag) return;
      const scrollArea = $("#chart-body");
      const areaRect = scrollArea.getBoundingClientRect();
      const mx = e.clientX - areaRect.left + scrollArea.scrollLeft;
      const my = e.clientY - areaRect.top + scrollArea.scrollTop;
      const hit = hitTest(mx, my);
      hoveredTaskIdx = hit ? hit.taskIdx : -1;
      const connHit = connectorHitTest(mx, my);
      if (connHit) canvas.style.cursor = "crosshair";
      else if (hit && hit.edge) canvas.style.cursor = "col-resize";
      else if (hit) canvas.style.cursor = "grab";
      else canvas.style.cursor = "default";
      const hoverKey = hit ? `${hit.taskIdx}:${hit.edge}` : null;
      if (hoverKey !== lastHover) {
        lastHover = hoverKey;
        if (viewMode === "tasks") { renderBars(hit); renderDeps(); }
      }
      // Row highlight from canvas
      let rowIdx = -1;
      if (viewMode === "tasks") {
        rowIdx = Math.floor(my / ROW_H);
        if (rowIdx >= tasks.length) rowIdx = -1;
      } else {
        for (let i = 0; i < resRowOffsets.length - 1; i++) {
          if (my >= resRowOffsets[i] && my < resRowOffsets[i + 1]) { rowIdx = i; break; }
        }
      }
      setHoveredRow(rowIdx);
      // Tooltip: blocked days + utilization
      const tooltip = $("#util-tooltip");
      const z = ZOOM_LEVELS[zoomIdx];
      const dayOffset = Math.floor((mx / z.colW) * z.days);
      const hoverDate = new Date(timeOrigin.getTime());
      hoverDate.setDate(hoverDate.getDate() + dayOffset);
      const hoverDateStr = formatDateISO(hoverDate);
      const hoveredBDs = getBlockedDaysForColumn(hoverDateStr);
      // For resource view, also check resource-specific blocked days
      let tooltipParts = [];
      if (hoveredBDs.length > 0) {
        const bdNames = [...new Set(hoveredBDs.map((bd) => bd.name))];
        tooltipParts.push(bdNames.join(", "));
      }
      if (viewMode === "resources" && rowIdx >= 0) {
        const rv = resViewRows[rowIdx];
        if (rv) {
          // Check resource-specific blocked days
          const resBDs = blockedDays.filter((bd) =>
            bd.scope === "resource" && bd.resource_id === rv.resource.id &&
            hoverDateStr >= bd.start_date && hoverDateStr <= bd.end_date
          );
          if (resBDs.length > 0) {
            const names = resBDs.map((bd) => bd.name).filter((n) => !tooltipParts.includes(n));
            if (names.length > 0) tooltipParts.push(names.join(", "));
          }
          if (Object.keys(rv.dayUtil).length > 0) {
            const dayKey = pxToTime(mx);
            const util = rv.dayUtil[dayKey];
            if (util !== undefined) tooltipParts.push(util + "% utilized");
          }
        }
      }
      if (tooltipParts.length > 0) {
        tooltip.textContent = tooltipParts.join(" · ");
        tooltip.style.display = "block";
        tooltip.style.left = (mx + 12) + "px";
        tooltip.style.top = (my - 24) + "px";
      } else {
        tooltip.style.display = "none";
      }
    });
    canvas.addEventListener("mouseleave", () => {
      if (dragTask) return;
      lastHover = null;
      setHoveredRow(-1);
      hoveredTaskIdx = -1;
      canvas.style.cursor = "default";
      if (viewMode === "tasks") { renderBars(null); renderDeps(); }
      $("#util-tooltip").style.display = "none";
    });
  }

  // ── Drag to resize bars on canvas ─────────────────────

  let dragTask = null;
  let dragMode = null;
  let dragStartX = 0;
  let dragOrigStart = "";
  let dragOrigEnd = "";

  function setupCanvasDrag() {
    const canvas = $("#gantt-canvas");
    canvas.addEventListener("dblclick", (e) => {
      if (linkDrag) return;
      const scrollArea = $("#chart-body");
      const areaRect = scrollArea.getBoundingClientRect();
      const mx = e.clientX - areaRect.left + scrollArea.scrollLeft;
      const my = e.clientY - areaRect.top + scrollArea.scrollTop;
      const taskList = viewMode === "tasks" ? tasks : resViewRows.flatMap((rv) => rv.tasks);
      const rows = viewMode === "tasks" ? tasks.length : resViewRows.length;
      const rowIdx = Math.floor(my / ROW_H);
      if (rowIdx < 0 || rowIdx >= rows) return;
      if (viewMode === "tasks") {
        const t = tasks[rowIdx];
        if (mx >= t._x1 && mx <= t._x2) openTaskModal(t);
      } else {
        const rv = resViewRows[rowIdx];
        for (const t of rv.tasks) {
          const x1 = dateToPx(t.start_date);
          const x2 = dateToPx(t.end_date) + oneDayPx();
          if (mx >= x1 && mx <= x2) { openTaskModal(tasks.find((tt) => tt.id === t.id) || t); break; }
        }
      }
    });
    canvas.addEventListener("mousedown", (e) => {
      if (viewMode !== "tasks" || linkDrag) return;
      const scrollArea = $("#chart-body");
      const areaRect = scrollArea.getBoundingClientRect();
      const mx = e.clientX - areaRect.left + scrollArea.scrollLeft;
      const my = e.clientY - areaRect.top + scrollArea.scrollTop;
      // Don't start a bar drag if clicking on a connector
      if (connectorHitTest(mx, my)) return;
      const rowIdx = Math.floor(my / ROW_H);
      if (rowIdx < 0 || rowIdx >= tasks.length) return;
      const t = tasks[rowIdx];
      if (mx < t._x1 || mx > t._x2) return;
      dragTask = t; dragStartX = mx;
      dragOrigStart = t.start_date; dragOrigEnd = t.end_date;
      if (mx - t._x1 < EDGE) dragMode = "resize-start";
      else if (t._x2 - mx < EDGE) dragMode = "resize-end";
      else dragMode = "move";
      canvas.style.cursor = dragMode === "move" ? "grabbing" : "col-resize";
      e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragTask || linkDrag) return;
      const scrollArea = $("#chart-body");
      const areaRect = scrollArea.getBoundingClientRect();
      const mx = e.clientX - areaRect.left + scrollArea.scrollLeft;
      const z = ZOOM_LEVELS[zoomIdx];
      const pxPerDay = z.colW / z.days;
      const deltaDays = Math.round((mx - dragStartX) / pxPerDay);
      if (dragMode === "move") {
        dragTask.start_date = shiftDate(dragOrigStart, deltaDays);
        dragTask.end_date = shiftDate(dragOrigEnd, deltaDays);
      } else if (dragMode === "resize-end") {
        const newEnd = shiftDate(dragOrigEnd, deltaDays);
        if (newEnd >= dragTask.start_date) dragTask.end_date = newEnd;
      } else if (dragMode === "resize-start") {
        const newStart = shiftDate(dragOrigStart, deltaDays);
        if (newStart <= dragTask.end_date) dragTask.start_date = newStart;
      }
      expandTimelineForDrag();
      renderBars(null); renderDeps();
    });
    window.addEventListener("mouseup", async () => {
      if (!dragTask) return;
      const t = dragTask; dragTask = null;
      $("#gantt-canvas").style.cursor = "default";
      if (t.start_date !== dragOrigStart || t.end_date !== dragOrigEnd) {
        // Adjust for blocked days based on drag mode
        if (dragMode === "move") {
          // Preserve original working day count when moving
          const origWorkDays = countWorkingDays(dragOrigStart, dragOrigEnd, t);
          if (origWorkDays > 0) {
            let ns = parseLocal(t.start_date);
            while (isDateBlockedForTask(formatDateISO(ns), t)) {
              ns.setDate(ns.getDate() + 1);
            }
            t.start_date = formatDateISO(ns);
            t.end_date = addWorkingDays(t.start_date, origWorkDays, t);
          }
        } else if (dragMode === "resize-start") {
          // Push start past blocked days, keep end fixed
          let ns = parseLocal(t.start_date);
          while (isDateBlockedForTask(formatDateISO(ns), t)) {
            ns.setDate(ns.getDate() + 1);
          }
          t.start_date = formatDateISO(ns);
        }
        // resize-end: user explicitly chose the new end date, don't adjust
        const snapshotBefore = tasks.map((x) => ({ id: x.id, start_date: x.start_date, end_date: x.end_date }));
        await api(`/api/tasks/${t.id}`, "PUT", { start_date: t.start_date, end_date: t.end_date });
        const origEnd = parseLocal(dragOrigEnd).getTime();
        const newEnd = parseLocal(t.end_date).getTime();
        const origStart = parseLocal(dragOrigStart).getTime();
        const newStart = parseLocal(t.start_date).getTime();
        const endDelta = Math.round((newEnd - origEnd) / 86400000);
        const startDelta = Math.round((newStart - origStart) / 86400000);
        const predDelta = Math.min(endDelta, startDelta);
        await enforceDepsFrom(t, predDelta);
        await loadAll();
        const cascaded = [];
        for (const snap of snapshotBefore) {
          if (snap.id === t.id) continue;
          const cur = tasks.find((x) => x.id === snap.id);
          if (cur && (cur.start_date !== snap.start_date || cur.end_date !== snap.end_date)) {
            cascaded.push({ id: snap.id, before: { start_date: snap.start_date, end_date: snap.end_date }, after: { start_date: cur.start_date, end_date: cur.end_date } });
          }
        }
        pushUndo({ type: "task-update-cascade", id: t.id, before: { start_date: dragOrigStart, end_date: dragOrigEnd }, after: { start_date: t.start_date, end_date: t.end_date }, cascaded });
      }
    });
  }

  // ── Dependency schedule enforcement ────────────────────

  function depScheduleShift(pred, succ, depType, lag, allowPullBack) {
    const predStart = parseLocal(pred.start_date);
    const predEnd = parseLocal(pred.end_date);
    const succStart = parseLocal(succ.start_date);
    const succEnd = parseLocal(succ.end_date);
    const succDurationDays = Math.round((succEnd - succStart) / 86400000);

    let requiredStart;
    if (depType === "FS") {
      requiredStart = new Date(predEnd);
      requiredStart.setDate(requiredStart.getDate() + 1 + lag);
    } else if (depType === "SS") {
      requiredStart = new Date(predStart);
      requiredStart.setDate(requiredStart.getDate() + lag);
    } else if (depType === "FF") {
      requiredStart = new Date(predEnd);
      requiredStart.setDate(requiredStart.getDate() + 1 + lag - succDurationDays);
    } else {
      requiredStart = new Date(predStart);
      requiredStart.setDate(requiredStart.getDate() + lag - succDurationDays);
    }

    const diffMs = requiredStart.getTime() - succStart.getTime();
    if (!allowPullBack && diffMs <= 0) return 0;
    const days = Math.round(diffMs / 86400000);
    return days;
  }

  async function enforceDepsFrom(movedTask, predDelta) {
    const depUrl = currentProjectId ? `/api/dependencies?project_id=${currentProjectId}` : "/api/dependencies";
    const taskUrl = currentProjectId ? `/api/tasks?project_id=${currentProjectId}` : "/api/tasks";
    deps = await api(depUrl);
    tasks = await api(taskUrl);
    const pred = tasks.find((t) => t.id === movedTask.id) || movedTask;
    const outDeps = deps.filter((d) => d.predecessor_id === pred.id);
    for (const d of outDeps) {
      const succ = tasks.find((t) => t.id === d.successor_id);
      if (!succ) continue;
      const shift = depScheduleShift(pred, succ, d.dep_type, d.lag, true);
      let actualShift;
      if (shift > 0) {
        // Violation: successor must push forward
        actualShift = shift;
      } else if (shift < 0 && predDelta !== undefined && predDelta < 0) {
        // Predecessor moved/shrunk left — pull successor back, but only by the predecessor's movement
        // Don't pull more than what would close a gap (preserve intentional spacing)
        actualShift = Math.max(shift, predDelta);
      } else {
        actualShift = 0;
      }
      if (actualShift !== 0) {
        succ.start_date = shiftDate(succ.start_date, actualShift);
        succ.end_date = shiftDate(succ.end_date, actualShift);
        await api(`/api/tasks/${succ.id}`, "PUT", { start_date: succ.start_date, end_date: succ.end_date });
        await enforceDepsFrom(succ, actualShift);
      }
    }
  }

  // ── Link drag (dependency creation by dragging) ──────

  let linkDrag = null; // { sourceTask, sourceEnd ("start"|"end"), targetIdx, mx, my }
  const CONNECTOR_R = 7;

  let hoveredTaskIdx = -1;
  let hoveredRowIdx = -1;

  function setHoveredRow(idx) {
    if (idx === hoveredRowIdx) return;
    hoveredRowIdx = idx;
    const rows = $("#sidebar-body").querySelectorAll(".sidebar-row");
    rows.forEach((r, i) => r.classList.toggle("row-highlight", i === idx));
    drawRowHighlight();
  }

  function drawRowHighlight() {
    const overlay = $("#row-highlight-overlay");
    if (!overlay) return;
    const canvas = $("#gantt-canvas");
    overlay.width = canvas.width;
    overlay.height = canvas.height;
    overlay.style.width = canvas.style.width;
    overlay.style.height = canvas.style.height;
    const ctx = overlay.getContext("2d");
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (hoveredRowIdx < 0) return;
    const accent = cssVar("--accent") || "#4a86c8";
    ctx.fillStyle = accent + "18";
    if (viewMode === "tasks") {
      const y = hoveredRowIdx * ROW_H;
      ctx.fillRect(0, y, canvas.width, ROW_H);
    } else if (resRowOffsets.length > hoveredRowIdx) {
      const y = resRowOffsets[hoveredRowIdx];
      const h = (resViewRows[hoveredRowIdx] && resViewRows[hoveredRowIdx]._rowH) || ROW_H;
      ctx.fillRect(0, y, canvas.width, h);
    }
  }

  function connectorHitTest(mx, my) {
    if (hoveredTaskIdx < 0 || hoveredTaskIdx >= tasks.length) return null;
    const t = tasks[hoveredTaskIdx];
    const cy = t._y + BAR_H / 2;
    const dxL = mx - t._x1, dyL = my - cy;
    if (dxL * dxL + dyL * dyL <= CONNECTOR_R * CONNECTOR_R) {
      return { taskIdx: hoveredTaskIdx, end: "start" };
    }
    const dxR = mx - t._x2, dyR = my - cy;
    if (dxR * dxR + dyR * dyR <= CONNECTOR_R * CONNECTOR_R) {
      return { taskIdx: hoveredTaskIdx, end: "end" };
    }
    return null;
  }

  function barHitTest(mx, my) {
    const rowIdx = Math.floor(my / ROW_H);
    if (rowIdx < 0 || rowIdx >= tasks.length) return -1;
    const t = tasks[rowIdx];
    if (mx >= t._x1 - 10 && mx <= t._x2 + 10) return rowIdx;
    return -1;
  }

  function setupLinkDrag() {
    const canvas = $("#gantt-canvas");

    canvas.addEventListener("mousedown", (e) => {
      if (viewMode !== "tasks" || dragTask) return;
      const scrollArea = $("#chart-body");
      const areaRect = scrollArea.getBoundingClientRect();
      const mx = e.clientX - areaRect.left + scrollArea.scrollLeft;
      const my = e.clientY - areaRect.top + scrollArea.scrollTop;
      const hit = connectorHitTest(mx, my);
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      linkDrag = {
        sourceTask: tasks[hit.taskIdx],
        sourceEnd: hit.end,
        targetIdx: -1,
        mx, my,
      };
      canvas.style.cursor = "crosshair";
    });

    window.addEventListener("mousemove", (e) => {
      if (!linkDrag) return;
      const scrollArea = $("#chart-body");
      const areaRect = scrollArea.getBoundingClientRect();
      const mx = e.clientX - areaRect.left + scrollArea.scrollLeft;
      const my = e.clientY - areaRect.top + scrollArea.scrollTop;
      linkDrag.mx = mx;
      linkDrag.my = my;
      linkDrag.targetIdx = barHitTest(mx, my);
      // Don't target self
      const srcIdx = tasks.indexOf(linkDrag.sourceTask);
      if (linkDrag.targetIdx === srcIdx) linkDrag.targetIdx = -1;
      renderBars(null);
      renderDeps();
      drawLinkDragLine();
    });

    window.addEventListener("mouseup", async (e) => {
      if (!linkDrag) return;
      const src = linkDrag.sourceTask;
      const tgtIdx = linkDrag.targetIdx;
      const sourceEnd = linkDrag.sourceEnd;
      linkDrag = null;
      $("#gantt-canvas").style.cursor = "default";
      clearLinkDragLine();
      renderBars(null);
      renderDeps();

      if (tgtIdx < 0) return;
      const tgt = tasks[tgtIdx];

      // Determine target end: which side of the target bar is the mouse closer to?
      const scrollArea = $("#chart-body");
      const areaRect = scrollArea.getBoundingClientRect();
      const mx = e.clientX - areaRect.left + scrollArea.scrollLeft;
      const tgtMidX = (tgt._x1 + tgt._x2) / 2;
      const targetEnd = mx < tgtMidX ? "start" : "end";

      // Map source end + target end to dependency type
      let depType;
      if (sourceEnd === "end" && targetEnd === "start") depType = "FS";
      else if (sourceEnd === "start" && targetEnd === "start") depType = "SS";
      else if (sourceEnd === "end" && targetEnd === "end") depType = "FF";
      else depType = "SF";

      const taskBefore = { start_date: tgt.start_date, end_date: tgt.end_date };
      const result = await api("/api/dependencies", "POST", {
        predecessor_id: src.id,
        successor_id: tgt.id,
        dep_type: depType,
      });
      if (result && result.error) {
        alert(result.error);
        return;
      }

      // Enforce schedule: shift successor if it violates the dependency
      const shift = depScheduleShift(src, tgt, depType, result.lag || 0);
      if (shift > 0) {
        await api(`/api/tasks/${tgt.id}`, "PUT", {
          start_date: shiftDate(tgt.start_date, shift),
          end_date: shiftDate(tgt.end_date, shift),
        });
        pushUndo({ type: "dep-create-shift", depId: result.id, taskId: tgt.id, taskBefore });
      } else {
        pushUndo({ type: "dep-create", id: result.id });
      }
      await loadAll();
    });
  }

  function drawLinkDragLine() {
    const svg = $("#link-svg");
    svg.innerHTML = "";
    if (!linkDrag) return;
    const src = linkDrag.sourceTask;
    const x1 = linkDrag.sourceEnd === "end" ? src._x2 : src._x1;
    const y1 = src._y + BAR_H / 2;
    const x2 = linkDrag.mx;
    const y2 = linkDrag.my;

    const dragColor = lightMode ? "#333333" : "#ffffff";
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML = `<marker id="link-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6 z" fill="${dragColor}cc"/></marker>`;
    svg.appendChild(defs);

    const midX = x1 + (x2 - x1) / 2;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", `M${x1},${y1} C${midX},${y1} ${midX},${y2} ${x2},${y2}`);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", dragColor + "aa");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-dasharray", "6,3");
    path.setAttribute("marker-end", "url(#link-arrow)");
    svg.appendChild(path);
  }

  function clearLinkDragLine() {
    $("#link-svg").innerHTML = "";
  }

  // ── Scroll sync ───────────────────────────────────────

  function setupScrollSync() {
    const chartBody = $("#chart-body");
    const chartHeader = $("#chart-header");
    const sidebarBody = $("#sidebar-body");
    chartBody.addEventListener("scroll", () => {
      chartHeader.scrollLeft = chartBody.scrollLeft;
      sidebarBody.scrollTop = chartBody.scrollTop;
    });
  }

  // ── Modals ────────────────────────────────────────────

  function addAssignmentRow(container, resId, role, allocation) {
    const r = resources.find((r) => r.id === resId);
    if (!r) return;
    const row = document.createElement("label");
    row.className = "rc-assignment-row";
    row.dataset.resId = resId;
    const roleVal = role && role !== r.role ? role : "";
    row.innerHTML = `
      <span class="rc-dot" style="background:${r.color}"></span>
      <span class="rc-name">${esc(r.name)}</span>
      <input type="text" class="rc-role" value="${esc(roleVal)}" placeholder="${esc(r.role || "Role")}" title="Role for this assignment">
      <input type="number" class="rc-alloc" min="1" max="100" value="${allocation}" title="Allocation %">
      <span class="rc-pct">%</span>
      <button type="button" class="btn btn-ghost btn-icon rc-remove" title="Remove">&times;</button>`;
    row.querySelector(".rc-remove").addEventListener("click", () => { row.remove(); });
    // Insert before the adder row
    const adder = container.querySelector(".rc-adder");
    if (adder) container.insertBefore(row, adder);
    else container.appendChild(row);
  }

  function addAssignmentAdder(container) {
    const adder = document.createElement("div");
    adder.className = "rc-adder";
    const sel = document.createElement("select");
    sel.className = "rc-add-select";
    sel.innerHTML = '<option value="">+ Add resource...</option>';
    for (const r of resources) {
      const opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = r.name + (r.role ? ` (${r.role})` : "");
      sel.appendChild(opt);
    }
    sel.addEventListener("change", () => {
      if (!sel.value) return;
      addAssignmentRow(container, parseInt(sel.value), "", 100);
      sel.value = "";
    });
    adder.appendChild(sel);
    container.appendChild(adder);
  }

  function openTaskModal(t) {
    $("#task-modal-title").textContent = t ? "Edit Task" : "New Task";
    $("#task-id").value = t ? t.id : "";
    $("#task-name").value = t ? t.name : "";
    $("#task-desc").value = t ? t.description : "";
    $("#task-start").value = t ? t.start_date : todayStr();
    $("#task-end").value = t ? t.end_date : shiftDate(todayStr(), 7);
    $("#task-progress").value = t ? t.progress : 0;
    $("#task-color").value = t ? t.color : "#4a86c8";
    $("#btn-task-delete").style.display = t ? "block" : "none";

    // Resource assignments (supports same resource multiple times with different roles)
    const cl = $("#task-resources");
    cl.innerHTML = "";
    const assignments = t ? (t.resources || []) : [];
    for (const a of assignments) {
      addAssignmentRow(cl, a.id, a.role || "", a.allocation);
    }
    addAssignmentAdder(cl);

    const projSel = $("#task-project");
    projSel.innerHTML = '<option value="">\u2014 none \u2014</option>';
    for (const p of projects) {
      const opt = document.createElement("option");
      opt.value = p.id; opt.textContent = p.name;
      if (t && t.project_id === p.id) opt.selected = true;
      else if (!t && currentProjectId && p.id === currentProjectId) opt.selected = true;
      projSel.appendChild(opt);
    }

    const parentSel = $("#task-parent");
    parentSel.innerHTML = '<option value="">\u2014 none \u2014</option>';
    for (const pt of tasks) {
      if (t && pt.id === t.id) continue;
      const opt = document.createElement("option");
      opt.value = pt.id; opt.textContent = pt.name;
      if (t && t.parent_id === pt.id) opt.selected = true;
      parentSel.appendChild(opt);
    }

    refreshAllRecents();
    syncPickerToValue("task-color");
    $("#task-modal").classList.add("open");
  }

  let resModalFromList = false;

  function openResourceModal(r, fromList) {
    resModalFromList = !!fromList;
    $("#resource-modal-title").textContent = r ? "Edit Resource" : "New Resource";
    $("#res-id").value = r ? r.id : "";
    $("#res-name").value = r ? r.name : "";
    $("#res-role").value = r ? r.role : "";
    $("#res-color").value = r ? r.color : "#4a86c8";
    $("#btn-res-delete").style.display = r ? "block" : "none";
    refreshAllRecents();
    syncPickerToValue("res-color");
    const modal = $("#resource-modal");
    modal.classList.toggle("z-above", resModalFromList);
    modal.classList.add("open");
  }

  function closeResourceModal() {
    $("#resource-modal").classList.remove("open", "z-above");
    if (resModalFromList) { resModalFromList = false; renderResourceList(); }
  }

  function openResourceListModal() {
    renderResourceList();
    $("#resource-list-modal").classList.add("open");
  }

  function updateDeleteSelectedBtn() {
    const all = $("#resource-list-body").querySelectorAll(".res-select");
    const checked = $("#resource-list-body").querySelectorAll(".res-select:checked");
    const btn = $("#btn-res-list-delete");
    btn.style.display = checked.length > 0 ? "inline-block" : "none";
    btn.textContent = checked.length > 1 ? `Delete Selected (${checked.length})` : "Delete Selected";
    const selBtn = $("#btn-res-select-all");
    if (selBtn) selBtn.textContent = (all.length > 0 && checked.length === all.length) ? "Deselect All" : "Select All";
  }

  function renderResourceList() {
    const body = $("#resource-list-body");
    body.innerHTML = "";
    if (resources.length === 0) {
      body.innerHTML = '<p style="color:var(--text-dim);font-size:13px;padding:12px 0">No resources yet.</p>';
      updateDeleteSelectedBtn();
      return;
    }
    for (const r of resources) {
      const item = document.createElement("div");
      item.className = "resource-list-item";
      item.innerHTML = `
        <input type="checkbox" class="res-select" value="${r.id}">
        <span class="resource-list-dot" style="background:${r.color}"></span>
        <span class="resource-list-name">${esc(r.name)}</span>
        <span class="resource-list-role">${esc(r.role || "\u2014")}</span>
        <span class="resource-list-actions">
          <button class="btn btn-ghost btn-icon btn-res-edit" data-id="${r.id}" title="Edit">&#9998;</button>
          <button class="btn btn-ghost btn-icon btn-res-del" data-id="${r.id}" title="Delete">&times;</button>
        </span>`;
      body.appendChild(item);
    }
    body.querySelectorAll(".res-select").forEach((cb) => {
      cb.addEventListener("change", updateDeleteSelectedBtn);
    });
    body.querySelectorAll(".btn-res-edit").forEach((btn) => {
      btn.addEventListener("click", () => {
        const r = resources.find((r) => r.id === parseInt(btn.dataset.id));
        if (r) openResourceModal(r, true);
      });
    });
    body.querySelectorAll(".btn-res-del").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (confirm("Delete this resource?")) {
          await api(`/api/resources/${btn.dataset.id}`, "DELETE");
          await loadAll();
          renderResourceList();
        }
      });
    });
    updateDeleteSelectedBtn();
  }

  let projModalFromList = false;

  function openProjectModal(p, fromList) {
    projModalFromList = !!fromList;
    $("#project-modal-title").textContent = p ? "Edit Project" : "New Project";
    $("#proj-id").value = p ? p.id : "";
    $("#proj-name").value = p ? p.name : "";
    $("#proj-desc").value = p ? p.description : "";
    $("#proj-color").value = p ? p.color : "#4a86c8";
    $("#btn-proj-delete").style.display = p ? "block" : "none";
    refreshAllRecents();
    syncPickerToValue("proj-color");
    const modal = $("#project-modal");
    modal.classList.toggle("z-above", projModalFromList);
    modal.classList.add("open");
  }

  function closeProjectModal() {
    $("#project-modal").classList.remove("open", "z-above");
    if (projModalFromList) { projModalFromList = false; renderProjectList(); }
  }

  // ── Blocked Days modal ─────────────────────────────────

  function openBlockedDaysModal() {
    renderBlockedDaysList();
    $("#blocked-days-modal").classList.add("open");
  }

  function renderBlockedDaysList() {
    const container = $("#blocked-days-list");
    if (blockedDays.length === 0) {
      container.innerHTML = '<p style="color:var(--text-dim);font-size:13px;padding:12px 0">No blocked days yet.</p>';
      return;
    }
    container.innerHTML = blockedDays.map((bd) => {
      const scopeLabel = bd.scope === "global" ? "Global" :
        bd.scope === "resource" ? (resources.find((r) => r.id === bd.resource_id)?.name || "Resource") :
        (projects.find((p) => p.id === bd.project_id)?.name || "Project");
      return `<div class="resource-list-item" data-id="${bd.id}">
        <span class="resource-list-dot" style="background:${bd.color}"></span>
        <span class="resource-list-name">${esc(bd.name)}</span>
        <span class="resource-list-role">${bd.start_date} — ${bd.end_date}</span>
        <span style="font-size:11px;color:var(--text-dim)">${scopeLabel}</span>
        <div class="resource-list-actions">
          <button class="btn btn-ghost btn-icon bd-edit" title="Edit">&#9998;</button>
          <button class="btn btn-ghost btn-icon bd-delete" title="Delete" style="color:var(--danger)">&times;</button>
        </div>
      </div>`;
    }).join("");
    container.querySelectorAll(".bd-edit").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = parseInt(btn.closest("[data-id]").dataset.id);
        openBlockedDayEditModal(blockedDays.find((bd) => bd.id === id));
      });
    });
    container.querySelectorAll(".bd-delete").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = parseInt(btn.closest("[data-id]").dataset.id);
        const oldBDs = [...blockedDays];
        await api(`/api/blocked-days/${id}`, "DELETE");
        await loadAll();
        renderBlockedDaysList();
        await adjustAllTasksForBlockedDays(oldBDs);
      });
    });
  }

  function openBlockedDayEditModal(bd) {
    const isEdit = !!bd;
    $("#blocked-day-modal-title").textContent = isEdit ? "Edit Blocked Day" : "Add Blocked Day";
    $("#bd-id").value = isEdit ? bd.id : "";
    $("#bd-name").value = isEdit ? bd.name : "";
    $("#bd-start").value = isEdit ? bd.start_date : "";
    $("#bd-end").value = isEdit ? bd.end_date : "";
    $("#bd-scope").value = isEdit ? bd.scope : "global";
    $("#bd-color").value = isEdit ? bd.color : "#ff6b6b";
    $("#btn-bd-delete").style.display = isEdit ? "" : "none";

    const resSel = $("#bd-resource");
    resSel.innerHTML = resources.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join("");
    if (isEdit && bd.resource_id) resSel.value = bd.resource_id;

    const projSel = $("#bd-project");
    projSel.innerHTML = projects.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
    if (isEdit && bd.project_id) projSel.value = bd.project_id;

    updateBdScopeVisibility();
    $("#blocked-day-modal").classList.add("open");
  }

  function updateBdScopeVisibility() {
    const scope = $("#bd-scope").value;
    $("#bd-resource-label").style.display = scope === "resource" ? "" : "none";
    $("#bd-project-label").style.display = scope === "project" ? "" : "none";
  }

  function openProjectListModal() {
    renderProjectList();
    $("#project-list-modal").classList.add("open");
  }

  function updateProjDeleteSelectedBtn() {
    const all = $("#project-list-body").querySelectorAll(".proj-select");
    const checked = $("#project-list-body").querySelectorAll(".proj-select:checked");
    const btn = $("#btn-proj-list-delete");
    btn.style.display = checked.length > 0 ? "inline-block" : "none";
    btn.textContent = checked.length > 1 ? `Delete Selected (${checked.length})` : "Delete Selected";
    const selBtn = $("#btn-proj-select-all");
    if (selBtn) selBtn.textContent = (all.length > 0 && checked.length === all.length) ? "Deselect All" : "Select All";
  }

  function renderProjectList() {
    const body = $("#project-list-body");
    body.innerHTML = "";
    if (projects.length === 0) {
      body.innerHTML = '<p style="color:var(--text-dim);font-size:13px;padding:12px 0">No projects yet.</p>';
      updateProjDeleteSelectedBtn();
      return;
    }
    for (const p of projects) {
      const taskCount = tasks.filter((t) => t.project_id === p.id).length;
      const item = document.createElement("div");
      item.className = "resource-list-item";
      item.innerHTML = `
        <input type="checkbox" class="proj-select" value="${p.id}">
        <span class="resource-list-dot" style="background:${p.color}"></span>
        <span class="resource-list-name">${esc(p.name)}</span>
        <span class="resource-list-role">${taskCount} task${taskCount !== 1 ? "s" : ""}</span>
        <span class="resource-list-actions">
          <button class="btn btn-ghost btn-icon btn-proj-export" data-id="${p.id}" title="Export">&#8681;</button>
          <button class="btn btn-ghost btn-icon btn-proj-edit" data-id="${p.id}" title="Edit">&#9998;</button>
          <button class="btn btn-ghost btn-icon btn-proj-del" data-id="${p.id}" title="Delete">&times;</button>
        </span>`;
      body.appendChild(item);
    }
    body.querySelectorAll(".proj-select").forEach((cb) => {
      cb.addEventListener("change", updateProjDeleteSelectedBtn);
    });
    body.querySelectorAll(".btn-proj-edit").forEach((btn) => {
      btn.addEventListener("click", () => {
        const p = projects.find((p) => p.id === parseInt(btn.dataset.id));
        if (p) openProjectModal(p, true);
      });
    });
    body.querySelectorAll(".btn-proj-del").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (confirm("Delete this project and all its tasks?")) {
          const pid = parseInt(btn.dataset.id);
          await api(`/api/projects/${pid}`, "DELETE");
          if (currentProjectId === pid) currentProjectId = null;
          await loadAll();
          renderProjectList();
        }
      });
    });
    body.querySelectorAll(".btn-proj-export").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const pid = parseInt(btn.dataset.id);
        const data = await api(`/api/projects/${pid}/export`);
        const p = projects.find((p) => p.id === pid);
        const now = new Date(); const stamp = now.getFullYear() + String(now.getMonth() + 1).padStart(2, "0") + String(now.getDate()).padStart(2, "0") + "-" + String(now.getHours()).padStart(2, "0") + String(now.getMinutes()).padStart(2, "0"); const filename = (p ? p.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() : "project") + `-${stamp}.json`;
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const link = document.createElement("a");
        link.download = filename;
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
      });
    });
    updateProjDeleteSelectedBtn();
  }

  async function openSettingsModal() {
    const cfg = await api("/api/config");
    $("#cfg-app-name").value = cfg.app_name || "Resource Planner";
    $("#cfg-app-version").value = cfg.app_version || "";
    $("#cfg-host").value = cfg.host;
    $("#cfg-port").value = cfg.port;
    $("#cfg-debug").value = String(cfg.debug);
    $("#cfg-db-uri").value = cfg.database_uri;
    $("#settings-modal").classList.add("open");
  }

  function openDepModal(taskCtx) {
    const predSel = $("#dep-pred");
    const succSel = $("#dep-succ");
    predSel.innerHTML = ""; succSel.innerHTML = "";
    for (const t of tasks) {
      const o1 = document.createElement("option");
      o1.value = t.id; o1.textContent = t.name;
      if (taskCtx && t.id === taskCtx.id) o1.selected = true;
      predSel.appendChild(o1);
      const o2 = document.createElement("option");
      o2.value = t.id; o2.textContent = t.name;
      succSel.appendChild(o2);
    }
    $("#dep-type").value = "FS"; $("#dep-lag").value = 0;
    $("#dep-modal").classList.add("open");
  }

  // ── Theme manager ───────────────────────────────────────

  function themePreviewHTML(vars) {
    const colors = [vars["--bg"], vars["--surface"], vars["--surface2"], vars["--accent"], vars["--danger"]];
    return colors.map((c) => `<span style="background:${c}"></span>`).join("");
  }

  function openThemeListModal() {
    const body = $("#theme-list-body");
    body.innerHTML = "";
    const all = getAllThemes();
    for (const [key, theme] of Object.entries(all)) {
      const item = document.createElement("div");
      item.className = "theme-list-item" + (key === currentTheme ? " active-theme" : "");
      const badges = [];
      if (theme.builtin) badges.push('<span class="theme-list-badge">built-in</span>');
      if (key === currentTheme) badges.push('<span class="theme-list-badge">active</span>');
      item.innerHTML = `
        <div class="theme-preview">${themePreviewHTML(theme.vars)}</div>
        <span class="theme-list-name">${esc(theme.name)}</span>
        ${badges.join("")}
        <div class="theme-list-actions">
          <button class="btn btn-ghost btn-icon btn-apply" title="Apply">&#10003;</button>
          ${theme.builtin ? '<button class="btn btn-ghost btn-icon btn-clone" title="Duplicate">&#128203;</button>' : '<button class="btn btn-ghost btn-icon btn-edit-theme" title="Edit">&#9998;</button>'}
        </div>`;
      item.querySelector(".btn-apply").addEventListener("click", (e) => {
        e.stopPropagation();
        applyTheme(key);
        openThemeListModal();
      });
      if (theme.builtin) {
        item.querySelector(".btn-clone").addEventListener("click", (e) => {
          e.stopPropagation();
          openThemeEditModal(null, theme);
        });
      } else {
        item.querySelector(".btn-edit-theme").addEventListener("click", (e) => {
          e.stopPropagation();
          openThemeEditModal(key);
        });
      }
      item.addEventListener("click", () => { applyTheme(key); openThemeListModal(); });
      body.appendChild(item);
    }
    $("#theme-list-modal").classList.add("open");
  }

  function openThemeEditModal(editKey, cloneFrom) {
    const isNew = !editKey;
    const theme = editKey ? getTheme(editKey) : null;
    const vars = theme ? theme.vars : (cloneFrom ? cloneFrom.vars : BUILTIN_THEMES.midnight.vars);
    const name = theme ? theme.name : (cloneFrom ? cloneFrom.name + " Copy" : "New Theme");

    $("#theme-edit-title").textContent = isNew ? "New Theme" : "Edit Theme";
    $("#theme-edit-key").value = editKey || "";
    $("#theme-edit-name").value = name;
    $("#theme-bg").value = vars["--bg"];
    $("#theme-surface").value = vars["--surface"];
    $("#theme-surface2").value = vars["--surface2"];
    $("#theme-border").value = vars["--border"];
    $("#theme-text").value = vars["--text"];
    $("#theme-text-dim").value = vars["--text-dim"];
    $("#theme-accent").value = vars["--accent"];
    $("#theme-danger").value = vars["--danger"];
    $("#btn-theme-delete").style.display = (editKey && !getTheme(editKey)?.builtin) ? "inline-block" : "none";
    updateThemePreview();
    $("#theme-edit-modal").classList.add("open", "z-above");
  }

  function getThemeEditVars() {
    return {
      "--bg": $("#theme-bg").value,
      "--surface": $("#theme-surface").value,
      "--surface2": $("#theme-surface2").value,
      "--border": $("#theme-border").value,
      "--text": $("#theme-text").value,
      "--text-dim": $("#theme-text-dim").value,
      "--accent": $("#theme-accent").value,
      "--danger": $("#theme-danger").value,
    };
  }

  function updateThemePreview() {
    const vars = getThemeEditVars();
    const bar = $("#theme-preview-bar");
    const colors = [
      { c: vars["--bg"], l: "BG" }, { c: vars["--surface"], l: "Srf" },
      { c: vars["--surface2"], l: "Srf2" }, { c: vars["--border"], l: "Bdr" },
      { c: vars["--text"], l: "Txt" }, { c: vars["--text-dim"], l: "Dim" },
      { c: vars["--accent"], l: "Acc" }, { c: vars["--danger"], l: "Dgr" },
    ];
    bar.innerHTML = colors.map((x) => {
      const fg = isLightTheme({ "--bg": x.c }) ? "#000" : "#fff";
      return `<span style="flex:1;background:${x.c};display:flex;align-items:center;justify-content:center;color:${fg};font-size:9px;font-weight:600">${x.l}</span>`;
    }).join("");
  }

  function themeKeyFromName(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "custom";
  }

  function closeThemeEditModal() {
    $("#theme-edit-modal").classList.remove("open", "z-above");
  }

  function closeAllModals() {
    document.querySelectorAll(".modal-overlay").forEach((m) => m.classList.remove("open", "z-above"));
  }

  // ── Context menu ──────────────────────────────────────

  let ctxTask = null;
  function showCtxMenu(e, t) {
    e.preventDefault(); ctxTask = t;
    const menu = $("#ctx-menu");
    menu.style.display = "block";
    menu.style.left = e.clientX + "px";
    menu.style.top = e.clientY + "px";
  }
  document.addEventListener("click", () => { $("#ctx-menu").style.display = "none"; });

  // ── View toggle ───────────────────────────────────────

  function setView(mode) {
    viewMode = mode;
    colWidths = null;
    saveUIState();
    $("#btn-view-tasks").classList.toggle("active", mode === "tasks");
    $("#btn-view-resources").classList.toggle("active", mode === "resources");
    if (mode === "tasks") {
      $(".sidebar-header").innerHTML = `<span class="col-name" data-col="0" title="Task">Task<span class="col-resize-handle"></span></span><span class="col-dates" data-col="1" title="Start Date">Start<span class="col-resize-handle"></span></span><span class="col-dates" data-col="2" title="End Date">End<span class="col-resize-handle"></span></span><span class="col-resource" data-col="3" title="Resource">Resource</span>`;
    }
    computeTimeline();
    render();
  }

  // ── Export PNG ─────────────────────────────────────────

  function buildExportCanvas(showSidebarOverride, callback) {
    if (typeof showSidebarOverride === "function") { callback = showSidebarOverride; showSidebarOverride = !sidebarCollapsed; }
    const DPR = 2;
    const canvas = $("#gantt-canvas");
    const depSvg = $("#dep-svg");
    const sidebar = $("#gantt-sidebar");
    const sidebarBody = $("#sidebar-body");
    const z = ZOOM_LEVELS[zoomIdx];

    const sidebarVisible = showSidebarOverride;
    const headerH = 48;

    // Measure sidebar columns, ensuring minimum widths for readability
    const hdrSpans = Array.from(sidebar.querySelector(".sidebar-header").children);
    const exportColWidths = hdrSpans.map((s) => {
      const rendered = s.getBoundingClientRect().width;
      return Math.max(rendered, 80);
    });
    // Give resource/name columns extra space in export
    const lastColIdx = exportColWidths.length - 1;
    if (exportColWidths[lastColIdx] < 160) exportColWidths[lastColIdx] = 160;
    if (exportColWidths[0] < 120) exportColWidths[0] = 120;
    const sbW = sidebarVisible ? exportColWidths.reduce((a, b) => a + b, 0) : 0;

    let maxBarPx = 0;
    for (const t of tasks) {
      const barEnd = dateToPx(t.end_date) + oneDayPx();
      if (barEnd > maxBarPx) maxBarPx = barEnd;
    }
    const chartPad = z.colW * 3;
    const chartW = Math.min(canvas.width, Math.ceil(maxBarPx + chartPad));
    const chartH = canvas.height;
    const totalW = sbW + chartW;
    const totalH = headerH + chartH;
    const exportCols = Math.ceil(chartW / z.colW);

    const out = document.createElement("canvas");
    out.width = totalW * DPR;
    out.height = totalH * DPR;
    out.style.width = totalW + "px";
    out.style.height = totalH + "px";
    const ctx = out.getContext("2d");
    ctx.scale(DPR, DPR);

    const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    const colBg = css("--bg") || "#1a1a2e";
    const colSurface = css("--surface") || "#16213e";
    const colBorder = css("--border") || "#1a4080";
    const colText = css("--text") || "#e0e0e0";
    const colDim = css("--text-dim") || "#8899aa";

    ctx.fillStyle = colBg;
    ctx.fillRect(0, 0, totalW, totalH);

    if (sidebarVisible) {
      ctx.fillStyle = colSurface;
      ctx.fillRect(0, 0, sbW, totalH);
      ctx.strokeStyle = colBorder;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(sbW, 0); ctx.lineTo(sbW, totalH); ctx.stroke();

      ctx.font = "600 11px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = colDim;
      let colX = 0;
      for (let i = 0; i < hdrSpans.length; i++) {
        const w = exportColWidths[i];
        ctx.fillText(hdrSpans[i].textContent.trim(), colX + 8, headerH / 2 + 4);
        ctx.strokeStyle = colBorder;
        if (i < hdrSpans.length - 1) {
          ctx.beginPath(); ctx.moveTo(colX + w, 0); ctx.lineTo(colX + w, headerH); ctx.stroke();
        }
        colX += w;
      }
      ctx.strokeStyle = colBorder;
      ctx.beginPath(); ctx.moveTo(0, headerH); ctx.lineTo(sbW, headerH); ctx.stroke();

      const rows = sidebarBody.children;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowH = (viewMode === "resources" && resViewRows[i] && resViewRows[i]._rowH) ? resViewRows[i]._rowH : ROW_H;
        const y = viewMode === "resources" ? headerH + (resRowOffsets[i] || 0) : headerH + i * ROW_H;
        if (i % 2 === 1) {
          ctx.fillStyle = colBorder + "20";
          ctx.fillRect(0, y, sbW, rowH);
        }
        const spans = Array.from(row.children);
        let cx = 0;
        for (let j = 0; j < spans.length; j++) {
          const w = j < exportColWidths.length ? exportColWidths[j] : spans[j].offsetWidth;
          const isDim = spans[j].classList.contains("col-dates");
          ctx.fillStyle = isDim ? colDim : colText;
          ctx.font = isDim ? "11px -apple-system, BlinkMacSystemFont, sans-serif"
                           : "13px -apple-system, BlinkMacSystemFont, sans-serif";
          ctx.save();
          ctx.beginPath();
          ctx.rect(cx, y, w, rowH);
          ctx.clip();
          ctx.fillText(spans[j].textContent.trim(), cx + 8, y + rowH / 2 + 4);
          ctx.restore();
          cx += w;
        }
        ctx.strokeStyle = colBorder;
        ctx.beginPath(); ctx.moveTo(0, y + rowH); ctx.lineTo(sbW, y + rowH); ctx.stroke();
      }
    }

    ctx.font = "600 11px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillStyle = colDim;
    ctx.strokeStyle = colBorder;
    for (let i = 0; i < exportCols; i++) {
      const d = new Date(timeOrigin.getTime() + i * z.days * 86400000);
      const x = sbW + i * z.colW;
      if (z.days <= 1) {
        ctx.fillText(String(d.getDate()), x + 4, headerH / 2);
        ctx.save(); ctx.font = "10px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText(MONTHS[d.getMonth()], x + 4, headerH / 2 + 12);
        ctx.restore(); ctx.font = "600 11px -apple-system, BlinkMacSystemFont, sans-serif";
      } else if (z.days <= 7) {
        ctx.fillText(MONTHS[d.getMonth()] + " " + d.getDate(), x + 4, headerH / 2 + 4);
      } else {
        ctx.fillText(MONTHS[d.getMonth()] + " " + d.getDate(), x + 4, headerH / 2);
        ctx.save(); ctx.font = "10px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText(String(d.getFullYear()), x + 4, headerH / 2 + 12);
        ctx.restore(); ctx.font = "600 11px -apple-system, BlinkMacSystemFont, sans-serif";
      }
      ctx.beginPath(); ctx.moveTo(x + z.colW, 0); ctx.lineTo(x + z.colW, headerH); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(sbW, headerH); ctx.lineTo(totalW, headerH); ctx.stroke();

    // Re-render the chart at full DPR resolution for crisp bars/text
    const hiCanvas = document.createElement("canvas");
    hiCanvas.width = chartW * DPR;
    hiCanvas.height = chartH * DPR;
    const hiCtx = hiCanvas.getContext("2d");
    hiCtx.scale(DPR, DPR);

    // Temporarily draw bars onto the hi-res canvas
    const origCanvas = $("#gantt-canvas");
    const origWidth = origCanvas.width;
    const origHeight = origCanvas.height;
    // Re-use the rendering functions with our hi-res canvas
    hiCtx.clearRect(0, 0, chartW, chartH);
    if (viewMode === "resources") {
      drawGridVariable(hiCtx, chartW, chartH, z);
    } else {
      drawGrid(hiCtx, chartW, chartH, z, tasks.length);
    }
    // Alternating row stripes on chart
    const stripColor = (cssVar("--border") || "#1a4080") + "20";
    hiCtx.fillStyle = stripColor;
    if (viewMode === "tasks") {
      for (let i = 1; i < tasks.length; i += 2) {
        hiCtx.fillRect(0, i * ROW_H, chartW, ROW_H);
      }
    } else {
      for (let i = 1; i < resViewRows.length; i += 2) {
        const ry = resRowOffsets[i] || 0;
        const rh = resViewRows[i]._rowH || ROW_H;
        hiCtx.fillRect(0, ry, chartW, rh);
      }
    }
    drawToday(hiCtx, chartW, chartH, z);
    if (viewMode === "tasks") {
      for (let i = 0; i < tasks.length; i++) {
        const t = tasks[i];
        const x1 = dateToPx(t.start_date);
        const x2 = dateToPx(t.end_date) + oneDayPx();
        const y = i * ROW_H + BAR_PAD;
        const w = Math.max(x2 - x1, 8);
        const barLabel = sidebarCollapsed && t.resources && t.resources.length
          ? t.name + " \u2014 " + t.resources.map((r) => r.role ? `${r.name} [${r.role}]` : r.name).join(", ")
          : t.name;
        const unstaffed = !t.resource_ids || t.resource_ids.length === 0;
        drawBar(hiCtx, x1, y, w, t.color, t.progress, barLabel, null, unstaffed);
        if (t.resources && t.resources.length > 0) {
          const dotR = Math.max(2, Math.min(BAR_H * 0.12, 4));
          const dotY = y + BAR_H - dotR - 1;
          for (let d = 0; d < t.resources.length; d++) {
            const dotX = x1 + 8 + d * (dotR * 2 + 2);
            if (dotX + dotR > x1 + w - 4) break;
            hiCtx.fillStyle = t.resources[d].color;
            hiCtx.beginPath();
            hiCtx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
            hiCtx.fill();
          }
        }
      }
    } else {
      for (let ri = 0; ri < resViewRows.length; ri++) {
        const rv = resViewRows[ri];
        const rowY = resRowOffsets[ri];
        const asns = rv.assignments;
        const laneH = rv._laneH;
        const gap = rv._laneCount > 1 ? 1 : 0;
        for (let i = 0; i < asns.length; i++) {
          const a = asns[i];
          const t = a.task;
          const x1 = dateToPx(t.start_date);
          const x2 = dateToPx(t.end_date) + oneDayPx();
          const w = Math.max(x2 - x1, 8);
          const barH = laneH - gap;
          const y = rowY + BAR_PAD + rv._lanes[i] * laneH;
          const meta = a.role && a.allocation !== 100 ? ` (${a.role} | ${a.allocation}%)` : a.role ? ` (${a.role})` : a.allocation !== 100 ? ` (${a.allocation}%)` : "";
          const label = t.name + meta;
          drawBar(hiCtx, x1, y, w, t.color, t.progress, label, barH);
        }
        if (rv._utilH > 0) {
          drawUtilChart(hiCtx, rv, rowY + rv._rowH - rv._utilH, rv._utilH, chartW);
        }
      }
    }

    // Draw hi-res chart onto export canvas (source is DPR-scaled pixels, dest is in logical coords with DPR transform)
    ctx.drawImage(hiCanvas, 0, 0, hiCanvas.width, hiCanvas.height, sbW, headerH, chartW, chartH);

    // Draw SVG dependency arrows — clip to same area as chart
    const svgClone = depSvg.cloneNode(true);
    svgClone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svgClone.setAttribute("width", chartW);
    svgClone.setAttribute("height", chartH);
    svgClone.setAttribute("viewBox", `0 0 ${chartW} ${chartH}`);
    const svgData = new XMLSerializer().serializeToString(svgClone);
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, sbW, headerH, chartW, chartH);
      URL.revokeObjectURL(url);
      callback(out);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      callback(out);
    };
    img.src = url;
  }

  function exportFilename(ext) {
    const p = projects.find((p) => p.id === currentProjectId);
    const proj = p ? p.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() : "all-projects";
    const now = new Date();
    const stamp = now.getFullYear() + String(now.getMonth() + 1).padStart(2, "0") + String(now.getDate()).padStart(2, "0") + "-" + String(now.getHours()).padStart(2, "0") + String(now.getMinutes()).padStart(2, "0");
    return `export-${proj}-${viewMode}-${stamp}.${ext}`;
  }

  function exportPNG() {
    const inlineRes = $("#export-inline-resources").checked;
    exportWithOptions(inlineRes, (out) => triggerDownload(out, exportFilename("png")));
  }

  function exportWithOptions(inlineResources, callback) {
    const origCollapsed = sidebarCollapsed;
    if (inlineResources) {
      sidebarCollapsed = true;
      if (viewMode === "tasks") { renderBars(); renderDeps(); }
    }
    const showSidebar = !origCollapsed;
    buildExportCanvas(showSidebar, (out) => {
      if (sidebarCollapsed !== origCollapsed) {
        sidebarCollapsed = origCollapsed;
        if (viewMode === "tasks") { renderBars(); renderDeps(); }
      }
      callback(out);
    });
  }

  function triggerDownload(canvasEl, filename) {
    const link = document.createElement("a");
    link.download = filename || "gantt-export.png";
    link.href = canvasEl.toDataURL("image/png");
    link.click();
  }

  function exportPDF() {
    const inlineRes = $("#export-inline-resources").checked;
    exportWithOptions(inlineRes, (out) => {
      const imgDataUrl = out.toDataURL("image/jpeg", 0.92);
      const imgBase64 = imgDataUrl.split(",")[1];
      const raw = atob(imgBase64);
      const imgBytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) imgBytes[i] = raw.charCodeAt(i);

      const w = out.width;
      const h = out.height;
      // Page sized to content at 1:1 logical pixels (image is 2x so it stays sharp)
      const imgW = Math.round(w / 2);
      const imgH = Math.round(h / 2);
      const pageW = imgW + 40;
      const pageH = imgH + 40;

      // Build PDF objects
      const objs = [];
      const addObj = (s) => { objs.push(s); return objs.length; };

      addObj(`<< /Type /Catalog /Pages 2 0 R >>`);
      addObj(`<< /Type /Pages /Kids [3 0 R] /Count 1 >>`);
      addObj(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents 4 0 R /Resources << /XObject << /Img 5 0 R >> >> >>`);

      const content = `q ${imgW} 0 0 ${imgH} 20 20 cm /Img Do Q`;
      addObj(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      // Object 5 is the image — will be handled specially due to binary stream

      // Assemble text portion up to image stream
      let body = "%PDF-1.4\n";
      const offsets = [];
      for (let i = 0; i < objs.length; i++) {
        offsets.push(body.length);
        body += `${i + 1} 0 obj\n${objs[i]}\nendobj\n`;
      }

      // Image object header
      const imgObjHeader = `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgBytes.length} >>\nstream\n`;
      const imgObjFooter = `\nendstream\nendobj\n`;

      const preImg = new TextEncoder().encode(body);
      const imgHeader = new TextEncoder().encode(imgObjHeader);
      const imgFooter = new TextEncoder().encode(imgObjFooter);

      offsets.push(preImg.length); // offset for obj 5

      const xrefStart = preImg.length + imgHeader.length + imgBytes.length + imgFooter.length;

      let xref = `xref\n0 6\n0000000000 65535 f \n`;
      for (let i = 0; i < offsets.length; i++) {
        xref += String(offsets[i]).padStart(10, "0") + ` 00000 n \n`;
      }
      xref += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

      const xrefBytes = new TextEncoder().encode(xref);

      const pdfBlob = new Blob([preImg, imgHeader, imgBytes, imgFooter, xrefBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.download = exportFilename("pdf");
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    });
  }

  // ── Event bindings ────────────────────────────────────

  function setupEvents() {
    $("#btn-add-task").addEventListener("click", () => openTaskModal(null));
    $("#btn-undo").addEventListener("click", () => undo());
    $("#btn-redo").addEventListener("click", () => redo());
    $("#btn-manage-resources").addEventListener("click", () => openResourceListModal());
    $("#btn-blocked-days").addEventListener("click", () => openBlockedDaysModal());
    $("#btn-blocked-days-close").addEventListener("click", () => { $("#blocked-days-modal").classList.remove("open"); });
    $("#btn-add-blocked-day").addEventListener("click", () => openBlockedDayEditModal(null));
    $("#btn-bd-cancel").addEventListener("click", () => { $("#blocked-day-modal").classList.remove("open"); });
    $("#bd-scope").addEventListener("change", updateBdScopeVisibility);
    $("#btn-bd-delete").addEventListener("click", async () => {
      const id = $("#bd-id").value;
      if (id) {
        const oldBDs = [...blockedDays];
        await api(`/api/blocked-days/${id}`, "DELETE");
        $("#blocked-day-modal").classList.remove("open");
        await loadAll();
        renderBlockedDaysList();
        await adjustAllTasksForBlockedDays(oldBDs);
      }
    });
    $("#blocked-day-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = $("#bd-id").value;
      const scope = $("#bd-scope").value;
      const data = {
        name: $("#bd-name").value,
        start_date: $("#bd-start").value,
        end_date: $("#bd-end").value,
        scope,
        resource_id: scope === "resource" ? parseInt($("#bd-resource").value) : null,
        project_id: scope === "project" ? parseInt($("#bd-project").value) : null,
        color: $("#bd-color").value,
      };
      const prevBDs = [...blockedDays];
      if (id) {
        await api(`/api/blocked-days/${id}`, "PUT", data);
      } else {
        await api("/api/blocked-days", "POST", data);
      }
      $("#blocked-day-modal").classList.remove("open");
      await loadAll();
      renderBlockedDaysList();
      await adjustAllTasksForBlockedDays(prevBDs);
    });
    $("#btn-add-project").addEventListener("click", () => openProjectModal(null));
    $("#btn-edit-project").addEventListener("click", () => {
      const p = projects.find((p) => p.id === currentProjectId);
      if (p) openProjectModal(p);
    });
    $("#btn-manage-projects").addEventListener("click", () => openProjectListModal());
    $("#btn-export-project").addEventListener("click", async () => {
      if (!currentProjectId) return;
      const data = await api(`/api/projects/${currentProjectId}/export`);
      const p = projects.find((p) => p.id === currentProjectId);
      const now = new Date(); const stamp = now.getFullYear() + String(now.getMonth() + 1).padStart(2, "0") + String(now.getDate()).padStart(2, "0") + "-" + String(now.getHours()).padStart(2, "0") + String(now.getMinutes()).padStart(2, "0"); const filename = (p ? p.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() : "project") + `-${stamp}.json`;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.download = filename;
      link.href = URL.createObjectURL(blob);
      link.click();
      URL.revokeObjectURL(link.href);
    });
    $("#btn-import-project").addEventListener("click", () => { $("#import-file-input").click(); });
    $("#btn-settings").addEventListener("click", () => openSettingsModal());
    $("#btn-export").addEventListener("click", () => { $("#export-modal").classList.add("open"); });
    $("#btn-export-close").addEventListener("click", () => { $("#export-modal").classList.remove("open"); });
    $("#btn-export-png").addEventListener("click", () => { $("#export-modal").classList.remove("open"); exportPNG(); });
    $("#btn-export-pdf").addEventListener("click", () => { $("#export-modal").classList.remove("open"); exportPDF(); });
    $("#btn-themes").addEventListener("click", () => openThemeListModal());
    $("#btn-help").addEventListener("click", () => { $("#help-modal").classList.add("open"); });
    $("#btn-help-close").addEventListener("click", () => { $("#help-modal").classList.remove("open"); });
    $("#btn-docs").addEventListener("click", async () => {
      const data = await api("/api/readme");
      $("#docs-content").innerHTML = renderMarkdown(data.content || "");
      $("#docs-modal").classList.add("open");
    });
    $("#btn-docs-close").addEventListener("click", () => { $("#docs-modal").classList.remove("open"); });
    $("#btn-seed").addEventListener("click", async () => {
      await api("/api/seed", "POST");
      closeAllModals();
      await loadAll();
    });
    $("#btn-reset-all").addEventListener("click", async () => {
      if (!confirm("This will permanently delete ALL projects, tasks, resources, and dependencies.\n\nAre you sure?")) return;
      if (!confirm("This cannot be undone. Continue?")) return;
      await api("/api/reset", "POST");
      closeAllModals();
      currentProjectId = null;
      await loadAll();
    });

    // View toggle
    $("#btn-view-tasks").addEventListener("click", () => setView("tasks"));
    $("#btn-view-resources").addEventListener("click", () => setView("resources"));

    // Project selector
    $("#project-select").addEventListener("change", (e) => {
      currentProjectId = e.target.value ? parseInt(e.target.value) : null;
      saveUIState();
      loadAll();
    });

    // Horizontal zoom
    $("#btn-zoom-in").addEventListener("click", () => {
      if (zoomIdx > 0) { zoomIdx--; $("#zoom-label").textContent = ZOOM_LEVELS[zoomIdx].name; saveUIState(); computeTimeline(); render(); }
    });
    $("#btn-zoom-out").addEventListener("click", () => {
      if (zoomIdx < ZOOM_LEVELS.length - 1) { zoomIdx++; $("#zoom-label").textContent = ZOOM_LEVELS[zoomIdx].name; saveUIState(); computeTimeline(); render(); }
    });

    // Vertical zoom
    $("#btn-vzoom-in").addEventListener("click", () => {
      if (vZoomIdx < V_ZOOM_LEVELS.length - 1) { vZoomIdx++; applyVZoom(); saveUIState(); render(); }
    });
    $("#btn-vzoom-out").addEventListener("click", () => {
      if (vZoomIdx > 0) { vZoomIdx--; applyVZoom(); saveUIState(); render(); }
    });

    // Font size
    $("#btn-font-up").addEventListener("click", () => {
      if (fontIdx < FONT_LEVELS.length - 1) { fontIdx++; applyFontZoom(); saveUIState(); render(); }
    });
    $("#btn-font-down").addEventListener("click", () => {
      if (fontIdx > 0) { fontIdx--; applyFontZoom(); saveUIState(); render(); }
    });

    // Task form — collects resource_ids from checkboxes
    $("#task-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const startVal = $("#task-start").value;
      const endVal = $("#task-end").value;
      if (startVal && endVal && endVal < startVal) {
        alert("End date cannot be before start date.");
        return;
      }
      const id = $("#task-id").value;
      const color = $("#task-color").value;
      saveRecentColor(color);
      const resourceIds = Array.from($("#task-resources").querySelectorAll(".rc-assignment-row"))
        .map((row) => {
          const entry = { id: parseInt(row.dataset.resId), allocation: parseInt(row.querySelector(".rc-alloc").value) || 100 };
          const roleVal = row.querySelector(".rc-role").value.trim();
          if (roleVal) entry.role = roleVal;
          return entry;
        });
      const data = {
        name: $("#task-name").value,
        description: $("#task-desc").value,
        start_date: startVal,
        end_date: endVal,
        progress: parseInt($("#task-progress").value) || 0,
        resource_ids: resourceIds,
        color: color,
        parent_id: $("#task-parent").value ? parseInt($("#task-parent").value) : null,
        project_id: $("#task-project").value ? parseInt($("#task-project").value) : null,
      };
      // Adjust dates for blocked days only if user changed the dates
      const oldTask = id ? tasks.find((x) => x.id === parseInt(id)) : null;
      const datesChanged = !oldTask || oldTask.start_date !== startVal || oldTask.end_date !== endVal;
      if (datesChanged) {
        const tempTask = { ...data, resource_ids: resourceIds.map((r) => r.id || r) };
        const calDays = Math.round((parseLocal(data.end_date) - parseLocal(data.start_date)) / 86400000) + 1;
        if (calDays > 0) {
          let ns = parseLocal(tempTask.start_date);
          while (isDateBlockedForTask(formatDateISO(ns), tempTask)) {
            ns.setDate(ns.getDate() + 1);
          }
          const adjStart = formatDateISO(ns);
          const adjEnd = addWorkingDays(adjStart, calDays, tempTask);
          if (adjStart !== data.start_date || adjEnd !== data.end_date) {
            data.start_date = adjStart;
            data.end_date = adjEnd;
          }
        }
      }
      if (id) {
        const before = oldTask ? {
          name: oldTask.name, description: oldTask.description,
          start_date: oldTask.start_date, end_date: oldTask.end_date,
          progress: oldTask.progress, color: oldTask.color,
          resource_ids: oldTask.resources.map((r) => ({ id: r.id, allocation: r.allocation, role: r.role || undefined })),
          parent_id: oldTask.parent_id, project_id: oldTask.project_id,
        } : null;
        await api(`/api/tasks/${id}`, "PUT", data);
        if (before) pushUndo({ type: "task-update", id: parseInt(id), before });
      } else {
        const result = await api("/api/tasks", "POST", data);
        if (result && result.id) pushUndo({ type: "task-create", id: result.id });
      }
      closeAllModals();
      await loadAll();
    });

    $("#btn-task-cancel").addEventListener("click", closeAllModals);
    $("#btn-task-delete").addEventListener("click", async () => {
      const id = $("#task-id").value;
      if (id && confirm("Delete this task?")) {
        const oldTask = tasks.find((x) => x.id === parseInt(id));
        const taskDeps = deps.filter((d) => d.predecessor_id === parseInt(id) || d.successor_id === parseInt(id));
        await api(`/api/tasks/${id}`, "DELETE");
        if (oldTask) {
          pushUndo({
            type: "task-delete", oldId: parseInt(id),
            data: {
              name: oldTask.name, description: oldTask.description,
              start_date: oldTask.start_date, end_date: oldTask.end_date,
              progress: oldTask.progress, color: oldTask.color,
              resource_ids: oldTask.resources.map((r) => ({ id: r.id, allocation: r.allocation, role: r.role || undefined })),
              parent_id: oldTask.parent_id, project_id: oldTask.project_id,
              sort_order: oldTask.sort_order,
            },
            deps: taskDeps.map((d) => ({ predecessor_id: d.predecessor_id, successor_id: d.successor_id, dep_type: d.dep_type, lag: d.lag })),
          });
        }
        closeAllModals(); await loadAll();
      }
    });

    // Resource form
    $("#resource-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = $("#res-id").value;
      const color = $("#res-color").value;
      saveRecentColor(color);
      const data = { name: $("#res-name").value, role: $("#res-role").value, color };
      if (id) await api(`/api/resources/${id}`, "PUT", data);
      else await api("/api/resources", "POST", data);
      await loadAll();
      closeResourceModal();
    });
    $("#btn-res-cancel").addEventListener("click", closeResourceModal);
    $("#btn-res-delete").addEventListener("click", async () => {
      const id = $("#res-id").value;
      if (id && confirm("Delete this resource?")) {
        await api(`/api/resources/${id}`, "DELETE");
        await loadAll(); closeResourceModal();
      }
    });

    // Resource list
    $("#btn-add-resource-from-list").addEventListener("click", () => openResourceModal(null, true));
    $("#btn-res-select-all").addEventListener("click", () => {
      const cbs = $("#resource-list-body").querySelectorAll(".res-select");
      const allChecked = cbs.length > 0 && Array.from(cbs).every((cb) => cb.checked);
      cbs.forEach((cb) => { cb.checked = !allChecked; });
      $("#btn-res-select-all").textContent = allChecked ? "Select All" : "Deselect All";
      updateDeleteSelectedBtn();
    });
    $("#btn-res-list-delete").addEventListener("click", async () => {
      const checked = Array.from($("#resource-list-body").querySelectorAll(".res-select:checked"));
      if (!checked.length) return;
      const count = checked.length;
      if (!confirm(`Delete ${count} resource${count > 1 ? "s" : ""}?`)) return;
      for (const cb of checked) {
        await api(`/api/resources/${cb.value}`, "DELETE");
      }
      await loadAll();
      renderResourceList();
    });
    $("#btn-res-list-close").addEventListener("click", () => { $("#resource-list-modal").classList.remove("open"); });

    // Project form
    $("#project-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = $("#proj-id").value;
      const color = $("#proj-color").value;
      saveRecentColor(color);
      const data = { name: $("#proj-name").value, description: $("#proj-desc").value, color };
      if (id) await api(`/api/projects/${id}`, "PUT", data);
      else { const created = await api("/api/projects", "POST", data); currentProjectId = created.id; }
      await loadAll();
      closeProjectModal();
    });
    $("#btn-proj-cancel").addEventListener("click", closeProjectModal);
    $("#btn-proj-delete").addEventListener("click", async () => {
      const id = $("#proj-id").value;
      if (id && confirm("Delete this project and all its tasks?")) {
        await api(`/api/projects/${id}`, "DELETE");
        if (currentProjectId === parseInt(id)) currentProjectId = null;
        await loadAll();
        closeProjectModal();
      }
    });

    // Project list
    $("#btn-add-project-from-list").addEventListener("click", () => openProjectModal(null, true));
    $("#btn-proj-select-all").addEventListener("click", () => {
      const cbs = $("#project-list-body").querySelectorAll(".proj-select");
      const allChecked = cbs.length > 0 && Array.from(cbs).every((cb) => cb.checked);
      cbs.forEach((cb) => { cb.checked = !allChecked; });
      $("#btn-proj-select-all").textContent = allChecked ? "Select All" : "Deselect All";
      updateProjDeleteSelectedBtn();
    });
    $("#btn-proj-list-delete").addEventListener("click", async () => {
      const checked = Array.from($("#project-list-body").querySelectorAll(".proj-select:checked"));
      if (!checked.length) return;
      const count = checked.length;
      if (!confirm(`Delete ${count} project${count > 1 ? "s" : ""} and all their tasks?`)) return;
      for (const cb of checked) {
        const pid = parseInt(cb.value);
        await api(`/api/projects/${pid}`, "DELETE");
        if (currentProjectId === pid) currentProjectId = null;
      }
      await loadAll();
      renderProjectList();
    });
    $("#btn-proj-list-close").addEventListener("click", () => { $("#project-list-modal").classList.remove("open"); });
    $("#btn-proj-import").addEventListener("click", () => { $("#import-file-input").click(); });
    $("#import-file-input").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const result = await api("/api/projects/import", "POST", data);
        if (result && result.error) { alert(result.error); return; }
        currentProjectId = result.id;
        await loadAll();
        renderProjectList();
      } catch (err) {
        alert("Failed to import: " + err.message);
      }
      e.target.value = "";
    });

    // Settings form
    $("#settings-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const appName = $("#cfg-app-name").value;
      const appVersion = $("#cfg-app-version").value;
      await api("/api/config", "PUT", {
        app_name: appName, app_version: appVersion, host: $("#cfg-host").value,
        port: parseInt($("#cfg-port").value), debug: $("#cfg-debug").value === "true",
        database_uri: $("#cfg-db-uri").value,
      });
      const title = appVersion ? `${appName} ${appVersion}` : appName;
      $("#app-title").textContent = title; document.title = title;
      closeAllModals();
    });
    $("#btn-settings-cancel").addEventListener("click", closeAllModals);

    // Theme manager
    $("#btn-add-theme").addEventListener("click", () => openThemeEditModal(null));
    $("#btn-theme-list-close").addEventListener("click", () => { $("#theme-list-modal").classList.remove("open"); });
    $("#btn-export-themes").addEventListener("click", () => {
      const data = { version: 1, themes: customThemes };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "themes.json";
      a.click();
      URL.revokeObjectURL(url);
    });
    $("#btn-import-themes").addEventListener("click", () => { $("#theme-import-file").click(); });
    $("#theme-import-file").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          const imported = data.themes || data;
          let count = 0;
          for (const [key, theme] of Object.entries(imported)) {
            if (!theme.name || !theme.vars) continue;
            let finalKey = key;
            if (BUILTIN_THEMES[finalKey]) finalKey = finalKey + "-custom";
            customThemes[finalKey] = { name: theme.name, vars: theme.vars };
            count++;
          }
          saveCustomThemes();
          openThemeListModal();
          alert(`Imported ${count} theme${count !== 1 ? "s" : ""}.`);
        } catch { alert("Invalid theme file."); }
      };
      reader.readAsText(file);
      e.target.value = "";
    });
    $("#btn-theme-edit-cancel").addEventListener("click", closeThemeEditModal);
    // Live preview as colors change
    for (const id of ["theme-bg","theme-surface","theme-surface2","theme-border","theme-text","theme-text-dim","theme-accent","theme-danger"]) {
      document.getElementById(id).addEventListener("input", updateThemePreview);
    }
    $("#theme-edit-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const editKey = $("#theme-edit-key").value;
      const name = $("#theme-edit-name").value.trim();
      if (!name) return;
      const vars = getThemeEditVars();
      let finalKey;
      if (editKey) {
        finalKey = editKey;
      } else {
        finalKey = themeKeyFromName(name);
        if (BUILTIN_THEMES[finalKey] || customThemes[finalKey]) {
          let i = 2;
          while (BUILTIN_THEMES[finalKey + "-" + i] || customThemes[finalKey + "-" + i]) i++;
          finalKey = finalKey + "-" + i;
        }
      }
      customThemes[finalKey] = { name, vars };
      saveCustomThemes();
      applyTheme(finalKey);
      closeThemeEditModal();
      openThemeListModal();
    });
    $("#btn-theme-delete").addEventListener("click", () => {
      const key = $("#theme-edit-key").value;
      if (!key || BUILTIN_THEMES[key]) return;
      if (!confirm("Delete this theme?")) return;
      delete customThemes[key];
      saveCustomThemes();
      if (currentTheme === key) applyTheme("midnight");
      closeThemeEditModal();
      openThemeListModal();
    });

    // Dependency form
    $("#dep-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = {
        predecessor_id: parseInt($("#dep-pred").value),
        successor_id: parseInt($("#dep-succ").value),
        dep_type: $("#dep-type").value,
        lag: parseInt($("#dep-lag").value) || 0,
      };
      const result = await api("/api/dependencies", "POST", data);
      if (result && result.error) { alert(result.error); return; }
      if (result && result.id) pushUndo({ type: "dep-create", id: result.id });
      closeAllModals(); await loadAll();
    });
    $("#btn-dep-cancel").addEventListener("click", closeAllModals);

    // Context menu
    $("#ctx-add-dep").addEventListener("click", () => openDepModal(ctxTask));
    $("#ctx-edit-task").addEventListener("click", () => { if (ctxTask) openTaskModal(ctxTask); });

    // Close modals on overlay click (only if mousedown also started on overlay)
    document.querySelectorAll(".modal-overlay").forEach((overlay) => {
      let mouseDownTarget = null;
      overlay.addEventListener("mousedown", (e) => { mouseDownTarget = e.target; });
      overlay.addEventListener("click", (e) => {
        if (e.target !== overlay || mouseDownTarget !== overlay) return;
        if (overlay.id === "resource-modal") closeResourceModal();
        else if (overlay.id === "project-modal") closeProjectModal();
        else if (overlay.id === "theme-edit-modal") closeThemeEditModal();
        else overlay.classList.remove("open");
      });
    });
    document.addEventListener("keydown", (e) => {
      if (!e.key) return;
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (key === "y" || (key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key !== "Escape") return;
      if ($("#theme-edit-modal").classList.contains("open")) closeThemeEditModal();
      else if ($("#resource-modal").classList.contains("open")) closeResourceModal();
      else if ($("#project-modal").classList.contains("open")) closeProjectModal();
      else closeAllModals();
    });
  }

  // ── Helpers ───────────────────────────────────────────

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  // Parse "YYYY-MM-DD" as local midnight (not UTC)
  function parseLocal(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function dateToPx(dateStr) {
    const d = parseLocal(dateStr);
    const z = ZOOM_LEVELS[zoomIdx];
    const diffDays = Math.round((d.getTime() - timeOrigin.getTime()) / 86400000);
    return (diffDays / z.days) * z.colW;
  }

  function oneDayPx() {
    const z = ZOOM_LEVELS[zoomIdx];
    return z.colW / z.days;
  }

  function timeToPx(ts) {
    const z = ZOOM_LEVELS[zoomIdx];
    const diffDays = Math.round((ts - timeOrigin.getTime()) / 86400000);
    return (diffDays / z.days) * z.colW;
  }

  function pxToTime(px) {
    const z = ZOOM_LEVELS[zoomIdx];
    const dayOffset = Math.floor((px / z.colW) * z.days);
    const d = new Date(timeOrigin.getTime());
    d.setDate(d.getDate() + dayOffset);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function shiftDate(dateStr, days) {
    const d = parseLocal(dateStr);
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function fmtDate(s) {
    const d = parseLocal(s);
    return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  }

  function esc(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  }

  // ── UI state persistence (localStorage) ──────────────

  const UI_STATE_KEY = "rp_ui_state";

  function saveUIState() {
    const state = {
      zoomIdx,
      vZoomIdx,
      fontIdx,
      viewMode,
      currentProjectId,
      sidebarCollapsed,
      sidebarWidth,
      theme: currentTheme,
    };
    try { localStorage.setItem(UI_STATE_KEY, JSON.stringify(state)); } catch {}
  }

  function loadUIState() {
    try {
      const raw = localStorage.getItem(UI_STATE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.zoomIdx != null && s.zoomIdx >= 0 && s.zoomIdx < ZOOM_LEVELS.length) zoomIdx = s.zoomIdx;
      if (s.vZoomIdx != null && s.vZoomIdx >= 0 && s.vZoomIdx < V_ZOOM_LEVELS.length) vZoomIdx = s.vZoomIdx;
      if (s.fontIdx != null && s.fontIdx >= 0 && s.fontIdx < FONT_LEVELS.length) fontIdx = s.fontIdx;
      if (s.viewMode === "tasks" || s.viewMode === "resources") viewMode = s.viewMode;
      if (s.currentProjectId != null) currentProjectId = s.currentProjectId;
      if (typeof s.sidebarCollapsed === "boolean") sidebarCollapsed = s.sidebarCollapsed;
      if (typeof s.sidebarWidth === "number" && s.sidebarWidth >= 120) sidebarWidth = s.sidebarWidth;
      if (s.theme && getTheme(s.theme)) currentTheme = s.theme;
    } catch {}
  }

  // ── Sidebar: collapse, resize, column resize ─────────

  let sidebarCollapsed = false;
  let sidebarWidth = 520;
  let colWidths = null; // null = use flex defaults

  function setupSidebar() {
    const sidebar = $("#gantt-sidebar");
    const handle = $("#sidebar-resize-handle");
    const toggle = $("#sidebar-toggle");

    // ── Collapse / expand
    toggle.addEventListener("click", () => {
      sidebarCollapsed = !sidebarCollapsed;
      sidebar.classList.toggle("collapsed", sidebarCollapsed);
      toggle.innerHTML = sidebarCollapsed ? "&#9654;" : "&#9664;";
      toggle.classList.toggle("collapsed-arrow", sidebarCollapsed);
      updateTogglePosition();
      saveUIState();
    });

    // ── Sidebar width drag
    let dragging = false;
    handle.addEventListener("mousedown", (e) => {
      if (sidebarCollapsed) return;
      dragging = true;
      handle.classList.add("active");
      e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const wrapperLeft = $(".gantt-wrapper").getBoundingClientRect().left;
      let newW = e.clientX - wrapperLeft;
      if (newW < 120) newW = 120;
      if (newW > window.innerWidth * 0.7) newW = window.innerWidth * 0.7;
      sidebarWidth = newW;
      colWidths = null;
      clearColInlineStyles();
      applySidebarWidth();
    });
    window.addEventListener("mouseup", () => {
      if (dragging) { dragging = false; handle.classList.remove("active"); saveUIState(); }
    });

    // ── Column resize handles in header
    const headerEl = $("#sidebar-header");
    headerEl.addEventListener("mousedown", (e) => {
      const resizer = e.target.closest(".col-resize-handle");
      if (!resizer) return;
      e.preventDefault();
      const colSpan = resizer.parentElement;
      const colIdx = parseInt(colSpan.dataset.col);
      initColWidths();
      const startX = e.clientX;
      const startW = colWidths[colIdx];

      const onMove = (ev) => {
        const delta = ev.clientX - startX;
        colWidths[colIdx] = Math.max(40, startW + delta);
        applyColWidths();
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });

    applySidebarWidth();
  }

  function initColWidths() {
    if (colWidths) return;
    const spans = Array.from($("#sidebar-header").children);
    colWidths = spans.map((s) => s.getBoundingClientRect().width);
  }

  function applyColWidths() {
    if (!colWidths) return;
    const last = colWidths.length - 1;
    const headerSpans = Array.from($("#sidebar-header").children);
    headerSpans.forEach((s, i) => {
      if (i < last) {
        s.style.flex = "none";
        s.style.width = colWidths[i] + "px";
      } else {
        s.style.flex = "1";
        s.style.width = "";
      }
    });
    $("#sidebar-body").querySelectorAll(".sidebar-row").forEach((row) => {
      const spans = Array.from(row.children);
      spans.forEach((s, i) => {
        if (i < last) {
          s.style.flex = "none";
          s.style.width = colWidths[i] + "px";
        } else if (i === last) {
          s.style.flex = "1";
          s.style.width = "";
        }
      });
    });
  }

  function clearColInlineStyles() {
    const headerSpans = Array.from($("#sidebar-header").children);
    headerSpans.forEach((s) => { s.style.flex = ""; s.style.width = ""; });
    $("#sidebar-body").querySelectorAll(".sidebar-row").forEach((row) => {
      Array.from(row.children).forEach((s) => { s.style.flex = ""; s.style.width = ""; });
    });
  }

  function applySidebarWidth() {
    document.documentElement.style.setProperty("--sidebar-w", sidebarWidth + "px");
    updateTogglePosition();
  }

  function updateTogglePosition() {
    const toggle = $("#sidebar-toggle");
    if (sidebarCollapsed) {
      toggle.style.left = "0px";
    } else {
      toggle.style.left = (sidebarWidth + 5) + "px";
    }
  }


  // ── Init ──────────────────────────────────────────────

  loadUIState();

  // Apply restored state to UI
  applyTheme(currentTheme);
  $("#zoom-label").textContent = ZOOM_LEVELS[zoomIdx].name;
  applyVZoom();
  applyFontZoom();
  applySidebarWidth();
  if (sidebarCollapsed) {
    $("#gantt-sidebar").classList.add("collapsed");
    $("#sidebar-toggle").innerHTML = "&#9654;";
    $("#sidebar-toggle").classList.add("collapsed-arrow");
    updateTogglePosition();
  }
  $("#btn-view-tasks").classList.toggle("active", viewMode === "tasks");
  $("#btn-view-resources").classList.toggle("active", viewMode === "resources");

  initColorPickers();
  setupEvents();
  setupScrollSync();
  setupLinkDrag();
  setupCanvasDrag();
  setupCanvasHover();
  setupSidebar();
  loadConfig();
  loadAll();
})();

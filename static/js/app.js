(function () {
  "use strict";

  const V_ZOOM_LEVELS = [
    { name: "XS", rowH: 24, barH: 16 },
    { name: "S",  rowH: 30, barH: 18 },
    { name: "M",  rowH: 36, barH: 22 },
    { name: "L",  rowH: 48, barH: 32 },
    { name: "XL", rowH: 64, barH: 46 },
  ];
  let vZoomIdx = 2;
  let ROW_H = 36;
  let BAR_H = 22;
  let BAR_PAD = (ROW_H - BAR_H) / 2;
  const EDGE = 8;

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
  let zoomIdx = 0;

  let tasks = [];
  let resources = [];
  let deps = [];
  let projects = [];
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
    [tasks, resources, deps, projects] = await Promise.all([
      api(taskUrl), api("/api/resources"), api(depUrl), api("/api/projects"),
    ]);
    populateProjectSelect();
    computeTimeline();
    render();
  }

  async function loadConfig() {
    const cfg = await api("/api/config");
    const title = cfg.app_name || "Resource Planner";
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
      const taskAllocs = rTasks.map((t) => {
        const ra = (t.resources || []).find((x) => x.id === r.id);
        return { task: t, allocation: ra ? ra.allocation : 100 };
      });

      // Build per-day utilization map and find overloaded spans
      const dayUtil = {};
      let peakUtil = 0;
      for (const { task: t, allocation } of taskAllocs) {
        let d = parseLocal(t.start_date).getTime();
        const end = parseLocal(t.end_date).getTime();
        while (d <= end) {
          dayUtil[d] = (dayUtil[d] || 0) + allocation;
          if (dayUtil[d] > peakUtil) peakUtil = dayUtil[d];
          d += DAY_MS;
        }
      }

      // Find contiguous overloaded spans (>100%)
      const overloaded = [];
      const days = Object.keys(dayUtil).map(Number).sort((a, b) => a - b);
      let spanStart = null;
      for (const day of days) {
        if (dayUtil[day] > 100) {
          if (spanStart === null) spanStart = day;
        } else {
          if (spanStart !== null) {
            overloaded.push({ start: spanStart, end: day - DAY_MS, util: 0 });
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
        for (let d = span.start; d <= span.end; d += DAY_MS) {
          if (dayUtil[d] > peak) peak = dayUtil[d];
        }
        span.util = peak;
      }

      resViewRows.push({ resource: r, tasks: rTasks, taskAllocs, overloaded, peakUtil });
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
      renderResourceSidebar();
      renderHeader();
      renderResourceBars();
      renderResourceOverlaps();
    }
    applyColWidths();
  }

  function renderSidebar() {
    const body = $("#sidebar-body");
    body.innerHTML = "";
    for (const t of tasks) {
      const row = document.createElement("div");
      row.className = "sidebar-row";
      row.dataset.id = t.id;
      const indent = t.parent_id ? "padding-left:20px;" : "";
      const dots = (t.resources || []).map(
        (r) => `<span class="task-dot" style="background:${r.color}" title="${esc(r.name)}"></span>`
      ).join("");
      const names = t.resource_name || "\u2014";
      row.innerHTML = `
        <span class="col-name" style="${indent}">
          <span class="resource-dots">${dots || `<span class="task-dot" style="background:${t.color}"></span>`}</span>
          ${esc(t.name)}
        </span>
        <span class="col-resource" title="${esc(names)}">${esc(names)}</span>
        <span class="col-dates">${fmtDate(t.start_date)}</span>
        <span class="col-dates">${fmtDate(t.end_date)}</span>`;
      row.addEventListener("click", () => openTaskModal(t));
      row.addEventListener("contextmenu", (e) => showCtxMenu(e, t));
      body.appendChild(row);
    }
  }

  function renderResourceSidebar() {
    const hdr = $(".sidebar-header");
    hdr.innerHTML = `<span class="col-name" data-col="0">Resource<span class="col-resize-handle"></span></span><span class="col-resource" data-col="1">Role<span class="col-resize-handle"></span></span><span class="col-dates" data-col="2">Tasks<span class="col-resize-handle"></span></span><span class="col-dates" data-col="3">Peak</span>`;
    const body = $("#sidebar-body");
    body.innerHTML = "";
    for (const rv of resViewRows) {
      const r = rv.resource;
      const overloaded = rv.peakUtil > 100;
      const row = document.createElement("div");
      row.className = "sidebar-row" + (overloaded ? " overload-row" : "");
      const peakLabel = rv.peakUtil > 0 ? rv.peakUtil + "%" : "\u2014";
      row.innerHTML = `
        <span class="col-name">
          <span class="task-dot" style="background:${r.color}"></span>
          ${esc(r.name)}
        </span>
        <span class="col-resource">${esc(r.role || "\u2014")}</span>
        <span class="col-dates">${rv.tasks.length}</span>
        <span class="col-dates" ${overloaded ? 'style="color:var(--danger);font-weight:600"' : ""}>${peakLabel}</span>`;
      body.appendChild(row);
    }
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
      const barEnd = dateToPx(t.end_date) + z.colW + 20;
      if (barEnd > totalW) totalW = Math.ceil(barEnd);
    }

    canvas.width = totalW;
    canvas.height = totalH;
    canvas.style.width = totalW + "px";
    canvas.style.height = totalH + "px";

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, totalW, totalH);

    drawGrid(ctx, totalW, totalH, z);
    drawToday(ctx, totalW, totalH, z);

    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      const x1 = dateToPx(t.start_date);
      const x2 = dateToPx(t.end_date) + z.colW;
      const y = i * ROW_H + BAR_PAD;
      const w = Math.max(x2 - x1, 8);

      const barLabel = sidebarCollapsed && t.resources && t.resources.length
        ? t.name + " \u2014 " + t.resources.map((r) => r.name).join(", ")
        : t.name;
      drawBar(ctx, x1, y, w, t.color, t.progress, barLabel);

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
        ctx.fillStyle = "#ffffffdd";
        ctx.strokeStyle = t.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x1, cy, cr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        // Right connector (end)
        ctx.beginPath(); ctx.arc(x1 + w, cy, cr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }

      // Highlight target bar during link drag
      if (linkDrag && linkDrag.targetIdx === i) {
        ctx.strokeStyle = "#fffc";
        ctx.lineWidth = 2;
        ctx.beginPath(); roundRect(ctx, x1 - 1, y - 1, w + 2, BAR_H + 2, 5); ctx.stroke();
      }

      t._x1 = x1; t._x2 = x1 + w; t._y = y;
    }

    resizeSvg(totalW, totalH);
  }

  function renderResourceBars() {
    const z = ZOOM_LEVELS[zoomIdx];
    const canvas = $("#gantt-canvas");
    let totalW = timeCols * z.colW;
    const totalH = resViewRows.length * ROW_H;

    for (const t of tasks) {
      const barEnd = dateToPx(t.end_date) + z.colW + 20;
      if (barEnd > totalW) totalW = Math.ceil(barEnd);
    }

    canvas.width = totalW;
    canvas.height = totalH;
    canvas.style.width = totalW + "px";
    canvas.style.height = totalH + "px";

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, totalW, totalH);

    drawGrid(ctx, totalW, totalH, z, resViewRows.length);
    drawToday(ctx, totalW, totalH, z);

    for (let ri = 0; ri < resViewRows.length; ri++) {
      const rv = resViewRows[ri];
      const rowY = ri * ROW_H;
      for (const t of rv.tasks) {
        const x1 = dateToPx(t.start_date);
        const x2 = dateToPx(t.end_date) + z.colW;
        const w = Math.max(x2 - x1, 8);
        const y = rowY + BAR_PAD;
        drawBar(ctx, x1, y, w, t.color, t.progress, t.name);
      }
    }

    resizeSvg(totalW, totalH);
  }

  function renderResourceOverlaps() {
    const svg = $("#dep-svg");
    svg.innerHTML = "";
    const z = ZOOM_LEVELS[zoomIdx];

    for (let ri = 0; ri < resViewRows.length; ri++) {
      const rv = resViewRows[ri];
      for (const span of rv.overloaded) {
        const x1 = timeToPx(span.start);
        const x2 = timeToPx(span.end) + z.colW;
        const y = ri * ROW_H;
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", x1);
        rect.setAttribute("y", y);
        rect.setAttribute("width", Math.max(x2 - x1, 4));
        rect.setAttribute("height", ROW_H);
        rect.setAttribute("fill", "#e74c3c33");
        rect.setAttribute("stroke", "#e74c3c88");
        rect.setAttribute("stroke-width", "1");
        rect.setAttribute("rx", "3");
        svg.appendChild(rect);

        // Show peak % label in the overloaded zone
        const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
        txt.setAttribute("x", x1 + 4);
        txt.setAttribute("y", y + ROW_H - 4);
        txt.setAttribute("fill", "#e74c3ccc");
        txt.setAttribute("font-size", "9");
        txt.setAttribute("font-family", "-apple-system, sans-serif");
        txt.textContent = span.util + "%";
        svg.appendChild(txt);
      }
    }
  }

  // ── Shared drawing helpers ────────────────────────────

  function drawGrid(ctx, totalW, totalH, z, rowCount) {
    ctx.strokeStyle = "#1a406030";
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
      ctx.fillStyle = "#e74c3c22";
      ctx.fillRect(todayX, 0, z.colW, totalH);
      ctx.strokeStyle = "#e74c3c88";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(todayX, 0); ctx.lineTo(todayX, totalH); ctx.stroke();
    }
  }

  function drawBar(ctx, x, y, w, color, progress, label) {
    ctx.fillStyle = color + "55";
    ctx.beginPath(); roundRect(ctx, x, y, w, BAR_H, 4); ctx.fill();
    if (progress > 0) {
      ctx.fillStyle = color + "cc";
      ctx.beginPath(); roundRect(ctx, x, y, (w * progress) / 100, BAR_H, 4); ctx.fill();
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath(); roundRect(ctx, x, y, w, BAR_H, 4); ctx.stroke();
    ctx.fillStyle = "#fff";
    const fontSize = Math.max(10, Math.min(BAR_H * 0.5, 16));
    ctx.font = `${fontSize}px -apple-system, sans-serif`;
    ctx.textBaseline = "middle";
    const maxTextW = w - 8;
    if (maxTextW > 20) {
      ctx.save();
      ctx.beginPath(); ctx.rect(x + 4, y, maxTextW, BAR_H); ctx.clip();
      ctx.fillText(label, x + 6, y + BAR_H / 2);
      ctx.restore();
    }
  }

  function drawResizeHandles(ctx, x1, y, w, edge) {
    const handleW = 4, handleH = BAR_H - 6, handleY = y + 3;
    ctx.fillStyle = "#ffffffbb";
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

    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML = `<marker id="arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6 z" fill="#e0e0e088"/></marker>
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
      path.setAttribute("stroke", "#e0e0e088");
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
        path.setAttribute("stroke", "#e0e0e088");
        path.setAttribute("stroke-width", "1.5");
        path.setAttribute("marker-end", "url(#arrow)");
      });
      hitPath.addEventListener("click", async (e) => {
        e.stopPropagation();
        const depId = hitPath.dataset.depId;
        const label = `${hitPath.dataset.predName} → ${hitPath.dataset.succName} (${hitPath.dataset.depType})`;
        if (confirm(`Delete dependency?\n${label}`)) {
          await api(`/api/dependencies/${depId}`, "DELETE");
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
    });
    canvas.addEventListener("mouseleave", () => {
      if (dragTask) return;
      lastHover = null;
      hoveredTaskIdx = -1;
      canvas.style.cursor = "default";
      if (viewMode === "tasks") { renderBars(null); renderDeps(); }
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
      const deltaDays = Math.round((mx - dragStartX) / z.colW) * z.days;
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
        await api(`/api/tasks/${t.id}`, "PUT", { start_date: t.start_date, end_date: t.end_date });
        await loadAll();
      }
    });
  }

  // ── Dependency schedule enforcement ────────────────────

  function depScheduleShift(pred, succ, depType, lag) {
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
    if (diffMs <= 0) return 0;
    return Math.round(diffMs / 86400000);
  }

  // ── Link drag (dependency creation by dragging) ──────

  let linkDrag = null; // { sourceTask, sourceEnd ("start"|"end"), targetIdx, mx, my }
  const CONNECTOR_R = 7;

  let hoveredTaskIdx = -1;

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

    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML = `<marker id="link-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6 z" fill="#ffffffcc"/></marker>`;
    svg.appendChild(defs);

    const midX = x1 + (x2 - x1) / 2;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", `M${x1},${y1} C${midX},${y1} ${midX},${y2} ${x2},${y2}`);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#ffffffaa");
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

    // Resource checklist with allocation %
    const cl = $("#task-resources");
    cl.innerHTML = "";
    const resMap = {};
    if (t && t.resources) t.resources.forEach((r) => { resMap[r.id] = r.allocation; });
    for (const r of resources) {
      const checked = t ? (t.resource_ids || []).includes(r.id) : false;
      const alloc = resMap[r.id] !== undefined ? resMap[r.id] : 100;
      const lbl = document.createElement("label");
      lbl.innerHTML = `<input type="checkbox" value="${r.id}" ${checked ? "checked" : ""}>
        <span class="rc-dot" style="background:${r.color}"></span>${esc(r.name)}
        <input type="number" class="rc-alloc" min="1" max="100" value="${alloc}" title="Allocation %">
        <span class="rc-pct">%</span>`;
      cl.appendChild(lbl);
    }

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
    updateProjDeleteSelectedBtn();
  }

  async function openSettingsModal() {
    const cfg = await api("/api/config");
    $("#cfg-app-name").value = cfg.app_name || "Resource Planner";
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
      $(".sidebar-header").innerHTML = `<span class="col-name" data-col="0">Task<span class="col-resize-handle"></span></span><span class="col-resource" data-col="1">Resource<span class="col-resize-handle"></span></span><span class="col-dates" data-col="2">Start<span class="col-resize-handle"></span></span><span class="col-dates" data-col="3">End</span>`;
    }
    computeTimeline();
    render();
  }

  // ── Event bindings ────────────────────────────────────

  function setupEvents() {
    $("#btn-add-task").addEventListener("click", () => openTaskModal(null));
    $("#btn-manage-resources").addEventListener("click", () => openResourceListModal());
    $("#btn-add-project").addEventListener("click", () => openProjectModal(null));
    $("#btn-edit-project").addEventListener("click", () => {
      const p = projects.find((p) => p.id === currentProjectId);
      if (p) openProjectModal(p);
    });
    $("#btn-manage-projects").addEventListener("click", () => openProjectListModal());
    $("#btn-settings").addEventListener("click", () => openSettingsModal());
    $("#btn-seed").addEventListener("click", async () => {
      await api("/api/seed", "POST");
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

    // Task form — collects resource_ids from checkboxes
    $("#task-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = $("#task-id").value;
      const color = $("#task-color").value;
      saveRecentColor(color);
      const resourceIds = Array.from($("#task-resources").querySelectorAll("input[type=checkbox]:checked"))
        .map((cb) => {
          const allocInput = cb.closest("label").querySelector(".rc-alloc");
          return { id: parseInt(cb.value), allocation: parseInt(allocInput.value) || 100 };
        });
      const data = {
        name: $("#task-name").value,
        description: $("#task-desc").value,
        start_date: $("#task-start").value,
        end_date: $("#task-end").value,
        progress: parseInt($("#task-progress").value) || 0,
        resource_ids: resourceIds,
        color: color,
        parent_id: $("#task-parent").value ? parseInt($("#task-parent").value) : null,
        project_id: $("#task-project").value ? parseInt($("#task-project").value) : null,
      };
      if (id) await api(`/api/tasks/${id}`, "PUT", data);
      else await api("/api/tasks", "POST", data);
      closeAllModals();
      await loadAll();
    });

    $("#btn-task-cancel").addEventListener("click", closeAllModals);
    $("#btn-task-delete").addEventListener("click", async () => {
      const id = $("#task-id").value;
      if (id && confirm("Delete this task?")) {
        await api(`/api/tasks/${id}`, "DELETE");
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

    // Settings form
    $("#settings-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const appName = $("#cfg-app-name").value;
      await api("/api/config", "PUT", {
        app_name: appName, host: $("#cfg-host").value,
        port: parseInt($("#cfg-port").value), debug: $("#cfg-debug").value === "true",
        database_uri: $("#cfg-db-uri").value,
      });
      $("#app-title").textContent = appName; document.title = appName;
      closeAllModals();
    });
    $("#btn-settings-cancel").addEventListener("click", closeAllModals);

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
      closeAllModals(); await loadAll();
    });
    $("#btn-dep-cancel").addEventListener("click", closeAllModals);

    // Context menu
    $("#ctx-add-dep").addEventListener("click", () => openDepModal(ctxTask));
    $("#ctx-edit-task").addEventListener("click", () => { if (ctxTask) openTaskModal(ctxTask); });

    // Close modals on overlay click
    document.querySelectorAll(".modal-overlay").forEach((overlay) => {
      overlay.addEventListener("click", (e) => {
        if (e.target !== overlay) return;
        if (overlay.id === "resource-modal") closeResourceModal();
        else if (overlay.id === "project-modal") closeProjectModal();
        else overlay.classList.remove("open");
      });
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if ($("#resource-modal").classList.contains("open")) closeResourceModal();
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
    return ((d.getTime() - timeOrigin.getTime()) / (z.days * 86400000)) * z.colW;
  }

  function timeToPx(ts) {
    const z = ZOOM_LEVELS[zoomIdx];
    return ((ts - timeOrigin.getTime()) / (z.days * 86400000)) * z.colW;
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
      viewMode,
      currentProjectId,
      sidebarCollapsed,
      sidebarWidth,
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
      if (s.viewMode === "tasks" || s.viewMode === "resources") viewMode = s.viewMode;
      if (s.currentProjectId != null) currentProjectId = s.currentProjectId;
      if (typeof s.sidebarCollapsed === "boolean") sidebarCollapsed = s.sidebarCollapsed;
      if (typeof s.sidebarWidth === "number" && s.sidebarWidth >= 120) sidebarWidth = s.sidebarWidth;
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
    const headerSpans = Array.from($("#sidebar-header").children);
    headerSpans.forEach((s, i) => {
      s.style.flex = "none";
      s.style.width = colWidths[i] + "px";
    });
    // Apply to all body rows
    $("#sidebar-body").querySelectorAll(".sidebar-row").forEach((row) => {
      const spans = Array.from(row.children);
      spans.forEach((s, i) => {
        if (i < colWidths.length) {
          s.style.flex = "none";
          s.style.width = colWidths[i] + "px";
        }
      });
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
  $("#zoom-label").textContent = ZOOM_LEVELS[zoomIdx].name;
  applyVZoom();
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

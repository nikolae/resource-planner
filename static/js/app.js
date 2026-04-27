(function () {
  "use strict";

  const ROW_H = 36;
  const BAR_H = 22;
  const BAR_PAD = (ROW_H - BAR_H) / 2;
  const EDGE = 8;
  const ZOOM_LEVELS = [
    { name: "Day", days: 1, colW: 36 },
    { name: "3-Day", days: 3, colW: 50 },
    { name: "Week", days: 7, colW: 70 },
    { name: "2-Week", days: 14, colW: 90 },
    { name: "Month", days: 30, colW: 100 },
  ];
  let zoomIdx = 0;

  let tasks = [];
  let resources = [];
  let deps = [];
  let projects = [];
  let currentProjectId = null;
  let timeOrigin;
  let timeCols;

  const $ = (s) => document.querySelector(s);
  const api = async (url, method = "GET", body) => {
    const opts = { method, headers: { "Content-Type": "application/json" } };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(url, opts);
    if (r.status === 204) return null;
    return r.json();
  };

  // ── Data fetching ─────────────────────────────────────

  async function loadAll() {
    const taskUrl = currentProjectId
      ? `/api/tasks?project_id=${currentProjectId}`
      : "/api/tasks";
    const depUrl = currentProjectId
      ? `/api/dependencies?project_id=${currentProjectId}`
      : "/api/dependencies";
    [tasks, resources, deps, projects] = await Promise.all([
      api(taskUrl),
      api("/api/resources"),
      api(depUrl),
      api("/api/projects"),
    ]);
    populateProjectSelect();
    computeTimeline();
    render();
  }

  function populateProjectSelect() {
    const sel = $("#project-select");
    const prev = sel.value;
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
      timeOrigin = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
      timeCols = 60;
      return;
    }
    let minD = Infinity, maxD = -Infinity;
    for (const t of tasks) {
      const s = new Date(t.start_date).getTime();
      const e = new Date(t.end_date).getTime();
      if (s < minD) minD = s;
      if (e > maxD) maxD = e;
    }
    const pad = 7 * 86400000;
    timeOrigin = new Date(minD - pad);
    timeOrigin.setHours(0, 0, 0, 0);
    const span = maxD + pad * 2 - timeOrigin.getTime();
    const z = ZOOM_LEVELS[zoomIdx];
    timeCols = Math.ceil(span / (z.days * 86400000)) + 1;
  }

  // ── Rendering ─────────────────────────────────────────

  function render() {
    renderSidebar();
    renderHeader();
    renderBars();
    renderDeps();
  }

  function renderSidebar() {
    const body = $("#sidebar-body");
    body.innerHTML = "";
    for (const t of tasks) {
      const row = document.createElement("div");
      row.className = "sidebar-row";
      row.dataset.id = t.id;
      const indent = t.parent_id ? "padding-left:20px;" : "";
      row.innerHTML = `
        <span class="col-name" style="${indent}">
          <span class="task-dot" style="background:${t.color}"></span>
          ${esc(t.name)}
        </span>
        <span class="col-resource">${esc(t.resource_name || "\u2014")}</span>
        <span class="col-dates">${fmtDate(t.start_date)}</span>
        <span class="col-dates">${fmtDate(t.end_date)}</span>`;
      row.addEventListener("click", () => openTaskModal(t));
      row.addEventListener("contextmenu", (e) => showCtxMenu(e, t));
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
        col.innerHTML = `<span class="ch-top">${d.getDate()}</span>
          <span class="ch-bot">${MONTHS[d.getMonth()]}</span>`;
      } else if (z.days <= 7) {
        col.innerHTML = `<span class="ch-top">${MONTHS[d.getMonth()]} ${d.getDate()}</span>`;
      } else {
        col.innerHTML = `<span class="ch-top">${MONTHS[d.getMonth()]} ${d.getDate()}</span>
          <span class="ch-bot">${d.getFullYear()}</span>`;
      }
      hdr.appendChild(col);
    }
  }

  function renderBars(hoverInfo) {
    const z = ZOOM_LEVELS[zoomIdx];
    const canvas = $("#gantt-canvas");
    const totalW = timeCols * z.colW;
    const totalH = tasks.length * ROW_H;
    canvas.width = totalW;
    canvas.height = totalH;
    canvas.style.width = totalW + "px";
    canvas.style.height = totalH + "px";

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, totalW, totalH);

    // grid lines
    ctx.strokeStyle = "#1a406030";
    ctx.lineWidth = 1;
    for (let i = 0; i <= timeCols; i++) {
      const x = i * z.colW;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, totalH);
      ctx.stroke();
    }
    for (let i = 0; i <= tasks.length; i++) {
      const y = i * ROW_H;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(totalW, y);
      ctx.stroke();
    }

    // today marker
    const todayX = dateToPx(todayStr());
    if (todayX >= 0 && todayX <= totalW) {
      ctx.fillStyle = "#e74c3c22";
      ctx.fillRect(todayX, 0, z.colW, totalH);
      ctx.strokeStyle = "#e74c3c88";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(todayX, 0);
      ctx.lineTo(todayX, totalH);
      ctx.stroke();
    }

    // bars
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      const x1 = dateToPx(t.start_date);
      const x2 = dateToPx(t.end_date) + z.colW;
      const y = i * ROW_H + BAR_PAD;
      const w = Math.max(x2 - x1, 8);

      // bar background
      ctx.fillStyle = t.color + "55";
      ctx.beginPath();
      roundRect(ctx, x1, y, w, BAR_H, 4);
      ctx.fill();

      // progress fill
      if (t.progress > 0) {
        ctx.fillStyle = t.color + "cc";
        const pw = (w * t.progress) / 100;
        ctx.beginPath();
        roundRect(ctx, x1, y, pw, BAR_H, 4);
        ctx.fill();
      }

      // border
      ctx.strokeStyle = t.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      roundRect(ctx, x1, y, w, BAR_H, 4);
      ctx.stroke();

      // label
      ctx.fillStyle = "#fff";
      ctx.font = "11px -apple-system, sans-serif";
      ctx.textBaseline = "middle";
      const label = t.name;
      const maxTextW = w - 8;
      if (maxTextW > 20) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x1 + 4, y, maxTextW, BAR_H);
        ctx.clip();
        ctx.fillText(label, x1 + 6, y + BAR_H / 2);
        ctx.restore();
      }

      // resize handles on hover
      if (hoverInfo && hoverInfo.taskIdx === i && !dragTask) {
        const handleW = 4;
        const handleH = BAR_H - 6;
        const handleY = y + 3;
        ctx.fillStyle = "#ffffffbb";
        if (hoverInfo.edge === "start" || hoverInfo.edge === "both") {
          ctx.beginPath();
          roundRect(ctx, x1 + 2, handleY, handleW, handleH, 2);
          ctx.fill();
        }
        if (hoverInfo.edge === "end" || hoverInfo.edge === "both") {
          ctx.beginPath();
          roundRect(ctx, x1 + w - handleW - 2, handleY, handleW, handleH, 2);
          ctx.fill();
        }
      }

      t._x1 = x1;
      t._x2 = x1 + w;
      t._y = y;
    }

    // resize SVG overlay
    const svg = $("#dep-svg");
    svg.setAttribute("width", totalW);
    svg.setAttribute("height", totalH);
    svg.style.width = totalW + "px";
    svg.style.height = totalH + "px";
  }

  function renderDeps() {
    const svg = $("#dep-svg");
    svg.innerHTML = "";
    const taskIdx = {};
    tasks.forEach((t, i) => { taskIdx[t.id] = i; });

    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML = `<marker id="arrow" markerWidth="8" markerHeight="6"
      refX="8" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6 z" fill="#e0e0e088"/>
    </marker>`;
    svg.appendChild(defs);

    for (const d of deps) {
      const pi = taskIdx[d.predecessor_id];
      const si = taskIdx[d.successor_id];
      if (pi === undefined || si === undefined) continue;
      const pred = tasks[pi];
      const succ = tasks[si];

      let x1, y1, x2, y2;
      if (d.dep_type === "FS") {
        x1 = pred._x2; y1 = pred._y + BAR_H / 2;
        x2 = succ._x1; y2 = succ._y + BAR_H / 2;
      } else if (d.dep_type === "SS") {
        x1 = pred._x1; y1 = pred._y + BAR_H / 2;
        x2 = succ._x1; y2 = succ._y + BAR_H / 2;
      } else if (d.dep_type === "FF") {
        x1 = pred._x2; y1 = pred._y + BAR_H / 2;
        x2 = succ._x2; y2 = succ._y + BAR_H / 2;
      } else {
        x1 = pred._x1; y1 = pred._y + BAR_H / 2;
        x2 = succ._x2; y2 = succ._y + BAR_H / 2;
      }

      const midX = x1 + (x2 - x1) / 2;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", `M${x1},${y1} C${midX},${y1} ${midX},${y2} ${x2},${y2}`);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "#e0e0e088");
      path.setAttribute("stroke-width", "1.5");
      path.setAttribute("marker-end", "url(#arrow)");
      svg.appendChild(path);
    }
  }

  // ── Hover handling on canvas ──────────────────────────

  function hitTest(mx, my) {
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
      if (dragTask) return;
      const rect = canvas.getBoundingClientRect();
      const scrollArea = $("#chart-body");
      const mx = e.clientX - rect.left + scrollArea.scrollLeft;
      const my = e.clientY - rect.top + scrollArea.scrollTop;
      const hit = hitTest(mx, my);

      if (hit && hit.edge) {
        canvas.style.cursor = "col-resize";
      } else if (hit) {
        canvas.style.cursor = "grab";
      } else {
        canvas.style.cursor = "default";
      }

      const hoverKey = hit ? `${hit.taskIdx}:${hit.edge}` : null;
      if (hoverKey !== lastHover) {
        lastHover = hoverKey;
        renderBars(hit);
        renderDeps();
      }
    });

    canvas.addEventListener("mouseleave", () => {
      if (dragTask) return;
      lastHover = null;
      canvas.style.cursor = "default";
      renderBars(null);
      renderDeps();
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
      const rect = canvas.getBoundingClientRect();
      const scrollArea = $("#chart-body");
      const mx = e.clientX - rect.left + scrollArea.scrollLeft;
      const my = e.clientY - rect.top + scrollArea.scrollTop;
      const rowIdx = Math.floor(my / ROW_H);
      if (rowIdx < 0 || rowIdx >= tasks.length) return;
      const t = tasks[rowIdx];
      if (mx < t._x1 || mx > t._x2) return;

      dragTask = t;
      dragStartX = mx;
      dragOrigStart = t.start_date;
      dragOrigEnd = t.end_date;

      if (mx - t._x1 < EDGE) dragMode = "resize-start";
      else if (t._x2 - mx < EDGE) dragMode = "resize-end";
      else dragMode = "move";

      canvas.style.cursor = dragMode === "move" ? "grabbing" : "col-resize";
      e.preventDefault();
    });

    window.addEventListener("mousemove", (e) => {
      if (!dragTask) return;
      const canvas = $("#gantt-canvas");
      const rect = canvas.getBoundingClientRect();
      const scrollArea = $("#chart-body");
      const mx = e.clientX - rect.left + scrollArea.scrollLeft;
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
      renderBars(null);
      renderDeps();
    });

    window.addEventListener("mouseup", async () => {
      if (!dragTask) return;
      const t = dragTask;
      dragTask = null;
      $("#gantt-canvas").style.cursor = "default";
      if (t.start_date !== dragOrigStart || t.end_date !== dragOrigEnd) {
        await api(`/api/tasks/${t.id}`, "PUT", {
          start_date: t.start_date,
          end_date: t.end_date,
        });
        await loadAll();
      }
    });
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

    const resSel = $("#task-resource");
    resSel.innerHTML = '<option value="">— none —</option>';
    for (const r of resources) {
      const opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = `${r.name} (${r.role})`;
      if (t && t.resource_id === r.id) opt.selected = true;
      resSel.appendChild(opt);
    }

    const projSel = $("#task-project");
    projSel.innerHTML = '<option value="">— none —</option>';
    for (const p of projects) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      if (t && t.project_id === p.id) opt.selected = true;
      else if (!t && currentProjectId && p.id === currentProjectId) opt.selected = true;
      projSel.appendChild(opt);
    }

    const parentSel = $("#task-parent");
    parentSel.innerHTML = '<option value="">— none —</option>';
    for (const pt of tasks) {
      if (t && pt.id === t.id) continue;
      const opt = document.createElement("option");
      opt.value = pt.id;
      opt.textContent = pt.name;
      if (t && t.parent_id === pt.id) opt.selected = true;
      parentSel.appendChild(opt);
    }

    $("#task-modal").classList.add("open");
  }

  function openResourceModal(r) {
    $("#resource-modal-title").textContent = r ? "Edit Resource" : "New Resource";
    $("#res-id").value = r ? r.id : "";
    $("#res-name").value = r ? r.name : "";
    $("#res-role").value = r ? r.role : "";
    $("#res-color").value = r ? r.color : "#4a86c8";
    $("#btn-res-delete").style.display = r ? "block" : "none";
    $("#resource-modal").classList.add("open");
  }

  function openProjectModal(p) {
    $("#project-modal-title").textContent = p ? "Edit Project" : "New Project";
    $("#proj-id").value = p ? p.id : "";
    $("#proj-name").value = p ? p.name : "";
    $("#proj-desc").value = p ? p.description : "";
    $("#proj-color").value = p ? p.color : "#4a86c8";
    $("#btn-proj-delete").style.display = p ? "block" : "none";
    $("#project-modal").classList.add("open");
  }

  async function openSettingsModal() {
    const cfg = await api("/api/config");
    $("#cfg-host").value = cfg.host;
    $("#cfg-port").value = cfg.port;
    $("#cfg-debug").value = String(cfg.debug);
    $("#cfg-db-uri").value = cfg.database_uri;
    $("#settings-modal").classList.add("open");
  }

  function openDepModal(taskCtx) {
    const predSel = $("#dep-pred");
    const succSel = $("#dep-succ");
    predSel.innerHTML = "";
    succSel.innerHTML = "";
    for (const t of tasks) {
      const o1 = document.createElement("option");
      o1.value = t.id;
      o1.textContent = t.name;
      if (taskCtx && t.id === taskCtx.id) o1.selected = true;
      predSel.appendChild(o1);
      const o2 = document.createElement("option");
      o2.value = t.id;
      o2.textContent = t.name;
      succSel.appendChild(o2);
    }
    $("#dep-type").value = "FS";
    $("#dep-lag").value = 0;
    $("#dep-modal").classList.add("open");
  }

  function closeAllModals() {
    document.querySelectorAll(".modal-overlay").forEach((m) => m.classList.remove("open"));
  }

  // ── Context menu ──────────────────────────────────────

  let ctxTask = null;

  function showCtxMenu(e, t) {
    e.preventDefault();
    ctxTask = t;
    const menu = $("#ctx-menu");
    menu.style.display = "block";
    menu.style.left = e.clientX + "px";
    menu.style.top = e.clientY + "px";
  }

  document.addEventListener("click", () => {
    $("#ctx-menu").style.display = "none";
  });

  // ── Event bindings ────────────────────────────────────

  function setupEvents() {
    // header buttons
    $("#btn-add-task").addEventListener("click", () => openTaskModal(null));
    $("#btn-add-resource").addEventListener("click", () => openResourceModal(null));
    $("#btn-add-project").addEventListener("click", () => openProjectModal(null));
    $("#btn-edit-project").addEventListener("click", () => {
      const p = projects.find((p) => p.id === currentProjectId);
      if (p) openProjectModal(p);
    });
    $("#btn-settings").addEventListener("click", () => openSettingsModal());
    $("#btn-seed").addEventListener("click", async () => {
      await api("/api/seed", "POST");
      await loadAll();
    });

    // project selector
    $("#project-select").addEventListener("change", (e) => {
      currentProjectId = e.target.value ? parseInt(e.target.value) : null;
      loadAll();
    });

    // zoom
    $("#btn-zoom-in").addEventListener("click", () => {
      if (zoomIdx > 0) { zoomIdx--; $("#zoom-label").textContent = ZOOM_LEVELS[zoomIdx].name; computeTimeline(); render(); }
    });
    $("#btn-zoom-out").addEventListener("click", () => {
      if (zoomIdx < ZOOM_LEVELS.length - 1) { zoomIdx++; $("#zoom-label").textContent = ZOOM_LEVELS[zoomIdx].name; computeTimeline(); render(); }
    });

    // task form
    $("#task-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = $("#task-id").value;
      const data = {
        name: $("#task-name").value,
        description: $("#task-desc").value,
        start_date: $("#task-start").value,
        end_date: $("#task-end").value,
        progress: parseInt($("#task-progress").value) || 0,
        resource_id: $("#task-resource").value ? parseInt($("#task-resource").value) : null,
        color: $("#task-color").value,
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
        closeAllModals();
        await loadAll();
      }
    });

    // resource form
    $("#resource-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = $("#res-id").value;
      const data = {
        name: $("#res-name").value,
        role: $("#res-role").value,
        color: $("#res-color").value,
      };
      if (id) await api(`/api/resources/${id}`, "PUT", data);
      else await api("/api/resources", "POST", data);
      closeAllModals();
      await loadAll();
    });

    $("#btn-res-cancel").addEventListener("click", closeAllModals);
    $("#btn-res-delete").addEventListener("click", async () => {
      const id = $("#res-id").value;
      if (id && confirm("Delete this resource?")) {
        await api(`/api/resources/${id}`, "DELETE");
        closeAllModals();
        await loadAll();
      }
    });

    // project form
    $("#project-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = $("#proj-id").value;
      const data = {
        name: $("#proj-name").value,
        description: $("#proj-desc").value,
        color: $("#proj-color").value,
      };
      if (id) await api(`/api/projects/${id}`, "PUT", data);
      else {
        const created = await api("/api/projects", "POST", data);
        currentProjectId = created.id;
      }
      closeAllModals();
      await loadAll();
    });

    $("#btn-proj-cancel").addEventListener("click", closeAllModals);
    $("#btn-proj-delete").addEventListener("click", async () => {
      const id = $("#proj-id").value;
      if (id && confirm("Delete this project and all its tasks?")) {
        await api(`/api/projects/${id}`, "DELETE");
        if (currentProjectId === parseInt(id)) currentProjectId = null;
        closeAllModals();
        await loadAll();
      }
    });

    // settings form
    $("#settings-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      await api("/api/config", "PUT", {
        host: $("#cfg-host").value,
        port: parseInt($("#cfg-port").value),
        debug: $("#cfg-debug").value === "true",
        database_uri: $("#cfg-db-uri").value,
      });
      closeAllModals();
    });

    $("#btn-settings-cancel").addEventListener("click", closeAllModals);

    // dependency form
    $("#dep-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = {
        predecessor_id: parseInt($("#dep-pred").value),
        successor_id: parseInt($("#dep-succ").value),
        dep_type: $("#dep-type").value,
        lag: parseInt($("#dep-lag").value) || 0,
      };
      const result = await api("/api/dependencies", "POST", data);
      if (result && result.error) {
        alert(result.error);
        return;
      }
      closeAllModals();
      await loadAll();
    });

    $("#btn-dep-cancel").addEventListener("click", closeAllModals);

    // context menu actions
    $("#ctx-add-dep").addEventListener("click", () => openDepModal(ctxTask));
    $("#ctx-edit-task").addEventListener("click", () => { if (ctxTask) openTaskModal(ctxTask); });

    // close modals on overlay click
    document.querySelectorAll(".modal-overlay").forEach((overlay) => {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) closeAllModals();
      });
    });

    // keyboard
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAllModals();
    });
  }

  // ── Helpers ───────────────────────────────────────────

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  function dateToPx(dateStr) {
    const d = new Date(dateStr);
    const z = ZOOM_LEVELS[zoomIdx];
    const diff = d.getTime() - timeOrigin.getTime();
    return (diff / (z.days * 86400000)) * z.colW;
  }

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function shiftDate(dateStr, days) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function fmtDate(s) {
    const d = new Date(s);
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

  // ── Init ──────────────────────────────────────────────

  setupEvents();
  setupScrollSync();
  setupCanvasDrag();
  setupCanvasHover();
  loadAll();
})();

import { useState, useRef, useCallback, useEffect, memo } from "react";

// ── UTILS ─────────────────────────────────────────────────────────────────────
function parseJSON(text) {
  const m = text.match(/```json\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
  if (m) { try { return JSON.parse(m[1]); } catch {} }
  try { return JSON.parse(text); } catch {}
  return null;
}

function mdToHtml(md) {
  if (!md) return "";
  return md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^---$/gm, '<hr/>')
    .replace(/^[-•] (.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ol">$1</li>')
    .replace(/(<li[^>]*>.*?<\/li>\n?)+/gs, s =>
      s.includes('class="ol"') ? `<ol>${s.replace(/ class="ol"/g, '')}</ol>` : `<ul>${s}</ul>`)
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/^(?!<[hopu]|<\/[hopu])(.+)$/gm, '<p>$1</p>')
    .replace(/<p><\/p>/g, '');
}

function parseMermaidToGraph(code) {
  const lines = code.split("\n").map(l => l.trim()).filter(Boolean);
  const nodes = {}, edges = [];
  const shapeOpen = { "((": "stadium", "([": "stadium", "[[": "subroutine", "[": "rect", "(": "round", "{": "diamond", ">": "flag" };
  for (const line of lines) {
    if (/^(flowchart|graph)/i.test(line)) continue;
    const arrowM = line.match(/([A-Za-z0-9_]+)\s*(?:(\(\(|\(\[|\[\[|\[|\(|\{|>)(.*?)(\)\)|\]\)|\]\]|\]|\)|\}|<))?\s*--+(?:\|([^|]*)\|)?\s*>\s*([A-Za-z0-9_]+)\s*(?:(\(\(|\(\[|\[\[|\[|\(|\{|>)(.*?)(\)\)|\]\)|\]\]|\]|\)|\}|<))?/);
    if (arrowM) {
      const [, sid, so, sl, , el, tid, to, tl] = arrowM;
      if (!nodes[sid]) nodes[sid] = { id: sid, label: (sl || sid).trim(), shape: shapeOpen[so] || "rect" };
      if (!nodes[tid]) nodes[tid] = { id: tid, label: (tl || tid).trim(), shape: shapeOpen[to] || "rect" };
      edges.push({ from: sid, to: tid, label: (el || "").trim() });
      continue;
    }
    const nodeM = line.match(/^([A-Za-z0-9_]+)\s*(\(\(|\(\[|\[\[|\[|\(|\{|>)(.*?)(\)\)|\]\)|\]\]|\]|\)|\}|<)\s*$/);
    if (nodeM) {
      const [, id, open, label] = nodeM;
      nodes[id] = { ...(nodes[id] || {}), id, label: label.trim() || id, shape: shapeOpen[open] || "rect" };
    }
  }
  autoLayout(Object.values(nodes), edges);
  return { nodes, edges };
}

function autoLayout(nodeList, edges) {
  if (!nodeList.length) return;
  const adj = {};
  for (const n of nodeList) adj[n.id] = [];
  for (const e of edges) if (adj[e.from]) adj[e.from].push(e.to);
  const levels = {}, visited = new Set(), q = [nodeList[0]?.id];
  if (nodeList[0]) { levels[nodeList[0].id] = 0; visited.add(nodeList[0].id); }
  while (q.length) {
    const cur = q.shift();
    for (const nxt of (adj[cur] || [])) {
      if (!visited.has(nxt)) { visited.add(nxt); levels[nxt] = (levels[cur] || 0) + 1; q.push(nxt); }
    }
  }
  for (const n of nodeList) if (levels[n.id] === undefined) levels[n.id] = 0;
  const byLv = {};
  for (const n of nodeList) { const lv = levels[n.id]; (byLv[lv] = byLv[lv] || []).push(n); }
  for (const [lv, lvN] of Object.entries(byLv)) {
    lvN.forEach((n, i) => { n.x = i * 220 + 60; n.y = Number(lv) * 130 + 60; });
  }
}

async function makeDocxBlob(title, notes) {
  if (!window.docx) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/docx/8.5.0/docx.umd.min.js";
      s.onload = res; s.onerror = () => rej(new Error("docx load failed"));
      document.head.appendChild(s);
    });
  }
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, LevelFormat } = window.docx;
  const ch = [];
  ch.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: title, bold: true, size: 36 })] }));
  ch.push(new Paragraph({ children: [new TextRun("")] }));
  for (const line of notes.split("\n")) {
    if (/^# (.+)$/.test(line)) ch.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: line.replace(/^# /, ""), bold: true, size: 32 })] }));
    else if (/^## (.+)$/.test(line)) ch.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: line.replace(/^## /, ""), bold: true, size: 28 })] }));
    else if (/^### (.+)$/.test(line)) ch.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: line.replace(/^### /, ""), bold: true, size: 24 })] }));
    else if (/^[-•] (.+)$/.test(line)) ch.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: line.replace(/^[-•] /, "") })] }));
    else if (line.trim()) ch.push(new Paragraph({ children: [new TextRun({ text: line })], spacing: { after: 120 } }));
    else ch.push(new Paragraph({ children: [new TextRun("")] }));
  }
  const doc = new Document({
    numbering: { config: [{ reference: "nums", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }] },
    sections: [{ properties: {}, children: ch }]
  });
  return Packer.toBlob(doc);
}

// ── PALETTE ───────────────────────────────────────────────────────────────────
const NODE_COLORS = [
  { fill: "#0D1F2D", stroke: "#00D4FF", text: "#E0F8FF", glow: "rgba(0,212,255,0.35)" },
  { fill: "#1A0D2E", stroke: "#9D4EDD", text: "#F0E8FF", glow: "rgba(157,78,221,0.35)" },
  { fill: "#0D2218", stroke: "#00FF87", text: "#E0FFE8", glow: "rgba(0,255,135,0.35)" },
  { fill: "#2E1A00", stroke: "#FF9500", text: "#FFF3E0", glow: "rgba(255,149,0,0.35)" },
  { fill: "#2E000D", stroke: "#FF2D55", text: "#FFE0E8", glow: "rgba(255,45,85,0.35)" },
  { fill: "#0D1E2E", stroke: "#0A84FF", text: "#E0F0FF", glow: "rgba(10,132,255,0.35)" },
];

const NW = 160, NH = 50;

function getNodeColor(id, nodes) {
  return NODE_COLORS[Object.keys(nodes).indexOf(id) % NODE_COLORS.length];
}

// ── FLOW EDITOR ───────────────────────────────────────────────────────────────
function FlowEditor({ nodes, edges, onChange }) {
  const svgRef = useRef();
  const [selNode, setSelNode] = useState(null);
  const [selEdge, setSelEdge] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [connecting, setConnecting] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [pan, setPan] = useState({ x: 40, y: 20 });
  const [panningSt, setPanningSt] = useState(null);
  const [zoom, setZoom] = useState(0.9);
  const [editPopup, setEditPopup] = useState(null);
  const nodesR = useRef(nodes); nodesR.current = nodes;
  const edgesR = useRef(edges); edgesR.current = edges;

  const svgCoords = e => {
    const r = svgRef.current.getBoundingClientRect();
    return { x: (e.clientX - r.left - pan.x) / zoom, y: (e.clientY - r.top - pan.y) / zoom };
  };

  const onNodeMD = (e, id, mode) => {
    e.stopPropagation();
    if (mode === "connect") { setConnecting(id); return; }
    if (connecting) {
      if (connecting !== id) onChange(nodesR.current, [...edgesR.current, { from: connecting, to: id, label: "" }]);
      setConnecting(null); return;
    }
    setSelNode(id); setSelEdge(null);
    const pt = svgCoords(e), n = nodesR.current[id];
    setDragging({ id, ox: pt.x - n.x, oy: pt.y - n.y });
  };

  const onSvgMD = e => {
    if (connecting) { setConnecting(null); return; }
    setSelNode(null); setSelEdge(null);
    setPanningSt({ sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y });
  };

  const onMM = e => {
    const pt = svgCoords(e); setMousePos(pt);
    if (dragging) {
      const up = { ...nodesR.current };
      up[dragging.id] = { ...up[dragging.id], x: pt.x - dragging.ox, y: pt.y - dragging.oy };
      onChange(up, edgesR.current);
    }
    if (panningSt) setPan({ x: panningSt.px + (e.clientX - panningSt.sx), y: panningSt.py + (e.clientY - panningSt.sy) });
  };

  const onMU = () => { setDragging(null); setPanningSt(null); };
  const onWheel = e => { e.preventDefault(); setZoom(z => Math.max(0.2, Math.min(2.5, z - e.deltaY * 0.001))); };

  const addNode = () => {
    const id = "N" + Date.now();
    onChange({ ...nodesR.current, [id]: { id, label: "New Node", shape: "rect", x: 200 + Math.random() * 150, y: 200 + Math.random() * 150 } }, edgesR.current);
    setSelNode(id);
  };

  const deleteNode = id => {
    const u = { ...nodesR.current }; delete u[id];
    onChange(u, edgesR.current.filter(e => e.from !== id && e.to !== id));
    setSelNode(null);
  };

  const deleteEdge = i => { onChange(nodesR.current, edgesR.current.filter((_, j) => j !== i)); setSelEdge(null); };

  const saveEdit = () => {
    if (!editPopup) return;
    if (editPopup.type === "node") onChange({ ...nodesR.current, [editPopup.id]: { ...nodesR.current[editPopup.id], label: editPopup.label } }, edgesR.current);
    else onChange(nodesR.current, edgesR.current.map((e, i) => i === editPopup.id ? { ...e, label: editPopup.label } : e));
    setEditPopup(null);
  };

  const nodeCenter = n => ({ x: n.x + NW / 2, y: n.y + NH / 2 });

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {/* Toolbar */}
      <div className="fe-toolbar">
        <button className="fe-btn" onClick={addNode}>＋ Node</button>
        {selNode && <>
          <button className="fe-btn fe-btn-connect" onClick={() => setConnecting(connecting ? null : selNode)}>
            {connecting === selNode ? "✕ Cancel" : "⟶ Link"}
          </button>
          <select className="fe-sel" value={nodes[selNode]?.shape || "rect"} onChange={e => {
            onChange({ ...nodesR.current, [selNode]: { ...nodesR.current[selNode], shape: e.target.value } }, edgesR.current);
          }}>
            <option value="rect">▭ Box</option>
            <option value="round">◉ Pill</option>
            <option value="diamond">◇ Diamond</option>
          </select>
          <button className="fe-btn fe-btn-edit" onClick={() => setEditPopup({ type: "node", id: selNode, label: nodes[selNode]?.label || "" })}>✎ Rename</button>
          <button className="fe-btn fe-btn-del" onClick={() => deleteNode(selNode)}>✕ Del</button>
        </>}
        {selEdge !== null && !selNode && (
          <button className="fe-btn fe-btn-edit" onClick={() => setEditPopup({ type: "edge", id: selEdge, label: edges[selEdge]?.label || "" })}>✎ Label</button>
        )}
        {connecting && <span className="fe-hint">→ click a target node</span>}
        <div style={{ flex: 1 }} />
        <button className="fe-btn fe-zoom-btn" onClick={() => setZoom(z => Math.min(2.5, z + 0.15))}>＋</button>
        <span className="fe-zoom">{Math.round(zoom * 100)}%</span>
        <button className="fe-btn fe-zoom-btn" onClick={() => setZoom(z => Math.max(0.2, z - 0.15))}>－</button>
        <button className="fe-btn" onClick={() => { setZoom(0.9); setPan({ x: 40, y: 20 }); }}>⊡</button>
      </div>

      <svg ref={svgRef} style={{ flex: 1, minHeight: 360, display: "block", cursor: panningSt ? "grabbing" : connecting ? "crosshair" : "grab", background: "transparent", touchAction: "none" }}
        onMouseDown={onSvgMD} onMouseMove={onMM} onMouseUp={onMU} onWheel={onWheel}>
        <defs>
          <marker id="arr" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0,10 3.5,0 7" fill="#00D4FF" opacity="0.7" />
          </marker>
          <marker id="arr-sel" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0,10 3.5,0 7" fill="#00FF87" />
          </marker>
          <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="rgba(0,212,255,0.07)" />
          </pattern>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          <rect x="-3000" y="-3000" width="8000" height="8000" fill="url(#grid)" />
          {/* Edges */}
          {edges.map((e, i) => {
            const from = nodes[e.from], to = nodes[e.to];
            if (!from || !to) return null;
            const f = nodeCenter(from), t = nodeCenter(to);
            const dx = t.x - f.x, dy = t.y - f.y, len = Math.sqrt(dx * dx + dy * dy) || 1;
            const ux = dx / len, uy = dy / len;
            const sx = f.x + ux * NW * 0.52, sy = f.y + uy * NH * 0.52;
            const ex = t.x - ux * NW * 0.52, ey = t.y - uy * NH * 0.52;
            const mx = (sx + ex) / 2 - uy * 28, my = (sy + ey) / 2 + ux * 28;
            const isSel = selEdge === i;
            const midX = (sx + 2 * mx + ex) / 4, midY = (sy + 2 * my + ey) / 4;
            return (
              <g key={i} onClick={ev => { ev.stopPropagation(); setSelEdge(i); setSelNode(null); }}>
                <path d={`M${sx},${sy} Q${mx},${my} ${ex},${ey}`}
                  stroke={isSel ? "#00FF87" : "#00D4FF"} strokeWidth={isSel ? 2 : 1.5} fill="none"
                  markerEnd={isSel ? "url(#arr-sel)" : "url(#arr)"}
                  strokeDasharray={isSel ? "6 3" : "none"} opacity={isSel ? 1 : 0.5}
                  style={{ cursor: "pointer" }} />
                <path d={`M${sx},${sy} Q${mx},${my} ${ex},${ey}`} stroke="transparent" strokeWidth={16} fill="none" style={{ cursor: "pointer" }} />
                {e.label && (
                  <g onDoubleClick={ev => { ev.stopPropagation(); setEditPopup({ type: "edge", id: i, label: e.label }); }}>
                    <rect x={midX - e.label.length * 3 - 8} y={midY - 9} width={e.label.length * 6 + 16} height={18} rx={9}
                      fill="#0A0F1A" stroke="#00D4FF" strokeWidth={1} />
                    <text x={midX} y={midY + 1} textAnchor="middle" dominantBaseline="middle"
                      fill="#00D4FF" fontSize={9} fontFamily="'DM Mono',monospace" letterSpacing="1">{e.label}</text>
                  </g>
                )}
                {isSel && (
                  <g style={{ cursor: "pointer" }} onClick={ev => { ev.stopPropagation(); deleteEdge(i); }}>
                    <circle cx={midX} cy={midY} r={10} fill="#FF2D55" stroke="#FF6B84" strokeWidth={1.5} />
                    <text x={midX} y={midY + 1} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={12} style={{ pointerEvents: "none" }}>✕</text>
                  </g>
                )}
              </g>
            );
          })}
          {/* Connect line */}
          {connecting && nodes[connecting] && (
            <line x1={nodeCenter(nodes[connecting]).x} y1={nodeCenter(nodes[connecting]).y}
              x2={mousePos.x} y2={mousePos.y}
              stroke="#00FF87" strokeWidth={1.5} strokeDasharray="5 3" opacity={0.7} style={{ pointerEvents: "none" }} />
          )}
          {/* Nodes */}
          {Object.values(nodes).map(n => {
            const col = getNodeColor(n.id, nodes);
            const sel = selNode === n.id;
            const { x, y } = n;
            const w = NW, h = NH;
            return (
              <g key={n.id} onMouseDown={e => onNodeMD(e, n.id, "")} onDoubleClick={e => { e.stopPropagation(); setEditPopup({ type: "node", id: n.id, label: n.label }); }}
                style={{ cursor: "move" }}>
                {n.shape === "diamond" ? (
                  <polygon points={`${x + w / 2},${y - 4} ${x + w + 4},${y + h / 2} ${x + w / 2},${y + h + 4} ${x - 4},${y + h / 2}`}
                    fill={col.fill} stroke={sel ? col.text : col.stroke} strokeWidth={sel ? 2 : 1}
                    filter={sel ? `drop-shadow(0 0 10px ${col.glow})` : "none"} />
                ) : n.shape === "round" ? (
                  <rect x={x} y={y} width={w} height={h} rx={h / 2}
                    fill={col.fill} stroke={sel ? col.text : col.stroke} strokeWidth={sel ? 2 : 1}
                    filter={sel ? `drop-shadow(0 0 10px ${col.glow})` : "none"} />
                ) : (
                  <rect x={x} y={y} width={w} height={h} rx={6}
                    fill={col.fill} stroke={sel ? col.text : col.stroke} strokeWidth={sel ? 2 : 1}
                    filter={sel ? `drop-shadow(0 0 10px ${col.glow})` : "none"} />
                )}
                <rect x={x} y={y} width={3} height={h} rx={2} fill={col.stroke} opacity={0.8} style={{ pointerEvents: "none" }} />
                <text x={x + w / 2} y={y + h / 2 + 1} textAnchor="middle" dominantBaseline="middle"
                  fill={col.text} fontSize={10} fontFamily="'DM Mono',monospace" fontWeight="500" letterSpacing="0.5"
                  style={{ pointerEvents: "none", userSelect: "none" }}>
                  {n.label.length > 22 ? n.label.slice(0, 20) + "…" : n.label}
                </text>
                {sel && (
                  <circle cx={x + w} cy={y + h / 2} r={7} fill={col.stroke} stroke={col.text} strokeWidth={1.5}
                    style={{ cursor: "crosshair" }}
                    onMouseDown={e => { e.stopPropagation(); onNodeMD(e, n.id, "connect"); }} />
                )}
              </g>
            );
          })}
        </g>
      </svg>

      <div className="fe-hint-bar">Double-click to rename · Drag to move · Select → Link nodes · Scroll to zoom</div>

      {editPopup && (
        <div className="ep-overlay" onClick={() => setEditPopup(null)}>
          <div className="ep" onClick={e => e.stopPropagation()}>
            <div className="ep-title">{editPopup.type === "node" ? "Rename Node" : "Set Edge Label"}</div>
            <input className="ep-input" autoFocus value={editPopup.label}
              onChange={e => setEditPopup({ ...editPopup, label: e.target.value })}
              onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditPopup(null); }}
              placeholder="Enter label…" />
            <div className="ep-row">
              <button className="ep-ok" onClick={saveEdit}>Confirm</button>
              <button className="ep-cancel" onClick={() => setEditPopup(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── CSS ───────────────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&family=Instrument+Serif:ital@0;1&display=swap');

  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html{scroll-behavior:smooth;font-size:16px}

  :root{
    --bg:#05070F;
    --surf:#080C17;
    --surf2:#0D1220;
    --surf3:#111828;
    --border:rgba(0,212,255,0.1);
    --border2:rgba(0,212,255,0.2);
    --cyan:#00D4FF;
    --cyan2:#00A8CC;
    --green:#00FF87;
    --purple:#9D4EDD;
    --red:#FF2D55;
    --orange:#FF9500;
    --text:#E8F4FF;
    --muted:#4A6A7A;
    --muted2:#2A3A4A;
    --r:8px;
    --r-lg:14px;
    --nav-h:58px;
    --shadow:0 4px 24px rgba(0,0,0,0.6),0 1px 4px rgba(0,212,255,0.05);
    --shadow-lg:0 16px 64px rgba(0,0,0,0.8),0 4px 20px rgba(0,212,255,0.08);
  }

  body{background:var(--bg);color:var(--text);font-family:'DM Mono',monospace;-webkit-font-smoothing:antialiased;min-height:100vh;}

  body::before{content:'';position:fixed;inset:0;z-index:0;pointer-events:none;
    background:radial-gradient(ellipse 80% 60% at 10% 0%,rgba(0,212,255,0.04),transparent),
               radial-gradient(ellipse 60% 40% at 90% 100%,rgba(157,78,221,0.04),transparent);}

  .app{min-height:100vh;position:relative;z-index:1;display:flex;flex-direction:column}

  /* ── TOPNAV ── */
  .topnav{
    position:fixed;top:0;left:0;right:0;z-index:200;
    height:var(--nav-h);
    background:rgba(5,7,15,0.92);
    backdrop-filter:blur(20px);
    -webkit-backdrop-filter:blur(20px);
    border-bottom:1px solid var(--border);
    display:flex;align-items:center;justify-content:space-between;
    padding:0 32px;
  }
  .topnav-brand{display:flex;align-items:center;gap:14px}
  .brand-logo{
    width:36px;height:36px;border-radius:8px;
    border:1px solid var(--border2);
    background:linear-gradient(135deg,#0D1A2E,#0A2030);
    display:flex;align-items:center;justify-content:center;
    font-size:16px;
    box-shadow:0 0 20px rgba(0,212,255,0.15);
  }
  .brand-name{font-family:'Syne',sans-serif;font-size:20px;font-weight:800;color:var(--text);letter-spacing:-0.5px}
  .brand-name span{color:var(--cyan)}
  .brand-tag{font-size:9px;letter-spacing:3px;text-transform:uppercase;color:var(--muted);margin-top:1px}
  .topnav-right{display:flex;align-items:center;gap:12px}
  .status-dot{width:6px;height:6px;border-radius:50%;background:var(--green);box-shadow:0 0 8px var(--green);animation:blink 2s ease infinite}
  @keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}
  .nav-meta{font-size:9px;letter-spacing:2.5px;text-transform:uppercase;color:var(--muted)}

  .page-body{margin-top:var(--nav-h);flex:1;display:flex;flex-direction:column}

  /* ── REVEAL ── */
  .reveal{opacity:0;transform:translateY(16px);transition:opacity .6s ease,transform .6s ease}
  .reveal.in{opacity:1;transform:none}

  /* ── UPLOAD LAYOUT ── */
  .upload-wrap{
    display:grid;
    grid-template-columns:45% 55%;
    min-height:calc(100vh - var(--nav-h));
  }

  .upload-left{
    display:flex;flex-direction:column;justify-content:center;
    padding:80px 56px 80px 64px;
    border-right:1px solid var(--border);
    position:relative;
    overflow:hidden;
  }
  .upload-left::before{
    content:'';position:absolute;top:-100px;left:-100px;
    width:400px;height:400px;border-radius:50%;
    background:radial-gradient(circle,rgba(0,212,255,0.05),transparent 70%);
    pointer-events:none;
  }

  .upload-right{
    display:flex;flex-direction:column;justify-content:center;
    padding:60px 64px 60px 56px;
    gap:16px;
    overflow-y:auto;
  }

  .eyebrow{
    font-size:9px;letter-spacing:4px;text-transform:uppercase;color:var(--cyan);
    display:flex;align-items:center;gap:10px;margin-bottom:20px;
    font-weight:500;
  }
  .eyebrow::before{content:'';width:20px;height:1px;background:var(--cyan);opacity:0.5}

  h1{
    font-family:'Syne',sans-serif;
    font-size:clamp(36px,4.5vw,60px);
    font-weight:800;line-height:1.0;color:var(--text);letter-spacing:-1.5px;
    margin-bottom:20px;
  }
  h1 em{font-style:italic;font-family:'Instrument Serif',serif;color:var(--cyan);font-weight:400}

  .hero-desc{
    font-size:13px;line-height:2;color:var(--muted);
    margin-bottom:40px;max-width:400px;font-weight:300;
  }

  .feature-list{display:flex;flex-direction:column;gap:0;border-top:1px solid var(--border)}
  .feat-item{
    display:flex;align-items:center;gap:12px;padding:12px 0;
    border-bottom:1px solid var(--border);
    font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);
    transition:color .2s;
  }
  .feat-item:hover{color:var(--text)}
  .feat-dot{width:5px;height:5px;border-radius:50%;background:var(--cyan);flex-shrink:0;box-shadow:0 0 6px var(--cyan)}

  /* ── DROP ZONE ── */
  .drop{
    border:1.5px dashed var(--border2);
    background:var(--surf);
    border-radius:var(--r-lg);
    padding:40px 32px;
    text-align:center;cursor:pointer;transition:all .3s;
    min-height:220px;display:flex;flex-direction:column;align-items:center;justify-content:center;
    position:relative;overflow:hidden;
  }
  .drop::before{
    content:'';position:absolute;inset:0;
    background:radial-gradient(ellipse at center,rgba(0,212,255,0.03),transparent);
    pointer-events:none;
  }
  .drop:hover,.drop.over{border-color:var(--cyan);box-shadow:0 0 40px rgba(0,212,255,0.1),var(--shadow);}
  .drop-icon{font-size:36px;margin-bottom:14px}
  .drop-title{font-family:'Syne',sans-serif;font-size:18px;font-weight:700;color:var(--text);margin-bottom:6px;letter-spacing:-0.3px}
  .drop-sub{font-size:11px;color:var(--muted);letter-spacing:1px}
  .drop-hint{margin-top:14px;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--muted2)}

  /* ── IMAGE THUMBNAILS ── */
  .drop-compact{min-height:90px!important;padding:16px 20px!important;flex-direction:row!important;gap:10px}
  .img-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:10px}
  .img-thumb{
    position:relative;border-radius:8px;overflow:hidden;
    border:1px solid var(--border);aspect-ratio:1;background:var(--surf2);
    box-shadow:var(--shadow);transition:all .2s;cursor:pointer;
  }
  .img-thumb:hover{border-color:var(--cyan);transform:scale(1.03);box-shadow:0 0 20px rgba(0,212,255,0.15)}
  .img-thumb img{width:100%;height:100%;object-fit:cover;display:block}
  .img-thumb-num{position:absolute;bottom:5px;left:7px;font-size:9px;font-weight:700;color:var(--text);text-shadow:0 1px 4px rgba(0,0,0,0.8);letter-spacing:1px}
  .img-thumb-del{
    position:absolute;top:5px;right:5px;width:20px;height:20px;border-radius:50%;
    border:none;cursor:pointer;background:rgba(255,45,85,0.8);color:#fff;font-size:9px;
    display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .15s;
  }
  .img-thumb:hover .img-thumb-del{opacity:1}

  /* ── UPLOAD BUTTONS ── */
  .upload-opts{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .upload-opt{
    display:flex;align-items:center;gap:12px;padding:16px 18px;
    border:1px solid var(--border);border-radius:var(--r);
    background:var(--surf);cursor:pointer;transition:all .2s;
  }
  .upload-opt:hover{border-color:var(--cyan);background:var(--surf2);box-shadow:0 0 20px rgba(0,212,255,0.08)}
  .upload-opt-icon{font-size:20px;flex-shrink:0}
  .upload-opt-label{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--text);font-weight:500}
  .upload-opt-sub{font-size:10px;color:var(--muted);margin-top:2px}

  /* ── BUTTONS ── */
  .btn{font-size:10px;letter-spacing:2.5px;text-transform:uppercase;font-weight:500;border:none;cursor:pointer;border-radius:var(--r);display:inline-flex;align-items:center;gap:8px;transition:all .2s;padding:10px 20px;white-space:nowrap;font-family:'DM Mono',monospace}
  .btn:disabled{opacity:.35;cursor:not-allowed}
  .btn-primary{
    background:linear-gradient(135deg,var(--cyan),var(--cyan2));
    color:#000;width:100%;justify-content:center;padding:16px;font-size:11px;
    letter-spacing:3px;box-shadow:0 4px 24px rgba(0,212,255,0.3);
    font-weight:700;border-radius:var(--r);position:relative;overflow:hidden;
  }
  .btn-primary::after{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,0.1),transparent);pointer-events:none}
  .btn-primary:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 8px 36px rgba(0,212,255,0.4)}
  .btn-primary:active:not(:disabled){transform:translateY(0)}
  .btn-ghost{background:transparent;border:1px solid var(--border);color:var(--muted);padding:8px 16px;font-size:9px}
  .btn-ghost:hover{border-color:var(--cyan);color:var(--cyan)}

  /* ── LOADING ── */
  .loading-wrap{text-align:center;padding:48px 20px}
  .loading-ring{
    width:48px;height:48px;margin:0 auto 20px;border-radius:50%;
    border:2px solid var(--border);border-top-color:var(--cyan);
    animation:spin .8s linear infinite;box-shadow:0 0 20px rgba(0,212,255,0.2);
  }
  @keyframes spin{to{transform:rotate(360deg)}}
  .loading-msg{font-size:11px;letter-spacing:2px;color:var(--muted);margin-bottom:16px;text-transform:uppercase}
  .progress-track{width:180px;margin:0 auto;height:1px;background:var(--border);border-radius:2px;overflow:hidden}
  .progress-fill{height:100%;background:var(--cyan);border-radius:2px;transition:width .6s ease;box-shadow:0 0 8px var(--cyan)}

  /* ── ERROR ── */
  .err-box{background:rgba(255,45,85,0.06);border:1px solid rgba(255,45,85,0.2);border-radius:var(--r);padding:12px 16px;color:var(--red);font-size:11px;margin-top:12px;line-height:1.6}
  .err-box::before{content:'⚠  '}

  /* ═══════════════════════ RESULT ═══════════════════════ */
  .result-page{display:flex;flex-direction:column;flex:1}

  .res-topbar{
    position:sticky;top:var(--nav-h);z-index:90;
    background:rgba(5,7,15,0.95);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
    border-bottom:1px solid var(--border);padding:12px 32px;
    display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;
  }
  .res-eyebrow{font-size:8px;letter-spacing:3px;text-transform:uppercase;color:var(--muted);margin-bottom:3px}
  .res-title{font-family:'Syne',sans-serif;font-size:20px;font-weight:700;color:var(--text);letter-spacing:-0.3px}

  .result-split{display:flex;flex-direction:column;flex:1}

  .result-panel{
    display:flex;flex-direction:column;
    border-bottom:1px solid var(--border);
    height:calc((100vh - var(--nav-h) - 55px) / 2);
    overflow:hidden;
  }
  .result-panel:last-child{border-bottom:none}

  .panel-hdr{
    display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;
    padding:10px 24px;background:var(--surf);border-bottom:1px solid var(--border);
    position:sticky;top:0;z-index:10;flex-shrink:0;
  }
  .panel-label{
    font-size:9px;letter-spacing:3px;text-transform:uppercase;color:var(--cyan);
    display:flex;align-items:center;gap:8px;font-weight:500;
  }
  .panel-label::before{content:'';width:12px;height:1px;background:var(--cyan)}
  .panel-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}

  /* ── NOTES CONTENT ── */
  .notes-ta-full{
    width:100%;flex:1;background:transparent;border:none;outline:none;
    padding:24px 32px;color:var(--muted);font-family:'DM Mono',monospace;font-size:12px;
    line-height:2;resize:none;overflow-y:auto;
  }
  .notes-ta-full::placeholder{color:var(--muted2)}
  .notes-prev-full{padding:24px 32px;flex:1;overflow-y:auto}

  .nc h1{font-family:'Syne',sans-serif;font-size:20px;font-weight:700;color:var(--text);margin:0 0 16px;padding-bottom:10px;border-bottom:1px solid var(--border)}
  .nc h2{font-family:'Syne',sans-serif;font-size:16px;font-weight:600;color:var(--text);margin:20px 0 8px}
  .nc h3{font-size:9px;font-weight:500;color:var(--cyan);margin:16px 0 6px;text-transform:uppercase;letter-spacing:3px}
  .nc p{font-size:13px;line-height:2;color:#7A9AAA;margin-bottom:10px}
  .nc ul{list-style:none;padding:0;margin:8px 0 12px}
  .nc ol{padding-left:22px;margin:8px 0 12px}
  .nc li{font-size:12.5px;line-height:1.9;color:#7A9AAA;padding:2px 0 2px 20px;position:relative}
  .nc ul li::before{content:'›';position:absolute;left:4px;color:var(--cyan);font-size:14px}
  .nc ol li{padding-left:0;list-style:decimal}
  .nc ol li::before{display:none}
  .nc strong{color:var(--text);font-weight:700}
  .nc em{color:var(--cyan);font-style:italic}
  .nc code{background:rgba(0,212,255,0.08);color:var(--cyan);padding:2px 7px;border-radius:4px;font-size:11px}
  .nc hr{border:none;border-top:1px solid var(--border);margin:18px 0}

  /* ── TOGGLES & DOWNLOAD BUTTONS ── */
  .toggle-group{display:flex;gap:2px;background:var(--surf2);border-radius:6px;padding:2px;border:1px solid var(--border)}
  .toggle-btn{font-size:8px;letter-spacing:1px;text-transform:uppercase;padding:4px 10px;border:none;border-radius:4px;cursor:pointer;background:transparent;color:var(--muted);transition:all .15s;font-family:'DM Mono',monospace}
  .toggle-btn.active{background:var(--cyan);color:#000;font-weight:700}

  .dl-btn{font-size:8px;letter-spacing:1.5px;text-transform:uppercase;font-weight:500;border:none;cursor:pointer;border-radius:6px;display:inline-flex;align-items:center;gap:5px;padding:6px 11px;transition:all .2s;white-space:nowrap;font-family:'DM Mono',monospace}
  .dl-btn:disabled{opacity:.35;cursor:not-allowed}
  .dl-jpg{background:rgba(0,212,255,0.08);border:1px solid rgba(0,212,255,0.2);color:var(--cyan)}
  .dl-jpg:hover:not(:disabled){background:rgba(0,212,255,0.15)}
  .dl-doc{background:rgba(157,78,221,0.08);border:1px solid rgba(157,78,221,0.2);color:var(--purple)}
  .dl-doc:hover:not(:disabled){background:rgba(157,78,221,0.15)}
  .dl-svg{background:rgba(0,255,135,0.08);border:1px solid rgba(0,255,135,0.2);color:var(--green)}
  .dl-svg:hover:not(:disabled){background:rgba(0,255,135,0.15)}

  /* ── FLOW EDITOR ── */
  .diagram-panel-body{flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0}
  .diagram-panel-body > div{flex:1;display:flex;flex-direction:column;min-height:0}

  .fe-toolbar{display:flex;align-items:center;gap:5px;padding:8px 14px;background:var(--surf2);border-bottom:1px solid var(--border);flex-shrink:0;flex-wrap:wrap;min-height:46px;position:relative}
  .fe-btn{font-size:8px;letter-spacing:.5px;text-transform:uppercase;padding:5px 10px;border:1px solid var(--border);background:var(--surf);color:var(--muted);border-radius:4px;cursor:pointer;transition:all .15s;white-space:nowrap;font-family:'DM Mono',monospace;font-weight:500}
  .fe-btn:hover{background:var(--surf3);border-color:var(--cyan);color:var(--cyan)}
  .fe-btn-connect{border-color:rgba(0,212,255,0.2);color:var(--cyan)}
  .fe-btn-edit{border-color:rgba(0,255,135,0.2);color:var(--green)}
  .fe-btn-del{border-color:rgba(255,45,85,0.2);color:var(--red)}
  .fe-zoom-btn{padding:4px 8px}
  .fe-sel{font-size:8px;padding:4px 8px;border:1px solid var(--border);background:var(--surf);color:var(--text);border-radius:4px;cursor:pointer;font-family:'DM Mono',monospace}
  .fe-zoom{font-size:9px;color:var(--muted);min-width:30px;text-align:center}
  .fe-hint{font-size:10px;color:var(--cyan);animation:glow-pulse 1.4s ease infinite;letter-spacing:1px}
  @keyframes glow-pulse{0%,100%{opacity:0.3}50%{opacity:1}}
  .fe-hint-bar{font-size:10px;color:var(--muted2);text-align:center;padding:6px;flex-shrink:0;border-top:1px solid var(--border);letter-spacing:1px}

  /* ── EDIT POPUP ── */
  .ep-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:500;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);animation:fadeIn .15s ease}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  .ep{background:var(--surf);border:1px solid var(--border2);border-radius:var(--r-lg);padding:28px;width:320px;box-shadow:var(--shadow-lg),0 0 60px rgba(0,212,255,0.1);animation:slideUp .2s ease}
  @keyframes slideUp{from{transform:translateY(12px);opacity:0}to{transform:none;opacity:1}}
  .ep-title{font-family:'Syne',sans-serif;font-size:16px;font-weight:700;color:var(--text);margin-bottom:16px;letter-spacing:-0.3px}
  .ep-input{width:100%;background:var(--surf2);border:1px solid var(--border);border-radius:var(--r);padding:10px 14px;color:var(--text);font-family:'DM Mono',monospace;font-size:13px;outline:none;margin-bottom:14px;transition:border-color .15s}
  .ep-input:focus{border-color:var(--cyan)}
  .ep-row{display:flex;gap:8px}
  .ep-ok{flex:1;font-family:'DM Mono',monospace;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;padding:10px;border:none;border-radius:var(--r);cursor:pointer;background:var(--cyan);color:#000;font-weight:700;transition:all .15s}
  .ep-ok:hover{background:var(--cyan2)}
  .ep-cancel{flex:1;font-family:'DM Mono',monospace;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;padding:10px;border:1px solid var(--border);border-radius:var(--r);cursor:pointer;background:transparent;color:var(--muted);transition:all .15s}
  .ep-cancel:hover{border-color:var(--red);color:var(--red)}

  /* ── FOOTER ── */
  .dl-err{background:rgba(255,45,85,0.06);border:1px solid rgba(255,45,85,0.15);border-radius:var(--r);padding:10px 14px;color:var(--red);font-size:11px;margin:10px 32px}
  .footer{padding:18px 32px;border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-top:auto}
  .footer-brand{font-family:'Syne',sans-serif;font-size:13px;font-weight:700;color:var(--muted)}
  .footer-brand span{color:var(--cyan)}
  .footer-meta{font-size:8px;letter-spacing:2.5px;text-transform:uppercase;color:var(--muted2)}

  /* ── RESPONSIVE ── */
  @media(max-width:1024px){
    .topnav{padding:0 24px}
    .upload-wrap{grid-template-columns:1fr;min-height:auto}
    .upload-left{padding:48px 32px;border-right:none;border-bottom:1px solid var(--border)}
    .upload-right{padding:40px 32px}
    .result-panel{height:auto;overflow:visible}
    .res-topbar{padding:10px 24px}
    .panel-hdr{padding:10px 18px}
    .notes-ta-full,.notes-prev-full{padding:20px 24px}
  }
  @media(max-width:767px){
    :root{--nav-h:50px}
    .topnav{padding:0 16px}
    .brand-tag{display:none}
    .brand-name{font-size:17px}
    h1{font-size:clamp(28px,8vw,40px);letter-spacing:-0.5px}
    .upload-left{padding:32px 20px}
    .upload-right{padding:28px 20px 48px}
    .upload-opts{grid-template-columns:1fr}
    .hero-desc{font-size:12px}
    .feature-list{display:none}
    .drop{padding:36px 20px;min-height:180px}
    .btn-primary{padding:14px;font-size:10px}
    .result-panel{height:auto;overflow:visible}
    .res-topbar{padding:10px 16px}
    .panel-hdr{padding:8px 14px;flex-direction:column;align-items:flex-start}
    .panel-actions{overflow-x:auto;flex-wrap:nowrap;width:100%;padding-bottom:2px}
    .dl-btn{flex-shrink:0}
    .notes-ta-full,.notes-prev-full{padding:16px;min-height:300px}
    .fe-toolbar{overflow-x:auto;flex-wrap:nowrap;padding:6px 10px;gap:4px}
    .fe-btn{flex-shrink:0}
    .footer{padding:14px 16px;flex-direction:column;align-items:center;text-align:center}
    .dl-err{margin:8px 16px}
  }
  @media(min-width:1280px){
    .topnav{padding:0 56px}
    .upload-wrap{max-width:1440px;margin:0 auto}
    .res-topbar{padding:12px 56px}
    .panel-hdr{padding:12px 36px}
    .notes-ta-full,.notes-prev-full{padding:32px 48px}
    .footer{padding:20px 56px}
  }
  @media(hover:none){
    .btn-primary:hover:not(:disabled){transform:none}
  }
`;

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const [images, setImages] = useState([]);
  const [step, setStep] = useState("upload");
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState("");
  const [loadPct, setLoadPct] = useState(0);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [notesMode, setNotesMode] = useState("preview");
  const [flowNodes, setFlowNodes] = useState({});
  const [flowEdges, setFlowEdges] = useState([]);
  const [dlError, setDlError] = useState("");
  const [dlBusy, setDlBusy] = useState("");
  const [revealed, setRevealed] = useState(false);

  const fileRef = useRef();
  const cameraRef = useRef();
  const notesCardRef = useRef();
  const flowCardRef = useRef();

  const BACKEND_URL = "https://inkparse-backend.onrender.com";

  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 80);
    return () => clearTimeout(t);
  }, []);

  const readImageFile = file => new Promise(resolve => {
    if (!file || !file.type.startsWith("image/")) return resolve(null);
    const r = new FileReader();
    r.onload = e => resolve({ src: e.target.result, b64: e.target.result.split(",")[1], mime: file.type || "image/jpeg", name: file.name || "image" });
    r.readAsDataURL(file);
  });

  const handleFiles = useCallback(async fileList => {
    const files = Array.from(fileList).filter(f => f.type.startsWith("image/"));
    if (!files.length) return;
    const read = await Promise.all(files.map(readImageFile));
    const valid = read.filter(Boolean);
    setImages(prev => {
      const existing = new Set(prev.map(i => i.name + i.src.slice(-20)));
      return [...prev, ...valid.filter(i => !existing.has(i.name + i.src.slice(-20)))];
    });
  }, []);

  const handleDrop = useCallback(e => {
    e.preventDefault(); setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const removeImage = idx => setImages(prev => prev.filter((_, i) => i !== idx));

  const analyze = async () => {
    if (!images.length) return;
    setLoading(true); setError(""); setDlError(""); setLoadPct(0);
    const stages = [
      [0, "Transmitting images…"], [22, "Decoding handwriting…"],
      [50, "Structuring content…"], [74, "Building flow diagram…"], [90, "Finalising…"]
    ];
    let mi = 0;
    const tick = setInterval(() => {
      if (mi < stages.length) { setLoadMsg(stages[mi][1]); setLoadPct(stages[mi][0]); mi++; }
    }, 850);
    try {
      const payload = images.length === 1
        ? { imageBase64: images[0].b64, imageMime: images[0].mime }
        : { images: images.map(i => ({ imageBase64: i.b64, imageMime: i.mime })) };
      const res = await fetch(`${BACKEND_URL}/api/analyze`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
      });
      clearInterval(tick); setLoadPct(96); setLoadMsg("Processing response…");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      setTitle(data.title || "Notes");
      setNotes(data.notes || "");
      const code = (data.mermaidCode || "flowchart TD\n  A([Start]) --> B[Content]").replace(/```[\w]*\n?/g, "").trim();
      const { nodes: n, edges: e } = parseMermaidToGraph(code);
      setFlowNodes(n); setFlowEdges(e);
      setLoadPct(100);
      setTimeout(() => setStep("result"), 300);
    } catch (e) {
      clearInterval(tick);
      setError(e.message.includes("fetch") || e.message.includes("Failed")
        ? "Unable to reach the server. Please ensure the backend is running."
        : e.message);
    } finally { setLoading(false); }
  };

  const loadH2C = () => new Promise((res, rej) => {
    if (window.html2canvas) return res();
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
    s.onload = res; s.onerror = () => rej(new Error("html2canvas failed"));
    document.head.appendChild(s);
  });

  const triggerDownload = (url, filename) => {
    const a = document.createElement("a"); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const dlNotesJpg = async () => {
    setDlBusy("notes-jpg"); setDlError("");
    try {
      await loadH2C();
      const canvas = await window.html2canvas(notesCardRef.current, { scale: 2, backgroundColor: "#080C17", useCORS: true, logging: false });
      triggerDownload(canvas.toDataURL("image/jpeg", 0.95), `${title || "notes"}.jpg`);
    } catch (e) { setDlError("JPG export failed: " + e.message); }
    finally { setDlBusy(""); }
  };

  const dlNotesDocx = async () => {
    setDlBusy("notes-docx"); setDlError("");
    try {
      const blob = await makeDocxBlob(title, notes);
      const url = URL.createObjectURL(blob);
      triggerDownload(url, `${title || "notes"}.docx`);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { setDlError("DOCX export failed: " + e.message); }
    finally { setDlBusy(""); }
  };

  const dlDiagramJpg = async () => {
    setDlBusy("diag-jpg"); setDlError("");
    try {
      await loadH2C();
      const svgEl = flowCardRef.current?.querySelector("svg");
      if (!svgEl) throw new Error("Diagram not found");
      const canvas = await window.html2canvas(svgEl, { scale: 2, backgroundColor: "#05070F", useCORS: true, logging: false });
      triggerDownload(canvas.toDataURL("image/jpeg", 0.95), `${title || "diagram"}.jpg`);
    } catch (e) { setDlError("JPG export failed: " + e.message); }
    finally { setDlBusy(""); }
  };

  const dlDiagramSvg = () => {
    setDlError("");
    try {
      const svgEl = flowCardRef.current?.querySelector("svg");
      if (!svgEl) throw new Error("Diagram not found");
      const clone = svgEl.cloneNode(true);
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      clone.setAttribute("style", "background:#05070F");
      const blob = new Blob([clone.outerHTML], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      triggerDownload(url, `${title || "diagram"}.svg`);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { setDlError("SVG export failed: " + e.message); }
  };

  const reset = () => {
    setImages([]); setStep("upload"); setNotes(""); setFlowNodes({}); setFlowEdges([]);
    setError(""); setDlError(""); setTitle(""); setLoadPct(0);
  };

  const year = new Date().getFullYear();

  return (
    <>
      <style>{css}</style>
      <div className="app">

        {/* TOPNAV */}
        <nav className="topnav">
          <div className="topnav-brand">
            <div className="brand-logo">✒</div>
            <div>
              <div className="brand-name">Script<span>AI</span></div>
              <div className="brand-tag">Handwriting Intelligence</div>
            </div>
          </div>
          <div className="topnav-right">
            {step === "result" && (
              <button className="btn btn-ghost" onClick={reset}>↩ New Upload</button>
            )}
            <div className="status-dot" />
            <div className="nav-meta">v2.0 · {year}</div>
          </div>
        </nav>

        <div className="page-body">

          {/* ── UPLOAD STEP ── */}
          {step === "upload" && (
            <div className={`upload-wrap reveal ${revealed ? "in" : ""}`}>

              <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }}
                onChange={e => { handleFiles(e.target.files); e.target.value = ""; }} />
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
                onChange={e => { handleFiles(e.target.files); e.target.value = ""; }} />

              {/* LEFT */}
              <div className="upload-left">
                <div className="eyebrow">AI-Powered Notes Reader</div>
                <h1>Raw notes,<br /><em>instantly structured.</em></h1>
                <p className="hero-desc">
                  Photograph any handwritten notes — messy, rotated, multi-page — and get clean
                  structured text plus an interactive flowchart. In seconds.
                </p>
                <div className="feature-list">
                  <div className="feat-item"><span className="feat-dot" />Reads any handwriting style</div>
                  <div className="feat-item"><span className="feat-dot" />Multi-page document support</div>
                  <div className="feat-item"><span className="feat-dot" />Auto flowchart generation</div>
                  <div className="feat-item"><span className="feat-dot" />Export JPG · DOCX · SVG</div>
                  <div className="feat-item"><span className="feat-dot" />Fully editable diagram</div>
                </div>
              </div>

              {/* RIGHT */}
              <div className="upload-right">

                {/* Drop zone */}
                <div className={`drop ${dragOver ? "over" : ""} ${images.length ? "drop-compact" : ""}`}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileRef.current.click()}>
                  {images.length === 0 ? (
                    <>
                      <span className="drop-icon">📓</span>
                      <div className="drop-title">Drop images here</div>
                      <div className="drop-sub">or click to browse files</div>
                      <div className="drop-hint">JPG · PNG · WEBP · Multiple files supported</div>
                    </>
                  ) : (
                    <>
                      <span className="drop-icon" style={{ fontSize: 24, marginBottom: 6 }}>＋</span>
                      <div className="drop-title" style={{ fontSize: 14 }}>Add more pages</div>
                    </>
                  )}
                </div>

                {/* Thumbnails */}
                {images.length > 0 && (
                  <div className="img-grid">
                    {images.map((img, idx) => (
                      <div key={idx} className="img-thumb">
                        <img src={img.src} alt={`Page ${idx + 1}`} />
                        <div className="img-thumb-num">P{idx + 1}</div>
                        <button className="img-thumb-del" onClick={e => { e.stopPropagation(); removeImage(idx); }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload options */}
                <div className="upload-opts">
                  <button className="upload-opt" onClick={e => { e.stopPropagation(); fileRef.current.click(); }}>
                    <span className="upload-opt-icon">🖼</span>
                    <div>
                      <div className="upload-opt-label">Upload Files</div>
                      <div className="upload-opt-sub">select from device</div>
                    </div>
                  </button>
                  <button className="upload-opt" onClick={e => { e.stopPropagation(); cameraRef.current.click(); }}>
                    <span className="upload-opt-icon">📷</span>
                    <div>
                      <div className="upload-opt-label">Take Photo</div>
                      <div className="upload-opt-sub">use camera</div>
                    </div>
                  </button>
                </div>

                {loading ? (
                  <div className="loading-wrap">
                    <div className="loading-ring" />
                    <div className="loading-msg">{loadMsg || "Processing…"}</div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${loadPct}%` }} />
                    </div>
                  </div>
                ) : (
                  <button className="btn btn-primary" disabled={!images.length || loading} onClick={analyze}>
                    {images.length > 1 ? `⚡ Analyse ${images.length} Pages` : "⚡ Analyse & Structure Notes"}
                  </button>
                )}

                {error && <div className="err-box">{error}</div>}
              </div>
            </div>
          )}

          {/* ── RESULT STEP ── */}
          {step === "result" && (
            <div className="result-page">

              <div className="res-topbar">
                <div>
                  <div className="res-eyebrow">Structured from {images.length} image{images.length > 1 ? "s" : ""}</div>
                  <div className="res-title">{title}</div>
                </div>
                <button className="btn btn-ghost" onClick={reset}>↩ New Upload</button>
              </div>

              <div className="result-split">

                {/* NOTES PANEL */}
                <div className="result-panel" ref={notesCardRef}>
                  <div className="panel-hdr">
                    <div className="panel-label">Extracted Notes</div>
                    <div className="panel-actions">
                      <div className="toggle-group">
                        <button className={`toggle-btn ${notesMode === "preview" ? "active" : ""}`} onClick={() => setNotesMode("preview")}>Preview</button>
                        <button className={`toggle-btn ${notesMode === "edit" ? "active" : ""}`} onClick={() => setNotesMode("edit")}>Edit</button>
                      </div>
                      <button className="dl-btn dl-jpg" disabled={dlBusy === "notes-jpg"} onClick={dlNotesJpg}>
                        {dlBusy === "notes-jpg" ? "…" : "🖼 JPG"}
                      </button>
                      <button className="dl-btn dl-doc" disabled={dlBusy === "notes-docx"} onClick={dlNotesDocx}>
                        {dlBusy === "notes-docx" ? "…" : "📄 DOCX"}
                      </button>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
                    {notesMode === "edit"
                      ? <textarea className="notes-ta-full" value={notes} onChange={e => setNotes(e.target.value)} spellCheck={false} placeholder="Your extracted notes will appear here…" />
                      : <div className="notes-prev-full nc" dangerouslySetInnerHTML={{ __html: mdToHtml(notes) }} />
                    }
                  </div>
                </div>

                {/* DIAGRAM PANEL */}
                <div className="result-panel" ref={flowCardRef}>
                  <div className="panel-hdr">
                    <div className="panel-label">Visual Flow Diagram</div>
                    <div className="panel-actions">
                      <span style={{ fontSize: 8, letterSpacing: 2, textTransform: "uppercase", color: "var(--muted2)" }}>Interactive</span>
                      <button className="dl-btn dl-jpg" disabled={dlBusy === "diag-jpg"} onClick={dlDiagramJpg}>
                        {dlBusy === "diag-jpg" ? "…" : "🖼 JPG"}
                      </button>
                      <button className="dl-btn dl-svg" onClick={dlDiagramSvg}>◈ SVG</button>
                    </div>
                  </div>
                  <div className="diagram-panel-body">
                    <FlowEditor nodes={flowNodes} edges={flowEdges} onChange={(n, e) => { setFlowNodes(n); setFlowEdges(e); }} />
                  </div>
                </div>

              </div>

              {dlError && <div className="dl-err">⚠ {dlError}</div>}
            </div>
          )}

          <footer className="footer">
            <div className="footer-brand">Script<span>AI</span> — Handwriting to knowledge</div>
            <div className="footer-meta">AI Powered · {year}</div>
          </footer>

        </div>
      </div>
    </>
  );
}
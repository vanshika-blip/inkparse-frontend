import { useState, useRef, useCallback, useEffect } from "react";

// ── UTILS ─────────────────────────────────────────────────────────────────────
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
    lvN.forEach((n, i) => { n.x = i * 220 + 60; n.y = Number(lv) * 140 + 60; });
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

// ── NODE COLORS — light paper palette ────────────────────────
const NODE_COLORS = [
  { fill: "#EEF3FB", stroke: "#4A6FA5", text: "#1A2235", glow: "rgba(74,111,165,0.25)" },
  { fill: "#F0EAF8", stroke: "#7C5CBF", text: "#1A1230", glow: "rgba(124,92,191,0.25)" },
  { fill: "#E8F5EE", stroke: "#2E7D52", text: "#0D2B1A", glow: "rgba(46,125,82,0.25)" },
  { fill: "#FFF4E6", stroke: "#C07030", text: "#2B1800", glow: "rgba(192,112,48,0.25)" },
  { fill: "#FDE8EC", stroke: "#C0364A", text: "#2B000D", glow: "rgba(192,54,74,0.25)" },
  { fill: "#E6F2FF", stroke: "#2E6FA5", text: "#002235", glow: "rgba(46,111,165,0.25)" },
];
const NW = 160, NH = 50;
function getNodeColor(id, nodes) {
  return NODE_COLORS[Object.keys(nodes).indexOf(id) % NODE_COLORS.length];
}

// ── FLOW EDITOR ───────────────────────────────────────────────
function FlowEditor({ nodes, edges, onChange }) {
  const svgRef = useRef();
  const [selNode, setSelNode] = useState(null);
  const [selEdge, setSelEdge] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [connecting, setConnecting] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [pan, setPan] = useState({ x: 40, y: 30 });
  const [panningSt, setPanningSt] = useState(null);
  const [zoom, setZoom] = useState(0.85);
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

  const onWheel = e => {
    e.preventDefault();
    setZoom(z => Math.max(0.2, Math.min(3, z - e.deltaY * 0.001)));
  };

  const touchRef = useRef(null);
  const onTouchStart = e => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      touchRef.current = { type: "pan", sx: t.clientX, sy: t.clientY, px: pan.x, py: pan.y };
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchRef.current = { type: "pinch", dist: Math.sqrt(dx*dx+dy*dy), z: zoom };
    }
  };
  const onTouchMove = e => {
    e.preventDefault();
    if (!touchRef.current) return;
    if (touchRef.current.type === "pan" && e.touches.length === 1) {
      const t = e.touches[0];
      setPan({ x: touchRef.current.px + (t.clientX - touchRef.current.sx), y: touchRef.current.py + (t.clientY - touchRef.current.sy) });
    } else if (touchRef.current.type === "pinch" && e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx*dx+dy*dy);
      setZoom(Math.max(0.2, Math.min(3, touchRef.current.z * (dist / touchRef.current.dist))));
    }
  };
  const onTouchEnd = () => { touchRef.current = null; };

  const addNode = () => {
    const id = "N" + Date.now();
    onChange({ ...nodesR.current, [id]: { id, label: "New Node", shape: "rect", x: 200 + Math.random()*120, y: 200 + Math.random()*120 } }, edgesR.current);
    setSelNode(id);
  };
  const deleteNode = id => {
    const u = { ...nodesR.current }; delete u[id];
    onChange(u, edgesR.current.filter(e => e.from !== id && e.to !== id));
    setSelNode(null);
  };
  const deleteEdge = i => { onChange(nodesR.current, edgesR.current.filter((_,j) => j !== i)); setSelEdge(null); };
  const saveEdit = () => {
    if (!editPopup) return;
    if (editPopup.type === "node") onChange({ ...nodesR.current, [editPopup.id]: { ...nodesR.current[editPopup.id], label: editPopup.label } }, edgesR.current);
    else onChange(nodesR.current, edgesR.current.map((e,i) => i === editPopup.id ? { ...e, label: editPopup.label } : e));
    setEditPopup(null);
  };
  const nodeCenter = n => ({ x: n.x + NW/2, y: n.y + NH/2 });

  const allNodes = Object.values(nodes);
  const canvasW = Math.max(1200, ...allNodes.map(n => n.x + NW + 120));
  const canvasH = Math.max(900, ...allNodes.map(n => n.y + NH + 120));

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", minHeight:0 }}>
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
          <button className="fe-btn fe-btn-edit" onClick={() => setEditPopup({ type:"node", id:selNode, label:nodes[selNode]?.label||"" })}>✎ Rename</button>
          <button className="fe-btn fe-btn-del" onClick={() => deleteNode(selNode)}>✕ Del</button>
        </>}
        {selEdge !== null && !selNode && (
          <button className="fe-btn fe-btn-edit" onClick={() => setEditPopup({ type:"edge", id:selEdge, label:edges[selEdge]?.label||"" })}>✎ Label</button>
        )}
        {connecting && <span className="fe-hint">→ click target node</span>}
        <div style={{ flex:1 }} />
        <button className="fe-btn fe-zoom-btn" onClick={() => setZoom(z => Math.min(3, z+0.15))}>＋</button>
        <span className="fe-zoom">{Math.round(zoom*100)}%</span>
        <button className="fe-btn fe-zoom-btn" onClick={() => setZoom(z => Math.max(0.2, z-0.15))}>－</button>
        <button className="fe-btn" onClick={() => { setZoom(0.85); setPan({x:40,y:30}); }}>⊡</button>
      </div>

      <div className="diagram-body">
        <svg ref={svgRef} width={canvasW} height={canvasH}
          style={{ display:"block", cursor: panningSt?"grabbing":connecting?"crosshair":"grab", background:"transparent", touchAction:"none" }}
          onMouseDown={onSvgMD} onMouseMove={onMM} onMouseUp={onMU} onWheel={onWheel}
          onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        >
          <defs>
            <marker id="arr" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0,10 3.5,0 7" fill="#4A6FA5" opacity="0.7" />
            </marker>
            <marker id="arr-sel" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0,10 3.5,0 7" fill="#2E4F80" />
            </marker>
            <pattern id="dotgrid" width="28" height="28" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="rgba(74,111,165,0.1)" />
            </pattern>
          </defs>
          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            <rect x="-5000" y="-5000" width="20000" height="20000" fill="url(#dotgrid)" />
            {edges.map((e,i) => {
              const from = nodes[e.from], to = nodes[e.to];
              if (!from||!to) return null;
              const f = nodeCenter(from), t = nodeCenter(to);
              const dx = t.x-f.x, dy = t.y-f.y, len = Math.sqrt(dx*dx+dy*dy)||1;
              const ux = dx/len, uy = dy/len;
              const sx = f.x+ux*NW*0.52, sy = f.y+uy*NH*0.52;
              const ex = t.x-ux*NW*0.52, ey = t.y-uy*NH*0.52;
              const mx = (sx+ex)/2-uy*30, my = (sy+ey)/2+ux*30;
              const isSel = selEdge===i;
              const midX = (sx+2*mx+ex)/4, midY = (sy+2*my+ey)/4;
              return (
                <g key={i} onClick={ev => { ev.stopPropagation(); setSelEdge(i); setSelNode(null); }}>
                  <path d={`M${sx},${sy} Q${mx},${my} ${ex},${ey}`}
                    stroke={isSel?"#2E4F80":"#4A6FA5"} strokeWidth={isSel?2:1.5} fill="none"
                    markerEnd={isSel?"url(#arr-sel)":"url(#arr)"}
                    strokeDasharray={isSel?"6 3":"none"} opacity={isSel?1:0.6}
                    style={{ cursor:"pointer" }} />
                  <path d={`M${sx},${sy} Q${mx},${my} ${ex},${ey}`} stroke="transparent" strokeWidth={16} fill="none" style={{ cursor:"pointer" }} />
                  {e.label && (
                    <g onDoubleClick={ev => { ev.stopPropagation(); setEditPopup({ type:"edge", id:i, label:e.label }); }}>
                      <rect x={midX-e.label.length*3-8} y={midY-9} width={e.label.length*6+16} height={18} rx={9}
                        fill="#F7F8FC" stroke={isSel?"#2E4F80":"#4A6FA5"} strokeWidth={1} />
                      <text x={midX} y={midY+1} textAnchor="middle" dominantBaseline="middle"
                        fill="#4A6FA5" fontSize={9} fontFamily="'Source Code Pro',monospace" letterSpacing="1">{e.label}</text>
                    </g>
                  )}
                  {isSel && (
                    <g style={{ cursor:"pointer" }} onClick={ev => { ev.stopPropagation(); deleteEdge(i); }}>
                      <circle cx={midX} cy={midY} r={10} fill="#C0364A" stroke="#E87A8A" strokeWidth={1.5} />
                      <text x={midX} y={midY+1} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={12} style={{ pointerEvents:"none" }}>✕</text>
                    </g>
                  )}
                </g>
              );
            })}
            {connecting && nodes[connecting] && (
              <line x1={nodeCenter(nodes[connecting]).x} y1={nodeCenter(nodes[connecting]).y}
                x2={mousePos.x} y2={mousePos.y}
                stroke="#2E4F80" strokeWidth={1.5} strokeDasharray="5 3" opacity={0.6} style={{ pointerEvents:"none" }} />
            )}
            {Object.values(nodes).map(n => {
              const col = getNodeColor(n.id, nodes);
              const sel = selNode === n.id;
              const { x, y } = n;
              return (
                <g key={n.id}
                  onMouseDown={e => onNodeMD(e, n.id, "")}
                  onDoubleClick={e => { e.stopPropagation(); setEditPopup({ type:"node", id:n.id, label:n.label }); }}
                  style={{ cursor:"move" }}>
                  {n.shape === "diamond" ? (
                    <polygon points={`${x+NW/2},${y-4} ${x+NW+4},${y+NH/2} ${x+NW/2},${y+NH+4} ${x-4},${y+NH/2}`}
                      fill={col.fill} stroke={col.stroke} strokeWidth={sel?2:1}
                      filter={sel?`drop-shadow(0 0 8px ${col.glow})`:"none"} />
                  ) : n.shape === "round" ? (
                    <rect x={x} y={y} width={NW} height={NH} rx={NH/2}
                      fill={col.fill} stroke={col.stroke} strokeWidth={sel?2:1}
                      filter={sel?`drop-shadow(0 0 8px ${col.glow})`:"none"} />
                  ) : (
                    <rect x={x} y={y} width={NW} height={NH} rx={6}
                      fill={col.fill} stroke={col.stroke} strokeWidth={sel?2:1}
                      filter={sel?`drop-shadow(0 0 8px ${col.glow})`:"none"} />
                  )}
                  <rect x={x} y={y} width={3} height={NH} rx={2} fill={col.stroke} opacity={0.6} style={{ pointerEvents:"none" }} />
                  <text x={x+NW/2} y={y+NH/2+1} textAnchor="middle" dominantBaseline="middle"
                    fill={col.text} fontSize={10} fontFamily="'Source Code Pro',monospace" fontWeight="500" letterSpacing="0.5"
                    style={{ pointerEvents:"none", userSelect:"none" }}>
                    {n.label.length > 22 ? n.label.slice(0,20)+"…" : n.label}
                  </text>
                  {sel && (
                    <circle cx={x+NW} cy={y+NH/2} r={7} fill={col.stroke} stroke="#fff" strokeWidth={1.5}
                      style={{ cursor:"crosshair" }}
                      onMouseDown={e => { e.stopPropagation(); onNodeMD(e, n.id, "connect"); }} />
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <div className="fe-hint-bar">
        Double-click to rename · Drag to move · Select → Link · <strong>Scroll to zoom</strong> · Drag background to pan
      </div>

      {editPopup && (
        <div className="ep-overlay" onClick={() => setEditPopup(null)}>
          <div className="ep" onClick={e => e.stopPropagation()}>
            <div className="ep-title">{editPopup.type === "node" ? "Rename Node" : "Set Edge Label"}</div>
            <input className="ep-input" autoFocus value={editPopup.label}
              onChange={e => setEditPopup({ ...editPopup, label: e.target.value })}
              onKeyDown={e => { if (e.key==="Enter") saveEdit(); if (e.key==="Escape") setEditPopup(null); }}
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

// ── CSS — COOL PAPER THEME ────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Source+Code+Pro:wght@300;400;500;600&display=swap');

  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

  :root{
    --bg:#F7F8FC;
    --surf:#FFFFFF;
    --surf2:#F2F4FB;
    --surf3:#EBEEF7;
    --border:#DDE2EE;
    --border2:#C4CEEA;
    --accent:#4A6FA5;
    --accent2:#2E4F80;
    --accent3:#93A8CC;
    --green:#2E7D52;
    --purple:#7C5CBF;
    --red:#C0364A;
    --orange:#C07030;
    --text:#1A2235;
    --text2:#3A4A65;
    --muted:#7A8FAA;
    --muted2:#B0BECC;
    --r:8px;
    --r-lg:14px;
    --nav-h:56px;
  }

  html,body{height:100%}

  body{
    background:var(--bg);
    color:var(--text);
    font-family:'Source Code Pro',monospace;
    -webkit-font-smoothing:antialiased;
    overflow-x:hidden;
  }
  body::before{
    content:'';position:fixed;inset:0;z-index:0;pointer-events:none;
    background:
      radial-gradient(ellipse 60% 40% at 0% 0%,rgba(74,111,165,0.04),transparent),
      radial-gradient(ellipse 50% 60% at 100% 100%,rgba(74,111,165,0.03),transparent);
  }

  #root{height:100%}
  .app{min-height:100%;position:relative;z-index:1;display:flex;flex-direction:column}
  .app.result-mode{height:100vh;overflow:hidden}

  /* ── TOPNAV ── */
  .topnav{
    height:var(--nav-h);flex-shrink:0;
    background:rgba(255,255,255,0.94);
    backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
    border-bottom:1px solid var(--border);
    display:flex;align-items:center;justify-content:space-between;
    padding:0 32px;z-index:100;position:sticky;top:0;
    box-shadow:0 1px 12px rgba(74,111,165,0.07);
  }
  .brand{display:flex;align-items:center;gap:12px}
  .brand-logo{
    width:34px;height:34px;border-radius:8px;flex-shrink:0;
    border:1px solid var(--border2);
    background:linear-gradient(135deg,#EEF3FB,#D8E4F5);
    display:flex;align-items:center;justify-content:center;font-size:16px;
    box-shadow:0 2px 8px rgba(74,111,165,0.1);
  }
  .brand-name{font-family:'Lora',serif;font-size:19px;font-weight:700;color:var(--text);letter-spacing:-0.3px}
  .brand-name span{color:var(--accent)}
  .brand-sub{font-size:8px;letter-spacing:3px;text-transform:uppercase;color:var(--muted);margin-top:1px;font-family:'Source Code Pro',monospace}
  .nav-right{display:flex;align-items:center;gap:10px}
  .status-dot{width:6px;height:6px;border-radius:50%;background:var(--green);box-shadow:0 0 6px rgba(46,125,82,0.5);animation:blink 2s ease infinite;flex-shrink:0}
  @keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}
  .nav-meta{font-size:8px;letter-spacing:2.5px;text-transform:uppercase;color:var(--muted)}
  .btn-ghost{
    font-family:'Source Code Pro',monospace;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;
    font-weight:500;border:1px solid var(--border);color:var(--muted);
    background:transparent;cursor:pointer;border-radius:var(--r);
    padding:7px 14px;transition:all .2s;white-space:nowrap;
  }
  .btn-ghost:hover{border-color:var(--accent);color:var(--accent);background:rgba(74,111,165,0.04)}

  /* ── UPLOAD PAGE ── */
  .upload-page{
    flex:1;display:grid;grid-template-columns:44% 56%;
    min-height:calc(100vh - var(--nav-h));
  }
  .upload-left{
    display:flex;flex-direction:column;justify-content:center;
    padding:72px 52px 72px 56px;
    border-right:1px solid var(--border);
    position:relative;overflow:hidden;
    background:linear-gradient(160deg,#FFFFFF 0%,#EEF3FB 100%);
  }
  .upload-left::before{
    content:'';position:absolute;top:-60px;right:-60px;
    width:300px;height:300px;border-radius:50%;
    background:radial-gradient(circle,rgba(74,111,165,0.07),transparent 70%);
    pointer-events:none;
  }
  .upload-right{
    display:flex;flex-direction:column;
    padding:52px 56px 52px 48px;
    gap:14px;overflow-y:auto;background:var(--bg);
  }

  .eyebrow{
    font-size:9px;letter-spacing:4px;text-transform:uppercase;color:var(--accent);
    display:flex;align-items:center;gap:10px;margin-bottom:20px;font-weight:600;
  }
  .eyebrow::before{content:'';width:18px;height:1px;background:var(--accent);opacity:0.5}

  h1{
    font-family:'Lora',serif;
    font-size:clamp(32px,3.8vw,52px);
    font-weight:700;line-height:1.05;color:var(--text);letter-spacing:-0.5px;
    margin-bottom:18px;
  }
  h1 em{font-style:italic;color:var(--accent);font-weight:400}

  .hero-desc{
    font-size:12px;line-height:2;color:var(--muted);
    margin-bottom:36px;max-width:380px;font-weight:400;
  }

  .feature-list{display:flex;flex-direction:column;border-top:1px solid var(--border)}
  .feat-item{
    display:flex;align-items:center;gap:10px;padding:11px 0;
    border-bottom:1px solid var(--border);
    font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);
  }
  .feat-dot{width:5px;height:5px;border-radius:50%;background:var(--accent);flex-shrink:0;box-shadow:0 0 5px rgba(74,111,165,0.4)}

  /* ── DROP ZONE ── */
  .drop{
    border:1.5px dashed var(--border2);background:var(--surf);
    border-radius:var(--r-lg);padding:36px 28px;text-align:center;
    cursor:pointer;transition:all .3s;
    min-height:190px;display:flex;flex-direction:column;align-items:center;justify-content:center;
    position:relative;overflow:hidden;
    box-shadow:0 2px 12px rgba(74,111,165,0.05);
  }
  .drop::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(74,111,165,0.02),transparent);pointer-events:none}
  .drop:hover,.drop.over{border-color:var(--accent);box-shadow:0 4px 24px rgba(74,111,165,0.12)}
  .drop-icon{font-size:32px;margin-bottom:10px}
  .drop-title{font-family:'Lora',serif;font-size:16px;font-weight:600;color:var(--text);margin-bottom:5px}
  .drop-sub{font-size:11px;color:var(--muted);letter-spacing:0.5px}
  .drop-hint{margin-top:10px;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--muted2)}
  .drop-compact{min-height:76px!important;padding:12px 18px!important;flex-direction:row!important;gap:10px;justify-content:center}

  /* ── THUMBNAILS ── */
  .img-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(78px,1fr));gap:8px}
  .img-thumb{position:relative;border-radius:7px;overflow:hidden;border:1px solid var(--border);aspect-ratio:1;background:var(--surf2);transition:all .2s}
  .img-thumb:hover{border-color:var(--accent);transform:scale(1.04);box-shadow:0 4px 16px rgba(74,111,165,0.15)}
  .img-thumb img{width:100%;height:100%;object-fit:cover;display:block}
  .img-thumb-num{position:absolute;bottom:4px;left:6px;font-size:8px;font-weight:600;color:var(--text);background:rgba(255,255,255,0.88);padding:1px 4px;border-radius:3px}
  .img-thumb-del{position:absolute;top:4px;right:4px;width:18px;height:18px;border-radius:50%;border:none;cursor:pointer;background:rgba(192,54,74,0.85);color:#fff;font-size:9px;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .15s}
  .img-thumb:hover .img-thumb-del{opacity:1}

  /* ── UPLOAD OPTS ── */
  .upload-opts{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .upload-opt{display:flex;align-items:center;gap:11px;padding:13px 15px;border:1px solid var(--border);border-radius:var(--r);background:var(--surf);cursor:pointer;transition:all .2s;box-shadow:0 1px 4px rgba(74,111,165,0.04)}
  .upload-opt:hover{border-color:var(--accent);background:rgba(74,111,165,0.03);box-shadow:0 4px 16px rgba(74,111,165,0.08)}
  .upload-opt-icon{font-size:18px;flex-shrink:0}
  .upload-opt-label{font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text);font-weight:600}
  .upload-opt-sub{font-size:10px;color:var(--muted);margin-top:2px}

  /* ── PRIMARY BUTTON ── */
  .btn-primary{
    font-family:'Source Code Pro',monospace;
    background:linear-gradient(135deg,var(--accent),var(--accent2));
    color:#fff;width:100%;justify-content:center;padding:15px;
    font-size:11px;letter-spacing:2.5px;text-transform:uppercase;font-weight:600;
    box-shadow:0 4px 20px rgba(74,111,165,0.3);
    border:none;cursor:pointer;border-radius:var(--r);
    display:flex;align-items:center;gap:8px;transition:all .2s;
  }
  .btn-primary:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 8px 28px rgba(74,111,165,0.4)}
  .btn-primary:active:not(:disabled){transform:translateY(0)}
  .btn-primary:disabled{opacity:.4;cursor:not-allowed}

  /* ── LOADING ── */
  .loading-wrap{text-align:center;padding:36px 16px}
  .loading-ring{width:42px;height:42px;margin:0 auto 16px;border-radius:50%;border:2px solid var(--border);border-top-color:var(--accent);animation:spin .8s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  .loading-msg{font-size:10px;letter-spacing:2px;color:var(--muted);margin-bottom:12px;text-transform:uppercase}
  .progress-track{width:150px;margin:0 auto;height:2px;background:var(--border);border-radius:2px;overflow:hidden}
  .progress-fill{height:100%;background:var(--accent);border-radius:2px;transition:width .6s ease}

  /* ── ERROR ── */
  .err-box{background:rgba(192,54,74,0.05);border:1px solid rgba(192,54,74,0.2);border-radius:var(--r);padding:10px 14px;color:var(--red);font-size:10px;line-height:1.7}
  .err-box::before{content:'⚠  '}

  /* ── RESULT PAGE ── */
  .result-page{flex:1;display:flex;flex-direction:column;height:calc(100vh - var(--nav-h));overflow:hidden}

  .res-topbar{
    flex-shrink:0;background:rgba(255,255,255,0.96);backdrop-filter:blur(16px);
    border-bottom:1px solid var(--border);padding:9px 32px;
    display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;
    box-shadow:0 1px 8px rgba(74,111,165,0.05);
  }
  .res-eyebrow{font-size:8px;letter-spacing:3px;text-transform:uppercase;color:var(--muted);margin-bottom:2px}
  .res-title{font-family:'Lora',serif;font-size:17px;font-weight:600;color:var(--text);letter-spacing:-0.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:55vw}

  .result-split{flex:1;display:grid;grid-template-columns:1fr 1fr;overflow:hidden;min-height:0}

  .result-panel{display:flex;flex-direction:column;overflow:hidden;min-height:0;border-right:1px solid var(--border)}
  .result-panel:last-child{border-right:none}

  .panel-hdr{flex-shrink:0;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;padding:9px 22px;background:var(--surf);border-bottom:1px solid var(--border)}
  .panel-label{font-size:8px;letter-spacing:3px;text-transform:uppercase;color:var(--accent);display:flex;align-items:center;gap:8px;font-weight:600}
  .panel-label::before{content:'';width:10px;height:1px;background:var(--accent)}
  .panel-actions{display:flex;align-items:center;gap:5px}

  .notes-scroll{flex:1;overflow-y:auto;min-height:0}
  .notes-scroll::-webkit-scrollbar{width:4px}
  .notes-scroll::-webkit-scrollbar-track{background:transparent}
  .notes-scroll::-webkit-scrollbar-thumb{background:var(--muted2);border-radius:2px}
  .notes-scroll::-webkit-scrollbar-thumb:hover{background:var(--accent3)}

  .notes-ta{display:block;width:100%;min-height:100%;background:transparent;border:none;outline:none;padding:24px 28px;color:var(--text2);font-family:'Source Code Pro',monospace;font-size:12px;line-height:2;resize:none}
  .notes-ta::placeholder{color:var(--muted2)}
  .notes-prev{padding:24px 28px}

  .diagram-body-outer{flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0}

  .diagram-body{flex:1;overflow:auto;min-height:0;position:relative;background:var(--surf2)}
  .diagram-body::-webkit-scrollbar{width:6px;height:6px}
  .diagram-body::-webkit-scrollbar-track{background:var(--surf2)}
  .diagram-body::-webkit-scrollbar-thumb{background:var(--muted2);border-radius:3px}
  .diagram-body::-webkit-scrollbar-thumb:hover{background:var(--accent3)}
  .diagram-body::-webkit-scrollbar-corner{background:var(--surf2)}
  .diagram-body{scrollbar-width:thin;scrollbar-color:var(--muted2) var(--surf2)}

  /* Notes rendered */
  .nc h1{font-family:'Lora',serif;font-size:18px;font-weight:700;color:var(--text);margin:0 0 14px;padding-bottom:10px;border-bottom:1px solid var(--border)}
  .nc h2{font-family:'Lora',serif;font-size:14px;font-weight:600;color:var(--text);margin:18px 0 6px}
  .nc h3{font-size:8px;font-weight:600;color:var(--accent);margin:14px 0 5px;text-transform:uppercase;letter-spacing:3px}
  .nc p{font-size:12px;line-height:2;color:var(--text2);margin-bottom:9px}
  .nc ul{list-style:none;padding:0;margin:6px 0 10px}
  .nc ol{padding-left:20px;margin:6px 0 10px}
  .nc li{font-size:12px;line-height:1.9;color:var(--text2);padding:2px 0 2px 18px;position:relative}
  .nc ul li::before{content:'›';position:absolute;left:3px;color:var(--accent);font-size:14px}
  .nc ol li{padding-left:0;list-style:decimal}
  .nc ol li::before{display:none}
  .nc strong{color:var(--text);font-weight:700}
  .nc em{color:var(--accent);font-style:italic}
  .nc code{background:rgba(74,111,165,0.07);color:var(--accent2);padding:2px 6px;border-radius:4px;font-size:10px;border:1px solid rgba(74,111,165,0.12)}
  .nc hr{border:none;border-top:1px solid var(--border);margin:14px 0}

  /* ── TOGGLES ── */
  .toggle-group{display:flex;gap:2px;background:var(--surf2);border-radius:6px;padding:2px;border:1px solid var(--border)}
  .toggle-btn{font-size:8px;letter-spacing:1px;text-transform:uppercase;padding:4px 9px;border:none;border-radius:4px;cursor:pointer;background:transparent;color:var(--muted);transition:all .15s;font-family:'Source Code Pro',monospace}
  .toggle-btn.active{background:var(--accent);color:#fff;font-weight:600}

  /* ── DOWNLOAD BUTTONS ── */
  .dl-btn{font-size:8px;letter-spacing:1px;text-transform:uppercase;font-weight:500;border:none;cursor:pointer;border-radius:5px;display:inline-flex;align-items:center;gap:4px;padding:5px 10px;transition:all .2s;white-space:nowrap;font-family:'Source Code Pro',monospace}
  .dl-btn:disabled{opacity:.35;cursor:not-allowed}
  .dl-jpg{background:rgba(74,111,165,0.08);border:1px solid rgba(74,111,165,0.22);color:var(--accent)}
  .dl-jpg:hover:not(:disabled){background:rgba(74,111,165,0.14)}
  .dl-doc{background:rgba(124,92,191,0.08);border:1px solid rgba(124,92,191,0.22);color:var(--purple)}
  .dl-doc:hover:not(:disabled){background:rgba(124,92,191,0.14)}
  .dl-svg{background:rgba(46,125,82,0.08);border:1px solid rgba(46,125,82,0.22);color:var(--green)}
  .dl-svg:hover:not(:disabled){background:rgba(46,125,82,0.14)}

  /* ── FLOW EDITOR ── */
  .fe-toolbar{flex-shrink:0;display:flex;align-items:center;gap:5px;padding:7px 12px;background:var(--surf);border-bottom:1px solid var(--border);flex-wrap:wrap;min-height:44px;box-shadow:0 1px 4px rgba(74,111,165,0.04)}
  .fe-btn{font-size:8px;letter-spacing:.5px;text-transform:uppercase;padding:5px 9px;border:1px solid var(--border);background:var(--surf2);color:var(--text2);border-radius:4px;cursor:pointer;transition:all .15s;white-space:nowrap;font-family:'Source Code Pro',monospace;font-weight:500}
  .fe-btn:hover{background:rgba(74,111,165,0.07);border-color:var(--accent);color:var(--accent)}
  .fe-btn-connect{border-color:rgba(74,111,165,0.3);color:var(--accent)}
  .fe-btn-edit{border-color:rgba(46,125,82,0.3);color:var(--green)}
  .fe-btn-del{border-color:rgba(192,54,74,0.3);color:var(--red)}
  .fe-zoom-btn{padding:4px 8px}
  .fe-sel{font-size:8px;padding:4px 7px;border:1px solid var(--border);background:var(--surf2);color:var(--text);border-radius:4px;cursor:pointer;font-family:'Source Code Pro',monospace}
  .fe-zoom{font-size:9px;color:var(--muted);min-width:28px;text-align:center}
  .fe-hint{font-size:9px;color:var(--accent);animation:gpulse 1.4s ease infinite;letter-spacing:1px}
  @keyframes gpulse{0%,100%{opacity:0.3}50%{opacity:1}}
  .fe-hint-bar{flex-shrink:0;font-size:10px;color:var(--muted);text-align:center;padding:5px 8px;border-top:1px solid var(--border);background:var(--surf);letter-spacing:0.3px}
  .fe-hint-bar strong{color:var(--text2);font-weight:500}

  /* ── EDIT POPUP ── */
  .ep-overlay{position:fixed;inset:0;background:rgba(26,34,53,0.4);z-index:500;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);animation:fadeIn .15s ease}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  .ep{background:var(--surf);border:1px solid var(--border2);border-radius:var(--r-lg);padding:26px;width:310px;box-shadow:0 16px 48px rgba(26,34,53,0.14);animation:slideUp .2s ease}
  @keyframes slideUp{from{transform:translateY(8px);opacity:0}to{transform:none;opacity:1}}
  .ep-title{font-family:'Lora',serif;font-size:16px;font-weight:600;color:var(--text);margin-bottom:14px}
  .ep-input{width:100%;background:var(--surf2);border:1px solid var(--border);border-radius:var(--r);padding:9px 12px;color:var(--text);font-family:'Source Code Pro',monospace;font-size:12px;outline:none;margin-bottom:12px;transition:border-color .15s}
  .ep-input:focus{border-color:var(--accent)}
  .ep-row{display:flex;gap:8px}
  .ep-ok{flex:1;font-family:'Source Code Pro',monospace;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;padding:9px;border:none;border-radius:var(--r);cursor:pointer;background:var(--accent);color:#fff;font-weight:600;transition:background .15s}
  .ep-ok:hover{background:var(--accent2)}
  .ep-cancel{flex:1;font-family:'Source Code Pro',monospace;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;padding:9px;border:1px solid var(--border);border-radius:var(--r);cursor:pointer;background:transparent;color:var(--muted);transition:all .15s}
  .ep-cancel:hover{border-color:var(--red);color:var(--red)}

  /* ── FOOTER ── */
  .dl-err{flex-shrink:0;background:rgba(192,54,74,0.05);border:1px solid rgba(192,54,74,0.18);border-radius:var(--r);padding:7px 14px;color:var(--red);font-size:10px;margin:6px 24px}
  .footer{flex-shrink:0;padding:11px 32px;border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;background:var(--surf)}
  .footer-brand{font-family:'Lora',serif;font-size:13px;font-weight:600;color:var(--text2)}
  .footer-brand span{color:var(--accent)}
  .footer-meta{font-size:8px;letter-spacing:2.5px;text-transform:uppercase;color:var(--muted2)}

  .reveal{opacity:0;transform:translateY(14px);transition:opacity .55s ease,transform .55s ease}
  .reveal.in{opacity:1;transform:none}

  /* ── RESPONSIVE ── */
  @media(max-width:900px){
    .upload-page{grid-template-columns:1fr;min-height:auto}
    .upload-left{padding:40px 28px;border-right:none;border-bottom:1px solid var(--border)}
    .upload-right{padding:32px 28px 56px}
    .feature-list{display:none}
    .result-page{height:auto;overflow:visible}
    .result-split{grid-template-columns:1fr;height:auto;overflow:visible}
    .result-panel{height:auto;overflow:visible;border-right:none;border-bottom:1px solid var(--border)}
    .result-panel:last-child{border-bottom:none}
    .diagram-body{height:480px}
    .notes-scroll{max-height:420px;overflow-y:auto}
  }
  @media(max-width:600px){
    :root{--nav-h:50px}
    .brand-sub{display:none}
    .brand-name{font-size:17px}
    .topnav{padding:0 16px}
    h1{font-size:clamp(26px,8vw,36px)}
    .upload-left{padding:28px 16px}
    .upload-right{padding:24px 16px 48px}
    .upload-opts{grid-template-columns:1fr}
    .drop{min-height:150px;padding:26px 14px}
    .res-topbar{padding:8px 16px}
    .panel-hdr{padding:7px 14px;flex-wrap:wrap}
    .panel-actions{overflow-x:auto;flex-wrap:nowrap;padding-bottom:2px}
    .dl-btn,.toggle-btn{flex-shrink:0}
    .fe-toolbar{overflow-x:auto;flex-wrap:nowrap;padding:5px 10px}
    .fe-btn{flex-shrink:0}
    .diagram-body{height:400px}
    .notes-scroll{max-height:360px}
    .footer{padding:10px 16px}
    .dl-err{margin:5px 14px}
  }
  @media(min-width:1400px){
    .topnav,.res-topbar,.footer{padding-left:52px;padding-right:52px}
    .upload-left{padding:80px 60px 80px 64px}
    .upload-right{padding:60px 64px 60px 56px}
    .panel-hdr{padding:10px 28px}
    .notes-ta,.notes-prev{padding:28px 36px}
  }
  @media(hover:none){.btn-primary:hover:not(:disabled){transform:none}}
`;

// ── MAIN APP ──────────────────────────────────────────────────
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

  const galleryRef = useRef();
  const cameraRef  = useRef();
  const notesCardRef = useRef();
  const flowCardRef  = useRef();

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
    const arr = Array.from(fileList).filter(f => f.type.startsWith("image/"));
    if (!arr.length) return;
    const results = await Promise.all(arr.map(readImageFile));
    const valid = results.filter(Boolean);
    setImages(prev => {
      const seen = new Set(prev.map(i => i.name + i.b64.slice(-20)));
      return [...prev, ...valid.filter(i => !seen.has(i.name + i.b64.slice(-20)))];
    });
  }, []);

  const onGalleryChange = e => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ""; };
  const onCameraChange  = e => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ""; };
  const handleDrop = useCallback(e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }, [handleFiles]);
  const removeImage = idx => setImages(prev => prev.filter((_, i) => i !== idx));

  const analyze = async () => {
    if (!images.length) return;
    setLoading(true); setError(""); setDlError(""); setLoadPct(0);
    const stages = [[0,"Transmitting images…"],[20,"Decoding handwriting…"],[48,"Structuring content…"],[72,"Building flow diagram…"],[90,"Finalising…"]];
    let mi = 0;
    const tick = setInterval(() => {
      if (mi < stages.length) { setLoadMsg(stages[mi][1]); setLoadPct(stages[mi][0]); mi++; }
    }, 900);
    try {
      const payload = images.length === 1
        ? { imageBase64: images[0].b64, imageMime: images[0].mime }
        : { images: images.map(i => ({ imageBase64: i.b64, imageMime: i.mime })) };
      const res = await fetch(`${BACKEND_URL}/api/analyze`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(payload) });
      clearInterval(tick); setLoadPct(96); setLoadMsg("Processing response…");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      setTitle(data.title || "Notes");
      setNotes(data.notes || "");
      const code = (data.mermaidCode || "flowchart TD\n  A([Start]) --> B[Content]").replace(/```[\w]*\n?/g,"").trim();
      const { nodes: n, edges: e } = parseMermaidToGraph(code);
      setFlowNodes(n); setFlowEdges(e);
      setLoadPct(100);
      setTimeout(() => setStep("result"), 300);
    } catch (err) {
      clearInterval(tick);
      setError(err.message.includes("fetch") || err.message.includes("Failed")
        ? "Cannot reach the server. Check that the backend is running on Render."
        : err.message);
    } finally { setLoading(false); }
  };

  const loadH2C = () => new Promise((res, rej) => {
    if (window.html2canvas) return res();
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
    s.onload = res; s.onerror = () => rej(new Error("html2canvas failed"));
    document.head.appendChild(s);
  });

  const triggerDownload = (url, name) => {
    const a = document.createElement("a"); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const dlNotesJpg = async () => {
    setDlBusy("notes-jpg"); setDlError("");
    try {
      await loadH2C();
      const canvas = await window.html2canvas(notesCardRef.current, { scale:2, backgroundColor:"#FFFFFF", useCORS:true, logging:false });
      triggerDownload(canvas.toDataURL("image/jpeg",0.95), `${title||"notes"}.jpg`);
    } catch(e) { setDlError("JPG export failed: "+e.message); }
    finally { setDlBusy(""); }
  };

  const dlNotesDocx = async () => {
    setDlBusy("notes-docx"); setDlError("");
    try {
      const blob = await makeDocxBlob(title, notes);
      const url = URL.createObjectURL(blob);
      triggerDownload(url, `${title||"notes"}.docx`);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch(e) { setDlError("DOCX export failed: "+e.message); }
    finally { setDlBusy(""); }
  };

  const dlDiagramJpg = async () => {
    setDlBusy("diag-jpg"); setDlError("");
    try {
      await loadH2C();
      const svgEl = flowCardRef.current?.querySelector("svg");
      if (!svgEl) throw new Error("Diagram not found");
      const canvas = await window.html2canvas(svgEl, { scale:2, backgroundColor:"#F2F4FB", useCORS:true, logging:false });
      triggerDownload(canvas.toDataURL("image/jpeg",0.95), `${title||"diagram"}.jpg`);
    } catch(e) { setDlError("JPG export failed: "+e.message); }
    finally { setDlBusy(""); }
  };

  const dlDiagramSvg = () => {
    setDlError("");
    try {
      const svgEl = flowCardRef.current?.querySelector("svg");
      if (!svgEl) throw new Error("Diagram not found");
      const clone = svgEl.cloneNode(true);
      clone.setAttribute("xmlns","http://www.w3.org/2000/svg");
      clone.setAttribute("style","background:#F2F4FB");
      const blob = new Blob([clone.outerHTML], { type:"image/svg+xml" });
      const url = URL.createObjectURL(blob);
      triggerDownload(url, `${title||"diagram"}.svg`);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch(e) { setDlError("SVG export failed: "+e.message); }
  };

  const reset = () => {
    setImages([]); setStep("upload"); setNotes(""); setFlowNodes({});
    setFlowEdges([]); setError(""); setDlError(""); setTitle(""); setLoadPct(0);
  };

  const year = new Date().getFullYear();

  return (
    <>
      <style>{css}</style>
      <div className={`app${step === "result" ? " result-mode" : ""}`}>

        <nav className="topnav">
          <div className="brand">
            <div className="brand-logo">📄</div>
            <div>
              <div className="brand-name">Note<span>Forge</span></div>
              <div className="brand-sub">Handwriting Intelligence</div>
            </div>
          </div>
          <div className="nav-right">
            {step === "result" && <button className="btn-ghost" onClick={reset}>↩ New Upload</button>}
            <div className="status-dot" />
            <div className="nav-meta">v2 · {year}</div>
          </div>
        </nav>

        {step === "upload" && (
          <div className={`upload-page reveal ${revealed ? "in" : ""}`}>
            <input ref={galleryRef} type="file" accept="image/*" multiple style={{ display:"none" }} onChange={onGalleryChange} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display:"none" }} onChange={onCameraChange} />

            <div className="upload-left">
              <div className="eyebrow">AI-Powered Notes Reader</div>
              <h1>Raw notes,<br /><em>instantly structured.</em></h1>
              <p className="hero-desc">
                Photograph any handwritten notes — messy, rotated, multi-page — and get
                clean structured text plus an interactive flowchart. In seconds.
              </p>
              <div className="feature-list">
                <div className="feat-item"><span className="feat-dot" />Any handwriting style</div>
                <div className="feat-item"><span className="feat-dot" />Multi-page support</div>
                <div className="feat-item"><span className="feat-dot" />Auto flowchart generation</div>
                <div className="feat-item"><span className="feat-dot" />Export JPG · DOCX · SVG</div>
                <div className="feat-item"><span className="feat-dot" />Fully editable diagram</div>
              </div>
            </div>

            <div className="upload-right">
              <div
                className={`drop ${dragOver?"over":""} ${images.length?"drop-compact":""}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => galleryRef.current.click()}
              >
                {images.length === 0 ? (
                  <>
                    <span className="drop-icon">📓</span>
                    <div className="drop-title">Drop images here</div>
                    <div className="drop-sub">or click to browse files</div>
                    <div className="drop-hint">JPG · PNG · WEBP · Select multiple files</div>
                  </>
                ) : (
                  <>
                    <span className="drop-icon" style={{ fontSize:20, marginBottom:3 }}>＋</span>
                    <div className="drop-title" style={{ fontSize:13 }}>Add more pages</div>
                    <div className="drop-sub">{images.length} page{images.length > 1 ? "s" : ""} ready</div>
                  </>
                )}
              </div>

              {images.length > 0 && (
                <div className="img-grid">
                  {images.map((img, idx) => (
                    <div key={idx} className="img-thumb">
                      <img src={img.src} alt={`Page ${idx+1}`} />
                      <div className="img-thumb-num">P{idx+1}</div>
                      <button className="img-thumb-del" onClick={e => { e.stopPropagation(); removeImage(idx); }}>✕</button>
                    </div>
                  ))}
                </div>
              )}

              <div className="upload-opts">
                <button className="upload-opt" onClick={e => { e.stopPropagation(); galleryRef.current.click(); }}>
                  <span className="upload-opt-icon">🖼</span>
                  <div>
                    <div className="upload-opt-label">Upload Files</div>
                    <div className="upload-opt-sub">select multiple at once</div>
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
                  <div className="progress-track"><div className="progress-fill" style={{ width:`${loadPct}%` }} /></div>
                </div>
              ) : (
                <button className="btn-primary" disabled={!images.length || loading} onClick={analyze}>
                  ⚡ {images.length > 1 ? `Analyse ${images.length} Pages` : "Analyse & Structure Notes"}
                </button>
              )}

              {error && <div className="err-box">{error}</div>}
            </div>
          </div>
        )}

        {step === "result" && (
          <div className="result-page">
            <div className="res-topbar">
              <div>
                <div className="res-eyebrow">Structured from {images.length} image{images.length > 1 ? "s" : ""}</div>
                <div className="res-title">{title}</div>
              </div>
              <button className="btn-ghost" onClick={reset}>↩ New Upload</button>
            </div>

            <div className="result-split">
              <div className="result-panel" ref={notesCardRef}>
                <div className="panel-hdr">
                  <div className="panel-label">Extracted Notes</div>
                  <div className="panel-actions">
                    <div className="toggle-group">
                      <button className={`toggle-btn ${notesMode==="preview"?"active":""}`} onClick={() => setNotesMode("preview")}>Preview</button>
                      <button className={`toggle-btn ${notesMode==="edit"?"active":""}`} onClick={() => setNotesMode("edit")}>Edit</button>
                    </div>
                    <button className="dl-btn dl-jpg" disabled={dlBusy==="notes-jpg"} onClick={dlNotesJpg}>{dlBusy==="notes-jpg"?"…":"🖼 JPG"}</button>
                    <button className="dl-btn dl-doc" disabled={dlBusy==="notes-docx"} onClick={dlNotesDocx}>{dlBusy==="notes-docx"?"…":"📄 DOCX"}</button>
                  </div>
                </div>
                <div className="notes-scroll">
                  {notesMode === "edit"
                    ? <textarea className="notes-ta" value={notes} onChange={e => setNotes(e.target.value)} spellCheck={false} placeholder="Extracted notes appear here…" />
                    : <div className="notes-prev nc" dangerouslySetInnerHTML={{ __html: mdToHtml(notes) }} />
                  }
                </div>
              </div>

              <div className="result-panel" ref={flowCardRef}>
                <div className="panel-hdr">
                  <div className="panel-label">Flow Diagram</div>
                  <div className="panel-actions">
                    <span style={{ fontSize:8, letterSpacing:2, textTransform:"uppercase", color:"var(--muted2)" }}>Interactive</span>
                    <button className="dl-btn dl-jpg" disabled={dlBusy==="diag-jpg"} onClick={dlDiagramJpg}>{dlBusy==="diag-jpg"?"…":"🖼 JPG"}</button>
                    <button className="dl-btn dl-svg" onClick={dlDiagramSvg}>◈ SVG</button>
                  </div>
                </div>
                <div className="diagram-body-outer">
                  <FlowEditor nodes={flowNodes} edges={flowEdges} onChange={(n,e) => { setFlowNodes(n); setFlowEdges(e); }} />
                </div>
              </div>
            </div>

            {dlError && <div className="dl-err">⚠ {dlError}</div>}
          </div>
        )}

        <footer className="footer">
          <div className="footer-brand">Note<span>Forge</span> — Handwriting to knowledge</div>
          <div className="footer-meta">AI Powered · {year}</div>
        </footer>
      </div>
    </>
  );
}
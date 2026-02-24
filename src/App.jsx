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
      const load = src => new Promise((ok, fail) => {
        const s = document.createElement("script");
        s.src = src; s.onload = ok;
        s.onerror = () => fail(new Error("failed: " + src));
        document.head.appendChild(s);
      });
      load("https://unpkg.com/docx@8.2.3/build/index.umd.js")
        .then(res)
        .catch(() => load("https://cdn.jsdelivr.net/npm/docx@8.2.3/build/index.umd.js").then(res).catch(rej));
    });
  }
  if (!window.docx) throw new Error("docx library unavailable");
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = window.docx;
  const ch = [];
  ch.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: title, bold: true, size: 36 })] }));
  ch.push(new Paragraph({ children: [new TextRun("")] }));
  for (const line of notes.split("\n")) {
    if (/^# (.+)$/.test(line))        ch.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: line.replace(/^# /, ""),   bold: true, size: 32 })] }));
    else if (/^## (.+)$/.test(line))  ch.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: line.replace(/^## /, ""),  bold: true, size: 28 })] }));
    else if (/^### (.+)$/.test(line)) ch.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: line.replace(/^### /, ""), bold: true, size: 24 })] }));
    else if (/^[-•] (.+)$/.test(line))ch.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: line.replace(/^[-•] /, "") })] }));
    else if (line.trim())              ch.push(new Paragraph({ children: [new TextRun({ text: line })], spacing: { after: 120 } }));
    else                               ch.push(new Paragraph({ children: [new TextRun("")] }));
  }
  const doc = new Document({ sections: [{ properties: {}, children: ch }] });
  return Packer.toBlob(doc);
}

// Builds a clean full-content SVG from node/edge data (ignores pan/zoom completely)
const EXPORT_COLORS = [
  { fill: "#EEF3FB", stroke: "#4A6FA5", text: "#1A2235" },
  { fill: "#F0EAF8", stroke: "#7C5CBF", text: "#1A1230" },
  { fill: "#E8F5EE", stroke: "#2E7D52", text: "#0D2B1A" },
  { fill: "#FFF4E6", stroke: "#C07030", text: "#2B1800" },
  { fill: "#FDE8EC", stroke: "#C0364A", text: "#2B000D" },
  { fill: "#E6F2FF", stroke: "#2E6FA5", text: "#002235" },
];

function buildDiagramSvgString(nodes, edges) {
  const nodeList = Object.values(nodes);
  if (!nodeList.length) return null;

  const PAD = 70;
  const minX = Math.min(...nodeList.map(n => n.x));
  const minY = Math.min(...nodeList.map(n => n.y));
  const maxX = Math.max(...nodeList.map(n => n.x + NW));
  const maxY = Math.max(...nodeList.map(n => n.y + NH));
  const W = maxX - minX + PAD * 2;
  const H = maxY - minY + PAD * 2;
  const ox = PAD - minX;
  const oy = PAD - minY;

  const nc = n => ({ x: n.x + NW / 2 + ox, y: n.y + NH / 2 + oy });

  // edges
  let edgeSvg = '';
  for (const e of edges) {
    const from = nodes[e.from], to = nodes[e.to];
    if (!from || !to) continue;
    const f = nc(from), t = nc(to);
    const dx = t.x - f.x, dy = t.y - f.y, len = Math.sqrt(dx*dx + dy*dy) || 1;
    const ux = dx/len, uy = dy/len;
    const sx = f.x + ux*NW*0.52, sy = f.y + uy*NH*0.52;
    const ex = t.x - ux*NW*0.52, ey = t.y - uy*NH*0.52;
    const mx = (sx+ex)/2 - uy*30, my = (sy+ey)/2 + ux*30;
    edgeSvg += `<path d="M${sx},${sy} Q${mx},${my} ${ex},${ey}" stroke="#4A6FA5" stroke-width="1.5" fill="none" marker-end="url(#arr)" opacity="0.65"/>`;
    if (e.label) {
      const midX = (sx+2*mx+ex)/4, midY = (sy+2*my+ey)/4;
      const lw = e.label.length * 6 + 16;
      edgeSvg += `<rect x="${midX - lw/2}" y="${midY-9}" width="${lw}" height="18" rx="9" fill="#F7F8FC" stroke="#4A6FA5" stroke-width="1"/>`;
      edgeSvg += `<text x="${midX}" y="${midY+1}" text-anchor="middle" dominant-baseline="middle" fill="#4A6FA5" font-size="9" font-family="monospace" letter-spacing="1">${e.label}</text>`;
    }
  }

  // nodes
  let nodeSvg = '';
  nodeList.forEach((n, idx) => {
    const col = EXPORT_COLORS[idx % EXPORT_COLORS.length];
    const nx = n.x + ox, ny = n.y + oy;
    const label = n.label.length > 22 ? n.label.slice(0, 20) + "…" : n.label;
    if (n.shape === "diamond") {
      nodeSvg += `<polygon points="${nx+NW/2},${ny-4} ${nx+NW+4},${ny+NH/2} ${nx+NW/2},${ny+NH+4} ${nx-4},${ny+NH/2}" fill="${col.fill}" stroke="${col.stroke}" stroke-width="1.2"/>`;
    } else if (n.shape === "round") {
      nodeSvg += `<rect x="${nx}" y="${ny}" width="${NW}" height="${NH}" rx="${NH/2}" fill="${col.fill}" stroke="${col.stroke}" stroke-width="1.2"/>`;
    } else {
      nodeSvg += `<rect x="${nx}" y="${ny}" width="${NW}" height="${NH}" rx="6" fill="${col.fill}" stroke="${col.stroke}" stroke-width="1.2"/>`;
    }
    nodeSvg += `<rect x="${nx}" y="${ny}" width="3" height="${NH}" rx="2" fill="${col.stroke}" opacity="0.6"/>`;
    nodeSvg += `<text x="${nx+NW/2}" y="${ny+NH/2+1}" text-anchor="middle" dominant-baseline="middle" fill="${col.text}" font-size="10" font-family="monospace" font-weight="500" letter-spacing="0.5">${label}</text>`;
  });

  return { svgStr: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <marker id="arr" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
        <polygon points="0 0,10 3.5,0 7" fill="#4A6FA5" opacity="0.7"/>
      </marker>
      <pattern id="dotgrid" width="28" height="28" patternUnits="userSpaceOnUse">
        <circle cx="1" cy="1" r="1" fill="rgba(74,111,165,0.1)"/>
      </pattern>
    </defs>
    <rect width="${W}" height="${H}" fill="#F2F4FB"/>
    <rect width="${W}" height="${H}" fill="url(#dotgrid)"/>
    ${edgeSvg}
    ${nodeSvg}
  </svg>`, W, H };
}

async function exportDiagramFull(nodes, edges) {
  const result = buildDiagramSvgString(nodes, edges);
  if (!result) throw new Error("No nodes to export");
  const { svgStr, W, H } = result;
  const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = 2;
      canvas.width  = W * scale;
      canvas.height = H * scale;
      const ctx = canvas.getContext("2d");
      ctx.scale(scale, scale);
      ctx.fillStyle = "#F2F4FB";
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob(b => resolve(b), "image/jpeg", 0.95);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("SVG render failed")); };
    img.src = url;
  });
}

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
  const canvasH = Math.max(900,  ...allNodes.map(n => n.y + NH + 120));

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
                        fill="#4A6FA5" fontSize={9} fontFamily="monospace" letterSpacing="1">{e.label}</text>
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
                    fill={col.text} fontSize={10} fontFamily="monospace" fontWeight="500" letterSpacing="0.5"
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

// ── CSS ───────────────────────────────────────────────────────
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

  html {
    width: 100%;
    max-width: none !important;
    height: 100%;
  }
  body {
    width: 100%;
    max-width: none !important;
    min-width: 0;
    height: 100%;
    background: var(--bg);
    color: var(--text);
    font-family: 'Source Code Pro', monospace;
    -webkit-font-smoothing: antialiased;
    overflow-x: hidden;
  }
  #root {
    width: 100% !important;
    max-width: none !important;
    min-width: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .app {
    width: 100% !important;
    max-width: none !important;
    min-width: 0;
    min-height: 100%;
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
  }
  .app.result-mode { height: 100vh; overflow: hidden; }

  /* ── TOPNAV ── */
  .topnav{
    width: 100%;
    height:var(--nav-h);flex-shrink:0;
    background:rgba(255,255,255,0.96);
    backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
    border-bottom:1px solid var(--border);
    display:flex;align-items:center;justify-content:space-between;
    padding:0 24px;z-index:100;position:sticky;top:0;
    box-shadow:0 1px 12px rgba(74,111,165,0.07);
  }
  .brand{display:flex;align-items:center;gap:10px}
  .brand-name{font-family:'Lora',serif;font-size:18px;font-weight:700;color:var(--text);letter-spacing:-0.3px}
  .nav-right{display:flex;align-items:center;gap:10px}
  .status-dot{width:7px;height:7px;border-radius:50%;background:var(--green);flex-shrink:0;box-shadow:0 0 0 2px rgba(46,125,82,0.2)}
  .btn-ghost{
    font-family:'Source Code Pro',monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;
    font-weight:500;border:1px solid var(--border);color:var(--muted);
    background:transparent;cursor:pointer;border-radius:var(--r);
    padding:8px 16px;transition:all .2s;white-space:nowrap;
  }
  .btn-ghost:hover{border-color:var(--accent);color:var(--accent);background:rgba(74,111,165,0.04)}

  /* ── UPLOAD PAGE ── */
  .upload-page{
    flex:1;
    width: 100%;
    display:flex;flex-direction:column;align-items:center;
    justify-content:center;
    min-height:calc(100vh - var(--nav-h));
    padding:40px 40px 60px;
    background: radial-gradient(ellipse at 60% 0%, rgba(74,111,165,0.06) 0%, transparent 60%),
                radial-gradient(ellipse at 10% 80%, rgba(124,92,191,0.04) 0%, transparent 50%),
                var(--bg);
  }

  .upload-hero{
    text-align:center;margin-bottom:36px;
  }
  .upload-hero h1{font-family:'Lora',serif;font-size:clamp(22px,5vw,36px);font-weight:700;color:var(--text);margin-bottom:8px;line-height:1.2}
  .upload-hero p{font-size:12px;color:var(--muted);letter-spacing:0.5px;line-height:1.7;max-width:460px;margin:0 auto}

  .upload-well{width:100%;max-width:960px;display:flex;flex-direction:column;gap:12px}

  /* ── DROP ZONE ── */
  .drop{
    border:2px dashed var(--border2);background:var(--surf);
    border-radius:var(--r-lg);padding:44px 28px;text-align:center;
    cursor:pointer;transition:all .3s;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    position:relative;overflow:hidden;
    box-shadow:0 2px 16px rgba(74,111,165,0.06);
  }
  .drop::before{
    content:'';position:absolute;inset:0;
    background:linear-gradient(135deg,rgba(74,111,165,0.03),transparent 50%);
    pointer-events:none;
  }
  .drop:hover,.drop.over{
    border-color:var(--accent);
    box-shadow:0 8px 32px rgba(74,111,165,0.14);
    transform:translateY(-1px);
  }
  .drop-icon{font-size:36px;margin-bottom:12px;display:block}
  .drop-title{font-family:'Lora',serif;font-size:17px;font-weight:600;color:var(--text);margin-bottom:6px}
  .drop-sub{font-size:11px;color:var(--muted);letter-spacing:0.3px}
  .drop-hint{margin-top:10px;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--muted2)}

  .drop-compact{padding:16px 20px!important;flex-direction:row!important;gap:12px;text-align:left!important}
  .drop-compact .drop-icon{font-size:20px;margin-bottom:0;flex-shrink:0}
  .drop-compact .drop-title{font-size:13px;margin-bottom:2px}

  /* ── THUMBNAILS ── */
  .img-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:8px}
  .img-thumb{position:relative;border-radius:8px;overflow:hidden;border:1px solid var(--border);aspect-ratio:1;background:var(--surf2);transition:all .2s}
  .img-thumb:hover{border-color:var(--accent);transform:scale(1.05);box-shadow:0 4px 16px rgba(74,111,165,0.15)}
  .img-thumb img{width:100%;height:100%;object-fit:cover;display:block}
  .img-thumb-num{position:absolute;bottom:4px;left:5px;font-size:8px;font-weight:600;color:var(--text);background:rgba(255,255,255,0.9);padding:1px 4px;border-radius:3px}
  .img-thumb-del{position:absolute;top:4px;right:4px;width:20px;height:20px;border-radius:50%;border:none;cursor:pointer;background:rgba(192,54,74,0.85);color:#fff;font-size:10px;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .15s;font-family:sans-serif}
  .img-thumb:hover .img-thumb-del{opacity:1}

  /* ── UPLOAD OPTS ── */
  .upload-opts{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .upload-opt{
    display:flex;align-items:center;gap:12px;padding:14px 16px;
    border:1px solid var(--border);border-radius:var(--r);background:var(--surf);
    cursor:pointer;transition:all .2s;
    box-shadow:0 1px 6px rgba(74,111,165,0.04);
  }
  .upload-opt:hover{border-color:var(--accent);background:rgba(74,111,165,0.03);box-shadow:0 4px 20px rgba(74,111,165,0.1);transform:translateY(-1px)}
  .upload-opt:active{transform:translateY(0)}
  .upload-opt-label{font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text);font-weight:600;display:block}

  /* ── PRIMARY BUTTON ── */
  .btn-primary{
    font-family:'Source Code Pro',monospace;
    background:linear-gradient(135deg,var(--accent),var(--accent2));
    color:#fff;width:100%;justify-content:center;padding:16px;
    font-size:11px;letter-spacing:2.5px;text-transform:uppercase;font-weight:600;
    box-shadow:0 4px 24px rgba(74,111,165,0.32);
    border:none;cursor:pointer;border-radius:var(--r);
    display:flex;align-items:center;gap:8px;transition:all .25s;
  }
  .btn-primary:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 10px 32px rgba(74,111,165,0.42)}
  .btn-primary:active:not(:disabled){transform:translateY(0)}
  .btn-primary:disabled{opacity:.4;cursor:not-allowed}

  /* ── LOADING ── */
  .loading-wrap{text-align:center;padding:28px 16px}
  .loading-ring{width:40px;height:40px;margin:0 auto 16px;border-radius:50%;border:2px solid var(--border);border-top-color:var(--accent);animation:spin .8s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  .loading-msg{font-size:10px;letter-spacing:2px;color:var(--muted);margin-bottom:12px;text-transform:uppercase}
  .progress-track{width:160px;margin:0 auto;height:2px;background:var(--border);border-radius:2px;overflow:hidden}
  .progress-fill{height:100%;background:var(--accent);border-radius:2px;transition:width .6s ease}

  /* ── ERROR ── */
  .err-box{background:rgba(192,54,74,0.05);border:1px solid rgba(192,54,74,0.2);border-radius:var(--r);padding:12px 16px;color:var(--red);font-size:11px;line-height:1.7}
  .err-box::before{content:'⚠  '}

  /* ── RESULT PAGE ── */
  .result-page{
    flex:1;
    width: 100%;
    display:flex;flex-direction:column;
    height:calc(100vh - var(--nav-h));
    overflow:hidden;
  }

  .res-topbar{
    width: 100%;
    flex-shrink:0;background:rgba(255,255,255,0.96);backdrop-filter:blur(16px);
    border-bottom:1px solid var(--border);padding:10px 24px;
    display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;
    box-shadow:0 1px 8px rgba(74,111,165,0.05);
  }
  .res-title{font-family:'Lora',serif;font-size:16px;font-weight:600;color:var(--text);letter-spacing:-0.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60vw}

  /* ── MOBILE TAB BAR ── */
  .mobile-tabs{
    display:none;
    flex-shrink:0;
    background:var(--surf);
    border-bottom:1px solid var(--border);
    padding:0 16px;
  }
  .mobile-tab{
    flex:1;
    font-family:'Source Code Pro',monospace;
    font-size:10px;letter-spacing:1.5px;text-transform:uppercase;font-weight:600;
    padding:12px 8px;border:none;background:transparent;
    color:var(--muted);cursor:pointer;
    border-bottom:2px solid transparent;
    transition:all .2s;
  }
  .mobile-tab.active{color:var(--accent);border-bottom-color:var(--accent)}

  /* ── SPLIT / PANELS ── */
  .result-split{
    flex:1;
    width: 100%;
    display:grid;
    grid-template-columns:1fr 1fr;
    overflow:hidden;
    min-height:0;
  }
  .result-panel{display:flex;flex-direction:column;overflow:hidden;min-height:0;border-right:1px solid var(--border)}
  .result-panel:last-child{border-right:none}

  .panel-hdr{flex-shrink:0;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;padding:10px 20px;background:var(--surf);border-bottom:1px solid var(--border)}
  .panel-label{font-size:8px;letter-spacing:3px;text-transform:uppercase;color:var(--accent);display:flex;align-items:center;gap:8px;font-weight:600}
  .panel-label::before{content:'';width:10px;height:1px;background:var(--accent)}
  .panel-actions{display:flex;align-items:center;gap:5px;flex-wrap:nowrap}

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
  .diagram-body::-webkit-scrollbar-corner{background:var(--surf2)}

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
  .ep-overlay{position:fixed;inset:0;background:rgba(26,34,53,0.4);z-index:500;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);animation:fadeIn .15s ease;padding:20px}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  .ep{background:var(--surf);border:1px solid var(--border2);border-radius:var(--r-lg);padding:26px;width:100%;max-width:310px;box-shadow:0 16px 48px rgba(26,34,53,0.14);animation:slideUp .2s ease}
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
  .dl-err{flex-shrink:0;background:rgba(192,54,74,0.05);border:1px solid rgba(192,54,74,0.18);border-radius:var(--r);padding:7px 14px;color:var(--red);font-size:10px;margin:6px 20px}
  .footer{
    width: 100%;
    flex-shrink:0;padding:12px 24px;border-top:1px solid var(--border);
    display:flex;align-items:center;justify-content:space-between;background:var(--surf);
  }
  .footer-brand{font-family:'Lora',serif;font-size:13px;font-weight:600;color:var(--text2)}
  .footer-brand span{color:var(--accent)}
  .footer-hint{font-size:9px;color:var(--muted2);letter-spacing:1px;text-transform:uppercase}

  /* ── DIVIDER ── */
  .section-divider{display:flex;align-items:center;gap:12px;color:var(--muted2);font-size:9px;letter-spacing:2px;text-transform:uppercase;margin:4px 0}
  .section-divider::before,.section-divider::after{content:'';flex:1;height:1px;background:var(--border)}

  /* ── TABLET (1024px and below) ── */
  @media(max-width:1024px){
    .result-split{grid-template-columns:1fr 1fr}
  }

  /* ── MOBILE (768px and below) ── key fix: single column + tabs ── */
  @media(max-width:768px){
    :root{--nav-h:52px}
    .topnav{padding:0 16px}

    /* Upload page */
    .upload-page{padding:28px 16px 48px;justify-content:flex-start;padding-top:40px}
    .upload-hero{margin-bottom:28px}
    .upload-well{max-width:100%}

    /* Result: full height scrollable, single column */
    .app.result-mode{height:100vh;overflow:hidden}
    .result-page{height:calc(100vh - var(--nav-h));overflow:hidden;display:flex;flex-direction:column}

    /* Show mobile tabs */
    .mobile-tabs{display:flex}

    /* Single column panels, each fills remaining space */
    .result-split{
      grid-template-columns:1fr;
      grid-template-rows:1fr;
      flex:1;
      overflow:hidden;
    }

    /* Hide/show panels based on active tab */
    .result-panel{
      border-right:none;
      border-bottom:none;
      height:100%;
    }
    .result-panel.panel-hidden{display:none}

    /* Notes area fills height */
    .notes-scroll{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch}

    /* Diagram fills height */
    .diagram-body{flex:1;overflow:auto;-webkit-overflow-scrolling:touch}

    .res-topbar{padding:8px 16px}
    .res-title{font-size:14px;max-width:65vw}
    .panel-hdr{padding:8px 14px}
    .panel-actions{gap:4px;overflow-x:auto;padding-bottom:2px;-webkit-overflow-scrolling:touch}
    .dl-btn,.toggle-btn{flex-shrink:0}

    .fe-toolbar{overflow-x:auto;flex-wrap:nowrap;padding:5px 10px;-webkit-overflow-scrolling:touch}
    .fe-btn{flex-shrink:0}
    .fe-hint-bar{font-size:9px}
    .footer{padding:10px 16px}
    .dl-err{margin:5px 12px}
    .notes-ta,.notes-prev{padding:16px 18px}

    /* Touch-friendly delete buttons always visible on mobile */
    .img-thumb-del{opacity:1}
  }

  @media(max-width:480px){
    :root{--nav-h:50px}
    .brand-name{font-size:16px}
    .upload-opts{grid-template-columns:1fr 1fr}
    .drop{padding:32px 20px}
    .drop-compact{padding:14px 16px!important}
    .img-grid{grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:7px}
    .btn-primary{padding:14px;font-size:10px}
    .upload-hero h1{font-size:22px}
    .upload-hero p{font-size:11px}
    .panel-hdr{flex-wrap:wrap}
    .res-title{font-size:13px;max-width:55vw}
  }

  @media(min-width:1400px){
    .topnav,.res-topbar,.footer{padding-left:52px;padding-right:52px}
    .panel-hdr{padding:11px 30px}
    .notes-ta,.notes-prev{padding:30px 36px}
  }

  @media(hover:none){
    .btn-primary:hover:not(:disabled){transform:none}
    .upload-opt:hover{transform:none}
    .drop:hover{transform:none}
  }
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
  // ← NEW: which tab is active on mobile
  const [mobileTab, setMobileTab] = useState("notes");

  const galleryRef = useRef();
  const cameraRef  = useRef();
  const notesCardRef  = useRef();
  const flowCardRef   = useRef();

  const BACKEND_URL = "https://inkparse-backend.onrender.com";

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
    const stages = [[0,"Transmitting…"],[20,"Decoding handwriting…"],[48,"Structuring content…"],[72,"Building diagram…"],[90,"Finalising…"]];
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
      setMobileTab("notes"); // reset to notes tab on new result
      setTimeout(() => setStep("result"), 300);
    } catch (err) {
      clearInterval(tick);
      setError(err.message.includes("fetch") || err.message.includes("Failed")
        ? "Cannot reach the server. Check that the backend is running on Render."
        : err.message);
    } finally { setLoading(false); }
  };

  const triggerDownload = (url, name) => {
    const a = document.createElement("a"); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const loadH2C = () => new Promise((res, rej) => {
    if (window.html2canvas) return res();
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
    s.onload = res; s.onerror = () => rej(new Error("html2canvas failed"));
    document.head.appendChild(s);
  });

  const dlNotesJpg = async () => {
    setDlBusy("notes-jpg"); setDlError("");
    try {
      await loadH2C();

      // Build a full-height off-screen container — no scroll clipping
      const wrapper = document.createElement("div");
      wrapper.style.cssText = [
        "position:fixed", "top:-99999px", "left:0",
        "width:820px", "background:#FFFFFF",
        "padding:48px 56px", "box-sizing:border-box",
        "font-family:'Source Code Pro',monospace",
        "color:#1A2235", "line-height:1.8",
      ].join(";");

      // Title bar
      const titleBar = document.createElement("div");
      titleBar.style.cssText = "font-family:'Lora',serif;font-size:24px;font-weight:700;color:#1A2235;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid #DDE2EE;";
      titleBar.textContent = title || "Notes";
      wrapper.appendChild(titleBar);

      // Notes content with inlined styles
      const styleTag = document.createElement("style");
      styleTag.textContent = `
        .nc-ex h1{font-family:'Lora',serif;font-size:20px;font-weight:700;color:#1A2235;margin:0 0 14px;padding-bottom:10px;border-bottom:1px solid #DDE2EE}
        .nc-ex h2{font-family:'Lora',serif;font-size:16px;font-weight:600;color:#1A2235;margin:20px 0 8px}
        .nc-ex h3{font-size:10px;font-weight:600;color:#4A6FA5;margin:16px 0 6px;text-transform:uppercase;letter-spacing:3px}
        .nc-ex p{font-size:13px;line-height:2;color:#3A4A65;margin-bottom:10px}
        .nc-ex ul{list-style:none;padding:0;margin:6px 0 12px}
        .nc-ex ol{padding-left:22px;margin:6px 0 12px}
        .nc-ex li{font-size:13px;line-height:1.9;color:#3A4A65;padding:2px 0 2px 20px;position:relative}
        .nc-ex ul li::before{content:'›';position:absolute;left:4px;color:#4A6FA5;font-size:15px}
        .nc-ex ol li{padding-left:0;list-style:decimal}
        .nc-ex ol li::before{display:none}
        .nc-ex strong{color:#1A2235;font-weight:700}
        .nc-ex em{color:#4A6FA5;font-style:italic}
        .nc-ex code{background:rgba(74,111,165,0.07);color:#2E4F80;padding:2px 7px;border-radius:4px;font-size:11px;border:1px solid rgba(74,111,165,0.12)}
        .nc-ex hr{border:none;border-top:1px solid #DDE2EE;margin:16px 0}
      `;
      wrapper.appendChild(styleTag);

      const content = document.createElement("div");
      content.className = "nc-ex";
      content.innerHTML = mdToHtml(notes);
      wrapper.appendChild(content);

      document.body.appendChild(wrapper);

      const canvas = await window.html2canvas(wrapper, {
        scale: 2,
        backgroundColor: "#FFFFFF",
        useCORS: true,
        logging: false,
        width: 820,
        height: wrapper.scrollHeight,
        windowWidth: 820,
      });

      document.body.removeChild(wrapper);
      triggerDownload(canvas.toDataURL("image/jpeg", 0.95), `${title||"notes"}.jpg`);
    } catch(e) {
      try { document.querySelector('[data-scribbld-export]')?.remove(); } catch(_) {}
      setDlError("JPG export failed: " + (e?.message || "unknown error"));
    }
    finally { setDlBusy(""); }
  };

  const dlNotesDocx = async () => {
    setDlBusy("notes-docx"); setDlError("");
    try {
      const blob = await makeDocxBlob(title, notes);
      const url = URL.createObjectURL(blob);
      triggerDownload(url, `${title||"notes"}.docx`);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch(e) { setDlError("DOCX export failed: " + (e?.message || "unknown error")); }
    finally { setDlBusy(""); }
  };

  const dlDiagramJpg = async () => {
    setDlBusy("diag-jpg"); setDlError("");
    try {
      // Export from node/edge data directly — full diagram, no pan/zoom clipping
      const blob = await exportDiagramFull(flowNodes, flowEdges);
      const url = URL.createObjectURL(blob);
      triggerDownload(url, `${title||"diagram"}.jpg`);
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    } catch(e) { setDlError("JPG export failed: " + (e?.message || "unknown error")); }
    finally { setDlBusy(""); }
  };

  const dlDiagramSvg = () => {
    setDlError("");
    try {
      const result = buildDiagramSvgString(flowNodes, flowEdges);
      if (!result) throw new Error("No nodes to export");
      const blob = new Blob([result.svgStr], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      triggerDownload(url, `${title||"diagram"}.svg`);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch(e) { setDlError("SVG export failed: " + e.message); }
  };

  const reset = () => {
    setImages([]); setStep("upload"); setNotes(""); setFlowNodes({});
    setFlowEdges([]); setError(""); setDlError(""); setTitle(""); setLoadPct(0);
    setMobileTab("notes");
  };

  return (
    <>
      <style>{css}</style>
      <div className={`app${step === "result" ? " result-mode" : ""}`}>

        {/* ── NAV ── */}
        <nav className="topnav">
          <div className="brand">
            <div className="brand-name">Scribbld</div>
          </div>
          <div className="nav-right">
            {step === "result" && <button className="btn-ghost" onClick={reset}>↩ New</button>}
            <div className="status-dot" title="Connected" />
          </div>
        </nav>

        {/* ── UPLOAD ── */}
        {step === "upload" && (
          <div className="upload-page">
            <input ref={galleryRef} type="file" accept="image/*" multiple style={{ display:"none" }} onChange={onGalleryChange} />
            <input ref={cameraRef}  type="file" accept="image/*" capture="environment" style={{ display:"none" }} onChange={onCameraChange} />

            <div className="upload-hero">
              <h1>Turn notes into insights</h1>
              <p>Upload a photo of your handwritten notes and get structured text with a flow diagram in seconds.</p>
            </div>

            <div className="upload-well">
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
                    <div className="drop-hint">JPG · PNG · WEBP · Multiple pages supported</div>
                  </>
                ) : (
                  <>
                    <span className="drop-icon">＋</span>
                    <div>
                      <div className="drop-title">{images.length} image{images.length>1?"s":""} ready</div>
                      <div className="drop-sub">Click to add more pages</div>
                    </div>
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

              {images.length === 0 && (
                <>
                  <div className="section-divider">or</div>
                  <div className="upload-opts">
                    <button className="upload-opt" onClick={e => { e.stopPropagation(); galleryRef.current.click(); }}>
                      <div className="upload-opt-text">
                        <span className="upload-opt-label">Gallery</span>
                      </div>
                    </button>
                    <button className="upload-opt" onClick={e => { e.stopPropagation(); cameraRef.current.click(); }}>
                      <div className="upload-opt-text">
                        <span className="upload-opt-label">Camera</span>
                      </div>
                    </button>
                  </div>
                </>
              )}

              {loading ? (
                <div className="loading-wrap">
                  <div className="loading-ring" />
                  <div className="loading-msg">{loadMsg || "Processing…"}</div>
                  <div className="progress-track"><div className="progress-fill" style={{ width:`${loadPct}%` }} /></div>
                </div>
              ) : (
                <button className="btn-primary" disabled={!images.length || loading} onClick={analyze}>
                  {images.length > 1 ? `✨ Process ${images.length} pages` : "✨ Process notes"}
                </button>
              )}

              {error && <div className="err-box">{error}</div>}
            </div>
          </div>
        )}

        {/* ── RESULT ── */}
        {step === "result" && (
          <div className="result-page">
            {/* Top bar */}
            <div className="res-topbar">
              <div className="res-title">{title}</div>
              <button className="btn-ghost" onClick={reset}>↩ New</button>
            </div>

            {/* Mobile-only tab bar */}
            <div className="mobile-tabs">
              <button
                className={`mobile-tab ${mobileTab === "notes" ? "active" : ""}`}
                onClick={() => setMobileTab("notes")}
              >
                📝 Notes
              </button>
              <button
                className={`mobile-tab ${mobileTab === "diagram" ? "active" : ""}`}
                onClick={() => setMobileTab("diagram")}
              >
                🔀 Diagram
              </button>
            </div>

            <div className="result-split">
              {/* Notes panel */}
              <div
                className={`result-panel ${mobileTab !== "notes" ? "panel-hidden" : ""}`}
                ref={notesCardRef}
              >
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

              {/* Diagram panel */}
              <div
                className={`result-panel ${mobileTab !== "diagram" ? "panel-hidden" : ""}`}
                ref={flowCardRef}
              >
                <div className="panel-hdr">
                  <div className="panel-label">Flow Diagram</div>
                  <div className="panel-actions">
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
          <div className="footer-brand">Scribbld</div>
        </footer>
      </div>
    </>
  );
}
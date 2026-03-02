import { useState, useRef, useCallback, useEffect } from "react";

// ── UTILS ─────────────────────────────────────────────────────
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
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^[-•] (.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ol">$1</li>')
    .replace(/(<li[^>]*>.*?<\/li>\n?)+/gs, s =>
      s.includes('class="ol"') ? `<ol>${s.replace(/ class="ol"/g, '')}</ol>` : `<ul>${s}</ul>`)
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/^(?!<[hopu]|<\/[hopu]|<b|<hr)(.+)$/gm, '<p>$1</p>')
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

// ── COLORS ────────────────────────────────────────────────────
const NODE_COLORS = [
  { fill: "#E8F0FA", stroke: "#3A6EA8", text: "#1A2C50", glow: "rgba(58,110,168,0.3)" },
  { fill: "#F3EDF9", stroke: "#7B52B9", text: "#2A1050", glow: "rgba(123,82,185,0.3)" },
  { fill: "#E6F4EE", stroke: "#2A7A50", text: "#0D2B1A", glow: "rgba(42,122,80,0.3)" },
  { fill: "#FFF5E6", stroke: "#B86A20", text: "#2B1600", glow: "rgba(184,106,32,0.3)" },
  { fill: "#FDEAEE", stroke: "#B83050", text: "#2B000D", glow: "rgba(184,48,80,0.3)" },
  { fill: "#E4F3FF", stroke: "#2060A0", text: "#002040", glow: "rgba(32,96,160,0.3)" },
];
const NW = 160, NH = 50;

function getNodeColor(id, nodes) {
  return NODE_COLORS[Object.keys(nodes).indexOf(id) % NODE_COLORS.length];
}

// ── FLOW DIAGRAM ──────────────────────────────────────────────
function FlowDiagram({ nodes, edges }) {
  const svgRef = useRef();
  const [pan, setPan] = useState({ x: 40, y: 30 });
  const [panningSt, setPanningSt] = useState(null);
  const [zoom, setZoom] = useState(0.85);

  const onSvgMD = e => setPanningSt({ sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y });
  const onMM = e => { if (panningSt) setPan({ x: panningSt.px + (e.clientX - panningSt.sx), y: panningSt.py + (e.clientY - panningSt.sy) }); };
  const onMU = () => setPanningSt(null);
  const onWheel = e => { e.preventDefault(); setZoom(z => Math.max(0.2, Math.min(3, z - e.deltaY * 0.001))); };

  const nodeCenter = n => ({ x: n.x + NW / 2, y: n.y + NH / 2 });
  const allNodes = Object.values(nodes);
  const canvasW = Math.max(800, ...allNodes.map(n => n.x + NW + 120));
  const canvasH = Math.max(700, ...allNodes.map(n => n.y + NH + 120));

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div className="fd-toolbar">
        <span className="fd-label">Call Flow Diagram</span>
        <div style={{ flex: 1 }} />
        <button className="fd-btn" onClick={() => setZoom(z => Math.min(3, z + 0.15))}>＋</button>
        <span className="fd-zoom">{Math.round(zoom * 100)}%</span>
        <button className="fd-btn" onClick={() => setZoom(z => Math.max(0.2, z - 0.15))}>－</button>
        <button className="fd-btn" onClick={() => { setZoom(0.85); setPan({ x: 40, y: 30 }); }}>⊡ Reset</button>
      </div>
      <div className="fd-body">
        <svg ref={svgRef} width={canvasW} height={canvasH}
          style={{ display: "block", cursor: panningSt ? "grabbing" : "grab", background: "transparent", touchAction: "none" }}
          onMouseDown={onSvgMD} onMouseMove={onMM} onMouseUp={onMU} onWheel={onWheel}>
          <defs>
            <marker id="fd-arr" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0,10 3.5,0 7" fill="#3A6EA8" opacity="0.8" />
            </marker>
            <pattern id="fd-dot" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="rgba(58,110,168,0.12)" />
            </pattern>
          </defs>
          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            <rect x="-5000" y="-5000" width="20000" height="20000" fill="url(#fd-dot)" />
            {edges.map((e, i) => {
              const from = nodes[e.from], to = nodes[e.to];
              if (!from || !to) return null;
              const f = nodeCenter(from), t = nodeCenter(to);
              const dx = t.x - f.x, dy = t.y - f.y, len = Math.sqrt(dx * dx + dy * dy) || 1;
              const ux = dx / len, uy = dy / len;
              const sx = f.x + ux * NW * 0.52, sy = f.y + uy * NH * 0.52;
              const ex = t.x - ux * NW * 0.52, ey = t.y - uy * NH * 0.52;
              const mx = (sx + ex) / 2 - uy * 30, my = (sy + ey) / 2 + ux * 30;
              const midX = (sx + 2 * mx + ex) / 4, midY = (sy + 2 * my + ey) / 4;
              return (
                <g key={i}>
                  <path d={`M${sx},${sy} Q${mx},${my} ${ex},${ey}`} stroke="#3A6EA8" strokeWidth={1.5} fill="none" markerEnd="url(#fd-arr)" opacity={0.6} />
                  {e.label && (
                    <>
                      <rect x={midX - e.label.length * 3 - 8} y={midY - 9} width={e.label.length * 6 + 16} height={18} rx={9} fill="#F0F4FC" stroke="#3A6EA8" strokeWidth={0.8} />
                      <text x={midX} y={midY + 1} textAnchor="middle" dominantBaseline="middle" fill="#3A6EA8" fontSize={9} fontFamily="monospace" letterSpacing="1">{e.label}</text>
                    </>
                  )}
                </g>
              );
            })}
            {Object.values(nodes).map(n => {
              const col = getNodeColor(n.id, nodes);
              const { x, y } = n;
              return (
                <g key={n.id}>
                  {n.shape === "diamond"
                    ? <polygon points={`${x + NW / 2},${y - 4} ${x + NW + 4},${y + NH / 2} ${x + NW / 2},${y + NH + 4} ${x - 4},${y + NH / 2}`} fill={col.fill} stroke={col.stroke} strokeWidth={1.2} />
                    : n.shape === "round"
                      ? <rect x={x} y={y} width={NW} height={NH} rx={NH / 2} fill={col.fill} stroke={col.stroke} strokeWidth={1.2} />
                      : <rect x={x} y={y} width={NW} height={NH} rx={7} fill={col.fill} stroke={col.stroke} strokeWidth={1.2} />
                  }
                  <rect x={x} y={y} width={3} height={NH} rx={2} fill={col.stroke} opacity={0.5} style={{ pointerEvents: "none" }} />
                  <text x={x + NW / 2} y={y + NH / 2 + 1} textAnchor="middle" dominantBaseline="middle" fill={col.text} fontSize={10} fontFamily="'DM Mono', monospace" fontWeight="500" letterSpacing="0.4" style={{ pointerEvents: "none", userSelect: "none" }}>
                    {n.label.length > 22 ? n.label.slice(0, 20) + "…" : n.label}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <div className="fd-hint">Scroll to zoom · Drag to pan</div>
    </div>
  );
}

// ── CSS ───────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@300;400;500&display=swap');

  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

  :root{
    --bg:#F5F6FA;
    --surf:#FFFFFF;
    --surf2:#EEF1FA;
    --surf3:#E4E8F5;
    --border:#D8DFEE;
    --border2:#B8C4E0;
    --accent:#1E4D8C;
    --accent2:#2C6FCA;
    --accent-lt:#EBF1FB;
    --gold:#9A6F2C;
    --gold-lt:#FBF5E6;
    --green:#1E6B3C;
    --green-lt:#E6F5EE;
    --purple:#5C3A9E;
    --purple-lt:#F0EBF9;
    --text:#0F1E3A;
    --text2:#2A3A5A;
    --muted:#6878A0;
    --muted2:#A0AECB;
    --r:8px;
    --r-lg:14px;
    --nav-h:60px;
    --serif:'Playfair Display',serif;
    --sans:'DM Sans',sans-serif;
    --mono:'DM Mono',monospace;
    --shadow:0 2px 16px rgba(15,30,58,0.08);
    --shadow-lg:0 8px 40px rgba(15,30,58,0.12);
  }

  body{font-family:var(--sans);background:var(--bg);color:var(--text);min-height:100vh;-webkit-font-smoothing:antialiased}

  /* ── NAV ── */
  .topnav{
    position:sticky;top:0;z-index:100;
    height:var(--nav-h);
    background:var(--surf);
    border-bottom:1px solid var(--border);
    display:flex;align-items:center;
    padding:0 32px;
    gap:16px;
  }
  .brand{display:flex;align-items:center;gap:10px;text-decoration:none}
  .brand-mark{
    width:32px;height:32px;border-radius:8px;
    background:linear-gradient(135deg,var(--accent) 0%,var(--accent2) 100%);
    display:flex;align-items:center;justify-content:center;
    color:#fff;font-size:15px;font-weight:700;font-family:var(--serif);
    letter-spacing:-0.5px;box-shadow:0 2px 8px rgba(30,77,140,0.25);
  }
  .brand-name{font-family:var(--serif);font-size:20px;font-weight:700;color:var(--text);letter-spacing:-0.3px}
  .brand-tag{font-size:10px;color:var(--muted);letter-spacing:2px;text-transform:uppercase;font-weight:500;margin-left:2px}
  .nav-right{margin-left:auto;display:flex;align-items:center;gap:10px}
  .nav-badge{
    background:var(--accent-lt);color:var(--accent);
    border:1px solid rgba(30,77,140,0.15);
    padding:4px 10px;border-radius:20px;
    font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;
  }

  /* ── BUTTONS ── */
  .btn-primary{
    background:linear-gradient(135deg,var(--accent) 0%,var(--accent2) 100%);
    color:#fff;border:none;cursor:pointer;
    padding:14px 32px;border-radius:var(--r);
    font-family:var(--sans);font-size:13px;font-weight:600;
    letter-spacing:0.5px;
    box-shadow:0 4px 14px rgba(30,77,140,0.3);
    transition:all 0.2s;
    display:flex;align-items:center;gap:8px;
    width:100%;justify-content:center;
  }
  .btn-primary:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 6px 20px rgba(30,77,140,0.4)}
  .btn-primary:disabled{opacity:0.55;cursor:not-allowed;transform:none}

  .btn-ghost{
    background:transparent;border:1px solid var(--border2);color:var(--text2);
    padding:8px 16px;border-radius:var(--r);cursor:pointer;
    font-family:var(--sans);font-size:12px;font-weight:500;
    transition:all 0.15s;
  }
  .btn-ghost:hover{background:var(--surf2);border-color:var(--accent)}

  .dl-btn{
    background:var(--surf2);border:1px solid var(--border);color:var(--text2);
    padding:6px 12px;border-radius:6px;cursor:pointer;
    font-family:var(--mono);font-size:10px;font-weight:500;
    transition:all 0.15s;letter-spacing:0.3px;
    white-space:nowrap;
  }
  .dl-btn:hover:not(:disabled){background:var(--accent-lt);color:var(--accent);border-color:rgba(30,77,140,0.3)}
  .dl-btn:disabled{opacity:0.5;cursor:not-allowed}

  /* ── INPUT PAGE ── */
  .input-page{
    min-height:calc(100vh - var(--nav-h));
    display:flex;flex-direction:column;align-items:center;
    padding:48px 24px 80px;
  }
  .input-hero{
    text-align:center;max-width:560px;margin-bottom:40px;
  }
  .input-hero h1{
    font-family:var(--serif);font-size:36px;font-weight:700;
    color:var(--text);line-height:1.2;margin-bottom:12px;
    letter-spacing:-0.5px;
  }
  .input-hero h1 span{color:var(--accent2)}
  .input-hero p{font-size:15px;color:var(--muted);line-height:1.7;font-weight:400}

  .input-card{
    width:100%;max-width:780px;
    background:var(--surf);border:1px solid var(--border);
    border-radius:var(--r-lg);
    box-shadow:var(--shadow-lg);
    overflow:hidden;
  }

  /* ── TABS ── */
  .tab-bar{
    display:flex;border-bottom:1px solid var(--border);
    background:var(--surf2);
  }
  .tab-item{
    flex:1;padding:14px 20px;
    background:transparent;border:none;cursor:pointer;
    font-family:var(--sans);font-size:12px;font-weight:600;
    color:var(--muted);letter-spacing:0.5px;text-transform:uppercase;
    border-bottom:2px solid transparent;margin-bottom:-1px;
    transition:all 0.15s;
    display:flex;align-items:center;justify-content:center;gap:6px;
  }
  .tab-item:hover{color:var(--text2)}
  .tab-item.active{color:var(--accent);border-bottom-color:var(--accent);background:var(--surf)}
  .tab-dot{
    width:6px;height:6px;border-radius:50%;
    background:var(--muted2);
    transition:background 0.15s;
  }
  .tab-item.active .tab-dot{background:var(--accent2)}
  .tab-item.filled .tab-dot{background:var(--green)}

  .tab-pane{display:none;padding:20px}
  .tab-pane.active{display:block}

  .prompt-label{
    font-size:11px;font-weight:600;color:var(--muted);
    letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px;
    display:flex;align-items:center;gap:6px;
  }
  .prompt-label .lbadge{
    background:var(--accent-lt);color:var(--accent);
    padding:2px 8px;border-radius:10px;font-size:9px;letter-spacing:1px;
  }

  .prompt-ta{
    width:100%;min-height:240px;max-height:400px;
    background:var(--surf2);border:1px solid var(--border);
    border-radius:var(--r);
    padding:16px;
    font-family:var(--mono);font-size:12px;line-height:1.7;
    color:var(--text);resize:vertical;
    transition:border-color 0.15s,box-shadow 0.15s;
    outline:none;
  }
  .prompt-ta:focus{border-color:var(--accent2);box-shadow:0 0 0 3px rgba(44,111,202,0.1)}
  .prompt-ta::placeholder{color:var(--muted2)}

  .char-count{
    text-align:right;font-size:10px;color:var(--muted2);
    font-family:var(--mono);margin-top:4px;
  }

  .input-footer{padding:20px;border-top:1px solid var(--border);background:var(--surf2)}

  .prompt-status{
    display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;
  }
  .ps-chip{
    display:flex;align-items:center;gap:5px;
    padding:4px 10px;border-radius:20px;font-size:10px;font-weight:600;letter-spacing:0.5px;
    border:1px solid;
  }
  .ps-chip.empty{background:var(--surf3);border-color:var(--border);color:var(--muted2)}
  .ps-chip.has{background:var(--green-lt);border-color:rgba(30,107,60,0.25);color:var(--green)}

  /* ── LOADING ── */
  .loading-wrap{text-align:center;padding:24px 0 8px}
  .loading-ring{
    width:40px;height:40px;border-radius:50%;
    border:3px solid var(--surf3);border-top-color:var(--accent2);
    animation:spin 0.8s linear infinite;margin:0 auto 12px;
  }
  @keyframes spin{to{transform:rotate(360deg)}}
  .loading-msg{font-size:13px;color:var(--muted);font-weight:500;margin-bottom:8px}
  .progress-track{height:3px;background:var(--surf3);border-radius:2px;overflow:hidden;margin-top:8px}
  .progress-fill{height:100%;background:linear-gradient(90deg,var(--accent),var(--accent2));border-radius:2px;transition:width 0.6s ease}

  .err-box{
    background:#FEF0F2;border:1px solid rgba(184,48,80,0.25);color:#8B1A30;
    padding:10px 14px;border-radius:var(--r);font-size:12px;
    font-family:var(--mono);margin-top:12px;
  }

  /* ── RESULT PAGE ── */
  .result-page{
    min-height:calc(100vh - var(--nav-h));
    display:flex;flex-direction:column;
  }

  /* ── DOCUMENT COVER ── */
  .doc-cover{
    background:linear-gradient(135deg,#0F1E3A 0%,#1E3A6A 60%,#2C6FCA 100%);
    color:#fff;padding:48px 48px 40px;position:relative;overflow:hidden;
  }
  .doc-cover::before{
    content:'';position:absolute;inset:0;
    background:radial-gradient(ellipse at 80% 50%,rgba(255,255,255,0.05) 0%,transparent 70%);
  }
  .doc-cover-inner{position:relative;max-width:900px}
  .doc-tags{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px}
  .doc-tag{
    padding:3px 10px;border-radius:12px;font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;
    background:rgba(255,255,255,0.12);color:rgba(255,255,255,0.8);border:1px solid rgba(255,255,255,0.15);
  }
  .doc-title{
    font-family:var(--serif);font-size:32px;font-weight:700;line-height:1.2;
    margin-bottom:8px;color:#fff;letter-spacing:-0.3px;
  }
  .doc-subtitle{
    font-size:15px;color:rgba(255,255,255,0.7);line-height:1.6;font-weight:400;margin-bottom:28px;
  }
  .doc-meta{
    display:flex;gap:20px;flex-wrap:wrap;
  }
  .doc-meta-item{
    display:flex;align-items:center;gap:6px;
    font-size:12px;color:rgba(255,255,255,0.65);font-weight:500;
  }
  .doc-meta-item strong{color:rgba(255,255,255,0.9)}

  /* ── HIGHLIGHTS BAR ── */
  .highlights-bar{
    background:var(--surf);border-bottom:1px solid var(--border);
    padding:20px 48px;
  }
  .highlights-label{
    font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;
    color:var(--muted);margin-bottom:12px;
  }
  .highlights-grid{
    display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;
  }
  .highlight-item{
    display:flex;align-items:flex-start;gap:8px;
    font-size:13px;color:var(--text2);line-height:1.5;
  }
  .highlight-dot{
    width:6px;height:6px;border-radius:50%;background:var(--accent2);
    margin-top:5px;flex-shrink:0;
  }

  /* ── RESULT BODY ── */
  .result-body{
    display:grid;grid-template-columns:1fr 400px;flex:1;
    min-height:calc(100vh - var(--nav-h) - 280px);
  }

  /* ── SECTIONS PANEL ── */
  .sections-panel{
    border-right:1px solid var(--border);
    overflow-y:auto;
    padding:0;
  }

  .section-nav{
    position:sticky;top:0;z-index:10;
    background:var(--surf);border-bottom:1px solid var(--border);
    padding:12px 24px;
    display:flex;align-items:center;gap:8px;overflow-x:auto;
    scrollbar-width:none;
  }
  .section-nav::-webkit-scrollbar{display:none}
  .snav-btn{
    background:transparent;border:1px solid var(--border);color:var(--muted);
    padding:5px 12px;border-radius:20px;font-size:10px;font-weight:600;
    cursor:pointer;white-space:nowrap;transition:all 0.15s;
    font-family:var(--sans);letter-spacing:0.3px;
  }
  .snav-btn:hover,.snav-btn.active{background:var(--accent-lt);color:var(--accent);border-color:rgba(30,77,140,0.25)}

  .doc-section{padding:32px 40px;border-bottom:1px solid var(--border)}
  .doc-section:last-child{border-bottom:none}

  .sec-header{display:flex;align-items:center;gap:10px;margin-bottom:20px}
  .sec-icon{
    width:36px;height:36px;border-radius:8px;
    background:var(--accent-lt);display:flex;align-items:center;justify-content:center;
    font-size:17px;flex-shrink:0;border:1px solid rgba(30,77,140,0.12);
  }
  .sec-heading{
    font-family:var(--serif);font-size:20px;font-weight:700;
    color:var(--text);letter-spacing:-0.2px;
  }
  .sec-num{
    font-size:10px;font-weight:700;color:var(--muted2);
    letter-spacing:2px;font-family:var(--mono);margin-top:2px;
  }

  /* ── MARKDOWN CONTENT ── */
  .sec-content h1,.sec-content h2,.sec-content h3{font-family:var(--serif);color:var(--text);margin:20px 0 8px}
  .sec-content h1{font-size:18px}
  .sec-content h2{font-size:16px;border-bottom:1px solid var(--border);padding-bottom:6px}
  .sec-content h3{font-size:13px;text-transform:uppercase;letter-spacing:1.5px;color:var(--accent);font-family:var(--sans);font-weight:700}
  .sec-content p{font-size:14px;line-height:1.8;color:var(--text2);margin-bottom:10px}
  .sec-content ul{list-style:none;padding:0;margin:8px 0 14px}
  .sec-content ol{padding-left:20px;margin:8px 0 14px}
  .sec-content li{font-size:14px;line-height:1.7;color:var(--text2);padding:3px 0 3px 18px;position:relative}
  .sec-content ul li::before{content:'›';position:absolute;left:2px;color:var(--accent2);font-size:16px;top:1px}
  .sec-content ol li{padding-left:0;list-style:decimal;color:var(--text2)}
  .sec-content ol li::before{display:none}
  .sec-content strong{color:var(--text);font-weight:700}
  .sec-content em{color:var(--accent);font-style:italic}
  .sec-content code{background:var(--surf2);color:var(--accent);padding:2px 6px;border-radius:4px;font-size:11.5px;border:1px solid var(--border);font-family:var(--mono)}
  .sec-content hr{border:none;border-top:1px solid var(--border);margin:18px 0}
  .sec-content blockquote{
    border-left:3px solid var(--accent2);padding:8px 16px;margin:12px 0;
    background:var(--accent-lt);border-radius:0 6px 6px 0;
    font-size:13px;color:var(--text2);font-style:italic;
  }

  /* ── DIAGRAM PANEL ── */
  .diagram-panel{
    display:flex;flex-direction:column;
    background:var(--surf);
    position:sticky;top:var(--nav-h);
    height:calc(100vh - var(--nav-h));
    overflow:hidden;
  }

  .fd-toolbar{
    display:flex;align-items:center;gap:6px;padding:10px 16px;
    border-bottom:1px solid var(--border);background:var(--surf2);
    flex-shrink:0;
  }
  .fd-label{font-size:11px;font-weight:700;color:var(--text);letter-spacing:0.5px;font-family:var(--mono)}
  .fd-btn{
    background:var(--surf3);border:1px solid var(--border);color:var(--text2);
    padding:4px 9px;border-radius:5px;cursor:pointer;font-size:11px;font-weight:600;
    font-family:var(--mono);transition:all 0.12s;
  }
  .fd-btn:hover{background:var(--accent-lt);color:var(--accent);border-color:rgba(30,77,140,0.3)}
  .fd-zoom{font-size:11px;color:var(--muted);font-family:var(--mono);min-width:35px;text-align:center}
  .fd-body{flex:1;overflow:auto;cursor:grab}
  .fd-body:active{cursor:grabbing}
  .fd-hint{font-size:9px;color:var(--muted2);text-align:center;padding:6px;letter-spacing:0.5px;border-top:1px solid var(--border);flex-shrink:0;font-family:var(--mono)}

  /* ── RESULT TOPBAR ── */
  .res-topbar{
    display:flex;align-items:center;gap:12px;
    padding:10px 24px;border-bottom:1px solid var(--border);
    background:var(--surf);flex-shrink:0;
  }
  .res-title{font-size:13px;font-weight:600;color:var(--text2);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--serif)}
  .dl-group{display:flex;gap:6px;align-items:center}

  /* ── MOBILE ── */
  .mobile-tabs{display:none}

  @media(max-width:900px){
    .result-body{grid-template-columns:1fr}
    .diagram-panel{display:none}
    .mobile-tabs{
      display:flex;border-bottom:1px solid var(--border);
      background:var(--surf2);
    }
    .mobile-tab{
      flex:1;padding:12px;border:none;background:transparent;cursor:pointer;
      font-family:var(--sans);font-size:11px;font-weight:700;color:var(--muted);
      letter-spacing:0.5px;text-transform:uppercase;border-bottom:2px solid transparent;margin-bottom:-1px;
      transition:all 0.15s;
    }
    .mobile-tab.active{color:var(--accent);border-bottom-color:var(--accent);background:var(--surf)}
    .mobile-diagram{display:none;height:calc(100vh - 200px)}
    .mobile-diagram.active{display:block}
    .doc-cover{padding:32px 24px 28px}
    .doc-title{font-size:24px}
    .highlights-bar{padding:16px 24px}
    .doc-section{padding:24px 20px}
    .sections-panel{overflow-y:visible}
    .fd-body{height:100%}
  }

  @media(max-width:600px){
    .input-hero h1{font-size:26px}
    .doc-cover{padding:24px 16px 20px}
    .doc-title{font-size:20px}
    .doc-subtitle{font-size:13px}
    .res-topbar{padding:8px 16px}
    .highlights-bar{padding:14px 16px}
    .doc-section{padding:20px 16px}
  }

  /* ── FOOTER ── */
  .footer{padding:16px 32px;text-align:center;font-size:11px;color:var(--muted2);border-top:1px solid var(--border);font-family:var(--mono);letter-spacing:0.5px}

  /* ── EMPTY DIAGRAM ── */
  .no-diagram{
    flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
    color:var(--muted2);font-size:12px;gap:10px;font-family:var(--mono);
    padding:32px;text-align:center;
  }
  .no-diagram-icon{font-size:36px;opacity:0.4}
`;

// ── MAIN APP ──────────────────────────────────────────────────
const BACKEND_URL = "https://inkparse-backend.onrender.com";

export default function App() {
  const [activeInputTab, setActiveInputTab] = useState("call");
  const [callPrompt, setCallPrompt] = useState("");
  const [evalPrompt, setEvalPrompt] = useState("");
  const [step, setStep] = useState("input");
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState("");
  const [loadPct, setLoadPct] = useState(0);
  const [error, setError] = useState("");
  const [docData, setDocData] = useState(null);
  const [flowNodes, setFlowNodes] = useState({});
  const [flowEdges, setFlowEdges] = useState([]);
  const [mobileTab, setMobileTab] = useState("doc");
  const [activeSection, setActiveSection] = useState(null);

  const sectionRefs = useRef({});

  const scrollToSection = (id) => {
    setActiveSection(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const generate = async () => {
    if (!callPrompt.trim() && !evalPrompt.trim()) return;
    setLoading(true); setError(""); setLoadPct(0);
    const stages = [
      [0, "Reading prompt…"],
      [20, "Analysing agent behaviour…"],
      [45, "Structuring document…"],
      [68, "Building call flow diagram…"],
      [85, "Finalising document…"]
    ];
    let mi = 0;
    const tick = setInterval(() => {
      if (mi < stages.length) { setLoadMsg(stages[mi][1]); setLoadPct(stages[mi][0]); mi++; }
    }, 1000);
    try {
      const payload = {};
      if (callPrompt.trim()) payload.callPrompt = callPrompt.trim();
      if (evalPrompt.trim()) payload.evalPrompt = evalPrompt.trim();

      const res = await fetch(`${BACKEND_URL}/api/generate-doc`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
      });
      clearInterval(tick); setLoadPct(92); setLoadMsg("Rendering document…");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);

      setDocData(data);

      if (data.callFlowMermaid) {
        const code = data.callFlowMermaid.replace(/```[\w]*\n?/g, "").trim();
        const { nodes: n, edges: e } = parseMermaidToGraph(code);
        setFlowNodes(n); setFlowEdges(e);
      } else {
        setFlowNodes({}); setFlowEdges([]);
      }

      if (data.sections?.length) setActiveSection(data.sections[0]?.id);
      setLoadPct(100);
      setTimeout(() => setStep("result"), 300);
    } catch (err) {
      clearInterval(tick);
      setError(
        err.message.includes("fetch") || err.message.includes("Failed")
          ? "Cannot reach the server. Make sure the Render backend is running."
          : err.message
      );
    } finally { setLoading(false); }
  };

  const reset = () => {
    setStep("input"); setDocData(null);
    setFlowNodes({}); setFlowEdges([]); setError(""); setLoadPct(0);
    setMobileTab("doc");
  };

  const downloadDocx = async () => {
    if (!docData) return;
    // Build markdown from sections
    const md = [
      `# ${docData.title}`,
      `**${docData.subtitle}**`,
      "",
      docData.agentName ? `**Agent:** ${docData.agentName}` : "",
      docData.company ? `**Company:** ${docData.company}` : "",
      docData.primaryGoal ? `**Primary Goal:** ${docData.primaryGoal}` : "",
      "",
      "## Key Highlights",
      ...(docData.keyHighlights || []).map(h => `- ${h}`),
      "",
      ...(docData.sections || []).flatMap(s => [
        `## ${s.heading}`,
        "",
        s.content,
        "",
        "---",
        ""
      ])
    ].filter(l => l !== undefined && l !== null).join("\n");

    if (!window.docx) {
      await new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = "https://unpkg.com/docx@8.2.3/build/index.umd.js";
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
    }
    const { Document, Packer, Paragraph, TextRun, HeadingLevel } = window.docx;
    const ch = [];
    ch.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: docData.title, bold: true, size: 36 })] }));
    ch.push(new Paragraph({ children: [new TextRun({ text: docData.subtitle || "", size: 24 })] }));
    ch.push(new Paragraph({ children: [new TextRun("")] }));
    for (const line of md.split("\n")) {
      if (/^# (.+)$/.test(line)) ch.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: line.replace(/^# /, ""), bold: true, size: 32 })] }));
      else if (/^## (.+)$/.test(line)) ch.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: line.replace(/^## /, ""), bold: true, size: 28 })] }));
      else if (/^### (.+)$/.test(line)) ch.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: line.replace(/^### /, ""), bold: true, size: 24 })] }));
      else if (/^[-•] (.+)$/.test(line)) ch.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: line.replace(/^[-•] /, "") })] }));
      else if (/^---$/.test(line)) ch.push(new Paragraph({ children: [new TextRun({ text: "", break: 1 })] }));
      else if (line.trim()) ch.push(new Paragraph({ children: [new TextRun({ text: line.replace(/\*\*(.+?)\*\*/g, "$1") })], spacing: { after: 100 } }));
      else ch.push(new Paragraph({ children: [new TextRun("")] }));
    }
    const doc = new Document({ sections: [{ properties: {}, children: ch }] });
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${docData.title || "document"}.docx`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <>
      <style>{css}</style>

      {/* ── NAV ── */}
      <nav className="topnav">
        <div className="brand">
          <div className="brand-mark">S</div>
          <div>
            <div className="brand-name">Scribbld</div>
          </div>
        </div>
        <div className="brand-tag">Prompt Docs</div>
        <div className="nav-right">
          {step === "result" && <button className="btn-ghost" onClick={reset}>↩ New Document</button>}
        </div>
      </nav>

      {/* ── INPUT ── */}
      {step === "input" && (
        <div className="input-page">
          <div className="input-hero">
            <h1>Turn your <span>AI prompts</span> into beautiful documents</h1>
            <p>Paste your call prompt, eval prompt, or both — and get a comprehensive, customer-ready document in seconds.</p>
          </div>

          <div className="input-card">
            <div className="tab-bar">
              <button
                className={`tab-item ${activeInputTab === "call" ? "active" : ""} ${callPrompt.trim() ? "filled" : ""}`}
                onClick={() => setActiveInputTab("call")}
              >
                <div className="tab-dot" />
                Call Prompt
              </button>
              <button
                className={`tab-item ${activeInputTab === "eval" ? "active" : ""} ${evalPrompt.trim() ? "filled" : ""}`}
                onClick={() => setActiveInputTab("eval")}
              >
                <div className="tab-dot" />
                Eval Prompt
              </button>
              <button
                className={`tab-item ${activeInputTab === "both" ? "active" : ""}`}
                onClick={() => setActiveInputTab("both")}
              >
                <div className="tab-dot" />
                Both
              </button>
            </div>

            {/* Call Prompt Tab */}
            {(activeInputTab === "call" || activeInputTab === "both") && (
              <div className={`tab-pane ${activeInputTab === "call" || activeInputTab === "both" ? "active" : ""}`}>
                <div className="prompt-label">
                  Call Prompt
                  <span className="lbadge">SYSTEM PROMPT</span>
                </div>
                <textarea
                  className="prompt-ta"
                  value={callPrompt}
                  onChange={e => setCallPrompt(e.target.value)}
                  placeholder="Paste your AI agent's system prompt here…&#10;&#10;This is the main instruction set that defines the agent's identity, rules, call flow, scripts, and behaviour."
                  spellCheck={false}
                />
                <div className="char-count">{callPrompt.length.toLocaleString()} characters</div>
              </div>
            )}

            {/* Eval Prompt Tab */}
            {(activeInputTab === "eval" || activeInputTab === "both") && (
              <div className={`tab-pane ${activeInputTab === "eval" || activeInputTab === "both" ? "active" : ""}`}>
                <div className="prompt-label">
                  Eval Prompt
                  <span className="lbadge">EVALUATION</span>
                </div>
                <textarea
                  className="prompt-ta"
                  value={evalPrompt}
                  onChange={e => setEvalPrompt(e.target.value)}
                  placeholder="Paste your evaluation prompt here…&#10;&#10;This defines how the agent's performance is measured, scored, and assessed."
                  spellCheck={false}
                />
                <div className="char-count">{evalPrompt.length.toLocaleString()} characters</div>
              </div>
            )}

            <div className="input-footer">
              <div className="prompt-status">
                <div className={`ps-chip ${callPrompt.trim() ? "has" : "empty"}`}>
                  {callPrompt.trim() ? "✓" : "○"} Call Prompt {callPrompt.trim() ? "ready" : "empty"}
                </div>
                <div className={`ps-chip ${evalPrompt.trim() ? "has" : "empty"}`}>
                  {evalPrompt.trim() ? "✓" : "○"} Eval Prompt {evalPrompt.trim() ? "ready" : "empty"}
                </div>
              </div>

              {loading ? (
                <div className="loading-wrap">
                  <div className="loading-ring" />
                  <div className="loading-msg">{loadMsg || "Generating…"}</div>
                  <div className="progress-track"><div className="progress-fill" style={{ width: `${loadPct}%` }} /></div>
                </div>
              ) : (
                <button
                  className="btn-primary"
                  disabled={(!callPrompt.trim() && !evalPrompt.trim()) || loading}
                  onClick={generate}
                >
                  <span>✦</span>
                  Generate Document
                </button>
              )}

              {error && <div className="err-box">⚠ {error}</div>}
            </div>
          </div>
        </div>
      )}

      {/* ── RESULT ── */}
      {step === "result" && docData && (
        <div className="result-page">
          {/* Top action bar */}
          <div className="res-topbar">
            <div className="res-title">{docData.title}</div>
            <div className="dl-group">
              <button className="dl-btn" onClick={downloadDocx}>📄 DOCX</button>
              <button className="btn-ghost" onClick={reset}>↩ New</button>
            </div>
          </div>

          {/* Cover */}
          <div className="doc-cover">
            <div className="doc-cover-inner">
              {docData.tags?.length > 0 && (
                <div className="doc-tags">
                  {docData.tags.map(t => <span key={t} className="doc-tag">{t}</span>)}
                </div>
              )}
              <div className="doc-title">{docData.title}</div>
              <div className="doc-subtitle">{docData.subtitle}</div>
              <div className="doc-meta">
                {docData.agentName && (
                  <div className="doc-meta-item">🤖 <strong>Agent:</strong> {docData.agentName}</div>
                )}
                {docData.company && (
                  <div className="doc-meta-item">🏢 <strong>Company:</strong> {docData.company}</div>
                )}
                {docData.primaryGoal && (
                  <div className="doc-meta-item">🎯 <strong>Goal:</strong> {docData.primaryGoal}</div>
                )}
                {docData.sections?.length > 0 && (
                  <div className="doc-meta-item">📋 <strong>{docData.sections.length} sections</strong></div>
                )}
              </div>
            </div>
          </div>

          {/* Highlights */}
          {docData.keyHighlights?.length > 0 && (
            <div className="highlights-bar">
              <div className="highlights-label">Key Highlights</div>
              <div className="highlights-grid">
                {docData.keyHighlights.map((h, i) => (
                  <div key={i} className="highlight-item">
                    <div className="highlight-dot" />
                    <span>{h}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mobile tabs */}
          <div className="mobile-tabs">
            <button className={`mobile-tab ${mobileTab === "doc" ? "active" : ""}`} onClick={() => setMobileTab("doc")}>📋 Document</button>
            <button className={`mobile-tab ${mobileTab === "flow" ? "active" : ""}`} onClick={() => setMobileTab("flow")}>🔀 Flow Diagram</button>
          </div>

          {/* Body */}
          <div className="result-body">
            {/* Sections panel */}
            <div className={`sections-panel ${mobileTab !== "doc" ? "" : ""}`} style={mobileTab !== "doc" ? { display: "none" } : {}}>
              {/* Section nav */}
              {docData.sections?.length > 1 && (
                <div className="section-nav">
                  {docData.sections.map((s, i) => (
                    <button key={s.id} className={`snav-btn ${activeSection === s.id ? "active" : ""}`} onClick={() => scrollToSection(s.id)}>
                      {s.icon} {s.heading}
                    </button>
                  ))}
                </div>
              )}

              {/* Sections */}
              {(docData.sections || []).map((sec, i) => (
                <div
                  key={sec.id}
                  className="doc-section"
                  ref={el => { if (el) sectionRefs.current[sec.id] = el; }}
                >
                  <div className="sec-header">
                    <div className="sec-icon">{sec.icon || "📄"}</div>
                    <div>
                      <div className="sec-num">SECTION {String(i + 1).padStart(2, "0")}</div>
                      <div className="sec-heading">{sec.heading}</div>
                    </div>
                  </div>
                  <div className="sec-content" dangerouslySetInnerHTML={{ __html: mdToHtml(sec.content || "") }} />
                </div>
              ))}
            </div>

            {/* Diagram panel (desktop sticky) */}
            <div className="diagram-panel">
              {Object.keys(flowNodes).length > 0 ? (
                <FlowDiagram nodes={flowNodes} edges={flowEdges} />
              ) : (
                <div className="no-diagram">
                  <div className="no-diagram-icon">🔀</div>
                  <div>No call flow diagram available</div>
                  <div style={{ fontSize: 10, marginTop: 4 }}>A flow diagram will appear here<br />when the prompt has a defined call flow</div>
                </div>
              )}
            </div>
          </div>

          {/* Mobile diagram */}
          {mobileTab === "flow" && (
            <div className="mobile-diagram active" style={{ height: "calc(100vh - 220px)" }}>
              {Object.keys(flowNodes).length > 0
                ? <FlowDiagram nodes={flowNodes} edges={flowEdges} />
                : (
                  <div className="no-diagram">
                    <div className="no-diagram-icon">🔀</div>
                    <div>No call flow diagram available</div>
                  </div>
                )
              }
            </div>
          )}
        </div>
      )}

      <footer className="footer">Scribbld</footer>
    </>
  );
}
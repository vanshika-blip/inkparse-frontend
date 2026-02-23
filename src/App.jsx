import { useState, useRef, useCallback, useEffect } from "react";

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
    .replace(/^### (.+)$/gm,'<h3>$1</h3>')
    .replace(/^## (.+)$/gm,'<h2>$1</h2>')
    .replace(/^# (.+)$/gm,'<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/`(.+?)`/g,'<code>$1</code>')
    .replace(/^---$/gm,'<hr/>')
    .replace(/^[-•] (.+)$/gm,'<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm,'<li class="ol">$1</li>')
    .replace(/(<li[^>]*>.*?<\/li>\n?)+/gs, s =>
      s.includes('class="ol"') ? `<ol>${s.replace(/ class="ol"/g,'')}</ol>` : `<ul>${s}</ul>`)
    .replace(/\n{2,}/g,'</p><p>')
    .replace(/^(?!<[hopu]|<\/[hopu])(.+)$/gm,'<p>$1</p>')
    .replace(/<p><\/p>/g,'');
}

function parseMermaidToGraph(code) {
  const lines = code.split("\n").map(l=>l.trim()).filter(Boolean);
  const nodes = {}, edges = [];
  const shapeOpen = { "((":"stadium","([":"stadium","[[":"subroutine","[":"rect","(":"round","{":"diamond",">":"flag" };
  for (const line of lines) {
    if (/^(flowchart|graph)/i.test(line)) continue;
    const arrowM = line.match(/([A-Za-z0-9_]+)\s*(?:(\(\(|\(\[|\[\[|\[|\(|\{|>)(.*?)(\)\)|\]\)|\]\]|\]|\)|\}|<))?\s*--+(?:\|([^|]*)\|)?\s*>\s*([A-Za-z0-9_]+)\s*(?:(\(\(|\(\[|\[\[|\[|\(|\{|>)(.*?)(\)\)|\]\)|\]\]|\]|\)|\}|<))?/);
    if (arrowM) {
      const [,sid,so,sl,,el,tid,to,tl] = arrowM;
      if (!nodes[sid]) nodes[sid] = { id:sid, label:(sl||sid).trim(), shape:shapeOpen[so]||"rect" };
      if (!nodes[tid]) nodes[tid] = { id:tid, label:(tl||tid).trim(), shape:shapeOpen[to]||"rect" };
      edges.push({ from:sid, to:tid, label:(el||"").trim() });
      continue;
    }
    const nodeM = line.match(/^([A-Za-z0-9_]+)\s*(\(\(|\(\[|\[\[|\[|\(|\{|>)(.*?)(\)\)|\]\)|\]\]|\]|\)|\}|<)\s*$/);
    if (nodeM) {
      const [,id,open,label] = nodeM;
      nodes[id] = { ...(nodes[id]||{}), id, label:label.trim()||id, shape:shapeOpen[open]||"rect" };
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
  if (nodeList[0]) { levels[nodeList[0].id]=0; visited.add(nodeList[0].id); }
  while (q.length) {
    const cur = q.shift();
    for (const nxt of (adj[cur]||[])) {
      if (!visited.has(nxt)) { visited.add(nxt); levels[nxt]=(levels[cur]||0)+1; q.push(nxt); }
    }
  }
  for (const n of nodeList) if (levels[n.id]===undefined) levels[n.id]=0;
  const byLv = {};
  for (const n of nodeList) { const lv=levels[n.id]; (byLv[lv]=byLv[lv]||[]).push(n); }
  for (const [lv, lvN] of Object.entries(byLv)) {
    lvN.forEach((n,i) => { n.x=i*220+80; n.y=Number(lv)*130+80; });
  }
}

async function makeDocxBlob(title, notes) {
  if (!window.docx) {
    await new Promise((res,rej)=>{
      const s=document.createElement("script");
      s.src="https://cdnjs.cloudflare.com/ajax/libs/docx/8.5.0/docx.umd.min.js";
      s.onload=res; s.onerror=()=>rej(new Error("docx load failed"));
      document.head.appendChild(s);
    });
  }
  const {Document,Packer,Paragraph,TextRun,HeadingLevel,AlignmentType,LevelFormat,BorderStyle}=window.docx;
  const ch=[];
  ch.push(new Paragraph({heading:HeadingLevel.HEADING_1,children:[new TextRun({text:title,bold:true,size:36,font:"Palatino Linotype"})]}));
  ch.push(new Paragraph({children:[new TextRun("")]}));
  for (const line of notes.split("\n")) {
    if (/^# (.+)$/.test(line)) ch.push(new Paragraph({heading:HeadingLevel.HEADING_1,children:[new TextRun({text:line.replace(/^# /,""),bold:true,font:"Palatino Linotype",size:32})]}));
    else if (/^## (.+)$/.test(line)) ch.push(new Paragraph({heading:HeadingLevel.HEADING_2,children:[new TextRun({text:line.replace(/^## /,""),bold:true,size:28})]}));
    else if (/^### (.+)$/.test(line)) ch.push(new Paragraph({heading:HeadingLevel.HEADING_3,children:[new TextRun({text:line.replace(/^### /,""),bold:true,size:24})]}));
    else if (/^[-•] (.+)$/.test(line)) ch.push(new Paragraph({bullet:{level:0},children:[new TextRun({text:line.replace(/^[-•] /,"")})]}));
    else if (/^\d+\. (.+)$/.test(line)) ch.push(new Paragraph({numbering:{reference:"nums",level:0},children:[new TextRun({text:line.replace(/^\d+\. /,"")})]}));
    else if (/^---$/.test(line)) ch.push(new Paragraph({border:{bottom:{style:BorderStyle.SINGLE,size:4,color:"8b7355",space:1}},children:[new TextRun("")]}));
    else if (line.trim()) ch.push(new Paragraph({children:[new TextRun({text:line})],spacing:{after:120}}));
    else ch.push(new Paragraph({children:[new TextRun("")]}));
  }
  const doc=new Document({
    numbering:{config:[{reference:"nums",levels:[{level:0,format:LevelFormat.DECIMAL,text:"%1.",alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:720,hanging:360}}}}]}]},
    styles:{default:{document:{run:{font:"Georgia",size:24}}}},
    sections:[{properties:{page:{size:{width:12240,height:15840},margin:{top:1440,right:1440,bottom:1440,left:1440}}},children:ch}]
  });
  return Packer.toBlob(doc);
}

// ── NODE PALETTE ──────────────────────────────────────────────────────────────
const PALETTE = [
  { fill:"#1e120a", stroke:"#7a5230", text:"#f0ead8", glow:"rgba(122,82,48,0.4)" },
  { fill:"#0f1e12", stroke:"#3d6b3a", text:"#e8f0e5", glow:"rgba(61,107,58,0.4)" },
  { fill:"#0f1220", stroke:"#3a4d7a", text:"#e5eaf5", glow:"rgba(58,77,122,0.4)" },
  { fill:"#1e1408", stroke:"#8c5c22", text:"#f5ead8", glow:"rgba(140,92,34,0.4)" },
  { fill:"#1e0f1e", stroke:"#6b3a6b", text:"#f5e5f5", glow:"rgba(107,58,107,0.4)" },
  { fill:"#081420", stroke:"#206080", text:"#d8eef5", glow:"rgba(32,96,128,0.4)" },
];

const NW = 160, NH = 52;

function getNodeColor(id, nodes) {
  return PALETTE[Object.keys(nodes).indexOf(id) % PALETTE.length];
}

function NodeShape({ n, col, selected, onMouseDown, onDoubleClick }) {
  const { x, y } = n;
  const w = NW, h = NH;
  const filter = selected
    ? `drop-shadow(0 0 12px ${col.glow}) drop-shadow(0 2px 10px rgba(0,0,0,0.4))`
    : `drop-shadow(0 2px 8px rgba(0,0,0,0.2))`;
  const commonProps = {
    fill: col.fill,
    stroke: selected ? col.text : col.stroke,
    strokeWidth: selected ? 2 : 1.5,
    filter,
    style: { transition: "filter 0.2s, stroke 0.15s" }
  };
  return (
    <g onMouseDown={onMouseDown} onDoubleClick={onDoubleClick} style={{ cursor:"move" }}>
      {n.shape==="diamond" ? (
        <polygon points={`${x+w/2},${y-4} ${x+w+4},${y+h/2} ${x+w/2},${y+h+4} ${x-4},${y+h/2}`} {...commonProps} />
      ) : n.shape==="round"||n.shape==="stadium" ? (
        <rect x={x} y={y} width={w} height={h} rx={h/2} {...commonProps} />
      ) : (
        <>
          <rect x={x} y={y} width={w} height={h} rx={6} {...commonProps} />
          <rect x={x} y={y} width={3} height={h} rx={2} fill={col.stroke} style={{pointerEvents:"none"}} />
        </>
      )}
      <text x={x+w/2} y={y+h/2+1} textAnchor="middle" dominantBaseline="middle"
        fill={col.text} fontSize={11} fontFamily="'Cormorant Garamond',serif" fontWeight="500"
        letterSpacing="0.3"
        style={{ pointerEvents:"none", userSelect:"none" }}>
        {n.label.length>21 ? n.label.slice(0,19)+"…" : n.label}
      </text>
      {selected && (
        <circle cx={x+w} cy={y+h/2} r={7} fill={col.stroke} stroke="#f0ead8" strokeWidth={1.5}
          style={{ cursor:"crosshair" }}
          onMouseDown={e=>{e.stopPropagation();onMouseDown(e,"connect");}} />
      )}
    </g>
  );
}

// ── FLOW EDITOR ───────────────────────────────────────────────────────────────
function FlowEditor({ nodes, edges, onChange }) {
  const svgRef = useRef();
  const [selNode, setSelNode] = useState(null);
  const [selEdge, setSelEdge] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [connecting, setConnecting] = useState(null);
  const [mousePos, setMousePos] = useState({x:0,y:0});
  const [pan, setPan] = useState({x:40,y:20});
  const [panningSt, setPanningSt] = useState(null);
  const [zoom, setZoom] = useState(0.85);
  const [editPopup, setEditPopup] = useState(null);
  const nodesR = useRef(nodes); nodesR.current = nodes;
  const edgesR = useRef(edges); edgesR.current = edges;

  // Auto-fit on initial load
  useEffect(() => {
    const nodeList = Object.values(nodes);
    if (!nodeList.length || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const maxX = Math.max(...nodeList.map(n => n.x + NW)) + 60;
    const maxY = Math.max(...nodeList.map(n => n.y + NH)) + 60;
    const fitZoom = Math.min(rect.width / maxX, rect.height / maxY, 1);
    setZoom(Math.max(0.35, fitZoom * 0.9));
    setPan({ x: 40, y: 30 });
  }, []);

  const svgCoords = e => {
    const r = svgRef.current.getBoundingClientRect();
    return { x:(e.clientX-r.left-pan.x)/zoom, y:(e.clientY-r.top-pan.y)/zoom };
  };

  const onNodeMD = (e, id, mode) => {
    e.stopPropagation();
    if (mode==="connect") { setConnecting(id); return; }
    if (connecting) {
      if (connecting!==id) onChange(nodesR.current, [...edgesR.current,{from:connecting,to:id,label:""}]);
      setConnecting(null); return;
    }
    setSelNode(id); setSelEdge(null);
    const pt=svgCoords(e), n=nodesR.current[id];
    setDragging({id,ox:pt.x-n.x,oy:pt.y-n.y});
  };

  const onSvgMD = e => {
    if (connecting) { setConnecting(null); return; }
    setSelNode(null); setSelEdge(null);
    setPanningSt({sx:e.clientX,sy:e.clientY,px:pan.x,py:pan.y});
  };

  const onMM = e => {
    const pt=svgCoords(e); setMousePos(pt);
    if (dragging) {
      const up={...nodesR.current};
      up[dragging.id]={...up[dragging.id],x:pt.x-dragging.ox,y:pt.y-dragging.oy};
      onChange(up,edgesR.current);
    }
    if (panningSt) setPan({x:panningSt.px+(e.clientX-panningSt.sx),y:panningSt.py+(e.clientY-panningSt.sy)});
  };

  const onMU = () => { setDragging(null); setPanningSt(null); };
  const onWheel = e => { e.preventDefault(); setZoom(z=>Math.max(0.2,Math.min(2,z-e.deltaY*0.001))); };

  const onTouchStart = e => {
    if (e.touches.length===1) {
      const t=e.touches[0];
      setPanningSt({sx:t.clientX,sy:t.clientY,px:pan.x,py:pan.y});
    }
  };
  const onTouchMove = e => {
    if (e.touches.length===1&&panningSt) {
      const t=e.touches[0];
      setPan({x:panningSt.px+(t.clientX-panningSt.sx),y:panningSt.py+(t.clientY-panningSt.sy)});
    }
  };
  const onTouchEnd = () => { setPanningSt(null); };

  const fitView = () => {
    const nodeList = Object.values(nodesR.current);
    if (!nodeList.length || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const minX = Math.min(...nodeList.map(n => n.x)) - 40;
    const minY = Math.min(...nodeList.map(n => n.y)) - 40;
    const maxX = Math.max(...nodeList.map(n => n.x + NW)) + 40;
    const maxY = Math.max(...nodeList.map(n => n.y + NH)) + 40;
    const w = maxX - minX, h = maxY - minY;
    const fitZoom = Math.min(rect.width / w, rect.height / h, 1);
    const z = Math.max(0.25, fitZoom * 0.92);
    setZoom(z);
    setPan({ x: -minX * z + 20, y: -minY * z + 20 });
  };

  const addNode = () => {
    const id="N"+Date.now();
    onChange({...nodesR.current,[id]:{id,label:"New Step",shape:"rect",x:200+Math.random()*100,y:200+Math.random()*100}},edgesR.current);
    setSelNode(id);
  };

  const deleteNode = id => {
    const u={...nodesR.current}; delete u[id];
    onChange(u, edgesR.current.filter(e=>e.from!==id&&e.to!==id));
    setSelNode(null);
  };

  const deleteEdge = i => { onChange(nodesR.current,edgesR.current.filter((_,j)=>j!==i)); setSelEdge(null); };

  const saveEdit = () => {
    if (!editPopup) return;
    if (editPopup.type==="node") onChange({...nodesR.current,[editPopup.id]:{...nodesR.current[editPopup.id],label:editPopup.label}},edgesR.current);
    else onChange(nodesR.current, edgesR.current.map((e,i)=>i===editPopup.id?{...e,label:editPopup.label}:e));
    setEditPopup(null);
  };

  const nodeCenter = n => ({x:n.x+NW/2,y:n.y+NH/2});

  const Arrow = ({e,i}) => {
    const from=nodes[e.from],to=nodes[e.to];
    if(!from||!to) return null;
    const f=nodeCenter(from),t=nodeCenter(to);
    const dx=t.x-f.x,dy=t.y-f.y,len=Math.sqrt(dx*dx+dy*dy)||1;
    const ux=dx/len,uy=dy/len;
    const sx=f.x+ux*NW*0.55,sy=f.y+uy*NH*0.55;
    const ex=t.x-ux*NW*0.55,ey=t.y-uy*NH*0.55;
    const mx=(sx+ex)/2-uy*30,my=(sy+ey)/2+ux*30;
    const isSel=selEdge===i;
    const stroke=isSel?"#7a5230":"#b5a88a";
    const midX=(sx+2*mx+ex)/4,midY=(sy+2*my+ey)/4;
    return (
      <g onClick={ev=>{ev.stopPropagation();setSelEdge(i);setSelNode(null);}}>
        <path d={`M${sx},${sy} Q${mx},${my} ${ex},${ey}`} stroke={stroke}
          strokeWidth={isSel?2:1.5} fill="none" markerEnd={isSel?"url(#arrow-sel)":"url(#arrow)"}
          strokeDasharray={isSel?"6 3":"none"} style={{cursor:"pointer"}} />
        <path d={`M${sx},${sy} Q${mx},${my} ${ex},${ey}`} stroke="transparent" strokeWidth={14} fill="none" style={{cursor:"pointer"}} />
        {e.label && (
          <g onDoubleClick={ev=>{ev.stopPropagation();setEditPopup({type:"edge",id:i,label:e.label});}}>
            <rect x={midX-e.label.length*3.2-6} y={midY-9} width={e.label.length*6.4+12} height={18} rx={9}
              fill="#f0ead8" stroke={stroke} strokeWidth={1} />
            <text x={midX} y={midY+1} textAnchor="middle" dominantBaseline="middle"
              fill="#3d2810" fontSize={10} fontFamily="'Cormorant Garamond',serif">{e.label}</text>
          </g>
        )}
        {isSel && (
          <g style={{cursor:"pointer"}} onClick={ev=>{ev.stopPropagation();deleteEdge(i);}}>
            <circle cx={midX} cy={midY} r={10} fill="#7a2810" stroke="#c4806a" strokeWidth={1.5} />
            <text x={midX} y={midY+1} textAnchor="middle" dominantBaseline="middle" fill="#f5e0d8" fontSize={12} style={{pointerEvents:"none"}}>✕</text>
          </g>
        )}
      </g>
    );
  };

  const ConnLine = () => {
    if (!connecting||!nodes[connecting]) return null;
    const f=nodeCenter(nodes[connecting]);
    return <line x1={f.x} y1={f.y} x2={mousePos.x} y2={mousePos.y}
      stroke="#7a5230" strokeWidth={1.5} strokeDasharray="5 3" style={{pointerEvents:"none"}} />;
  };

  return (
    <div style={{display:"flex",flexDirection:"column",flex:1,minHeight:0}}>
      <div className="fe-toolbar">
        <button className="fe-btn" onClick={addNode}>＋ Node</button>
        {selNode && <>
          <button className="fe-btn fe-btn-connect" onClick={()=>setConnecting(connecting?null:selNode)}>
            {connecting===selNode?"✕ Cancel":"→ Connect"}
          </button>
          <select className="fe-sel" value={nodes[selNode]?.shape||"rect"} onChange={e=>{
            onChange({...nodesR.current,[selNode]:{...nodesR.current[selNode],shape:e.target.value}},edgesR.current);
          }}>
            <option value="rect">▭ Rectangle</option>
            <option value="round">◉ Pill</option>
            <option value="diamond">◇ Diamond</option>
          </select>
          <button className="fe-btn fe-btn-edit" onClick={()=>setEditPopup({type:"node",id:selNode,label:nodes[selNode]?.label||""})}>
            ✎ Rename
          </button>
          <button className="fe-btn fe-btn-del" onClick={()=>deleteNode(selNode)}>✕ Delete</button>
        </>}
        {selEdge!==null&&!selNode && (
          <button className="fe-btn fe-btn-edit" onClick={()=>setEditPopup({type:"edge",id:selEdge,label:edges[selEdge]?.label||""})}>
            ✎ Label Edge
          </button>
        )}
        {connecting && <span className="fe-hint">Click a target node to connect</span>}
        <div style={{flex:1}}/>
        <button className="fe-btn" onClick={fitView} title="Fit diagram to view">⊡ Fit</button>
        <button className="fe-btn fe-zoom-btn" onClick={()=>setZoom(z=>Math.min(2,z+0.15))}>＋</button>
        <span className="fe-zoom">{Math.round(zoom*100)}%</span>
        <button className="fe-btn fe-zoom-btn" onClick={()=>setZoom(z=>Math.max(0.2,z-0.15))}>－</button>
      </div>

      <svg ref={svgRef} style={{flex:1,minHeight:360,display:"block",cursor:panningSt?"grabbing":connecting?"crosshair":"grab",background:"transparent",touchAction:"none"}}
        onMouseDown={onSvgMD} onMouseMove={onMM} onMouseUp={onMU} onWheel={onWheel}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        <defs>
          <marker id="arrow" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0,10 3.5,0 7" fill="#b5a88a" />
          </marker>
          <marker id="arrow-sel" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0,10 3.5,0 7" fill="#7a5230" />
          </marker>
          <pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1" fill="rgba(160,130,90,0.14)" />
          </pattern>
        </defs>
        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          <rect x="-4000" y="-4000" width="10000" height="10000" fill="url(#dots)" />
          {edges.map((e,i)=><Arrow key={i} e={e} i={i}/>)}
          <ConnLine />
          {Object.values(nodes).map(n=>(
            <NodeShape key={n.id} n={n} col={getNodeColor(n.id,nodes)}
              selected={selNode===n.id}
              onMouseDown={(e,mode)=>onNodeMD(e,n.id,mode)}
              onDoubleClick={e=>{e.stopPropagation();setEditPopup({type:"node",id:n.id,label:n.label});}}
            />
          ))}
        </g>
      </svg>

      <div className="fe-hint-bar">Double-click to rename · Drag to reposition · Select node → Connect · Scroll to zoom</div>

      {editPopup && (
        <div className="ep-overlay" onClick={()=>setEditPopup(null)}>
          <div className="ep" onClick={e=>e.stopPropagation()}>
            <div className="ep-title">{editPopup.type==="node"?"Rename Node":"Set Edge Label"}</div>
            <input className="ep-input" autoFocus value={editPopup.label}
              onChange={e=>setEditPopup({...editPopup,label:e.target.value})}
              onKeyDown={e=>{if(e.key==="Enter")saveEdit();if(e.key==="Escape")setEditPopup(null);}}
              placeholder="Enter label…" />
            <div className="ep-row">
              <button className="ep-ok" onClick={saveEdit}>Confirm</button>
              <button className="ep-cancel" onClick={()=>setEditPopup(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── IMAGE QUEUE THUMBNAIL ─────────────────────────────────────────────────────
function ImageThumb({ img, index, current, total, onRemove, onClick }) {
  const isCurrent = index === current;
  return (
    <div
      onClick={onClick}
      style={{
        position:"relative", flexShrink:0,
        width:72, height:72,
        borderRadius:8,
        border:`2px solid ${isCurrent ? "var(--acc)" : "var(--bd-l)"}`,
        overflow:"hidden", cursor:"pointer",
        boxShadow: isCurrent ? "0 0 0 3px var(--acc-l)" : "none",
        transition:"all .2s",
        background:"var(--parch-1)"
      }}>
      <img src={img.preview} alt={`Image ${index+1}`}
        style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}} />
      {isCurrent && (
        <div style={{
          position:"absolute",inset:0,
          background:"rgba(107,60,24,0.12)",
          border:"2px solid var(--acc)",
          borderRadius:6,pointerEvents:"none"
        }}/>
      )}
      <button
        onClick={e=>{e.stopPropagation();onRemove(index);}}
        style={{
          position:"absolute",top:3,right:3,
          width:18,height:18,borderRadius:"50%",
          background:"rgba(26,14,6,0.75)",border:"none",
          color:"#f0ead8",fontSize:10,cursor:"pointer",
          display:"flex",alignItems:"center",justifyContent:"center",
          lineHeight:1,fontFamily:"monospace",padding:0
        }}>✕</button>
      <div style={{
        position:"absolute",bottom:0,left:0,right:0,
        background:"rgba(26,14,6,0.5)",
        color:"#f0ead8",
        fontFamily:"'DM Mono',monospace",fontSize:8,
        textAlign:"center",padding:"2px 0",letterSpacing:"0.5px"
      }}>{index+1}/{total}</div>
    </div>
  );
}

// ── LOADING DOTS ──────────────────────────────────────────────────────────────
function LoadingDots() {
  return (
    <span className="ld">
      <span className="ld-d"/>
      <span className="ld-d"/>
      <span className="ld-d"/>
    </span>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App() {
  // Multi-image queue: [{file, preview, b64, mime}]
  const [imageQueue, setImageQueue] = useState([]);
  const [currentIdx, setCurrentIdx]   = useState(0);
  const [step, setStep]           = useState("upload");
  const [loading, setLoading]     = useState(false);
  const [loadMsg, setLoadMsg]     = useState("");
  const [loadPct, setLoadPct]     = useState(0);
  const [error, setError]         = useState("");
  const [dragOver, setDragOver]   = useState(false);
  const [title, setTitle]         = useState("");
  const [notes, setNotes]         = useState("");
  const [notesMode, setNotesMode] = useState("preview");
  const [activeTab, setActiveTab] = useState("notes");
  const [flowNodes, setFlowNodes] = useState({});
  const [flowEdges, setFlowEdges] = useState([]);
  const [dlError, setDlError]     = useState("");
  const [dlBusy, setDlBusy]       = useState("");
  const [revealed, setRevealed]   = useState(false);
  // Result tab: which image's result we're viewing
  const [resultIdx, setResultIdx] = useState(0);
  const [results, setResults]     = useState([]); // [{title, notes, flowNodes, flowEdges}]

  const fileRef      = useRef();
  const cameraRef    = useRef();
  const notesCardRef = useRef();
  const flowCardRef  = useRef();

  const BACKEND_URL = "https://inkparse-backend.onrender.com";

  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 80);
    return () => clearTimeout(t);
  }, []);

  const readFile = (file) => new Promise((res) => {
    const r = new FileReader();
    r.onload = e => res({ b64: e.target.result.split(",")[1], preview: e.target.result, mime: file.type || "image/jpeg" });
    r.readAsDataURL(file);
  });

  const handleFiles = useCallback(async (files) => {
    const valid = Array.from(files).filter(f => f.type.startsWith("image/"));
    if (!valid.length) return;
    const loaded = await Promise.all(valid.map(readFile));
    setImageQueue(prev => {
      const next = [...prev, ...loaded];
      setCurrentIdx(prev.length); // jump to first newly added
      return next;
    });
  }, []);

  const handleDrop = useCallback(e => {
    e.preventDefault(); setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const removeImage = (idx) => {
    setImageQueue(prev => {
      const next = prev.filter((_,i) => i !== idx);
      setCurrentIdx(c => Math.min(c, Math.max(0, next.length - 1)));
      return next;
    });
  };

  const analyze = async () => {
    if (!imageQueue.length) return;
    setLoading(true); setError(""); setDlError(""); setLoadPct(0);
    setResults([]);
    const allResults = [];

    for (let i = 0; i < imageQueue.length; i++) {
      const img = imageQueue[i];
      const msgs = [
        [0, `Image ${i+1}/${imageQueue.length}: Transmitting…`],
        [20, `Image ${i+1}/${imageQueue.length}: Reading handwriting…`],
        [55, `Image ${i+1}/${imageQueue.length}: Structuring content…`],
        [78, `Image ${i+1}/${imageQueue.length}: Generating diagram…`],
        [92, `Image ${i+1}/${imageQueue.length}: Finalising…`],
      ];
      let mi = 0;
      const base = (i / imageQueue.length) * 100;
      const tick = setInterval(() => {
        if (mi < msgs.length) {
          setLoadMsg(msgs[mi][1]);
          setLoadPct(base + (msgs[mi][0] / imageQueue.length));
          mi++;
        }
      }, 900);

      try {
        const res = await fetch(`${BACKEND_URL}/api/analyze`, {
          method:"POST", headers:{"Content-Type":"application/json"},
          body:JSON.stringify({imageBase64:img.b64,imageMime:img.mime})
        });
        clearInterval(tick);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error||`Error ${res.status}`);
        const t = data.title || `Notes ${i+1}`;
        const n = data.notes || "";
        const code = (data.mermaidCode || "flowchart TD\n  A([Start]) --> B[Content]").replace(/```[\w]*\n?/g,"").trim();
        const {nodes: fn, edges: fe} = parseMermaidToGraph(code);
        allResults.push({ title: t, notes: n, flowNodes: fn, flowEdges: fe, imagePreview: img.preview });
      } catch(e) {
        clearInterval(tick);
        allResults.push({ title: `Image ${i+1}`, notes: "", flowNodes: {}, flowEdges: [], error: e.message, imagePreview: img.preview });
      }
    }

    setResults(allResults);
    setResultIdx(0);
    const first = allResults[0];
    if (first) { setTitle(first.title); setNotes(first.notes); setFlowNodes(first.flowNodes); setFlowEdges(first.flowEdges); }
    setLoadPct(100);
    setActiveTab("notes");
    setTimeout(() => setStep("result"), 300);
    setLoading(false);
  };

  const switchResult = (idx) => {
    const r = results[idx];
    if (!r) return;
    setResultIdx(idx);
    setTitle(r.title); setNotes(r.notes); setFlowNodes(r.flowNodes); setFlowEdges(r.flowEdges);
    setActiveTab("notes");
  };

  const loadH2C = () => new Promise((res,rej)=>{
    if(window.html2canvas)return res();
    const s=document.createElement("script");
    s.src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
    s.onload=res;s.onerror=()=>rej(new Error("html2canvas failed"));
    document.head.appendChild(s);
  });

  const triggerDownload = (url,filename) => {
    const a=document.createElement("a"); a.href=url; a.download=filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const dlNotesJpg = async () => {
    setDlBusy("notes-jpg"); setDlError("");
    try {
      await loadH2C();
      const canvas=await window.html2canvas(notesCardRef.current,{scale:2,backgroundColor:"#f0ead8",useCORS:true,logging:false});
      triggerDownload(canvas.toDataURL("image/jpeg",0.95),`${title||"notes"}.jpg`);
    } catch(e){setDlError("JPG export failed: "+e.message);}
    finally{setDlBusy("");}
  };

  const dlNotesDocx = async () => {
    setDlBusy("notes-docx"); setDlError("");
    try {
      const blob=await makeDocxBlob(title,notes);
      const url=URL.createObjectURL(blob);
      triggerDownload(url,`${title||"notes"}.docx`);
      setTimeout(()=>URL.revokeObjectURL(url),2000);
    } catch(e){setDlError("DOCX export failed: "+e.message);}
    finally{setDlBusy("");}
  };

  const dlDiagramJpg = async () => {
    setDlBusy("diag-jpg"); setDlError("");
    try {
      await loadH2C();
      const svgEl=flowCardRef.current?.querySelector("svg");
      if(!svgEl)throw new Error("Diagram not found");
      const canvas=await window.html2canvas(svgEl,{scale:2,backgroundColor:"#f5f0e5",useCORS:true,logging:false});
      triggerDownload(canvas.toDataURL("image/jpeg",0.95),`${title||"diagram"}.jpg`);
    } catch(e){setDlError("JPG export failed: "+e.message);}
    finally{setDlBusy("");}
  };

  const dlDiagramSvg = () => {
    setDlError("");
    try {
      const svgEl=flowCardRef.current?.querySelector("svg");
      if(!svgEl)throw new Error("Diagram not found");
      const clone=svgEl.cloneNode(true);
      clone.setAttribute("xmlns","http://www.w3.org/2000/svg");
      clone.setAttribute("style","background:#f5f0e5");
      const blob=new Blob([clone.outerHTML],{type:"image/svg+xml"});
      const url=URL.createObjectURL(blob);
      triggerDownload(url,`${title||"diagram"}.svg`);
      setTimeout(()=>URL.revokeObjectURL(url),2000);
    } catch(e){setDlError("SVG export failed: "+e.message);}
  };

  const reset = () => {
    setImageQueue([]); setCurrentIdx(0);
    setStep("upload"); setResults([]); setResultIdx(0);
    setNotes(""); setFlowNodes({}); setFlowEdges([]);
    setError(""); setDlError(""); setTitle(""); setLoadPct(0);
  };

  const currentYear = new Date().getFullYear();

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=DM+Mono:wght@300;400;500&display=swap');

        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html{scroll-behavior:smooth;font-size:16px}

        :root{
          --parch-0:#faf5ec;
          --parch-1:#f5edd8;
          --parch-2:#ede0c4;
          --parch-3:#d8c9a8;
          --ink-0:#1a0e06;
          --ink-1:#2e1a0a;
          --ink-2:#5a3a18;
          --ink-3:#8a6840;
          --ink-4:#b09060;
          --acc:#6b3c18;
          --acc-h:#7a4a24;
          --acc-l:rgba(107,60,24,0.12);
          --bd:#d0bfa0;
          --bd-l:#e8ddc8;
          --red:#7a2010;
          --blue:#1e3a6a;
          --green:#1a4428;
          --r:10px;
          --r-lg:16px;
          --shadow:0 4px 28px rgba(26,14,6,0.08),0 1px 4px rgba(26,14,6,0.04);
          --shadow-lg:0 12px 48px rgba(26,14,6,0.12),0 2px 8px rgba(26,14,6,0.06);
          --nav-h:60px;
        }

        body{
          background:var(--parch-0);
          color:var(--ink-1);
          font-family:'EB Garamond',serif;
          -webkit-font-smoothing:antialiased;
          min-height:100vh;
        }

        body::before{
          content:'';position:fixed;inset:0;z-index:0;pointer-events:none;
          background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
        }

        .app{min-height:100vh;position:relative;z-index:1;display:flex;flex-direction:column}

        /* ── TOPNAV ── */
        .topnav{
          position:fixed;top:0;left:0;right:0;z-index:100;
          height:var(--nav-h);
          background:rgba(250,245,236,0.95);
          backdrop-filter:blur(12px);
          -webkit-backdrop-filter:blur(12px);
          border-bottom:1px solid var(--bd-l);
          display:flex;align-items:center;justify-content:space-between;
          padding:0 48px;
        }
        .topnav-brand{display:flex;align-items:center;gap:14px}
        .topnav-emblem{
          width:38px;height:38px;border-radius:50%;
          border:1.5px solid var(--bd);
          display:flex;align-items:center;justify-content:center;
          background:var(--parch-1);font-size:16px;
          box-shadow:0 2px 8px rgba(26,14,6,0.1);flex-shrink:0;
        }
        .brand-name{font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:700;color:var(--ink-0);letter-spacing:-0.3px;line-height:1.1;}
        .brand-name em{font-style:italic;color:var(--acc)}
        .brand-sub{font-family:'DM Mono',monospace;font-size:8px;letter-spacing:3px;text-transform:uppercase;color:var(--ink-4);margin-top:2px;}
        .topnav-right{display:flex;align-items:center;gap:16px;}
        .topnav-meta{font-family:'DM Mono',monospace;font-size:8px;letter-spacing:2.5px;text-transform:uppercase;color:var(--ink-4);}

        .page-body{margin-top:var(--nav-h);flex:1;display:flex;flex-direction:column;}

        .reveal{opacity:0;transform:translateY(12px);transition:opacity .5s ease,transform .5s ease}
        .reveal.in{opacity:1;transform:none}

        /* ── UPLOAD LAYOUT ── */
        .upload-wrap{
          max-width:1200px;margin:0 auto;width:100%;
          padding:64px 48px 100px;
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:80px;align-items:start;
          min-height:calc(100vh - var(--nav-h));
        }
        .upload-left{display:flex;flex-direction:column;position:sticky;top:calc(var(--nav-h)+32px);}

        .eyebrow{
          font-family:'DM Mono',monospace;font-size:9px;letter-spacing:4px;
          text-transform:uppercase;color:var(--ink-3);
          display:flex;align-items:center;gap:12px;margin-bottom:16px;
        }
        .eyebrow::before{content:'';width:24px;height:1px;background:var(--bd)}

        h1{
          font-family:'Cormorant Garamond',serif;
          font-size:clamp(38px,5vw,64px);
          font-weight:700;line-height:1.03;color:var(--ink-0);letter-spacing:-1px;
          margin-bottom:24px;
        }
        h1 em{font-style:italic;color:var(--acc);font-weight:600}

        .hero-desc{font-family:'EB Garamond',serif;font-size:16px;line-height:1.9;color:var(--ink-2);margin-bottom:36px;max-width:420px;}

        .hero-features{display:flex;flex-direction:column;gap:0}
        .feat{
          font-family:'DM Mono',monospace;font-size:9px;
          letter-spacing:2.5px;text-transform:uppercase;color:var(--ink-3);
          display:flex;align-items:center;gap:12px;
          padding:10px 0;border-bottom:1px solid var(--bd-l);
        }
        .feat:first-child{border-top:1px solid var(--bd-l)}
        .feat-dot{width:6px;height:6px;border-radius:50%;background:var(--acc);flex-shrink:0}

        .hero-features-grid{display:none;grid-template-columns:1fr 1fr;gap:8px 16px;margin-bottom:24px;}
        .feat-grid-item{font-family:'DM Mono',monospace;font-size:8px;letter-spacing:2px;text-transform:uppercase;color:var(--ink-3);display:flex;align-items:center;gap:8px;padding:6px 0;}

        /* ── DROP ZONE ── */
        .drop{
          border:1.5px dashed var(--bd);background:var(--parch-1);
          border-radius:var(--r-lg);padding:48px 40px;
          text-align:center;cursor:pointer;transition:all .3s;
          min-height:220px;display:flex;flex-direction:column;align-items:center;justify-content:center;
        }
        .drop:hover,.drop.over{
          border-color:var(--acc);background:#f8f0e0;
          transform:translateY(-2px);box-shadow:var(--shadow-lg);
        }
        .drop-icon{font-size:44px;margin-bottom:16px;filter:drop-shadow(0 2px 4px rgba(26,14,6,0.15));}
        .drop-title{font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:600;font-style:italic;color:var(--ink-1);margin-bottom:6px;}
        .drop-sub{font-family:'EB Garamond',serif;font-size:14px;font-style:italic;color:var(--ink-3);}
        .drop-hint{margin-top:16px;font-family:'DM Mono',monospace;font-size:8px;letter-spacing:2px;text-transform:uppercase;color:var(--bd);}

        /* ── CAMERA BUTTON (small, secondary) ── */
        .camera-row{display:flex;align-items:center;gap:10px;margin-top:12px;}
        .camera-btn{
          flex:1;display:flex;align-items:center;justify-content:center;gap:8px;
          padding:12px 16px;border:1.5px solid var(--bd-l);border-radius:var(--r);
          background:var(--parch-0);cursor:pointer;transition:all .2s;
          font-family:'DM Mono',monospace;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--ink-2);
        }
        .camera-btn:hover{border-color:var(--acc);color:var(--acc);background:var(--parch-1);}

        /* ── IMAGE QUEUE ── */
        .img-queue-header{
          display:flex;align-items:center;justify-content:space-between;
          margin-bottom:10px;
        }
        .img-queue-label{font-family:'DM Mono',monospace;font-size:8px;letter-spacing:2px;text-transform:uppercase;color:var(--ink-3);}
        .img-queue-count{font-family:'DM Mono',monospace;font-size:8px;color:var(--ink-4);background:var(--parch-2);padding:3px 8px;border-radius:100px;}
        .img-queue-strip{display:flex;gap:8px;flex-wrap:wrap;padding:12px;background:var(--parch-1);border:1px solid var(--bd-l);border-radius:var(--r);margin-bottom:12px;}
        .img-queue-add{
          width:72px;height:72px;border-radius:8px;border:1.5px dashed var(--bd);
          display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;
          cursor:pointer;transition:all .2s;background:transparent;color:var(--ink-4);
          font-family:'DM Mono',monospace;font-size:8px;letter-spacing:1px;
        }
        .img-queue-add:hover{border-color:var(--acc);color:var(--acc);}
        .img-queue-add-icon{font-size:20px;line-height:1;}

        /* Main preview */
        .img-main-prev{
          border-radius:var(--r-lg);overflow:hidden;border:1px solid var(--bd-l);
          margin-bottom:14px;position:relative;box-shadow:var(--shadow);
          background:var(--parch-1);
        }
        .img-main-prev img{width:100%;max-height:240px;object-fit:contain;display:block;}
        .img-badge{
          position:absolute;top:12px;left:12px;
          background:var(--ink-0);color:var(--parch-0);
          font-family:'DM Mono',monospace;font-size:8px;letter-spacing:2px;
          padding:4px 12px;border-radius:100px;text-transform:uppercase;
        }
        .img-nav{
          position:absolute;top:50%;transform:translateY(-50%);
          display:flex;justify-content:space-between;width:100%;padding:0 8px;pointer-events:none;
        }
        .img-nav-btn{
          pointer-events:all;
          width:30px;height:30px;border-radius:50%;
          background:rgba(26,14,6,0.55);border:none;
          color:#f0ead8;font-size:14px;cursor:pointer;
          display:flex;align-items:center;justify-content:center;
          transition:background .15s;
        }
        .img-nav-btn:hover{background:rgba(26,14,6,0.8);}

        /* ── BUTTONS ── */
        .btn{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;font-weight:500;border:none;cursor:pointer;border-radius:var(--r);display:inline-flex;align-items:center;gap:8px;transition:all .2s;padding:11px 20px;white-space:nowrap;}
        .btn:disabled{opacity:.38;cursor:not-allowed}
        .btn-primary{background:var(--ink-0);color:var(--parch-0);width:100%;justify-content:center;padding:17px;font-size:11px;letter-spacing:3px;box-shadow:0 4px 20px rgba(26,14,6,0.22);position:relative;overflow:hidden;}
        .btn-primary::after{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,0.05),transparent);pointer-events:none;}
        .btn-primary:hover:not(:disabled){background:var(--ink-1);transform:translateY(-2px);box-shadow:0 8px 32px rgba(26,14,6,0.28);}
        .btn-primary:active:not(:disabled){transform:translateY(0)}
        .btn-ghost{background:transparent;border:1px solid var(--bd);color:var(--ink-2);padding:9px 18px;}
        .btn-ghost:hover{border-color:var(--acc);color:var(--acc);background:var(--acc-l)}

        /* Multi-image analyze note */
        .analyze-note{font-family:'EB Garamond',serif;font-size:13px;font-style:italic;color:var(--ink-3);text-align:center;margin-top:10px;}

        /* ── LOADING ── */
        .loading-wrap{text-align:center;padding:52px 24px}
        .loading-spinner{width:44px;height:44px;margin:0 auto 20px;border-radius:50%;border:1.5px solid var(--bd-l);border-top-color:var(--acc);animation:spin .9s linear infinite;}
        @keyframes spin{to{transform:rotate(360deg)}}
        .loading-msg{font-family:'EB Garamond',serif;font-size:15px;font-style:italic;color:var(--ink-2);margin-bottom:16px;}
        .progress-track{width:200px;margin:0 auto;height:2px;background:var(--bd-l);border-radius:2px;overflow:hidden;}
        .progress-fill{height:100%;background:var(--acc);border-radius:2px;transition:width .6s ease;}
        .ld{display:inline-flex;gap:4px;align-items:center;vertical-align:middle}
        .ld-d{width:4px;height:4px;border-radius:50%;background:var(--parch-0);animation:ldpulse 1.2s ease infinite;}
        .ld-d:nth-child(2){animation-delay:.2s}
        .ld-d:nth-child(3){animation-delay:.4s}
        @keyframes ldpulse{0%,80%,100%{opacity:.2;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}

        /* ── ERROR ── */
        .err-box{background:rgba(122,32,16,0.05);border:1px solid rgba(122,32,16,0.18);border-radius:var(--r);padding:12px 16px;color:var(--red);font-size:13px;margin-top:14px;font-family:'DM Mono',monospace;line-height:1.6;}
        .err-box::before{content:'⚠  ';opacity:.7}

        /* ═══════════════════════════════════════════════════════
           RESULT LAYOUT
        ═══════════════════════════════════════════════════════ */

        .result-page{
          display:flex;flex-direction:column;
          flex:1;
          /* Important: fixed height so panels can scroll independently */
          height:calc(100vh - var(--nav-h));
          overflow:hidden;
        }

        .res-topbar{
          flex-shrink:0;
          background:rgba(250,245,236,0.97);
          backdrop-filter:blur(10px);
          -webkit-backdrop-filter:blur(10px);
          border-bottom:1px solid var(--bd-l);
          padding:12px 40px;
          display:flex;align-items:center;
          justify-content:space-between;flex-wrap:wrap;gap:12px;
        }
        .res-topbar-left{display:flex;align-items:center;gap:20px;flex:1;min-width:0;}
        .res-eyebrow{font-family:'DM Mono',monospace;font-size:8px;letter-spacing:3px;text-transform:uppercase;color:var(--ink-4);margin-bottom:3px;}
        .res-title{font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:700;font-style:italic;color:var(--ink-0);line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:400px;}

        /* Multi-result switcher in topbar */
        .res-switcher{
          display:flex;align-items:center;gap:6px;
          padding:4px;background:var(--parch-1);
          border:1px solid var(--bd-l);border-radius:8px;
          overflow-x:auto;max-width:300px;
          scrollbar-width:none;
        }
        .res-switcher::-webkit-scrollbar{display:none;}
        .res-sw-btn{
          flex-shrink:0;
          width:36px;height:36px;border-radius:6px;
          border:none;cursor:pointer;overflow:hidden;
          background:transparent;padding:0;
          transition:all .15s;position:relative;
          outline:none;
        }
        .res-sw-btn img{width:100%;height:100%;object-fit:cover;display:block;border-radius:6px;}
        .res-sw-btn.active{box-shadow:0 0 0 2px var(--acc);}
        .res-sw-btn .sw-num{
          position:absolute;bottom:0;left:0;right:0;
          background:rgba(26,14,6,0.6);color:#f0ead8;
          font-family:'DM Mono',monospace;font-size:7px;
          text-align:center;padding:1px 0;border-radius:0 0 4px 4px;
          display:none;
        }
        .res-sw-btn.active .sw-num{display:block;}

        /* Tablet tab bar */
        .tab-bar{
          display:none;
          flex-shrink:0;
          border-bottom:1px solid var(--bd-l);
          background:var(--parch-1);
          padding:0 32px;
        }
        .tab-btn{
          font-family:'DM Mono',monospace;font-size:9px;letter-spacing:2px;text-transform:uppercase;
          padding:14px 20px;border:none;background:transparent;cursor:pointer;
          color:var(--ink-4);border-bottom:2px solid transparent;
          transition:all .2s;margin-bottom:-1px;
        }
        .tab-btn.active{color:var(--acc);border-bottom-color:var(--acc);}

        /* THE KEY FIX: split fills remaining height, panels scroll */
        .result-split{
          display:grid;
          grid-template-columns:42% 58%;
          flex:1;
          min-height:0;
          overflow:hidden;
        }

        .result-panel{
          display:flex;
          flex-direction:column;
          overflow:hidden; /* panel itself doesn't scroll */
          border-right:1px solid var(--bd-l);
        }
        .result-panel:last-child{border-right:none;}

        .panel-hdr{
          display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;
          padding:10px 24px;
          background:var(--parch-1);
          border-bottom:1px solid var(--bd-l);
          flex-shrink:0;
        }
        .panel-label{
          font-family:'DM Mono',monospace;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:var(--ink-3);
          display:flex;align-items:center;gap:10px;
        }
        .panel-label::before{content:'';width:14px;height:1px;background:var(--acc);}
        .panel-actions{display:flex;align-items:center;gap:5px;flex-wrap:wrap;}

        /* notes body scrolls */
        .panel-body{
          flex:1;
          overflow-y:auto;
          overflow-x:hidden;
          scrollbar-width:thin;
          scrollbar-color:var(--bd-l) transparent;
        }
        .panel-body::-webkit-scrollbar{width:4px;}
        .panel-body::-webkit-scrollbar-track{background:transparent;}
        .panel-body::-webkit-scrollbar-thumb{background:var(--bd-l);border-radius:2px;}

        .notes-ta-full{
          width:100%;height:100%;min-height:300px;
          background:transparent;border:none;outline:none;
          padding:28px 32px;
          color:var(--ink-2);font-family:'DM Mono',monospace;font-size:12.5px;
          line-height:1.9;resize:none;
        }
        .notes-prev-full{padding:28px 32px;}

        /* Notes content styles */
        .nc h1{font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:700;font-style:italic;color:var(--ink-0);margin:0 0 16px;padding-bottom:10px;border-bottom:1px solid var(--bd-l);}
        .nc h2{font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:600;font-style:italic;color:var(--ink-1);margin:20px 0 8px;}
        .nc h3{font-family:'DM Mono',monospace;font-size:9px;font-weight:500;color:var(--ink-3);margin:16px 0 6px;text-transform:uppercase;letter-spacing:3px;}
        .nc p{font-size:14.5px;line-height:1.95;color:var(--ink-2);margin-bottom:10px;font-family:'EB Garamond',serif;}
        .nc ul{list-style:none;padding:0;margin:6px 0 12px}
        .nc ol{padding-left:22px;margin:6px 0 12px}
        .nc li{font-size:14px;line-height:1.85;color:var(--ink-2);padding:3px 0 3px 22px;position:relative;font-family:'EB Garamond',serif;}
        .nc ul li::before{content:'·';position:absolute;left:4px;color:var(--acc);font-size:18px;line-height:1.1;}
        .nc ol li{padding-left:0;list-style:decimal}
        .nc ol li::before{display:none}
        .nc strong{color:var(--ink-0);font-weight:700}
        .nc em{color:var(--acc-h);font-style:italic}
        .nc code{background:rgba(107,60,24,0.07);color:var(--acc);padding:2px 7px;border-radius:4px;font-family:'DM Mono',monospace;font-size:11px;}
        .nc hr{border:none;border-top:1px solid var(--bd-l);margin:18px 0}

        .toggle-group{display:flex;gap:2px;background:var(--bd-l);border-radius:7px;padding:2px;}
        .toggle-btn{font-family:'DM Mono',monospace;font-size:8px;letter-spacing:1px;text-transform:uppercase;padding:5px 10px;border:none;border-radius:5px;cursor:pointer;background:transparent;color:var(--ink-3);transition:all .15s;}
        .toggle-btn.active{background:var(--ink-0);color:var(--parch-0);}

        /* Download buttons — cleaner, bigger */
        .dl-group{display:flex;align-items:center;gap:5px;}
        .dl-btn{font-family:'DM Mono',monospace;font-size:8px;letter-spacing:1.5px;text-transform:uppercase;font-weight:500;border:none;cursor:pointer;border-radius:6px;display:inline-flex;align-items:center;gap:5px;padding:7px 12px;transition:all .2s;white-space:nowrap;}
        .dl-btn:disabled{opacity:.35;cursor:not-allowed}
        .dl-jpg{background:rgba(107,60,24,0.09);border:1px solid rgba(107,60,24,0.22);color:var(--acc)}
        .dl-jpg:hover:not(:disabled){background:rgba(107,60,24,0.15)}
        .dl-doc{background:rgba(30,58,106,0.07);border:1px solid rgba(30,58,106,0.18);color:var(--blue)}
        .dl-doc:hover:not(:disabled){background:rgba(30,58,106,0.12)}
        .dl-svg{background:rgba(26,68,40,0.07);border:1px solid rgba(26,68,40,0.18);color:var(--green)}
        .dl-svg:hover:not(:disabled){background:rgba(26,68,40,0.12)}

        /* diagram panel — flex column, flow editor fills remaining space */
        .diagram-panel-inner{
          flex:1;display:flex;flex-direction:column;overflow:hidden;
        }

        /* ── FLOW EDITOR ── */
        .fe-toolbar{display:flex;align-items:center;gap:5px;padding:8px 14px;background:var(--parch-1);border-bottom:1px solid var(--bd-l);flex-shrink:0;flex-wrap:wrap;min-height:44px;}
        .fe-btn{font-family:'DM Mono',monospace;font-size:8px;letter-spacing:.5px;text-transform:uppercase;padding:5px 10px;border:1px solid var(--bd-l);background:var(--parch-0);color:var(--ink-2);border-radius:5px;cursor:pointer;transition:all .15s;white-space:nowrap;}
        .fe-btn:hover{background:var(--parch-1);border-color:var(--acc);color:var(--acc)}
        .fe-btn-connect{border-color:rgba(30,58,106,0.2);color:var(--blue)}
        .fe-btn-connect:hover{background:rgba(30,58,106,0.06)}
        .fe-btn-edit{border-color:rgba(26,68,40,0.2);color:var(--green)}
        .fe-btn-edit:hover{background:rgba(26,68,40,0.06)}
        .fe-btn-del{border-color:rgba(122,32,16,0.2);color:var(--red)}
        .fe-btn-del:hover{background:rgba(122,32,16,0.06)}
        .fe-zoom-btn{padding:4px 8px;}
        .fe-sel{font-family:'DM Mono',monospace;font-size:8px;padding:5px 8px;border:1px solid var(--bd-l);background:var(--parch-0);color:var(--ink-1);border-radius:5px;cursor:pointer;}
        .fe-zoom{font-family:'DM Mono',monospace;font-size:8px;color:var(--ink-4);min-width:28px;text-align:center;}
        .fe-hint{font-family:'EB Garamond',serif;font-size:12px;color:var(--acc);font-style:italic;animation:fadepulse 1.5s ease infinite;}
        @keyframes fadepulse{0%,100%{opacity:.4}50%{opacity:1}}
        .fe-hint-bar{font-family:'EB Garamond',serif;font-size:11px;color:var(--bd);font-style:italic;text-align:center;padding:5px;flex-shrink:0;border-top:1px solid var(--bd-l);}

        /* ── EDIT POPUP ── */
        .ep-overlay{position:fixed;inset:0;background:rgba(26,14,6,0.45);z-index:200;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);animation:fadeIn .15s ease;}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        .ep{background:var(--parch-0);border:1px solid var(--bd);border-radius:var(--r-lg);padding:28px;width:320px;box-shadow:var(--shadow-lg);animation:slideUp .2s ease;}
        @keyframes slideUp{from{transform:translateY(12px);opacity:0}to{transform:none;opacity:1}}
        .ep-title{font-family:'Cormorant Garamond',serif;font-size:17px;font-weight:600;font-style:italic;color:var(--ink-0);margin-bottom:16px;}
        .ep-input{width:100%;background:var(--parch-1);border:1px solid var(--bd);border-radius:var(--r);padding:11px 14px;color:var(--ink-0);font-family:'EB Garamond',serif;font-size:15px;outline:none;margin-bottom:14px;transition:border-color .15s;}
        .ep-input:focus{border-color:var(--acc)}
        .ep-row{display:flex;gap:8px}
        .ep-ok{flex:1;font-family:'DM Mono',monospace;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;padding:10px;border:none;border-radius:var(--r);cursor:pointer;background:var(--ink-0);color:var(--parch-0);transition:background .15s;}
        .ep-ok:hover{background:var(--ink-1)}
        .ep-cancel{flex:1;font-family:'DM Mono',monospace;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;padding:10px;border:1px solid var(--bd);border-radius:var(--r);cursor:pointer;background:transparent;color:var(--ink-3);transition:border-color .15s;}
        .ep-cancel:hover{border-color:var(--acc);color:var(--acc)}

        /* ── FOOTER ── */
        .dl-err{background:rgba(122,32,16,0.05);border:1px solid rgba(122,32,16,0.15);border-radius:var(--r);padding:10px 14px;color:var(--red);font-size:12px;margin:10px 40px;font-family:'DM Mono',monospace;flex-shrink:0;}
        .footer{padding:18px 48px;border-top:1px solid var(--bd-l);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;}
        .footer-brand{font-family:'Cormorant Garamond',serif;font-size:14px;font-style:italic;color:var(--ink-3);}
        .footer-meta{font-family:'DM Mono',monospace;font-size:8px;letter-spacing:2.5px;text-transform:uppercase;color:var(--bd);}

        /* ══════════════════════════════════════════════════════
           RESPONSIVE
        ══════════════════════════════════════════════════════ */

        @media(max-width:1024px){
          .topnav{padding:0 32px;}
          .topnav-meta{display:none;}
          .upload-wrap{grid-template-columns:1fr;gap:32px;min-height:auto;padding:40px 32px 80px;}
          .upload-left{position:static;}
          .hero-features{display:none;}
          .hero-features-grid{display:grid;}

          .result-page{height:auto;overflow:visible;}
          .result-split{grid-template-columns:1fr;overflow:visible;}
          .tab-bar{display:flex;}
          .res-topbar{padding:10px 24px;}
          .result-panel{overflow:visible;border-right:none;border-bottom:1px solid var(--bd-l);}
          .result-panel:last-child{border-bottom:none;}
          .panel-hdr{padding:10px 20px;}
          .notes-ta-full,.notes-prev-full{padding:24px 24px;}
        }

        @media(max-width:767px){
          :root{--nav-h:54px;}
          .topnav{padding:0 18px;}
          .brand-sub{display:none;}
          .brand-name{font-size:20px;}
          .topnav-emblem{width:34px;height:34px;font-size:14px;}
          .upload-wrap{padding:24px 18px 60px;gap:24px;}
          h1{font-size:clamp(28px,8vw,40px);letter-spacing:-0.5px;margin-bottom:14px;}
          .hero-desc{font-size:15px;margin-bottom:20px;}
          .hero-features-grid{display:none;}
          .drop{padding:36px 20px;min-height:180px;}
          .drop-icon{font-size:32px;margin-bottom:12px;}
          .drop-title{font-size:18px;}
          .drop-hint{display:none;}
          .btn-primary{padding:16px;}
          .tab-bar{padding:0 18px;}
          .res-topbar{padding:8px 18px;}
          .res-title{font-size:16px;max-width:220px;}
          .panel-hdr{padding:8px 14px;flex-direction:column;align-items:flex-start;gap:6px;}
          .panel-actions{width:100%;overflow-x:auto;flex-wrap:nowrap;-webkit-overflow-scrolling:touch;padding-bottom:2px;}
          .dl-btn{flex-shrink:0;}
          .notes-ta-full,.notes-prev-full{padding:16px 16px;}
          .fe-toolbar{overflow-x:auto;flex-wrap:nowrap;padding:6px 10px;gap:5px;-webkit-overflow-scrolling:touch;}
          .fe-btn{flex-shrink:0;}
          .ep{width:calc(100vw - 36px);max-width:340px;padding:22px;}
          .dl-err{margin:8px 18px;}
          .footer{padding:14px 18px;flex-direction:column;align-items:center;text-align:center;}
          .img-queue-strip{padding:8px;gap:6px;}
          .res-switcher{max-width:180px;}
        }

        @media(min-width:1280px){
          .topnav{padding:0 64px;}
          .upload-wrap{padding:72px 64px 120px;max-width:1280px;}
          .res-topbar{padding:12px 56px;}
          .panel-hdr{padding:12px 36px;}
          .notes-ta-full,.notes-prev-full{padding:36px 48px;}
          .footer{padding:20px 64px;}
        }

        @media(hover:none){
          .drop:hover{transform:none;box-shadow:none;}
          .btn-primary:hover:not(:disabled){transform:none;box-shadow:0 4px 20px rgba(26,14,6,0.22);}
        }
      `}</style>

      <div className="app">

        {/* ── FIXED TOPNAV ── */}
        <nav className="topnav">
          <div className="topnav-brand">
            <div className="topnav-emblem">✒</div>
            <div>
              <div className="brand-name">Ink<em>Parse</em></div>
              <div className="brand-sub">Handwriting Intelligence</div>
            </div>
          </div>
          <div className="topnav-right">
            {step === "result" && (
              <button className="btn btn-ghost" onClick={reset} style={{padding:"8px 16px",fontSize:"9px"}}>↩ New images</button>
            )}
            <div className="topnav-meta">AI-Powered · {currentYear}</div>
          </div>
        </nav>

        <div className="page-body">

          {/* ── UPLOAD STEP ── */}
          {step === "upload" && (
            <div className={`upload-wrap reveal ${revealed ? "in" : ""}`} style={{transitionDelay:"0.08s"}}>

              <div className="upload-left">
                <div className="eyebrow">Intelligent Notes Reader</div>
                <h1>Your scribbles,<br /><em>precisely structured.</em></h1>
                <p className="hero-desc">
                  Photograph any handwritten notes — rushed, rotated, densely annotated —
                  and InkParse transforms them into clean, structured text with an interactive
                  flow diagram. Professional results in seconds.
                </p>
                <div className="hero-features">
                  <div className="feat"><span className="feat-dot"/>Recognises any handwriting style</div>
                  <div className="feat"><span className="feat-dot"/>Automatic flowchart generation</div>
                  <div className="feat"><span className="feat-dot"/>Export to JPG, DOCX &amp; SVG</div>
                  <div className="feat"><span className="feat-dot"/>Process multiple images at once</div>
                </div>
                <div className="hero-features-grid">
                  <div className="feat-grid-item"><span className="feat-dot"/>Any handwriting</div>
                  <div className="feat-grid-item"><span className="feat-dot"/>Auto flowchart</div>
                  <div className="feat-grid-item"><span className="feat-dot"/>JPG, DOCX, SVG</div>
                  <div className="feat-grid-item"><span className="feat-dot"/>Multi-image batch</div>
                </div>
              </div>

              <div className="upload-right">
                {/* Image queue (shown once at least one image is queued) */}
                {imageQueue.length > 0 && (
                  <div style={{marginBottom:16}}>
                    <div className="img-queue-header">
                      <span className="img-queue-label">Images queued</span>
                      <span className="img-queue-count">{imageQueue.length} image{imageQueue.length>1?"s":""}</span>
                    </div>
                    <div className="img-queue-strip">
                      {imageQueue.map((img, idx) => (
                        <ImageThumb key={idx} img={img} index={idx} current={currentIdx} total={imageQueue.length}
                          onRemove={removeImage} onClick={() => setCurrentIdx(idx)} />
                      ))}
                      {/* Add more button */}
                      <button className="img-queue-add" onClick={() => fileRef.current.click()}>
                        <span className="img-queue-add-icon">＋</span>
                        <span>Add</span>
                      </button>
                    </div>

                    {/* Main preview of current image */}
                    <div className="img-main-prev">
                      <span className="img-badge">Image {currentIdx+1} of {imageQueue.length}</span>
                      <img src={imageQueue[currentIdx]?.preview} alt="Preview" />
                      {imageQueue.length > 1 && (
                        <div className="img-nav">
                          <button className="img-nav-btn"
                            onClick={() => setCurrentIdx(i => Math.max(0,i-1))}
                            disabled={currentIdx===0}>‹</button>
                          <button className="img-nav-btn"
                            onClick={() => setCurrentIdx(i => Math.min(imageQueue.length-1,i+1))}
                            disabled={currentIdx===imageQueue.length-1}>›</button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Drop zone — always visible (smaller when images are queued) */}
                {imageQueue.length === 0 ? (
                  <>
                    <div className={`drop ${dragOver ? "over" : ""}`}
                      onDragOver={e=>{e.preventDefault();setDragOver(true)}}
                      onDragLeave={()=>setDragOver(false)}
                      onDrop={handleDrop}
                      onClick={()=>fileRef.current.click()}>
                      <span className="drop-icon">📓</span>
                      <div className="drop-title">Drop or browse images</div>
                      <div className="drop-sub">Any photo · any handwriting · any angle</div>
                      <div className="drop-hint">JPG · PNG · WEBP · HEIC · Multiple files supported</div>
                      <input ref={fileRef} type="file" accept="image/*" multiple style={{display:"none"}}
                        onChange={e=>handleFiles(e.target.files)} />
                    </div>

                    {/* Camera option (secondary) */}
                    <div className="camera-row" style={{marginTop:12}}>
                      <button className="camera-btn" onClick={()=>cameraRef.current.click()}>
                        📷 Take a Photo
                      </button>
                      <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{display:"none"}}
                        onChange={e=>handleFiles(e.target.files)} />
                    </div>
                  </>
                ) : (
                  <>
                    {/* Compact add more / change all */}
                    <div style={{display:"flex",gap:8,marginBottom:14}}>
                      <label style={{flex:1}}>
                        <input ref={fileRef} type="file" accept="image/*" multiple style={{display:"none"}}
                          onChange={e=>handleFiles(e.target.files)} />
                        <span className="camera-btn" style={{width:"100%",display:"flex",cursor:"pointer"}}>＋ Add more images</span>
                      </label>
                      <button className="btn btn-ghost" style={{padding:"10px 16px",fontSize:"9px"}} onClick={reset}>✕ Clear all</button>
                    </div>
                    <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{display:"none"}}
                      onChange={e=>handleFiles(e.target.files)} />
                  </>
                )}

                {loading ? (
                  <div className="loading-wrap">
                    <div className="loading-spinner"/>
                    <div className="loading-msg">{loadMsg || "Processing…"}</div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{width:`${loadPct}%`}}/>
                    </div>
                  </div>
                ) : (
                  <>
                    <button className="btn btn-primary" style={{marginTop:imageQueue.length?14:20}}
                      disabled={!imageQueue.length||loading} onClick={analyze}>
                      {loading ? <LoadingDots/> : imageQueue.length > 1
                        ? `Analyse ${imageQueue.length} Images`
                        : "Analyse & Structure Notes"}
                    </button>
                    {imageQueue.length > 1 && (
                      <p className="analyze-note">All {imageQueue.length} images will be processed sequentially</p>
                    )}
                  </>
                )}

                {error && <div className="err-box">{error}</div>}
              </div>
            </div>
          )}

          {/* ── RESULT STEP ── */}
          {step === "result" && (
            <div className="result-page">

              {/* Sticky topbar */}
              <div className="res-topbar">
                <div className="res-topbar-left">
                  {/* Multi-result switcher */}
                  {results.length > 1 && (
                    <div className="res-switcher">
                      {results.map((r, idx) => (
                        <button key={idx} className={`res-sw-btn ${resultIdx===idx?"active":""}`}
                          onClick={() => switchResult(idx)} title={r.title}>
                          <img src={r.imagePreview} alt={`Result ${idx+1}`} />
                          <span className="sw-num">{idx+1}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div style={{minWidth:0}}>
                    {results.length > 1 && (
                      <div className="res-eyebrow">Image {resultIdx+1} of {results.length}</div>
                    )}
                    {results.length <= 1 && <div className="res-eyebrow">Structured from handwriting</div>}
                    <div className="res-title">{title}</div>
                  </div>
                </div>
                <button className="btn btn-ghost" onClick={reset} style={{padding:"8px 16px",fontSize:"9px",flexShrink:0}}>↩ New images</button>
              </div>

              {/* Tablet tab bar */}
              <div className="tab-bar">
                <button className={`tab-btn ${activeTab==="notes"?"active":""}`} onClick={()=>setActiveTab("notes")}>
                  Extracted Notes
                </button>
                <button className={`tab-btn ${activeTab==="diagram"?"active":""}`} onClick={()=>setActiveTab("diagram")}>
                  Flow Diagram
                </button>
              </div>

              <div className="result-split">

                {/* NOTES PANEL */}
                <div className="result-panel" data-tab="notes" ref={notesCardRef}>
                  <div className="panel-hdr">
                    <div className="panel-label">Extracted Notes</div>
                    <div className="panel-actions">
                      <div className="toggle-group">
                        <button className={`toggle-btn ${notesMode==="preview"?"active":""}`} onClick={()=>setNotesMode("preview")}>Preview</button>
                        <button className={`toggle-btn ${notesMode==="edit"?"active":""}`} onClick={()=>setNotesMode("edit")}>Edit</button>
                      </div>
                      <div className="dl-group">
                        <button className="dl-btn dl-jpg" disabled={dlBusy==="notes-jpg"} onClick={dlNotesJpg}>
                          {dlBusy==="notes-jpg"?"…":"🖼 JPG"}
                        </button>
                        <button className="dl-btn dl-doc" disabled={dlBusy==="notes-docx"} onClick={dlNotesDocx}>
                          {dlBusy==="notes-docx"?"…":"📄 DOCX"}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="panel-body">
                    {notesMode==="edit"
                      ? <textarea className="notes-ta-full" value={notes} onChange={e=>setNotes(e.target.value)} spellCheck={false} placeholder="Your extracted notes will appear here…"/>
                      : <div className="notes-prev-full nc" dangerouslySetInnerHTML={{__html:mdToHtml(notes)}}/>
                    }
                  </div>
                </div>

                {/* DIAGRAM PANEL */}
                <div className="result-panel" data-tab="diagram" ref={flowCardRef}>
                  <div className="panel-hdr">
                    <div className="panel-label">Visual Flow Diagram</div>
                    <div className="panel-actions">
                      <span style={{fontFamily:"'DM Mono',monospace",fontSize:"8px",letterSpacing:"2px",textTransform:"uppercase",color:"var(--bd)",marginRight:4}}>Interactive</span>
                      <div className="dl-group">
                        <button className="dl-btn dl-jpg" disabled={dlBusy==="diag-jpg"} onClick={dlDiagramJpg}>
                          {dlBusy==="diag-jpg"?"…":"🖼 JPG"}
                        </button>
                        <button className="dl-btn dl-svg" onClick={dlDiagramSvg}>◈ SVG</button>
                      </div>
                    </div>
                  </div>
                  <div className="diagram-panel-inner">
                    <FlowEditor nodes={flowNodes} edges={flowEdges} onChange={(n,e)=>{setFlowNodes(n);setFlowEdges(e);}} />
                  </div>
                </div>

              </div>

              {dlError && <div className="dl-err">⚠ {dlError}</div>}

              {/* Tab panel show/hide on tablet */}
              <style>{`
                @media(max-width:1024px) and (min-width:768px){
                  .result-panel[data-tab="notes"]{ display: ${activeTab==="notes"?"flex":"none"}; }
                  .result-panel[data-tab="diagram"]{ display: ${activeTab==="diagram"?"flex":"none"}; }
                }
              `}</style>

            </div>
          )}

          {step !== "result" && (
            <footer className="footer">
              <div className="footer-brand">InkParse — Turn your handwriting into knowledge</div>
              <div className="footer-meta">AI Powered · {currentYear}</div>
            </footer>
          )}

        </div>
      </div>
    </>
  );
}
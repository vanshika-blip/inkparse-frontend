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
    // Match inline node defs in arrows: A[label] --> B[label]
    const arrowM = line.match(/([A-Za-z0-9_]+)\s*(?:(\(\(|\(\[|\[\[|\[|\(|\{|>)(.*?)(\)\)|\]\)|\]\]|\]|\)|\}|<))?\s*--+(?:\|([^|]*)\|)?\s*>\s*([A-Za-z0-9_]+)\s*(?:(\(\(|\(\[|\[\[|\[|\(|\{|>)(.*?)(\)\)|\]\)|\]\]|\]|\)|\}|<))?/);
    if (arrowM) {
      const [,sid,so,sl,,el,tid,to,tl] = arrowM;
      if (!nodes[sid]) nodes[sid] = { id:sid, label:(sl||sid).trim(), shape:shapeOpen[so]||"rect" };
      if (!nodes[tid]) nodes[tid] = { id:tid, label:(tl||tid).trim(), shape:shapeOpen[to]||"rect" };
      edges.push({ from:sid, to:tid, label:(el||"").trim() });
      continue;
    }
    // Standalone node def
    const nodeM = line.match(/^([A-Za-z0-9_]+)\s*(\(\(|\(\[|\[\[|\[|\(|\{|>)(.*?)(\)\)|\]\)|\]\]|\]|\)|\}|<)\s*$/);
    if (nodeM) {
      const [,id,open,label] = nodeM;
      nodes[id] = nodes[id] || {};
      nodes[id] = { ...nodes[id], id, label:label.trim()||id, shape:shapeOpen[open]||"rect" };
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
  const NW=170, NH=60, GX=60, GY=70;
  for (const [lv, lvN] of Object.entries(byLv)) {
    lvN.forEach((n,i) => { n.x=i*(NW+GX)+60; n.y=Number(lv)*(NH+GY)+60; });
  }
}

function graphToMermaid(nodes, edges) {
  const lines = ["flowchart TD"];
  for (const n of Object.values(nodes)) {
    const lb = n.label.replace(/[[\]{}()]/g," ").trim();
    if (n.shape==="stadium"||n.shape==="round") lines.push(`  ${n.id}([${lb}])`);
    else if (n.shape==="diamond") lines.push(`  ${n.id}{${lb}}`);
    else lines.push(`  ${n.id}[${lb}]`);
  }
  for (const e of edges) lines.push(`  ${e.from} -->${e.label?`|${e.label}|`:""} ${e.to}`);
  return lines.join("\n");
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
  ch.push(new Paragraph({heading:HeadingLevel.HEADING_1,children:[new TextRun({text:title,bold:true,size:36,font:"Georgia"})]}));
  ch.push(new Paragraph({children:[new TextRun("")]}));
  for (const line of notes.split("\n")) {
    if (/^# (.+)$/.test(line)) ch.push(new Paragraph({heading:HeadingLevel.HEADING_1,children:[new TextRun({text:line.replace(/^# /,""),bold:true,font:"Georgia",size:32})]}));
    else if (/^## (.+)$/.test(line)) ch.push(new Paragraph({heading:HeadingLevel.HEADING_2,children:[new TextRun({text:line.replace(/^## /,""),bold:true,font:"Georgia",size:28})]}));
    else if (/^### (.+)$/.test(line)) ch.push(new Paragraph({heading:HeadingLevel.HEADING_3,children:[new TextRun({text:line.replace(/^### /,""),bold:true,size:24})]}));
    else if (/^[-•] (.+)$/.test(line)) ch.push(new Paragraph({bullet:{level:0},children:[new TextRun({text:line.replace(/^[-•] /,"")})]}));
    else if (/^\d+\. (.+)$/.test(line)) ch.push(new Paragraph({numbering:{reference:"nums",level:0},children:[new TextRun({text:line.replace(/^\d+\. /,"")})]}));
    else if (/^---$/.test(line)) ch.push(new Paragraph({border:{bottom:{style:BorderStyle.SINGLE,size:4,color:"c9a96e",space:1}},children:[new TextRun("")]}));
    else if (line.trim()) ch.push(new Paragraph({children:[new TextRun({text:line})],spacing:{after:120}}));
    else ch.push(new Paragraph({children:[new TextRun("")]}));
  }
  const doc=new Document({
    numbering:{config:[{reference:"nums",levels:[{level:0,format:LevelFormat.DECIMAL,text:"%1.",alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:720,hanging:360}}}}]}]},
    styles:{
      default:{document:{run:{font:"Georgia",size:24}}},
      paragraphStyles:[
        {id:"Heading1",name:"Heading 1",basedOn:"Normal",next:"Normal",quickFormat:true,run:{size:36,bold:true,font:"Georgia",color:"1a1a2e"},paragraph:{spacing:{before:360,after:180},outlineLevel:0}},
        {id:"Heading2",name:"Heading 2",basedOn:"Normal",next:"Normal",quickFormat:true,run:{size:28,bold:true,color:"5c4f8a"},paragraph:{spacing:{before:240,after:120},outlineLevel:1}},
        {id:"Heading3",name:"Heading 3",basedOn:"Normal",next:"Normal",quickFormat:true,run:{size:24,bold:true,color:"8b6abf"},paragraph:{spacing:{before:180,after:80},outlineLevel:2}},
      ]
    },
    sections:[{
      properties:{page:{size:{width:12240,height:15840},margin:{top:1440,right:1440,bottom:1440,left:1440}}},
      children:ch
    }]
  });
  return Packer.toBlob(doc);
}

// ── NODE COLORS & SHAPES ──────────────────────────────────────────────────────
const PALETTE = [
  { fill:"#2d1b69", stroke:"#7c3aed", text:"#c4b5fd", glow:"rgba(124,58,237,0.4)" },
  { fill:"#1a3a5c", stroke:"#0ea5e9", text:"#7dd3fc", glow:"rgba(14,165,233,0.4)" },
  { fill:"#1a4a3a", stroke:"#10b981", text:"#6ee7b7", glow:"rgba(16,185,129,0.4)" },
  { fill:"#4a1a2a", stroke:"#f43f5e", text:"#fda4af", glow:"rgba(244,63,94,0.4)" },
  { fill:"#3a2a1a", stroke:"#f59e0b", text:"#fcd34d", glow:"rgba(245,158,11,0.4)" },
  { fill:"#1a1a4a", stroke:"#6366f1", text:"#a5b4fc", glow:"rgba(99,102,241,0.4)" },
];

const NW = 164, NH = 52;

function getNodeColor(id, nodes) {
  const keys = Object.keys(nodes);
  return PALETTE[keys.indexOf(id) % PALETTE.length];
}

function NodeShape({ n, col, selected, connecting, onMouseDown, onDoubleClick }) {
  const { x, y } = n;
  const w = NW, h = NH;
  const filter = selected ? `drop-shadow(0 0 12px ${col.glow}) drop-shadow(0 0 4px ${col.stroke})` : `drop-shadow(0 0 6px ${col.glow})`;

  const commonProps = {
    fill: col.fill,
    stroke: selected ? col.text : col.stroke,
    strokeWidth: selected ? 2.5 : 1.5,
    filter,
    style: { transition: "filter 0.2s, stroke 0.15s" }
  };

  return (
    <g onMouseDown={onMouseDown} onDoubleClick={onDoubleClick} style={{ cursor: "move" }}>
      {n.shape === "diamond" ? (
        <polygon points={`${x+w/2},${y-4} ${x+w+4},${y+h/2} ${x+w/2},${y+h+4} ${x-4},${y+h/2}`} {...commonProps} />
      ) : n.shape === "round" || n.shape === "stadium" ? (
        <>
          <rect x={x} y={y} width={w} height={h} rx={h/2} {...commonProps} />
          {/* inner shine */}
          <rect x={x+4} y={y+4} width={w-8} height={h/2-4} rx={(h/2-4)/2} fill="rgba(255,255,255,0.05)" style={{pointerEvents:"none"}} />
        </>
      ) : (
        <>
          <rect x={x} y={y} width={w} height={h} rx={8} {...commonProps} />
          <rect x={x+4} y={y+4} width={w-8} height={h/2-4} rx={4} fill="rgba(255,255,255,0.05)" style={{pointerEvents:"none"}} />
          {/* left accent bar */}
          <rect x={x} y={y} width={3} height={h} rx={2} fill={col.stroke} style={{pointerEvents:"none"}} />
        </>
      )}
      <text
        x={x+w/2} y={y+h/2+1}
        textAnchor="middle" dominantBaseline="middle"
        fill={col.text} fontSize={12} fontFamily="'DM Sans',sans-serif" fontWeight="500"
        style={{ pointerEvents:"none", userSelect:"none" }}>
        {n.label.length > 20 ? n.label.slice(0,18)+"…" : n.label}
      </text>
      {/* connect handle dot */}
      {selected && (
        <circle cx={x+w} cy={y+h/2} r={8} fill={col.stroke} stroke="#fff" strokeWidth={1.5}
          style={{ cursor:"crosshair", filter:`drop-shadow(0 0 6px ${col.glow})` }}
          onMouseDown={e=>{e.stopPropagation();onMouseDown(e,"connect");}} />
      )}
    </g>
  );
}

// ── VISUAL FLOW EDITOR ────────────────────────────────────────────────────────
function FlowEditor({ nodes, edges, onChange }) {
  const svgRef = useRef();
  const [selNode, setSelNode] = useState(null);
  const [selEdge, setSelEdge] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [connecting, setConnecting] = useState(null);
  const [mousePos, setMousePos] = useState({x:0,y:0});
  const [pan, setPan] = useState({x:40,y:20});
  const [panningSt, setPanningSt] = useState(null);
  const [zoom, setZoom] = useState(0.9);
  const [editPopup, setEditPopup] = useState(null); // {type:"node"|"edge", id, label}
  const nodesR = useRef(nodes); nodesR.current = nodes;
  const edgesR = useRef(edges); edgesR.current = edges;

  const svgCoords = (e) => {
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

  const onSvgMD = (e) => {
    if (connecting) { setConnecting(null); return; }
    setSelNode(null); setSelEdge(null);
    setPanningSt({sx:e.clientX,sy:e.clientY,px:pan.x,py:pan.y});
  };

  const onMM = (e) => {
    const pt = svgCoords(e); setMousePos(pt);
    if (dragging) {
      const up={...nodesR.current};
      up[dragging.id]={...up[dragging.id],x:pt.x-dragging.ox,y:pt.y-dragging.oy};
      onChange(up,edgesR.current);
    }
    if (panningSt) setPan({x:panningSt.px+(e.clientX-panningSt.sx),y:panningSt.py+(e.clientY-panningSt.sy)});
  };

  const onMU = () => { setDragging(null); setPanningSt(null); };
  const onWheel = (e) => { e.preventDefault(); setZoom(z=>Math.max(0.25,Math.min(2,z-e.deltaY*0.001))); };

  const addNode = () => {
    const id="N"+Date.now(), ct=svgCoords({clientX:300,clientY:300});
    onChange({...nodesR.current,[id]:{id,label:"New Step",shape:"rect",x:ct.x+Math.random()*60,y:ct.y+Math.random()*60}},edgesR.current);
    setSelNode(id);
  };

  const deleteNode = (id) => {
    const u={...nodesR.current}; delete u[id];
    onChange(u, edgesR.current.filter(e=>e.from!==id&&e.to!==id));
    setSelNode(null);
  };

  const deleteEdge = (i) => { onChange(nodesR.current,edgesR.current.filter((_,j)=>j!==i)); setSelEdge(null); };

  const saveEdit = () => {
    if (!editPopup) return;
    if (editPopup.type==="node") {
      onChange({...nodesR.current,[editPopup.id]:{...nodesR.current[editPopup.id],label:editPopup.label}},edgesR.current);
    } else {
      onChange(nodesR.current, edgesR.current.map((e,i)=>i===editPopup.id?{...e,label:editPopup.label}:e));
    }
    setEditPopup(null);
  };

  const nodeCenter = n => ({x:n.x+NW/2,y:n.y+NH/2});

  // Curved arrow between nodes
  const Arrow = ({e,i}) => {
    const from=nodes[e.from],to=nodes[e.to];
    if(!from||!to) return null;
    const f=nodeCenter(from),t=nodeCenter(to);
    const dx=t.x-f.x,dy=t.y-f.y,len=Math.sqrt(dx*dx+dy*dy)||1;
    const ux=dx/len,uy=dy/len;
    const sx=f.x+ux*NW*0.55,sy=f.y+uy*NH*0.55;
    const ex=t.x-ux*NW*0.55,ey=t.y-uy*NH*0.55;
    // Bezier control point for curve
    const mx=(sx+ex)/2-uy*30,my=(sy+ey)/2+ux*30;
    const isSel=selEdge===i;
    const col=isSel?"#f472b6":"#4b5563";
    const midX=(sx+2*mx+ex)/4,midY=(sy+2*my+ey)/4;
    return (
      <g key={i} onClick={ev=>{ev.stopPropagation();setSelEdge(i);setSelNode(null);}}>
        <path d={`M${sx},${sy} Q${mx},${my} ${ex},${ey}`}
          stroke={col} strokeWidth={isSel?2.5:1.5} fill="none"
          markerEnd={isSel?"url(#arrow-sel)":"url(#arrow)"}
          strokeDasharray={isSel?"6 3":"none"}
          style={{filter:isSel?`drop-shadow(0 0 4px #f472b6)`:"none",cursor:"pointer"}} />
        {/* invisible hit area */}
        <path d={`M${sx},${sy} Q${mx},${my} ${ex},${ey}`} stroke="transparent" strokeWidth={14} fill="none" style={{cursor:"pointer"}} />
        {e.label && (
          <g onDoubleClick={ev=>{ev.stopPropagation();setEditPopup({type:"edge",id:i,label:e.label});}}>
            <rect x={midX-e.label.length*3.2-6} y={midY-9} width={e.label.length*6.4+12} height={18} rx={9}
              fill="#1e1b2e" stroke={col} strokeWidth={1} />
            <text x={midX} y={midY+1} textAnchor="middle" dominantBaseline="middle"
              fill={isSel?"#f9a8d4":"#9ca3af"} fontSize={10} fontFamily="'DM Sans',sans-serif">
              {e.label}
            </text>
          </g>
        )}
        {isSel && (
          <g style={{cursor:"pointer"}} onClick={ev=>{ev.stopPropagation();deleteEdge(i);}}>
            <circle cx={midX} cy={midY} r={10} fill="#7f1d1d" stroke="#f87171" strokeWidth={1.5} />
            <text x={midX} y={midY+1} textAnchor="middle" dominantBaseline="middle" fill="#fca5a5" fontSize={12} style={{pointerEvents:"none"}}>✕</text>
          </g>
        )}
      </g>
    );
  };

  // Live connecting line
  const ConnLine = () => {
    if (!connecting||!nodes[connecting]) return null;
    const f=nodeCenter(nodes[connecting]);
    return <line x1={f.x} y1={f.y} x2={mousePos.x} y2={mousePos.y}
      stroke="#7c3aed" strokeWidth={2} strokeDasharray="6 3"
      style={{filter:"drop-shadow(0 0 6px #7c3aed)",pointerEvents:"none"}} />;
  };

  const canvasW = 2000, canvasH = 2000;

  return (
    <div style={{display:"flex",flexDirection:"column",flex:1,minHeight:0,position:"relative"}}>
      {/* Toolbar */}
      <div className="fe-toolbar">
        <button className="fe-btn" onClick={addNode}>＋ Add Node</button>
        {selNode && <>
          <button className="fe-btn fe-btn-connect" onClick={()=>setConnecting(connecting?null:selNode)}>
            {connecting===selNode?"✕ Cancel":"⟶ Connect"}
          </button>
          <select className="fe-sel" value={nodes[selNode]?.shape||"rect"} onChange={e=>{
            onChange({...nodesR.current,[selNode]:{...nodesR.current[selNode],shape:e.target.value}},edgesR.current);
          }}>
            <option value="rect">▭ Box</option>
            <option value="round">◉ Pill (Start/End)</option>
            <option value="diamond">◇ Diamond (Decision)</option>
          </select>
          <button className="fe-btn fe-btn-edit" onClick={()=>setEditPopup({type:"node",id:selNode,label:nodes[selNode]?.label||""})}>
            ✏ Label
          </button>
          <button className="fe-btn fe-btn-del" onClick={()=>deleteNode(selNode)}>✕</button>
        </>}
        {selEdge!==null&&!selNode && (
          <button className="fe-btn fe-btn-edit" onClick={()=>setEditPopup({type:"edge",id:selEdge,label:edges[selEdge]?.label||""})}>
            ✏ Edge Label
          </button>
        )}
        {connecting && <span className="fe-hint">→ Click a node to connect</span>}
        <div style={{flex:1}}/>
        <button className="fe-btn" onClick={()=>setZoom(z=>Math.min(2,z+0.15))}>＋</button>
        <span className="fe-zoom">{Math.round(zoom*100)}%</span>
        <button className="fe-btn" onClick={()=>setZoom(z=>Math.max(0.25,z-0.15))}>－</button>
        <button className="fe-btn" onClick={()=>{setZoom(0.9);setPan({x:40,y:20});}}>⊡ Reset</button>
      </div>

      {/* Canvas */}
      <svg ref={svgRef} style={{flex:1,minHeight:400,display:"block",cursor:panningSt?"grabbing":connecting?"crosshair":"grab",background:"transparent"}}
        onMouseDown={onSvgMD} onMouseMove={onMM} onMouseUp={onMU} onWheel={onWheel}>
        <defs>
          <marker id="arrow" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0,10 3.5,0 7" fill="#4b5563" />
          </marker>
          <marker id="arrow-sel" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0,10 3.5,0 7" fill="#f472b6" />
          </marker>
          {/* dot grid */}
          <pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="rgba(148,163,184,0.12)" />
          </pattern>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          <rect x="-1000" y="-1000" width={canvasW+2000} height={canvasH+2000} fill="url(#dots)" />
          {/* Edges */}
          {edges.map((e,i)=><Arrow key={i} e={e} i={i}/>)}
          <ConnLine />
          {/* Nodes */}
          {Object.values(nodes).map(n=>(
            <NodeShape key={n.id} n={n}
              col={getNodeColor(n.id, nodes)}
              selected={selNode===n.id}
              connecting={connecting===n.id}
              onMouseDown={(e,mode)=>onNodeMD(e,n.id,mode)}
              onDoubleClick={e=>{e.stopPropagation();setEditPopup({type:"node",id:n.id,label:n.label});}}
            />
          ))}
        </g>
      </svg>

      <div className="fe-hint-bar">Double-click to edit · Drag to move · Select + ⟶ Connect to link nodes · Scroll to zoom</div>

      {/* Edit Popup */}
      {editPopup && (
        <div className="ep-overlay" onClick={()=>setEditPopup(null)}>
          <div className="ep" onClick={e=>e.stopPropagation()}>
            <div className="ep-title">{editPopup.type==="node"?"Edit Node Label":"Edit Edge Label"}</div>
            <input className="ep-input" autoFocus
              value={editPopup.label}
              onChange={e=>setEditPopup({...editPopup,label:e.target.value})}
              onKeyDown={e=>{if(e.key==="Enter")saveEdit();if(e.key==="Escape")setEditPopup(null);}}
              placeholder="Enter label..."
            />
            <div className="ep-row">
              <button className="ep-ok" onClick={saveEdit}>Save</button>
              <button className="ep-cancel" onClick={()=>setEditPopup(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const [image, setImage]         = useState(null);
  const [imageB64, setImageB64]   = useState(null);
  const [imageMime, setImageMime] = useState("image/jpeg");
  const [step, setStep]           = useState("upload");
  const [loading, setLoading]     = useState(false);
  const [loadMsg, setLoadMsg]     = useState("");
  const [error, setError]         = useState("");
  const [dragOver, setDragOver]   = useState(false);

  const [title, setTitle]         = useState("");
  const [notes, setNotes]         = useState("");
  const [notesMode, setNotesMode] = useState("preview");
  const [flowNodes, setFlowNodes] = useState({});
  const [flowEdges, setFlowEdges] = useState([]);
  const [dlError, setDlError]     = useState("");
  const [dlBusy, setDlBusy]       = useState("");

  const fileRef      = useRef();
  const notesCardRef = useRef();
  const flowCardRef  = useRef();

  const handleFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setImageMime(file.type||"image/jpeg");
    const r=new FileReader();
    r.onload=e=>{setImage(e.target.result);setImageB64(e.target.result.split(",")[1]);};
    r.readAsDataURL(file);
  };

  const handleDrop = useCallback(e=>{e.preventDefault();setDragOver(false);handleFile(e.dataTransfer.files[0]);}, []);

  // ── Change this to wherever your backend is running ──────────
  const BACKEND_URL = "https://inkparse-backend.onrender.com";

  const analyze = async () => {
    if (!imageB64) return;
    setLoading(true); setError(""); setDlError("");
    setLoadMsg("Sending to backend…");
    try {
      // OpenAI key is securely stored in server.js — never exposed to browser
      const res = await fetch(`${BACKEND_URL}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: imageB64, imageMime })
      });
      setLoadMsg("Reading your handwriting…");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Backend error ${res.status}`);
      setTitle(data.title || "Notes");
      setNotes(data.notes || "");
      setLoadMsg("Building diagram…");
      const code = (data.mermaidCode || "flowchart TD\n  A([Start]) --> B[Content]")
        .replace(/```[\w]*\n?/g, "").trim();
      const {nodes:n,edges:e}=parseMermaidToGraph(code);
      setFlowNodes(n); setFlowEdges(e);
      setStep("result");
    } catch(e) {
      if (e.message.includes("fetch") || e.message.includes("Failed") || e.message.includes("NetworkError")) {
        setError("Cannot reach backend.\nMake sure inkparse-server.js is running:\n  node inkparse-server.js");
      } else {
        setError(e.message);
      }
    }
    finally { setLoading(false); }
  };

  // ── DOWNLOADS ──────────────────────────────────────────────────────────────
  const loadH2C = () => new Promise((res,rej)=>{
    if(window.html2canvas)return res();
    const s=document.createElement("script");
    s.src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
    s.onload=res;s.onerror=()=>rej(new Error("html2canvas failed"));
    document.head.appendChild(s);
  });

  const triggerDownload = (url, filename) => {
    const a=document.createElement("a"); a.href=url; a.download=filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const dlNotesJpg = async () => {
    setDlBusy("notes-jpg"); setDlError("");
    try {
      await loadH2C();
      const canvas=await window.html2canvas(notesCardRef.current,{scale:2,backgroundColor:"#0f0e1a",useCORS:true,logging:false});
      triggerDownload(canvas.toDataURL("image/jpeg",0.95),`${title||"notes"}.jpg`);
    } catch(e){setDlError("JPG failed: "+e.message);}
    finally{setDlBusy("");}
  };

  const dlNotesDocx = async () => {
    setDlBusy("notes-docx"); setDlError("");
    try {
      const blob=await makeDocxBlob(title,notes);
      const url=URL.createObjectURL(blob);
      triggerDownload(url,`${title||"notes"}.docx`);
      setTimeout(()=>URL.revokeObjectURL(url),2000);
    } catch(e){setDlError("DOCX failed: "+e.message);}
    finally{setDlBusy("");}
  };

  const dlDiagramJpg = async () => {
    setDlBusy("diag-jpg"); setDlError("");
    try {
      await loadH2C();
      // Only capture the SVG canvas area
      const svgEl = flowCardRef.current?.querySelector("svg");
      if (!svgEl) throw new Error("No diagram");
      const canvas=await window.html2canvas(svgEl,{scale:2,backgroundColor:"#0f0e1a",useCORS:true,logging:false});
      triggerDownload(canvas.toDataURL("image/jpeg",0.95),`${title||"diagram"}-flow.jpg`);
    } catch(e){setDlError("JPG failed: "+e.message);}
    finally{setDlBusy("");}
  };

  const dlDiagramSvg = () => {
    setDlError("");
    try {
      const svgEl=flowCardRef.current?.querySelector("svg");
      if(!svgEl)throw new Error("No diagram");
      const clone=svgEl.cloneNode(true);
      clone.setAttribute("xmlns","http://www.w3.org/2000/svg");
      clone.setAttribute("style","background:#0f0e1a");
      const blob=new Blob([clone.outerHTML],{type:"image/svg+xml"});
      const url=URL.createObjectURL(blob);
      triggerDownload(url,`${title||"diagram"}.svg`);
      setTimeout(()=>URL.revokeObjectURL(url),2000);
    } catch(e){setDlError("SVG failed: "+e.message);}
  };

  const reset = () => {
    setImage(null);setImageB64(null);setStep("upload");
    setNotes("");setFlowNodes({});setFlowEdges([]);
    setError("");setDlError("");setTitle("");
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400;1,600&family=DM+Mono:wght@400;500&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        body{background:#0f0e1a;-webkit-font-smoothing:antialiased}

        :root {
          --bg: #0f0e1a;
          --surface: #16142a;
          --surface2: #1e1b35;
          --border: rgba(139,92,246,0.15);
          --border2: rgba(139,92,246,0.08);
          --accent: #7c3aed;
          --accent2: #a78bfa;
          --text: #e2d9f3;
          --muted: #6b5f8f;
          --muted2: #3d3560;
        }

        .app{min-height:100vh;background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif}

        /* Background texture */
        .app::before{content:'';position:fixed;inset:0;z-index:0;pointer-events:none;
          background:radial-gradient(ellipse at 20% 10%,rgba(124,58,237,0.08) 0%,transparent 50%),
                     radial-gradient(ellipse at 80% 90%,rgba(59,130,246,0.05) 0%,transparent 50%)}

        .wrap{position:relative;z-index:1;max-width:1140px;margin:0 auto;padding:44px 24px 80px}

        /* ── HEADER ── */
        .hdr{margin-bottom:44px;display:flex;align-items:flex-end;gap:24px;flex-wrap:wrap}
        .hdr-left{flex:1}
        .hdr-eyebrow{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:var(--accent2);margin-bottom:12px;display:flex;align-items:center;gap:10px}
        .hdr-eyebrow::before{content:'';width:24px;height:1px;background:var(--accent2)}
        h1{font-family:'Cormorant Garamond',serif;font-size:clamp(36px,5.5vw,62px);font-weight:700;line-height:1.05;color:var(--text)}
        h1 em{font-style:italic;color:var(--accent2);font-weight:400}

        /* ── DROP ZONE ── */
        .drop{border:1.5px dashed var(--border);background:rgba(124,58,237,0.03);border-radius:16px;padding:72px 40px;text-align:center;cursor:pointer;transition:all .3s}
        .drop:hover,.drop.over{border-color:rgba(139,92,246,0.45);background:rgba(124,58,237,0.07);transform:translateY(-2px)}
        .drop-icon{font-size:52px;display:block;margin-bottom:18px;filter:drop-shadow(0 0 20px rgba(124,58,237,0.3))}
        .drop-title{font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:600;color:var(--text);margin-bottom:8px}
        .drop-sub{color:var(--muted);font-size:13px}

        .img-prev{border-radius:14px;overflow:hidden;border:1px solid var(--border);margin-bottom:16px;position:relative}
        .img-prev img{width:100%;max-height:300px;object-fit:contain;background:var(--surface);display:block}
        .img-badge{position:absolute;top:12px;left:12px;background:var(--accent);color:#fff;font-family:'DM Mono',monospace;font-size:9px;letter-spacing:2px;padding:4px 12px;border-radius:100px;text-transform:uppercase}

        /* ── BUTTONS ── */
        .btn{font-family:'DM Mono',monospace;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:500;border:none;cursor:pointer;border-radius:10px;display:inline-flex;align-items:center;gap:8px;transition:all .2s;padding:12px 22px;white-space:nowrap}
        .btn:disabled{opacity:.4;cursor:not-allowed}
        .btn-main{background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;width:100%;justify-content:center;font-size:12px;padding:17px;border-radius:12px;letter-spacing:2px;box-shadow:0 4px 24px rgba(124,58,237,0.3)}
        .btn-main:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 8px 32px rgba(124,58,237,0.4)}
        .btn-ghost{background:rgba(255,255,255,0.04);border:1px solid var(--border2);color:var(--muted)}
        .btn-ghost:hover{border-color:var(--border);color:var(--accent2)}
        .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}

        /* ── LOADING ── */
        .loading-wrap{text-align:center;padding:64px 20px}
        .spin{width:48px;height:48px;border-radius:50%;border:2px solid rgba(124,58,237,0.1);border-top-color:#7c3aed;animation:spin .9s linear infinite;margin:0 auto 20px;box-shadow:0 0 20px rgba(124,58,237,0.2)}
        @keyframes spin{to{transform:rotate(360deg)}}
        .loading-wrap p{font-family:'DM Mono',monospace;font-size:11px;letter-spacing:3px;color:var(--muted);animation:fade 2s ease infinite}
        @keyframes fade{0%,100%{opacity:.3}50%{opacity:1}}
        .err{background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:10px;padding:12px 16px;color:#fca5a5;font-size:12px;margin-top:14px;font-family:'DM Mono',monospace;white-space:pre-wrap}

        /* ── RESULT ── */
        .res-hdr{margin-bottom:28px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}
        .res-eyebrow{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:var(--muted);margin-bottom:5px}
        .res-title{font-family:'Cormorant Garamond',serif;font-size:30px;font-weight:700;color:var(--text);line-height:1.1}

        /* ── TWO COL ── */
        .two-col{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:14px}
        @media(max-width:760px){.two-col{grid-template-columns:1fr}}

        /* ── CARD ── */
        .card{background:var(--surface);border:1px solid var(--border2);border-radius:16px;overflow:hidden;display:flex;flex-direction:column}
        .card-head{background:rgba(124,58,237,0.04);border-bottom:1px solid var(--border2);padding:13px 20px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
        .card-label{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:var(--muted)}
        .toggle-group{display:flex;gap:2px;background:rgba(0,0,0,0.3);border-radius:8px;padding:3px}
        .toggle-btn{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;padding:5px 12px;border:none;border-radius:5px;cursor:pointer;background:transparent;color:var(--muted2);transition:all .15s}
        .toggle-btn.active{background:var(--accent);color:#fff}

        /* ── NOTES ── */
        .notes-ta{width:100%;min-height:440px;background:transparent;border:none;outline:none;padding:22px;color:#c4b5fd;font-family:'DM Mono',monospace;font-size:13px;line-height:1.75;resize:vertical;flex:1}
        .notes-ta::placeholder{color:var(--muted2)}
        .notes-prev{padding:22px 26px;min-height:440px;overflow:auto;flex:1}

        .nc h1{font-family:'Cormorant Garamond',serif;font-size:21px;font-weight:700;color:var(--text);margin:0 0 14px;padding-bottom:10px;border-bottom:1px solid var(--border2)}
        .nc h2{font-family:'Cormorant Garamond',serif;font-size:17px;font-weight:600;color:#c4b5fd;margin:20px 0 8px}
        .nc h3{font-family:'DM Mono',monospace;font-size:10px;font-weight:500;color:var(--accent2);margin:14px 0 6px;text-transform:uppercase;letter-spacing:2px}
        .nc p{font-size:13.5px;line-height:1.8;color:#b0a0d0;margin-bottom:10px}
        .nc ul{list-style:none;padding:0;margin:6px 0 12px}
        .nc ol{padding-left:20px;margin:6px 0 12px}
        .nc li{font-size:13px;line-height:1.75;color:#c4b5fd;padding:2px 0 2px 18px;position:relative}
        .nc ul li::before{content:'◈';position:absolute;left:0;color:var(--accent2);font-size:8px;top:8px}
        .nc ol li{padding-left:0;list-style:decimal;color:#c4b5fd}
        .nc ol li::before{display:none}
        .nc strong{color:var(--text);font-weight:600}
        .nc em{color:#e9a8fd;font-style:italic}
        .nc code{background:rgba(124,58,237,0.15);color:#c4b5fd;padding:2px 7px;border-radius:4px;font-family:'DM Mono',monospace;font-size:11px}
        .nc hr{border:none;border-top:1px solid var(--border2);margin:16px 0}

        /* ── DOWNLOAD STRIP ── */
        .dl-strip{display:flex;gap:8px;flex-wrap:wrap;padding:10px 16px;background:rgba(0,0,0,0.25);border-top:1px solid var(--border2);flex-shrink:0}
        .dl-btn{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;font-weight:500;border:none;cursor:pointer;border-radius:7px;display:inline-flex;align-items:center;gap:5px;padding:7px 13px;transition:all .2s}
        .dl-btn:disabled{opacity:.4;cursor:not-allowed}
        .dl-jpg{background:rgba(251,146,60,0.1);border:1px solid rgba(251,146,60,0.25);color:#fdba74}
        .dl-jpg:hover:not(:disabled){background:rgba(251,146,60,0.18)}
        .dl-doc{background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.25);color:#a5b4fc}
        .dl-doc:hover:not(:disabled){background:rgba(99,102,241,0.18)}
        .dl-svg{background:rgba(52,211,153,0.1);border:1px solid rgba(52,211,153,0.25);color:#6ee7b7}
        .dl-svg:hover:not(:disabled){background:rgba(52,211,153,0.18)}

        /* ── FLOW EDITOR ── */
        .fe-toolbar{display:flex;align-items:center;gap:6px;padding:9px 14px;background:rgba(0,0,0,0.3);border-bottom:1px solid var(--border2);flex-shrink:0;flex-wrap:wrap;min-height:48px}
        .fe-btn{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.5px;padding:6px 11px;border:1px solid var(--border);background:rgba(124,58,237,0.08);color:var(--accent2);border-radius:6px;cursor:pointer;transition:all .15s;white-space:nowrap}
        .fe-btn:hover{background:rgba(124,58,237,0.18);border-color:var(--accent)}
        .fe-btn-connect{background:rgba(6,182,212,0.08);border-color:rgba(6,182,212,0.25);color:#67e8f9}
        .fe-btn-connect:hover{background:rgba(6,182,212,0.18)}
        .fe-btn-edit{background:rgba(52,211,153,0.08);border-color:rgba(52,211,153,0.25);color:#6ee7b7}
        .fe-btn-edit:hover{background:rgba(52,211,153,0.18)}
        .fe-btn-del{background:rgba(239,68,68,0.08);border-color:rgba(239,68,68,0.25);color:#fca5a5}
        .fe-btn-del:hover{background:rgba(239,68,68,0.18)}
        .fe-sel{font-family:'DM Mono',monospace;font-size:9px;padding:6px 8px;border:1px solid var(--border);background:var(--surface2);color:var(--text);border-radius:6px;cursor:pointer}
        .fe-zoom{font-family:'DM Mono',monospace;font-size:9px;color:var(--muted);min-width:30px;text-align:center}
        .fe-hint{font-family:'DM Mono',monospace;font-size:9px;color:#c084fc;letter-spacing:1px;animation:fade 1.5s ease infinite}
        .fe-hint-bar{font-family:'DM Mono',monospace;font-size:9px;color:var(--muted2);letter-spacing:.5px;text-align:center;padding:6px;flex-shrink:0}

        /* ── EDIT POPUP ── */
        .ep-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:200;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)}
        .ep{background:var(--surface2);border:1px solid var(--border);border-radius:14px;padding:22px;width:280px;box-shadow:0 24px 80px rgba(0,0,0,0.6),0 0 0 1px rgba(124,58,237,0.2)}
        .ep-title{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:var(--muted);margin-bottom:12px}
        .ep-input{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px 12px;color:var(--text);font-family:'DM Sans',sans-serif;font-size:14px;outline:none;margin-bottom:12px;transition:border-color .15s}
        .ep-input:focus{border-color:var(--accent)}
        .ep-row{display:flex;gap:8px}
        .ep-ok{flex:1;font-family:'DM Mono',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;padding:9px;border:none;border-radius:8px;cursor:pointer;background:var(--accent);color:#fff;font-weight:500}
        .ep-ok:hover{background:#6d28d9}
        .ep-cancel{flex:1;font-family:'DM Mono',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;padding:9px;border:1px solid var(--border2);border-radius:8px;cursor:pointer;background:transparent;color:var(--muted)}

        /* ── BOTTOM ── */
        .sep{height:1px;background:linear-gradient(90deg,transparent,var(--border),transparent);margin:20px 0}
        .dl-err{background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.2);border-radius:8px;padding:10px 14px;color:#fca5a5;font-size:11px;margin-top:10px;font-family:'DM Mono',monospace}
      `}</style>

      <div className="app">
        <div className="wrap">
          {/* HEADER */}
          <div className="hdr">
            <div className="hdr-left">
              <div className="hdr-eyebrow">Smart Notes Reader</div>
              <h1>Your scribbles,<br /><em>perfectly structured.</em></h1>
            </div>
          </div>

          {/* UPLOAD */}
          {step==="upload" && (
            <div>
              {!image ? (
                <div className={`drop ${dragOver?"over":""}`}
                  onDragOver={e=>{e.preventDefault();setDragOver(true)}}
                  onDragLeave={()=>setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={()=>fileRef.current.click()}>
                  <span className="drop-icon">📓</span>
                  <div className="drop-title">Drop your handwritten notes</div>
                  <div className="drop-sub" style={{marginTop:7}}>Any photo · any handwriting · any angle</div>
                  <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])} />
                </div>
              ) : (
                <div>
                  <div className="img-prev">
                    <span className="img-badge">Ready</span>
                    <img src={image} alt="preview" />
                  </div>
                  <div className="row" style={{marginBottom:14}}>
                    <button className="btn btn-ghost" onClick={reset}>↩ Change</button>
                  </div>
                </div>
              )}
              {loading
                ? <div className="loading-wrap"><div className="spin"/><p>{loadMsg}</p></div>
                : <button className="btn btn-main" style={{marginTop:22}} disabled={!image||loading} onClick={analyze}>◈ &nbsp;READ & STRUCTURE NOTES</button>
              }
              {error && <div className="err">⚠ {error}</div>}
            </div>
          )}

          {/* RESULT */}
          {step==="result" && (
            <div>
              <div className="res-hdr">
                <div>
                  <div className="res-eyebrow">Structured from handwriting</div>
                  <div className="res-title">{title}</div>
                </div>
                <button className="btn btn-ghost" onClick={reset}>↩ New image</button>
              </div>

              <div className="two-col">
                {/* NOTES */}
                <div className="card" ref={notesCardRef}>
                  <div className="card-head">
                    <span className="card-label">📝 Notes</span>
                    <div className="toggle-group">
                      <button className={`toggle-btn ${notesMode==="preview"?"active":""}`} onClick={()=>setNotesMode("preview")}>Preview</button>
                      <button className={`toggle-btn ${notesMode==="edit"?"active":""}`} onClick={()=>setNotesMode("edit")}>Edit</button>
                    </div>
                  </div>
                  {notesMode==="edit"
                    ? <textarea className="notes-ta" value={notes} onChange={e=>setNotes(e.target.value)} spellCheck={false} placeholder="Your notes…"/>
                    : <div className="notes-prev nc" dangerouslySetInnerHTML={{__html:mdToHtml(notes)}}/>
                  }
                  <div className="dl-strip">
                    <button className="dl-btn dl-jpg" disabled={dlBusy==="notes-jpg"} onClick={dlNotesJpg}>
                      {dlBusy==="notes-jpg"?"…":"🖼"} JPG
                    </button>
                    <button className="dl-btn dl-doc" disabled={dlBusy==="notes-docx"} onClick={dlNotesDocx}>
                      {dlBusy==="notes-docx"?"…":"📄"} DOCX
                    </button>
                  </div>
                </div>

                {/* DIAGRAM */}
                <div className="card" ref={flowCardRef} style={{minHeight:520}}>
                  <div className="card-head">
                    <span className="card-label">⬡ Visual Diagram</span>
                    <span style={{fontFamily:"'DM Mono',monospace",fontSize:8,color:"var(--muted2)",letterSpacing:2}}>INTERACTIVE EDITOR</span>
                  </div>
                  <FlowEditor nodes={flowNodes} edges={flowEdges}
                    onChange={(n,e)=>{setFlowNodes(n);setFlowEdges(e);}} />
                  <div className="dl-strip">
                    <button className="dl-btn dl-jpg" disabled={dlBusy==="diag-jpg"} onClick={dlDiagramJpg}>
                      {dlBusy==="diag-jpg"?"…":"🖼"} JPG
                    </button>
                    <button className="dl-btn dl-svg" onClick={dlDiagramSvg}>⬡ SVG</button>
                  </div>
                </div>
              </div>

              {dlError && <div className="dl-err">⚠ {dlError}</div>}
              <div className="sep"/>
              <button className="btn btn-ghost" onClick={reset}>✕ Start over</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

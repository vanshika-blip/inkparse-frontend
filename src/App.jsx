import { useState, useRef, useCallback } from "react";

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
    lvN.forEach((n,i) => { n.x=i*240+60; n.y=Number(lv)*120+60; });
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

// ── NODE PALETTE — warm ink tones ─────────────────────────────────────────────
const PALETTE = [
  { fill:"#2c1810", stroke:"#8b5e3c", text:"#f5f0e8", glow:"rgba(139,94,60,0.35)" },
  { fill:"#1a2a1a", stroke:"#5a7a3a", text:"#f0f5e8", glow:"rgba(90,122,58,0.35)" },
  { fill:"#1a1a2a", stroke:"#4a5a8a", text:"#e8ecf5", glow:"rgba(74,90,138,0.35)" },
  { fill:"#2a1a10", stroke:"#a0622a", text:"#f5ede0", glow:"rgba(160,98,42,0.35)" },
  { fill:"#2a1a2a", stroke:"#7a3a6a", text:"#f5e8f2", glow:"rgba(122,58,106,0.35)" },
  { fill:"#101a2a", stroke:"#2a6a8a", text:"#e0eef5", glow:"rgba(42,106,138,0.35)" },
];

const NW = 164, NH = 52;

function getNodeColor(id, nodes) {
  return PALETTE[Object.keys(nodes).indexOf(id) % PALETTE.length];
}

function NodeShape({ n, col, selected, onMouseDown, onDoubleClick }) {
  const { x, y } = n;
  const w = NW, h = NH;
  const filter = selected
    ? `drop-shadow(0 0 10px ${col.glow}) drop-shadow(0 2px 8px rgba(0,0,0,0.3))`
    : `drop-shadow(0 2px 6px rgba(0,0,0,0.15))`;
  const commonProps = {
    fill: col.fill, stroke: selected ? col.text : col.stroke,
    strokeWidth: selected ? 2 : 1.5, filter,
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
        fill={col.text} fontSize={11.5} fontFamily="'Lora',serif" fontStyle="italic"
        style={{ pointerEvents:"none", userSelect:"none" }}>
        {n.label.length>20 ? n.label.slice(0,18)+"…" : n.label}
      </text>
      {selected && (
        <circle cx={x+w} cy={y+h/2} r={7} fill={col.stroke} stroke="#f5f0e8" strokeWidth={1.5}
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
  const [zoom, setZoom] = useState(0.9);
  const [editPopup, setEditPopup] = useState(null);
  const nodesR = useRef(nodes); nodesR.current = nodes;
  const edgesR = useRef(edges); edgesR.current = edges;

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
  const onWheel = e => { e.preventDefault(); setZoom(z=>Math.max(0.25,Math.min(2,z-e.deltaY*0.001))); };

  // Touch support for mobile panning
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
    const stroke=isSel?"#8b5e3c":"#c4b8a0";
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
              fill="#f5f0e8" stroke={stroke} strokeWidth={1} />
            <text x={midX} y={midY+1} textAnchor="middle" dominantBaseline="middle"
              fill="#5c4a35" fontSize={10} fontFamily="'Lora',serif" fontStyle="italic">{e.label}</text>
          </g>
        )}
        {isSel && (
          <g style={{cursor:"pointer"}} onClick={ev=>{ev.stopPropagation();deleteEdge(i);}}>
            <circle cx={midX} cy={midY} r={10} fill="#8b3a2a" stroke="#d4907a" strokeWidth={1.5} />
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
      stroke="#8b5e3c" strokeWidth={1.5} strokeDasharray="5 3" style={{pointerEvents:"none"}} />;
  };

  return (
    <div style={{display:"flex",flexDirection:"column",flex:1,minHeight:0}}>
      {/* Toolbar */}
      <div className="fe-toolbar">
        <button className="fe-btn" onClick={addNode}>✦ Add Node</button>
        {selNode && <>
          <button className="fe-btn fe-btn-connect" onClick={()=>setConnecting(connecting?null:selNode)}>
            {connecting===selNode?"✕ Cancel":"→ Connect"}
          </button>
          <select className="fe-sel" value={nodes[selNode]?.shape||"rect"} onChange={e=>{
            onChange({...nodesR.current,[selNode]:{...nodesR.current[selNode],shape:e.target.value}},edgesR.current);
          }}>
            <option value="rect">▭ Box</option>
            <option value="round">◉ Pill</option>
            <option value="diamond">◇ Diamond</option>
          </select>
          <button className="fe-btn fe-btn-edit" onClick={()=>setEditPopup({type:"node",id:selNode,label:nodes[selNode]?.label||""})}>
            ✎ Label
          </button>
          <button className="fe-btn fe-btn-del" onClick={()=>deleteNode(selNode)}>✕</button>
        </>}
        {selEdge!==null&&!selNode && (
          <button className="fe-btn fe-btn-edit" onClick={()=>setEditPopup({type:"edge",id:selEdge,label:edges[selEdge]?.label||""})}>
            ✎ Edge Label
          </button>
        )}
        {connecting && <span className="fe-hint">→ Click a node to connect</span>}
        <div style={{flex:1}}/>
        <button className="fe-btn" onClick={()=>setZoom(z=>Math.min(2,z+0.15))}>＋</button>
        <span className="fe-zoom">{Math.round(zoom*100)}%</span>
        <button className="fe-btn" onClick={()=>setZoom(z=>Math.max(0.25,z-0.15))}>－</button>
        <button className="fe-btn" onClick={()=>{setZoom(0.9);setPan({x:40,y:20});}}>⊡</button>
      </div>

      {/* Canvas */}
      <svg ref={svgRef} style={{flex:1,minHeight:500,display:"block",cursor:panningSt?"grabbing":connecting?"crosshair":"grab",background:"transparent",touchAction:"none"}}
        onMouseDown={onSvgMD} onMouseMove={onMM} onMouseUp={onMU} onWheel={onWheel}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        <defs>
          <marker id="arrow" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0,10 3.5,0 7" fill="#c4b8a0" />
          </marker>
          <marker id="arrow-sel" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0,10 3.5,0 7" fill="#8b5e3c" />
          </marker>
          <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="rgba(139,115,85,0.18)" />
          </pattern>
        </defs>
        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          <rect x="-2000" y="-2000" width="6000" height="6000" fill="url(#dots)" />
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

      <div className="fe-hint-bar">Double-click to edit · Drag to move · Select + → Connect · Scroll to zoom</div>

      {editPopup && (
        <div className="ep-overlay" onClick={()=>setEditPopup(null)}>
          <div className="ep" onClick={e=>e.stopPropagation()}>
            <div className="ep-title">{editPopup.type==="node"?"Edit Label":"Edge Label"}</div>
            <input className="ep-input" autoFocus value={editPopup.label}
              onChange={e=>setEditPopup({...editPopup,label:e.target.value})}
              onKeyDown={e=>{if(e.key==="Enter")saveEdit();if(e.key==="Escape")setEditPopup(null);}}
              placeholder="Enter label..." />
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
  const cameraRef    = useRef();
  const notesCardRef = useRef();
  const flowCardRef  = useRef();

  const BACKEND_URL = "https://inkparse-backend.onrender.com";

  const handleFile = file => {
    if (!file||!file.type.startsWith("image/")) return;
    setImageMime(file.type||"image/jpeg");
    const r=new FileReader();
    r.onload=e=>{setImage(e.target.result);setImageB64(e.target.result.split(",")[1]);};
    r.readAsDataURL(file);
  };

  const handleDrop = useCallback(e=>{e.preventDefault();setDragOver(false);handleFile(e.dataTransfer.files[0]);}, []);

  const analyze = async () => {
    if (!imageB64) return;
    setLoading(true); setError(""); setDlError("");
    setLoadMsg("Sending to Scrivly…");
    try {
      const res = await fetch(`${BACKEND_URL}/api/analyze`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({imageBase64:imageB64,imageMime})
      });
      setLoadMsg("Reading your handwriting…");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error||`Error ${res.status}`);
      setTitle(data.title||"Notes");
      setNotes(data.notes||"");
      setLoadMsg("Building diagram…");
      const code=(data.mermaidCode||"flowchart TD\n  A([Start]) --> B[Content]").replace(/```[\w]*\n?/g,"").trim();
      const {nodes:n,edges:e}=parseMermaidToGraph(code);
      setFlowNodes(n); setFlowEdges(e);
      setStep("result");
    } catch(e) {
      setError(e.message.includes("fetch")||e.message.includes("Failed")
        ? "Cannot reach backend. Make sure inkparse-server.js is running."
        : e.message);
    }
    finally { setLoading(false); }
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
      const canvas=await window.html2canvas(notesCardRef.current,{scale:2,backgroundColor:"#f5f0e8",useCORS:true,logging:false});
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
      const svgEl=flowCardRef.current?.querySelector("svg");
      if(!svgEl)throw new Error("No diagram");
      const canvas=await window.html2canvas(svgEl,{scale:2,backgroundColor:"#faf7f2",useCORS:true,logging:false});
      triggerDownload(canvas.toDataURL("image/jpeg",0.95),`${title||"diagram"}.jpg`);
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
      clone.setAttribute("style","background:#faf7f2");
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
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Lora:ital,wght@0,400;0,500;0,600;1,400;1,500&family=DM+Mono:wght@400;500&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html{scroll-behavior:smooth}

        :root{
          --bg:#f5f0e8;
          --bg2:#faf7f2;
          --surface:#fff9f0;
          --border:#d4c9b0;
          --border2:#e8dfd0;
          --ink:#2c1810;
          --ink2:#5c4a35;
          --ink3:#8b7355;
          --accent:#8b5e3c;
          --accent2:#a0724e;
          --muted:#c4b8a0;
          --red:#8b3a2a;
        }

        body{background:var(--bg);color:var(--ink);font-family:'Lora',serif;-webkit-font-smoothing:antialiased}

        /* paper texture overlay */
        body::before{content:'';position:fixed;inset:0;z-index:0;pointer-events:none;
          background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4'%3E%3Crect width='4' height='4' fill='%23f5f0e8'/%3E%3Ccircle cx='1' cy='1' r='0.5' fill='%23c4b8a0' opacity='0.3'/%3E%3C/svg%3E");
          opacity:0.6}

        .app{min-height:100vh;position:relative;z-index:1}
        .wrap{width:100%;padding:40px 48px 100px}

        /* ── HEADER ── */
        .hdr{margin-bottom:44px;border-bottom:1px solid var(--border2);padding-bottom:24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px}
        .hdr-brand{display:flex;align-items:center;gap:14px}
        .hdr-icon{font-size:28px}
        .brand-name{font-family:'Playfair Display',serif;font-size:28px;font-weight:700;color:var(--ink);letter-spacing:-0.5px}
        .brand-name em{font-style:italic;color:var(--accent)}
        .hdr-tagline{font-family:'Lora',serif;font-size:12px;color:var(--ink3);font-style:italic}
        .hdr-right{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:var(--muted)}

        /* ── PAGE TITLE ── */
        .page-title{margin-bottom:36px}
        .eyebrow{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:4px;text-transform:uppercase;color:var(--ink3);margin-bottom:14px;display:flex;align-items:center;gap:10px}
        .eyebrow::before{content:'';width:20px;height:1px;background:var(--ink3)}
        h1{font-family:'Playfair Display',serif;font-size:clamp(38px,5vw,64px);font-weight:700;line-height:1.05;color:var(--ink)}
        h1 em{font-style:italic;color:var(--accent);font-weight:400}

        /* ── DROP ZONE ── */
        .drop{border:1.5px dashed var(--border);background:var(--surface);border-radius:14px;padding:72px 40px;text-align:center;cursor:pointer;transition:all .3s;position:relative}
        .drop:hover,.drop.over{border-color:var(--accent);background:#fdf8f0;transform:translateY(-2px);box-shadow:0 8px 32px rgba(139,94,60,0.08)}
        .drop-icon{font-size:48px;display:block;margin-bottom:18px}
        .drop-title{font-family:'Playfair Display',serif;font-size:22px;font-weight:600;color:var(--ink);margin-bottom:8px;font-style:italic}
        .drop-sub{color:var(--ink3);font-size:13px;font-family:'Lora',serif;font-style:italic}

        .img-prev{border-radius:12px;overflow:hidden;border:1px solid var(--border);margin-bottom:18px;position:relative;box-shadow:0 4px 24px rgba(0,0,0,0.08)}
        .img-prev img{width:100%;max-height:300px;object-fit:contain;background:var(--surface);display:block}
        .img-badge{position:absolute;top:12px;left:12px;background:var(--ink);color:var(--bg);font-family:'DM Mono',monospace;font-size:8px;letter-spacing:2px;padding:4px 12px;border-radius:100px;text-transform:uppercase}

        /* ── BUTTONS ── */
        .btn{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;font-weight:500;border:none;cursor:pointer;border-radius:8px;display:inline-flex;align-items:center;gap:8px;transition:all .2s;padding:11px 20px;white-space:nowrap}
        .btn:disabled{opacity:.4;cursor:not-allowed}
        .btn-main{background:var(--ink);color:var(--bg);width:100%;justify-content:center;padding:16px;border-radius:10px;font-size:11px;letter-spacing:2.5px;box-shadow:0 4px 20px rgba(44,24,16,0.2)}
        .btn-main:hover:not(:disabled){background:#3d2015;transform:translateY(-1px);box-shadow:0 8px 28px rgba(44,24,16,0.25)}
        .btn-ghost{background:transparent;border:1px solid var(--border);color:var(--ink2)}
        .btn-ghost:hover{border-color:var(--accent);color:var(--accent)}
        .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}

        /* ── LOADING ── */
        .loading-wrap{text-align:center;padding:64px 20px}
        .spin{width:40px;height:40px;border-radius:50%;border:1.5px solid var(--border2);border-top-color:var(--accent);animation:spin .9s linear infinite;margin:0 auto 18px}
        @keyframes spin{to{transform:rotate(360deg)}}
        .loading-wrap p{font-family:'Lora',serif;font-size:13px;font-style:italic;color:var(--ink3);animation:fade 2s ease infinite}
        @keyframes fade{0%,100%{opacity:.3}50%{opacity:1}}
        .err{background:rgba(139,58,42,0.06);border:1px solid rgba(139,58,42,0.2);border-radius:8px;padding:12px 16px;color:var(--red);font-size:12px;margin-top:14px;font-family:'DM Mono',monospace;white-space:pre-wrap}

        /* ── RESULT ── */
        .res-hdr{margin-bottom:32px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding-bottom:22px;border-bottom:1px solid var(--border2)}
        .res-eyebrow{font-family:'DM Mono',monospace;font-size:8px;letter-spacing:3px;text-transform:uppercase;color:var(--ink3);margin-bottom:5px}
        .res-title{font-family:'Playfair Display',serif;font-size:26px;font-weight:700;color:var(--ink);font-style:italic;line-height:1.1}

        /* ── TWO COL ── */
        .two-col{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:16px;align-items:stretch}
        @media(max-width:760px){.two-col{grid-template-columns:1fr}}

        /* ── CARD ── */
        .card{background:var(--surface);border:1px solid var(--border2);border-radius:16px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 4px 24px rgba(44,24,16,0.07);height:100%}
        .card-head{background:var(--bg2);border-bottom:1px solid var(--border2);padding:12px 20px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
        .card-label{font-family:'DM Mono',monospace;font-size:8px;letter-spacing:3px;text-transform:uppercase;color:var(--ink3)}
        .toggle-group{display:flex;gap:2px;background:var(--border2);border-radius:6px;padding:2px}
        .toggle-btn{font-family:'DM Mono',monospace;font-size:8px;letter-spacing:1px;text-transform:uppercase;padding:4px 10px;border:none;border-radius:4px;cursor:pointer;background:transparent;color:var(--ink3);transition:all .15s}
        .toggle-btn.active{background:var(--ink);color:var(--bg)}

        /* ── NOTES ── */
        .notes-ta{width:100%;min-height:560px;background:transparent;border:none;outline:none;padding:24px;color:var(--ink2);font-family:'DM Mono',monospace;font-size:12px;line-height:1.8;resize:vertical;flex:1}
        .notes-prev{padding:28px 32px;min-height:560px;overflow:auto;flex:1}

        .nc h1{font-family:'Playfair Display',serif;font-size:20px;font-weight:700;color:var(--ink);margin:0 0 14px;padding-bottom:10px;border-bottom:1px solid var(--border2);font-style:italic}
        .nc h2{font-family:'Playfair Display',serif;font-size:16px;font-weight:600;color:var(--ink2);margin:20px 0 8px;font-style:italic}
        .nc h3{font-family:'DM Mono',monospace;font-size:9px;font-weight:500;color:var(--ink3);margin:14px 0 6px;text-transform:uppercase;letter-spacing:2px}
        .nc p{font-size:13.5px;line-height:1.85;color:var(--ink2);margin-bottom:10px;font-family:'Lora',serif}
        .nc ul{list-style:none;padding:0;margin:6px 0 12px}
        .nc ol{padding-left:20px;margin:6px 0 12px}
        .nc li{font-size:13px;line-height:1.8;color:var(--ink2);padding:2px 0 2px 18px;position:relative;font-family:'Lora',serif}
        .nc ul li::before{content:'✦';position:absolute;left:0;color:var(--accent);font-size:7px;top:8px}
        .nc ol li{padding-left:0;list-style:decimal}
        .nc ol li::before{display:none}
        .nc strong{color:var(--ink);font-weight:700}
        .nc em{color:var(--accent2);font-style:italic}
        .nc code{background:rgba(139,94,60,0.08);color:var(--accent);padding:2px 6px;border-radius:3px;font-family:'DM Mono',monospace;font-size:11px}
        .nc hr{border:none;border-top:1px solid var(--border2);margin:16px 0}

        /* ── DOWNLOAD STRIP ── */
        .dl-strip{display:flex;gap:8px;flex-wrap:wrap;padding:10px 16px;background:var(--bg2);border-top:1px solid var(--border2);flex-shrink:0}
        .dl-btn{font-family:'DM Mono',monospace;font-size:8px;letter-spacing:1px;text-transform:uppercase;font-weight:500;border:none;cursor:pointer;border-radius:6px;display:inline-flex;align-items:center;gap:5px;padding:7px 12px;transition:all .2s}
        .dl-btn:disabled{opacity:.4;cursor:not-allowed}
        .dl-jpg{background:rgba(139,94,60,0.08);border:1px solid rgba(139,94,60,0.2);color:var(--accent)}
        .dl-jpg:hover:not(:disabled){background:rgba(139,94,60,0.14)}
        .dl-doc{background:rgba(74,90,138,0.08);border:1px solid rgba(74,90,138,0.2);color:#4a5a8a}
        .dl-doc:hover:not(:disabled){background:rgba(74,90,138,0.14)}
        .dl-svg{background:rgba(90,122,58,0.08);border:1px solid rgba(90,122,58,0.2);color:#5a7a3a}
        .dl-svg:hover:not(:disabled){background:rgba(90,122,58,0.14)}

        /* ── FLOW EDITOR ── */
        .fe-toolbar{display:flex;align-items:center;gap:6px;padding:9px 14px;background:var(--bg2);border-bottom:1px solid var(--border2);flex-shrink:0;flex-wrap:wrap;min-height:46px}
        .fe-btn{font-family:'DM Mono',monospace;font-size:8px;letter-spacing:.5px;padding:5px 10px;border:1px solid var(--border);background:transparent;color:var(--ink2);border-radius:5px;cursor:pointer;transition:all .15s;white-space:nowrap}
        .fe-btn:hover{background:var(--border2);border-color:var(--accent);color:var(--accent)}
        .fe-btn-connect{border-color:rgba(74,90,138,0.3);color:#4a5a8a}
        .fe-btn-connect:hover{background:rgba(74,90,138,0.08)}
        .fe-btn-edit{border-color:rgba(90,122,58,0.3);color:#5a7a3a}
        .fe-btn-edit:hover{background:rgba(90,122,58,0.08)}
        .fe-btn-del{border-color:rgba(139,58,42,0.3);color:var(--red)}
        .fe-btn-del:hover{background:rgba(139,58,42,0.08)}
        .fe-sel{font-family:'DM Mono',monospace;font-size:8px;padding:5px 8px;border:1px solid var(--border);background:var(--bg);color:var(--ink);border-radius:5px;cursor:pointer}
        .fe-zoom{font-family:'DM Mono',monospace;font-size:8px;color:var(--ink3);min-width:28px;text-align:center}
        .fe-hint{font-family:'Lora',serif;font-size:11px;color:var(--accent);font-style:italic;animation:fade 1.5s ease infinite}
        .fe-hint-bar{font-family:'Lora',serif;font-size:10px;color:var(--muted);font-style:italic;text-align:center;padding:6px;flex-shrink:0}

        /* ── EDIT POPUP ── */
        .ep-overlay{position:fixed;inset:0;background:rgba(44,24,16,0.4);z-index:200;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px)}
        .ep{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:24px;width:300px;box-shadow:0 24px 80px rgba(0,0,0,0.15)}
        .ep-title{font-family:'Playfair Display',serif;font-size:15px;font-weight:600;color:var(--ink);margin-bottom:14px;font-style:italic}
        .ep-input{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:7px;padding:10px 12px;color:var(--ink);font-family:'Lora',serif;font-size:14px;outline:none;margin-bottom:12px;transition:border-color .15s}
        .ep-input:focus{border-color:var(--accent)}
        .ep-row{display:flex;gap:8px}
        .ep-ok{flex:1;font-family:'DM Mono',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;padding:9px;border:none;border-radius:7px;cursor:pointer;background:var(--ink);color:var(--bg);font-weight:500}
        .ep-ok:hover{background:#3d2015}
        .ep-cancel{flex:1;font-family:'DM Mono',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;padding:9px;border:1px solid var(--border);border-radius:7px;cursor:pointer;background:transparent;color:var(--ink3)}

        /* ── FOOTER STRIP ── */
        .sep{height:1px;background:var(--border2);margin:24px 0}
        .dl-err{background:rgba(139,58,42,0.06);border:1px solid rgba(139,58,42,0.15);border-radius:7px;padding:10px 14px;color:var(--red);font-size:11px;margin-top:10px;font-family:'DM Mono',monospace}

        /* ── FOOTER ── */
        .footer{margin-top:60px;padding-top:24px;border-top:1px solid var(--border2);text-align:center;font-family:'DM Mono',monospace;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--muted)}
        .footer em{font-style:italic;font-family:'Lora',serif;color:var(--ink3);letter-spacing:0;font-size:11px}

        /* ── UPLOAD / CAMERA BUTTONS ── */
        .upload-btns{display:flex;align-items:center;gap:12px;margin-top:16px;flex-wrap:wrap}
        .upload-opt{flex:1;min-width:140px;display:flex;flex-direction:column;align-items:center;gap:4px;padding:18px 16px;border:1.5px solid var(--border);border-radius:12px;background:var(--surface);cursor:pointer;transition:all .2s;text-align:center}
        .upload-opt:hover{border-color:var(--accent);background:#fdf8f0;transform:translateY(-2px);box-shadow:0 6px 20px rgba(139,94,60,0.1)}
        .upload-opt-camera{border-color:rgba(74,90,138,0.3);background:rgba(74,90,138,0.03)}
        .upload-opt-camera:hover{border-color:#4a5a8a;background:rgba(74,90,138,0.06);box-shadow:0 6px 20px rgba(74,90,138,0.1)}
        .upload-opt-icon{font-size:28px;line-height:1}
        .upload-opt-label{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--ink);font-weight:500;margin-top:4px}
        .upload-opt-sub{font-family:'Lora',serif;font-size:11px;color:var(--ink3);font-style:italic}
        .upload-divider{font-family:'Lora',serif;font-size:12px;color:var(--muted);font-style:italic;padding:0 4px;flex-shrink:0}

        /* ── UPLOAD HERO LAYOUT ── */
        .upload-layout{display:grid;grid-template-columns:1fr 1fr;gap:80px;align-items:center;min-height:70vh;padding:20px 0}
        .upload-left{display:flex;flex-direction:column;gap:0}
        .upload-left .eyebrow{margin-bottom:18px}
        .upload-left h1{margin-bottom:24px}
        .hero-desc{font-family:'Lora',serif;font-size:15px;line-height:1.85;color:var(--ink2);margin-bottom:32px;font-style:italic;max-width:420px}
        .hero-features{display:flex;flex-direction:column;gap:10px}
        .feat{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--ink3);display:flex;align-items:center;gap:10px}
        .feat::after{content:'';flex:1;height:1px;background:var(--border2)}
        .upload-right{display:flex;flex-direction:column;gap:0}
        .upload-right .drop{min-height:320px;display:flex;flex-direction:column;align-items:center;justify-content:center}

        /* ── RESPONSIVE: TABLET (max 900px) ── */
        @media(max-width:900px){
          .wrap{padding:32px 28px 80px}
          .upload-layout{grid-template-columns:1fr;gap:40px;min-height:auto;padding:0}
          .hero-desc{font-size:14px;margin-bottom:24px}
          .upload-right .drop{min-height:240px}
          .wrap{padding:36px 20px 80px}
          .hdr{margin-bottom:36px;padding-bottom:20px}
          .brand-name{font-size:24px}
          h1{font-size:clamp(32px,6vw,48px)}
          .two-col{grid-template-columns:1fr}
          .card{border-radius:12px}
          .hdr-right{display:none}
          .notes-prev,.notes-ta{min-height:320px}
          .card[style*="minHeight"]{min-height:420px!important}
        }

        /* ── RESPONSIVE: MOBILE (max 600px) ── */
        @media(max-width:600px){
          .wrap{padding:16px 16px 60px}
          .upload-layout{grid-template-columns:1fr;gap:28px;min-height:auto}
          .hero-desc{font-size:13px;margin-bottom:18px}
          .hero-features{display:none}
          .upload-btns{flex-direction:column;gap:8px}
          .upload-opt{width:100%;flex-direction:row;justify-content:center;gap:12px;padding:14px 16px}
          .upload-divider{display:none}
          .upload-right .drop{min-height:200px}
          .wrap{padding:20px 14px 60px}
          .hdr{margin-bottom:24px;padding-bottom:16px;flex-direction:row;align-items:center}
          .hdr-icon{font-size:22px}
          .brand-name{font-size:20px}
          .hdr-tagline{display:none}
          h1{font-size:clamp(28px,8vw,40px)}
          .eyebrow{font-size:8px;letter-spacing:3px;margin-bottom:10px}
          .page-title{margin-bottom:24px}

          /* Drop zone — tighter on mobile */
          .drop{padding:44px 24px;border-radius:12px}
          .drop-icon{font-size:38px;margin-bottom:12px}
          .drop-title{font-size:18px}
          .drop-sub{font-size:12px}

          /* Image preview */
          .img-prev img{max-height:220px}

          /* Main button — bigger tap target */
          .btn-main{padding:18px;font-size:11px;border-radius:12px;margin-top:16px!important}
          .btn{padding:12px 16px;font-size:9px}

          /* Cards stacked */
          .two-col{gap:14px}
          .card{border-radius:10px}
          .card-head{padding:10px 14px}
          .card-label{font-size:7px;letter-spacing:2px}

          /* Notes */
          .notes-prev{padding:16px 18px;min-height:260px}
          .notes-ta{padding:16px;min-height:260px;font-size:11px}
          .nc h1{font-size:17px}
          .nc h2{font-size:14px}
          .nc p,.nc li{font-size:12.5px}

          /* Download strip — scrollable row on mobile */
          .dl-strip{overflow-x:auto;flex-wrap:nowrap;padding:8px 12px;gap:6px;-webkit-overflow-scrolling:touch}
          .dl-btn{white-space:nowrap;flex-shrink:0;font-size:8px;padding:8px 12px}

          /* Flow editor toolbar — scrollable */
          .fe-toolbar{overflow-x:auto;flex-wrap:nowrap;padding:8px 12px;gap:6px;-webkit-overflow-scrolling:touch}
          .fe-btn{flex-shrink:0;padding:7px 10px;font-size:8px}
          .fe-hint-bar{font-size:9px;padding:5px 10px}

          /* Diagram canvas — touch friendly height */
          .card[style*="minHeight"]{min-height:340px!important}
          svg{min-height:300px!important;touch-action:none;flex:1}

          /* Result header */
          .res-hdr{flex-direction:column;align-items:flex-start;gap:8px;margin-bottom:18px;padding-bottom:14px}
          .res-title{font-size:20px}

          /* Edit popup — full width on mobile */
          .ep{width:calc(100vw - 40px);max-width:340px}

          /* Footer */
          .footer{margin-top:40px;font-size:8px}
          .footer em{font-size:10px}

          /* Error box */
          .err{font-size:11px;padding:10px 12px}
          .dl-err{font-size:10px;padding:8px 12px}

          /* Loading */
          .loading-wrap{padding:44px 16px}
        }

        /* ── RESPONSIVE: SMALL PHONE (max 380px) ── */
        @media(max-width:380px){
          .wrap{padding:16px 12px 50px}
          h1{font-size:26px}
          .drop{padding:36px 16px}
          .btn-main{font-size:10px;padding:16px}
          .brand-name{font-size:18px}
        }

        /* ── TOUCH: Remove hover effects on touch devices ── */
        @media(hover:none){
          .drop:hover{transform:none;box-shadow:none}
          .btn-main:hover:not(:disabled){transform:none;box-shadow:0 4px 20px rgba(44,24,16,0.2)}
          .fe-btn:hover{background:transparent;border-color:var(--border);color:var(--ink2)}
        }

        /* ── LARGE SCREENS (min 1400px) ── */
        @media(min-width:1400px){
          .wrap{padding:52px 80px 120px}
          .two-col{gap:32px}
          .notes-prev,.notes-ta{min-height:620px}
        }
      `}</style>

      <div className="app">
        <div className="wrap">

          {/* HEADER */}
          <div className="hdr">
            <div className="hdr-brand">
              <span className="hdr-icon">✒</span>
              <div>
                <div className="brand-name">Scri<em>vly</em></div>
                <div className="hdr-tagline">Handwriting to structured notes</div>
              </div>
            </div>
            <div className="hdr-right">Est. 2026 · AI Powered</div>
          </div>

          {/* UPLOAD */}
          {step==="upload" && (
            <div className="upload-layout">
              {/* LEFT — hero text */}
              <div className="upload-left">
                <div className="eyebrow">Smart Notes Reader</div>
                <h1>Your scribbles,<br/><em>perfectly structured.</em></h1>
                <p className="hero-desc">
                  Snap a photo of any handwritten notes — messy, rotated, sketchy — and Scrivly turns them into
                  clean structured text plus an interactive flowchart. Instantly.
                </p>
                <div className="hero-features">
                  <div className="feat">✦ Any handwriting style</div>
                  <div className="feat">✦ Auto flowchart generation</div>
                  <div className="feat">✦ Export JPG &amp; DOCX</div>
                </div>
              </div>

              {/* RIGHT — upload box */}
              <div className="upload-right">
                {!image ? (
                  <div>
                    <div className={`drop ${dragOver?"over":""}`}
                      onDragOver={e=>{e.preventDefault();setDragOver(true)}}
                      onDragLeave={()=>setDragOver(false)}
                      onDrop={handleDrop}
                      onClick={()=>fileRef.current.click()}>
                      <span className="drop-icon">📓</span>
                      <div className="drop-title">Drop or browse a photo</div>
                      <div className="drop-sub" style={{marginTop:6}}>Any photo · any handwriting · any angle</div>
                      <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])} />
                    </div>

                    {/* Upload / Camera buttons */}
                    <div className="upload-btns">
                      <button className="upload-opt" onClick={()=>fileRef.current.click()}>
                        <span className="upload-opt-icon">🖼</span>
                        <span className="upload-opt-label">Upload Photo</span>
                        <span className="upload-opt-sub">from your device</span>
                      </button>
                      <div className="upload-divider">or</div>
                      <button className="upload-opt upload-opt-camera" onClick={()=>cameraRef.current.click()}>
                        <span className="upload-opt-icon">📷</span>
                        <span className="upload-opt-label">Take a Photo</span>
                        <span className="upload-opt-sub">open camera now</span>
                      </button>
                      <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])} />
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="img-prev">
                      <span className="img-badge">Ready to read</span>
                      <img src={image} alt="preview" />
                    </div>
                    <div className="row" style={{marginBottom:14}}>
                      <button className="btn btn-ghost" onClick={reset}>↩ Change image</button>
                    </div>
                  </div>
                )}

                {loading
                  ? <div className="loading-wrap"><div className="spin"/><p>{loadMsg}</p></div>
                  : <button className="btn btn-main" style={{marginTop:20}} disabled={!image||loading} onClick={analyze}>
                      ✦ &nbsp; Read & Structure Notes
                    </button>
                }
                {error && <div className="err">⚠ {error}</div>}
              </div>
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
                    <span className="card-label">✦ Notes</span>
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
                    <button className="dl-btn dl-jpg" disabled={dlBusy==="notes-jpg"} onClick={dlNotesJpg}>{dlBusy==="notes-jpg"?"…":"🖼"} JPG</button>
                    <button className="dl-btn dl-doc" disabled={dlBusy==="notes-docx"} onClick={dlNotesDocx}>{dlBusy==="notes-docx"?"…":"📄"} DOCX</button>
                  </div>
                </div>

                {/* DIAGRAM */}
                <div className="card" ref={flowCardRef} style={{minHeight:"calc(100vh - 280px)"}}>                
                  <div className="card-head">
                    <span className="card-label">◈ Flow Diagram</span>
                    <span style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:"var(--muted)",letterSpacing:2,textTransform:"uppercase"}}>Interactive Editor</span>
                  </div>
                  <FlowEditor nodes={flowNodes} edges={flowEdges} onChange={(n,e)=>{setFlowNodes(n);setFlowEdges(e);}} />
                  <div className="dl-strip">
                    <button className="dl-btn dl-jpg" disabled={dlBusy==="diag-jpg"} onClick={dlDiagramJpg}>{dlBusy==="diag-jpg"?"…":"🖼"} JPG</button>
                    <button className="dl-btn dl-svg" onClick={dlDiagramSvg}>◈ SVG</button>
                  </div>
                </div>
              </div>

              {dlError && <div className="dl-err">⚠ {dlError}</div>}
              <div className="sep"/>
              <button className="btn btn-ghost" onClick={reset}>✕ Start over</button>
            </div>
          )}

          <div className="footer">
            Scrivly · <em>Turn your handwriting into knowledge</em>
          </div>
        </div>
      </div>
    </>
  );
}
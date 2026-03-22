import { useState, useEffect, useRef, useCallback, memo } from "react";

const BACKEND_URL = "https://inkparse-backend.onrender.com";

// ── Logo ──────────────────────────────────────────────────────────────────────
const ScribbleLogo = ({ size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <rect width="40" height="40" rx="8" fill="#111"/>
    <path d="M7 27 C9 23, 11 17, 14 21 C17 25, 18 13, 21 17 C24 21, 26 9, 29 15 C32 21, 34 19, 36 17"
      fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <rect x="8" y="11" width="8" height="6" rx="1.5" fill="none" stroke="#fff" strokeWidth="1.5"/>
  </svg>
);

// ── Mermaid lazy loader ───────────────────────────────────────────────────────
let mermaidLib = null, mermaidId = 0;
async function getMermaid() {
  if (!mermaidLib) {
    const mod = await import("https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs");
    mermaidLib = mod.default;
    mermaidLib.initialize({
      startOnLoad: false,
      theme: "default",
      themeVariables: {
        primaryColor: "#f0f0f0",
        primaryTextColor: "#111",
        primaryBorderColor: "#ddd",
        lineColor: "#555",
        background: "#fff",
        mainBkg: "#f9fafb",
        nodeBorder: "#ddd",
        clusterBkg: "#f9fafb",
        titleColor: "#111",
        edgeLabelBackground: "#fff",
      },
      flowchart: { curve: "basis", padding: 20 },
      fontSize: 13,
    });
  }
  return mermaidLib;
}

// ── Marked lazy loader ────────────────────────────────────────────────────────
let markedLib = null;
async function getMarked() {
  if (!markedLib) {
    const mod = await import("https://cdn.jsdelivr.net/npm/marked@12/src/marked.js");
    markedLib = mod.marked;
  }
  return markedLib;
}

// ── CSS ───────────────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap');

  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{
    --bg:#f5f5f5;
    --surf:#ffffff;
    --surf2:#f9fafb;
    --surf3:#f3f4f6;
    --border:#ebebeb;
    --border2:#e0e0e0;
    --ink:#111111;
    --ink2:#444444;
    --muted:#9ca3af;
    --muted2:#6b7280;
    --r:10px;
  }

  body{background:var(--bg);font-family:'Plus Jakarta Sans',sans-serif;color:var(--ink);min-height:100vh}
  .app{height:100vh;display:flex;flex-direction:column;overflow:hidden}

  .hdr{background:var(--surf);border-bottom:1px solid var(--border);padding:11px 20px;display:flex;align-items:center;gap:12px;flex-shrink:0;z-index:200;}
  .hdr-title h1{font-size:15px;font-weight:700;color:var(--ink);letter-spacing:-0.3px}
  .hdr-title p{font-size:10px;color:var(--muted);margin-top:1px;font-weight:400}
  .hdr-right{margin-left:auto;display:flex;align-items:center;gap:10px}
  .badge{background:var(--ink);color:#fff;border-radius:5px;padding:3px 10px;font-size:10px;font-weight:600;letter-spacing:0.3px;}

  .layout{display:flex;flex:1;min-height:0;height:0;overflow:hidden}

  .sidenav{width:210px;flex-shrink:0;background:var(--surf);border-right:1px solid var(--border);padding:16px 10px;display:flex;flex-direction:column;gap:2px;overflow-y:auto;}
  .sidenav-section{font-size:9px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:1.5px;padding:12px 10px 5px;}
  .sidenav-btn{display:flex;align-items:center;gap:9px;padding:9px 10px;border-radius:7px;background:none;border:none;color:var(--muted2);cursor:pointer;font-size:12px;font-weight:500;font-family:'Plus Jakarta Sans',sans-serif;width:100%;text-align:left;transition:all .15s;}
  .sidenav-btn:hover{background:var(--surf2);color:var(--ink)}
  .sidenav-btn.active{background:var(--surf3);color:var(--ink);font-weight:600}
  .sidenav-btn .sicon{font-size:13px;width:18px;text-align:center;opacity:0.5}
  .sidenav-btn.active .sicon{opacity:1}
  .sidenav-info{background:var(--surf2);border:1px solid var(--border);border-radius:8px;padding:12px;margin-top:auto;}
  .info-row{display:flex;justify-content:space-between;font-size:11px;margin-bottom:5px;color:var(--muted2)}
  .info-val{color:var(--ink);font-weight:600}

  .main{flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0;height:0}
  .workspace{flex:1;display:flex;gap:12px;padding:14px;min-height:0;overflow:hidden;height:0}

  .panel{background:var(--surf);border:1px solid var(--border);border-radius:var(--r);display:flex;flex-direction:column;overflow:hidden;}
  .panel-hdr{padding:11px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;background:var(--surf);}
  .panel-hdr h3{font-size:11px;font-weight:600;color:var(--ink);letter-spacing:0.1px}
  .panel-label{font-size:9px;font-weight:600;color:var(--muted);padding:6px 12px;border-bottom:1px solid var(--border);background:var(--surf2);flex-shrink:0;letter-spacing:0.3px;}

  .type-toggle{display:flex;background:var(--surf3);border-radius:6px;padding:3px;gap:2px}
  .type-toggle button{padding:4px 12px;border:none;border-radius:5px;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;font-size:11px;font-weight:500;background:transparent;color:var(--muted);transition:all .15s;}
  .type-toggle button.on{background:var(--surf);color:var(--ink);font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,0.08)}
  .type-toggle button:hover:not(.on){color:var(--ink2)}

  .upload-panel{width:290px;flex-shrink:0}
  .drop-zone{flex:1;display:flex;align-items:center;justify-content:center;border:1.5px dashed var(--border2);border-radius:8px;margin:12px;cursor:pointer;transition:all .2s;background:var(--surf2);}
  .drop-zone:hover,.drop-zone.drag{border-color:#aaa;background:var(--surf3)}
  .drop-inner{display:flex;flex-direction:column;align-items:center;gap:9px;text-align:center;padding:24px}
  .drop-icon{font-size:1.6rem;opacity:0.15}
  .drop-zone p{font-size:12px;color:var(--muted2)}
  .drop-zone .hint{font-size:10px;color:var(--muted);margin-top:1px}
  .img-preview-wrap{flex:1;overflow:auto;padding:12px;display:flex;align-items:flex-start;justify-content:center}
  .img-preview{max-width:100%;border-radius:8px;border:1px solid var(--border)}

  .btn-primary{background:var(--ink);color:#fff;border:none;padding:10px 16px;border-radius:7px;font-family:'Plus Jakarta Sans',sans-serif;font-size:12px;font-weight:600;cursor:pointer;transition:all .15s;width:calc(100% - 24px);margin:0 12px 12px;flex-shrink:0;display:flex;align-items:center;justify-content:center;gap:8px;}
  .btn-primary:hover:not(:disabled){background:#333}
  .btn-primary:disabled{opacity:.4;cursor:not-allowed}
  .btn-ghost{background:transparent;border:1px solid var(--border2);color:var(--muted2);padding:6px 12px;border-radius:6px;font-family:'Plus Jakarta Sans',sans-serif;font-size:11px;font-weight:500;cursor:pointer;transition:all .15s;}
  .btn-ghost:hover{border-color:#999;color:var(--ink)}
  .btn-text{background:none;border:none;color:var(--muted);font-size:11px;cursor:pointer;padding:4px 7px;border-radius:5px;transition:all .15s;font-family:'Plus Jakarta Sans',sans-serif;}
  .btn-text:hover{color:#ef4444;background:#fef2f2}
  .btn-dl{background:var(--surf2);border:1px solid var(--border2);color:var(--ink2);padding:4px 11px;border-radius:5px;font-family:'Plus Jakarta Sans',sans-serif;font-size:10px;font-weight:600;cursor:pointer;transition:all .15s;}
  .btn-dl:hover{background:var(--ink);color:#fff;border-color:var(--ink)}
  .dl-bar{display:flex;gap:5px}

  .result-body{flex:1;display:flex;min-height:0;overflow:hidden}
  .edit-col{width:42%;border-right:1px solid var(--border);display:flex;flex-direction:column;min-height:0}
  .preview-col{flex:1;display:flex;flex-direction:column;min-height:0}
  .code-area{flex:1;width:100%;border:none;outline:none;resize:none;padding:13px;font-family:'Courier New',monospace;font-size:11px;line-height:1.7;color:#374151;background:#fafafa;overflow:auto;white-space:pre;min-height:0;}
  .code-area.notes{white-space:pre-wrap;word-wrap:break-word;font-family:'Plus Jakarta Sans',sans-serif;font-size:12px}
  .preview-scroll{flex:1;overflow:auto;padding:16px;min-height:0;background:#fff}
  .preview-scroll::-webkit-scrollbar,.code-area::-webkit-scrollbar,.img-preview-wrap::-webkit-scrollbar{width:4px;height:4px}
  .preview-scroll::-webkit-scrollbar-thumb,.code-area::-webkit-scrollbar-thumb,.img-preview-wrap::-webkit-scrollbar-thumb{background:#e0e0e0;border-radius:2px}

  .mermaid-out{overflow-x:auto}
  .mermaid-out svg{max-width:100%;height:auto;border-radius:6px}
  .mermaid-err{background:#fef2f2;border:1px solid #fecaca;color:#dc2626;padding:10px 13px;border-radius:7px;font-size:11px}

  .md-out{font-size:13px;line-height:1.8;color:#374151}
  .md-out h1{font-size:18px;font-weight:700;margin-bottom:12px;color:#111;border-bottom:1px solid var(--border);padding-bottom:8px}
  .md-out h2{font-size:15px;font-weight:600;margin:16px 0 8px;color:#222}
  .md-out h3{font-size:13px;font-weight:600;margin:12px 0 5px;color:#333}
  .md-out p{margin-bottom:9px}
  .md-out ul,.md-out ol{margin:6px 0 6px 20px}
  .md-out li{margin-bottom:3px}
  .md-out strong{font-weight:700;color:#111}
  .md-out code{background:var(--surf3);padding:1px 5px;border-radius:4px;font-family:'Courier New',monospace;font-size:0.9em;color:#374151}
  .md-out blockquote{border-left:3px solid #ddd;padding-left:12px;color:var(--muted2);margin:10px 0}
  .md-out hr{border:none;border-top:1px solid var(--border);margin:14px 0}

  .empty-state{flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:9px;color:var(--muted);font-size:12px;text-align:center;padding:32px}
  .empty-icon{font-size:2rem;opacity:0.1;margin-bottom:4px}
  .loading{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:var(--muted2);font-size:12px}
  .spinner{width:28px;height:28px;border:2px solid var(--border2);border-top-color:var(--ink);border-radius:50%;animation:spin .75s linear infinite}
  .spin{width:13px;height:13px;border:2px solid transparent;border-top-color:currentColor;border-radius:50%;animation:spin .7s linear infinite;display:inline-block}
  @keyframes spin{to{transform:rotate(360deg)}}
  .error-box{background:#fef2f2;border:1px solid #fecaca;color:#dc2626;padding:10px 13px;border-radius:7px;font-size:11px;margin:10px;flex-shrink:0}

  .loading-bar{height:2px;background:linear-gradient(90deg,#111,#ccc,#111);background-size:200%;animation:lbar 1.2s linear infinite;flex-shrink:0}
  @keyframes lbar{from{background-position:200%}to{background-position:-200%}}

  .doc-workspace{flex:1;display:flex;gap:12px;padding:14px;min-height:0;height:0;overflow:hidden}

  /* left input panel */
  .doc-input-col{width:360px;flex-shrink:0;display:flex;flex-direction:column;min-height:0;overflow:hidden;background:var(--surf);border:1px solid var(--border);border-radius:var(--r)}

  /* right output panel */
  .doc-output-col{flex:1;min-width:0;display:flex;flex-direction:column;min-height:0;overflow:hidden}

  /* scrollable cards area fills remaining space */
  .doc-cards-scroll{flex:1;display:flex;flex-direction:column;gap:10px;overflow-y:auto;padding:12px 12px 4px;min-height:0}

  .doc-cards-scroll::-webkit-scrollbar{width:4px}
  .doc-cards-scroll::-webkit-scrollbar-thumb{background:#e0e0e0;border-radius:2px}

  /* button wrapper pinned at bottom of the panel */
  .doc-gen-btn-wrap{flex-shrink:0;padding:10px 12px 12px;background:var(--surf);border-top:1px solid var(--border)}

  /* button fills wrapper exactly */
  .doc-gen-btn-wrap .btn-primary{width:100%;margin:0}

  .input-card{background:var(--surf);border:1px solid var(--border2);border-radius:8px;display:flex;flex-direction:column;overflow:hidden;flex-shrink:0}
  .input-card-hdr{padding:9px 13px;background:var(--surf2);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between}
  .input-card-hdr h4{font-size:11px;font-weight:600;color:var(--ink);display:flex;align-items:center;gap:7px}
  .card-tag{background:transparent;color:var(--muted);border:1px solid var(--border);font-size:9px;font-weight:600;padding:1px 7px;border-radius:3px;letter-spacing:0.3px}
  .prompt-area{width:100%;border:none;outline:none;resize:vertical;padding:11px 13px;font-family:'Plus Jakarta Sans',sans-serif;font-size:12px;line-height:1.65;color:#374151;background:#fff;min-height:90px;}
  .prompt-area::placeholder{color:var(--muted);font-size:11px}
  .ctx-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;padding:11px 13px}
  .field-label{font-size:10px;font-weight:600;color:var(--muted2);margin-bottom:4px;letter-spacing:0.2px}
  .field-input{width:100%;background:var(--surf2);border:1px solid var(--border2);border-radius:6px;padding:7px 10px;font-family:'Plus Jakarta Sans',sans-serif;font-size:12px;color:var(--ink);outline:none;transition:border-color .15s;}
  .field-input:focus{border-color:#999}
  .field-full{padding:0 13px 11px;display:flex;flex-direction:column}

  .doc-preview{flex:1;overflow-y:auto;padding:20px 24px;background:#f9fafb}
  .doc-preview::-webkit-scrollbar{width:4px}
  .doc-preview::-webkit-scrollbar-thumb{background:#e0e0e0;border-radius:2px}

  .client-doc{max-width:820px;margin:0 auto;font-family:'Plus Jakarta Sans',sans-serif;color:var(--ink)}
  .client-doc .doc-hero{background:#111;color:#fff;border-radius:10px;padding:24px 28px;margin-bottom:16px;}
  .client-doc .doc-hero .d-eyebrow{font-size:9px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#888;margin-bottom:8px}
  .client-doc .doc-hero h1{font-size:20px;font-weight:700;color:#fff;margin-bottom:4px;letter-spacing:-0.3px}
  .client-doc .doc-hero .d-sub{font-size:11px;color:#666}
  .client-doc .doc-hero .d-meta{display:flex;gap:20px;margin-top:16px;flex-wrap:wrap}
  .client-doc .doc-hero .d-meta-item .d-label{font-size:9px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:#555;margin-bottom:3px}
  .client-doc .doc-hero .d-meta-item .d-val{font-size:12px;color:#ccc}
  .client-doc .doc-section{background:#fff;border:1px solid var(--border);border-radius:10px;margin-bottom:12px;overflow:hidden}
  .client-doc .sec-hdr{display:flex;align-items:center;gap:10px;padding:11px 16px;background:var(--surf2);border-bottom:1px solid var(--border)}
  .client-doc .sec-num{background:#111;color:#fff;width:22px;height:22px;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0}
  .client-doc .sec-hdr h2{font-size:12px;font-weight:700;color:var(--ink)}
  .client-doc .sec-body{padding:16px}
  .client-doc .stage-card{border:1px solid var(--border);border-radius:8px;margin-bottom:11px;overflow:hidden}
  .client-doc .stage-hdr{display:flex;align-items:center;gap:10px;padding:9px 13px;background:var(--surf3);border-bottom:1px solid var(--border)}
  .client-doc .stage-label{font-size:9px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--muted)}
  .client-doc .stage-name{font-size:12px;font-weight:700;color:var(--ink)}
  .client-doc .stage-body{padding:13px;display:grid;grid-template-columns:1fr 1fr;gap:13px}
  .client-doc .stage-col h4{font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--muted);margin-bottom:8px}
  .client-doc .script-bubble{background:var(--surf2);border-left:3px solid #ddd;padding:8px 12px;font-size:12px;line-height:1.65;color:#374151;margin-bottom:6px;border-radius:0 6px 6px 0}
  .client-doc .outcome-chip{display:inline-flex;align-items:center;background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;font-size:10px;font-weight:600;padding:3px 9px;border-radius:4px;margin:2px 2px 2px 0}
  .client-doc .outcome-chip.red{background:#fef2f2;border-color:#fecaca;color:#dc2626}
  .client-doc .outcome-chip.yellow{background:#fffbeb;border-color:#fde68a;color:#92400e}
  .client-doc .eval-table{width:100%;border-collapse:collapse}
  .client-doc .eval-table th{background:var(--surf3);padding:9px 13px;font-size:10px;font-weight:600;color:var(--ink);text-align:left;border-bottom:1px solid var(--border2)}
  .client-doc .eval-table td{padding:9px 13px;font-size:12px;border-bottom:1px solid var(--border);color:#374151;vertical-align:top}
  .client-doc .eval-table tr:last-child td{border-bottom:none}
  .client-doc .eval-table tr:hover td{background:var(--surf2)}
  .client-doc .score-pill{display:inline-block;font-weight:700;font-size:10px;padding:2px 9px;border-radius:4px}
  .client-doc .score-pill.high{background:#dcfce7;color:#166534}
  .client-doc .score-pill.med{background:#fef9c3;color:#854d0e}
  .client-doc .score-pill.low{background:#fee2e2;color:#991b1b}
  .client-doc .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .client-doc .info-item{background:var(--surf2);border:1px solid var(--border);border-radius:7px;padding:12px 14px}
  .client-doc .i-label{font-size:9px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;color:var(--muted);margin-bottom:5px}
  .client-doc .i-val{font-size:12px;color:#374151;line-height:1.6}
  .client-doc .flow-vis{display:flex;align-items:center;flex-wrap:wrap;padding:10px 0;margin-bottom:14px;gap:2px}
  .client-doc .flow-node{background:var(--surf3);border:1px solid var(--border2);color:var(--ink);font-size:10px;font-weight:600;padding:6px 14px;border-radius:4px}
  .client-doc .flow-node.end-node{background:#111;color:#fff;border-color:#111}
  .client-doc .flow-arr{color:var(--muted);font-size:14px;margin:0 3px}

  .toast{position:fixed;top:64px;left:50%;transform:translateX(-50%);background:#fff;border:1px solid var(--border2);box-shadow:0 4px 16px rgba(0,0,0,0.08);border-radius:7px;padding:9px 18px;font-size:12px;font-weight:600;z-index:1000;white-space:nowrap;animation:tslide .2s ease;font-family:'Plus Jakarta Sans',sans-serif}
  @keyframes tslide{from{opacity:0;transform:translateX(-50%) translateY(-6px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
  .toast.ok{border-color:#86efac;color:#166534}
  .toast.err{border-color:#fca5a5;color:#dc2626}
  .toast.info{border-color:#93c5fd;color:#1d4ed8}

  @media(max-width:767px){
    .sidenav{display:none!important}
    .bottom-nav{display:flex!important}
    .main{padding-bottom:68px}
    .workspace,.doc-workspace{flex-direction:column;overflow-y:auto}
    .upload-panel,.doc-input-col{width:100%}
    .result-body{flex-direction:column}
    .edit-col{width:100%;border-right:none;border-bottom:1px solid var(--border);min-height:180px}
    .client-doc .stage-body,.client-doc .info-grid{grid-template-columns:1fr}
  }
  @media(min-width:768px){.bottom-nav{display:none!important}}

  .bottom-nav{display:none;position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:1px solid var(--border);padding:8px 0 14px;z-index:200}
  .bnav-btn{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;background:none;border:none;color:var(--muted);cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;font-size:10px;padding:4px 0;transition:color .2s;font-weight:500}
  .bnav-btn.active{color:var(--ink);font-weight:600}
  .bnav-icon{font-size:15px;line-height:1}
`;

function useToast() {
  const [toast, setToast] = useState(null);
  const show = useCallback((msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);
  return [toast, show];
}

// ── Section 1: Image → Structure ──────────────────────────────────────────────
const ImageSection = memo(({ showToast }) => {
  const [image, setImage]             = useState(null);
  const [imgPrev, setImgPrev]         = useState(null);
  const [mode, setMode]               = useState("flowchart");
  const [editContent, setEditContent] = useState("");
  const [svg, setSvg]                 = useState("");
  const [svgErr, setSvgErr]           = useState("");
  const [mdHtml, setMdHtml]           = useState("");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [drag, setDrag]               = useState(false);
  const [hasResult, setHasResult]     = useState(false);

  const fileRef = useRef(), camRef = useRef(), timerRef = useRef();

  const renderMermaid = useCallback(async (code) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (!code.trim()) return;
      try {
        const m = await getMermaid();
        mermaidId++;
        const { svg: s } = await m.render(`mer-${mermaidId}`, code);
        setSvg(s); setSvgErr("");
      } catch { setSvgErr("Diagram syntax error — edit the code to fix."); }
    }, 500);
  }, []);

  const renderMd = useCallback(async (text) => {
    const marked = await getMarked();
    setMdHtml(marked.parse(text));
  }, []);

  useEffect(() => {
    if (!hasResult || !editContent) return;
    if (mode === "flowchart") renderMermaid(editContent);
    else renderMd(editContent);
  }, [editContent, mode, hasResult, renderMermaid, renderMd]);

  const loadFile = (file) => {
    if (!file || !file.type.startsWith("image/")) { setError("Please upload a valid image."); return; }
    setImage(file); setImgPrev(URL.createObjectURL(file));
    setEditContent(""); setSvg(""); setSvgErr(""); setError(""); setHasResult(false); setMdHtml("");
  };

  const reset = () => {
    setImage(null); setImgPrev(null); setEditContent(""); setSvg("");
    setSvgErr(""); setError(""); setHasResult(false); setMdHtml("");
  };

  const analyze = async () => {
    if (!image) return;
    setLoading(true); setError(""); setEditContent(""); setSvg(""); setHasResult(false); setMdHtml("");
    try {
      const formData = new FormData();
      formData.append("image", image);
      formData.append("type", mode);
      const res = await fetch(`${BACKEND_URL}/api/analyze`, { method: "POST", body: formData });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Analysis failed");
      let content = data.content.trim();
      setEditContent(content); setHasResult(true);
      if (mode === "flowchart") renderMermaid(content);
      else renderMd(content);
      showToast("Converted successfully ✓", "ok");
    } catch (e) {
      setError("Error: " + e.message);
      showToast("Conversion failed", "err");
    } finally { setLoading(false); }
  };

  const triggerDL = (url, name) => {
    const a = document.createElement("a"); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const downloadSVG = () => {
    if (!svg) return;
    triggerDL(URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })), "flowchart.svg");
  };

  const downloadDOC = () => {
    const body = mode === "flowchart"
      ? `<h2>Flowchart</h2>${svg ? `<div>${svg}</div>` : ""}<pre style="background:#f9fafb;padding:16px">${editContent}</pre>`
      : (mdHtml || editContent);
    const html = `<html><head><meta charset="utf-8"/><style>body{font-family:Calibri,Arial,sans-serif;margin:72pt;font-size:11pt;}pre{background:#f9fafb;padding:12pt;}ul,ol{margin-left:20pt;}</style></head><body>${body}</body></html>`;
    triggerDL(URL.createObjectURL(new Blob(["\ufeff", html], { type: "application/msword" })), `${mode}.doc`);
  };

  return (
    <div className="workspace">
      <div className="panel upload-panel">
        <div className="panel-hdr">
          <h3>Original Image</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="type-toggle">
              <button className={mode === "flowchart" ? "on" : ""} onClick={() => { setMode("flowchart"); reset(); }}>Flowchart</button>
              <button className={mode === "notes" ? "on" : ""} onClick={() => { setMode("notes"); reset(); }}>Notes</button>
            </div>
            {imgPrev && <button className="btn-text" onClick={reset}>✕</button>}
          </div>
        </div>

        {!imgPrev ? (
          <div className={`drop-zone${drag ? " drag" : ""}`}
            onDrop={(e) => { e.preventDefault(); setDrag(false); loadFile(e.dataTransfer.files[0]); }}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onClick={() => fileRef.current.click()}>
            <div className="drop-inner">
              <div className="drop-icon">⬆</div>
              <p><strong style={{ fontWeight: 600, color: "var(--ink)" }}>Drop image here</strong></p>
              <p>or click to upload</p>
              <p className="hint">JPG · PNG · WEBP · HEIC</p>
              <button className="btn-ghost" style={{ marginTop: 6 }} onClick={(e) => { e.stopPropagation(); camRef.current.click(); }}>Camera</button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => loadFile(e.target.files[0])} />
            <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => loadFile(e.target.files[0])} />
          </div>
        ) : (
          <div className="img-preview-wrap">
            <img src={imgPrev} alt="Uploaded" className="img-preview" />
          </div>
        )}

        {imgPrev && (
          <button className="btn-primary" onClick={analyze} disabled={loading}>
            {loading ? <><span className="spin" /> Analyzing…</> : `Convert to ${mode === "flowchart" ? "Flowchart" : "Notes"} →`}
          </button>
        )}
      </div>

      <div className="panel" style={{ flex: 1, minWidth: 0 }}>
        {loading && <div className="loading-bar" />}
        <div className="panel-hdr">
          <h3>Result</h3>
          {hasResult && (
            <div className="dl-bar">
              {mode === "flowchart" && svg && <button className="btn-dl" onClick={downloadSVG}>↓ SVG</button>}
              <button className="btn-dl" onClick={downloadDOC}>↓ DOC</button>
            </div>
          )}
        </div>

        {error && <div className="error-box">{error}</div>}

        {!hasResult && !loading && !error && (
          <div className="empty-state">
            <div className="empty-icon">◻</div>
            <p>Upload a {mode} image and click Convert</p>
            <p style={{ fontSize: 11, marginTop: 2 }}>Editable result with live preview</p>
          </div>
        )}

        {loading && (
          <div className="loading">
            <div className="spinner" />
            <p>Analyzing with GPT-4o…</p>
            <p style={{ fontSize: 11 }}>10–20 seconds</p>
          </div>
        )}

        {hasResult && !loading && (
          <div className="result-body">
            <div className="edit-col">
              <div className="panel-label">{mode === "flowchart" ? "Mermaid code — edit to adjust" : "Notes — edit freely"}</div>
              <textarea className={`code-area${mode === "notes" ? " notes" : ""}`}
                value={editContent} onChange={(e) => setEditContent(e.target.value)}
                spellCheck={mode === "notes"} placeholder={mode === "flowchart" ? "Mermaid.js code…" : "Your notes…"} />
            </div>
            <div className="preview-col">
              <div className="panel-label">Live preview</div>
              <div className="preview-scroll">
                {mode === "flowchart"
                  ? svgErr
                    ? <div className="mermaid-err">{svgErr}</div>
                    : svg
                      ? <div className="mermaid-out" dangerouslySetInnerHTML={{ __html: svg }} />
                      : <div style={{ color: "var(--muted)", fontSize: 12 }}>Rendering…</div>
                  : <div className="md-out" dangerouslySetInnerHTML={{ __html: mdHtml }} />}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

// ── Section 2: Prompt → Client Doc ───────────────────────────────────────────
const DocCreator = memo(({ showToast }) => {
  const [scriptPrompt, setScriptPrompt] = useState("");
  const [evalPrompt, setEvalPrompt]     = useState("");
  const [ctx, setCtx]                   = useState({ client: "", product: "", version: "v1.0" });
  const [docHtml, setDocHtml]           = useState("");
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState("");

  const generate = async () => {
    if (!scriptPrompt && !evalPrompt) { setError("Please provide at least one prompt."); return; }
    setLoading(true); setError(""); setDocHtml("");
    try {
      const res = await fetch(`${BACKEND_URL}/api/generate-doc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptPrompt, evalPrompt, client: ctx.client, product: ctx.product, version: ctx.version }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Generation failed");
      setDocHtml(data.content);
      showToast("Document generated ✓", "ok");
    } catch (e) {
      setError("Error: " + e.message);
      showToast("Generation failed", "err");
    } finally { setLoading(false); }
  };

  const downloadDOC = () => {
    if (!docHtml) return;
    const styles = `body{font-family:Calibri,Arial,sans-serif;margin:48pt;font-size:11pt;color:#1a1a1a;background:#fff}.doc-hero{background:#111;color:#fff;padding:20pt;border-radius:4pt;margin-bottom:14pt}.d-eyebrow{font-size:8pt;letter-spacing:2px;text-transform:uppercase;color:#888;margin-bottom:6pt}h1{font-size:18pt;color:#fff;margin-bottom:4pt}.d-sub{font-size:9pt;color:#666}.d-meta{display:flex;gap:16pt;margin-top:12pt}.d-label{font-size:7pt;text-transform:uppercase;color:#555}.d-val{font-size:9pt;color:#ccc}.doc-section{border:1pt solid #ebebeb;border-radius:4pt;margin-bottom:12pt}.sec-hdr{background:#f9fafb;padding:9pt 13pt;border-bottom:1pt solid #ebebeb;display:flex;align-items:center;gap:8pt}.sec-num{background:#111;color:#fff;display:inline-block;padding:2pt 6pt;border-radius:3pt;font-size:8pt;font-weight:bold;margin-right:6pt}.sec-hdr h2{font-size:11pt;font-weight:bold;margin:0}.sec-body{padding:13pt}.stage-card{border:1pt solid #ebebeb;border-radius:4pt;margin-bottom:9pt}.stage-hdr{background:#f3f4f6;padding:8pt 12pt;border-bottom:1pt solid #ebebeb}.stage-label{font-size:7pt;text-transform:uppercase;color:#9ca3af;letter-spacing:1px}.stage-name{font-size:10pt;font-weight:bold;color:#111;display:block}.stage-body{padding:10pt}.stage-col{display:inline-block;vertical-align:top;width:48%;padding-right:8pt}.stage-col h4{font-size:7pt;font-weight:bold;text-transform:uppercase;color:#9ca3af;margin-bottom:5pt}.script-bubble{background:#f9fafb;border-left:3pt solid #ddd;padding:6pt 9pt;font-size:9pt;line-height:1.6;margin-bottom:5pt}.eval-table{border-collapse:collapse;width:100%}.eval-table th{background:#f3f4f6;color:#111;padding:7pt 10pt;font-size:8pt;font-weight:bold;text-align:left;border-bottom:1pt solid #ebebeb}.eval-table td{padding:7pt 10pt;font-size:9pt;border-bottom:0.5pt solid #ebebeb;vertical-align:top}.info-grid{display:table;width:100%}.info-item{display:table-cell;width:50%;padding-right:10pt;vertical-align:top}.i-label{font-size:7pt;font-weight:bold;text-transform:uppercase;color:#9ca3af;margin-bottom:3pt}.i-val{font-size:9pt;line-height:1.5}.flow-vis{margin-bottom:12pt}.flow-node{display:inline-block;background:#f3f4f6;border:1pt solid #e0e0e0;color:#111;font-size:8pt;padding:3pt 9pt;border-radius:3pt;margin:2pt}.flow-arr{display:inline-block;color:#9ca3af;margin:0 2pt}.outcome-chip{display:inline-block;border:0.5pt solid #bbf7d0;background:#f0fdf4;color:#166534;font-size:8pt;padding:2pt 6pt;border-radius:3pt;margin:2pt}.outcome-chip.red{background:#fef2f2;border-color:#fecaca;color:#dc2626}.outcome-chip.yellow{background:#fffbeb;border-color:#fde68a;color:#92400e}.score-pill{display:inline-block;font-weight:bold;font-size:8pt;padding:1pt 6pt;border-radius:3pt}.score-pill.high{background:#dcfce7;color:#166534}.score-pill.med{background:#fef9c3;color:#854d0e}.score-pill.low{background:#fee2e2;color:#991b1b}`;
    const full = `<html><head><meta charset="utf-8"/><style>${styles}</style></head><body>${docHtml}</body></html>`;
    const blob = new Blob(["\ufeff", full], { type: "application/msword" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "AI_Call_Documentation.doc";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  return (
    <div className="doc-workspace">
      <div className="doc-input-col">
        <div className="panel-hdr"><h3>Input</h3></div>
        <div className="doc-cards-scroll">

          <div className="input-card">
            <div className="input-card-hdr"><h4>Document Context</h4></div>
            <div className="ctx-grid">
              <div>
                <div className="field-label">Client Name</div>
                <input className="field-input" placeholder="e.g. Swiggy" value={ctx.client} onChange={(e) => setCtx({ ...ctx, client: e.target.value })} />
              </div>
              <div>
                <div className="field-label">Version</div>
                <input className="field-input" placeholder="v1.0" value={ctx.version} onChange={(e) => setCtx({ ...ctx, version: e.target.value })} />
              </div>
            </div>
            <div className="field-full">
              <div className="field-label">Product / Use Case</div>
              <input className="field-input" placeholder="e.g. Delivery Executive Onboarding" value={ctx.product} onChange={(e) => setCtx({ ...ctx, product: e.target.value })} />
            </div>
          </div>

          <div className="input-card">
            <div className="input-card-hdr">
              <h4>Call Script Prompt</h4>
              <span className="card-tag">Optional</span>
            </div>
            <textarea className="prompt-area" style={{ minHeight: 110 }}
              placeholder="Paste your call script prompt here..."
              value={scriptPrompt} onChange={(e) => setScriptPrompt(e.target.value)} />
          </div>

          <div className="input-card">
            <div className="input-card-hdr">
              <h4>Evaluation Prompt</h4>
              <span className="card-tag">Optional</span>
            </div>
            <textarea className="prompt-area" style={{ minHeight: 100 }}
              placeholder="Paste your evaluation/scoring prompt here..."
              value={evalPrompt} onChange={(e) => setEvalPrompt(e.target.value)} />
          </div>

          {error && <div className="error-box" style={{ margin: 0 }}>{error}</div>}

        </div>

        <div className="doc-gen-btn-wrap">
          <button className="btn-primary" onClick={generate} disabled={loading}>
            {loading ? <><span className="spin" /> Generating Document…</> : "Generate Client Document →"}
          </button>
        </div>
      </div>

      <div className="panel doc-output-col">
        {loading && <div className="loading-bar" />}
        <div className="panel-hdr">
          <h3>Generated Document</h3>
          {docHtml && <button className="btn-dl" onClick={downloadDOC}>↓ DOC</button>}
        </div>

        {loading && (
          <div className="loading">
            <div className="spinner" />
            <p>GPT-4o is writing your document…</p>
            <p style={{ fontSize: 11, color: "var(--muted)" }}>Generating stages, scripts & evaluation framework</p>
          </div>
        )}

        {!docHtml && !loading && (
          <div className="empty-state">
            <div className="empty-icon">◻</div>
            <p>Your client-ready document will appear here</p>
            <p style={{ fontSize: 11, marginTop: 2 }}>Paste your prompts and click Generate</p>
          </div>
        )}

        {docHtml && !loading && (
          <div className="doc-preview">
            <div dangerouslySetInnerHTML={{ __html: docHtml }} />
          </div>
        )}
      </div>
    </div>
  );
});

// ── Root App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("image");
  const [toast, show] = useToast();

  const TABS = [
    { id: "image", label: "Image → Structure",   icon: "⬆" },
    { id: "doc",   label: "Prompt → Client Doc", icon: "◻" },
  ];

  return (
    <>
      <style>{css}</style>
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      <div className="app">
        <div className="hdr">
          <ScribbleLogo size={32} />
          <div className="hdr-title">
            <h1>InkParse</h1>
            <p>AI-powered · by Hunar</p>
          </div>
          <div className="hdr-right">
            <span className="badge">GPT-4o</span>
          </div>
        </div>

        <div className="layout">
          <nav className="sidenav">
            <div className="sidenav-section">Tools</div>
            {TABS.map((t) => (
              <button key={t.id} className={`sidenav-btn${tab === t.id ? " active" : ""}`} onClick={() => setTab(t.id)}>
                <span className="sicon">{t.icon}</span> {t.label}
              </button>
            ))}

            <div className="sidenav-section">Guide</div>
            <div style={{ padding: "4px 10px" }}>
              <div style={{ fontSize: 11, lineHeight: 1.8, color: "var(--muted2)" }}>
                <div style={{ fontWeight: 600, color: "var(--ink2)", marginBottom: 2 }}>Image → Structure</div>
                <div style={{ color: "var(--muted)", marginBottom: 12, fontSize: 10 }}>Upload a flowchart or notes photo, convert to editable Mermaid / Markdown</div>
                <div style={{ fontWeight: 600, color: "var(--ink2)", marginBottom: 2 }}>Prompt → Client Doc</div>
                <div style={{ color: "var(--muted)", fontSize: 10 }}>Paste script & eval prompts, get a detailed client-ready document</div>
              </div>
            </div>

            <div className="sidenav-info">
              <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, fontWeight: 600 }}>Stack</div>
              {[["Model", "GPT-4o"], ["Vision", "Enabled"], ["Output", "SVG · DOC · MD"]].map(([l, v]) => (
                <div key={l} className="info-row">
                  <span>{l}</span>
                  <span className="info-val">{v}</span>
                </div>
              ))}
            </div>
          </nav>

          <main className="main">
            {tab === "image" && <ImageSection showToast={show} />}
            {tab === "doc"   && <DocCreator   showToast={show} />}
          </main>
        </div>

        <nav className="bottom-nav">
          {TABS.map((t) => (
            <button key={t.id} className={`bnav-btn${tab === t.id ? " active" : ""}`} onClick={() => setTab(t.id)}>
              <span className="bnav-icon">{t.icon}</span>
              {t.label.split("→")[0].trim()}
            </button>
          ))}
        </nav>
      </div>
    </>
  );
}
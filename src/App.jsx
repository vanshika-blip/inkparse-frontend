import { useState, useEffect, useRef, useCallback, memo } from "react";

// ── IMPORTANT: Set this to your Render backend URL ────────────────────────────
const BACKEND_URL = "https://inkparse-backend.onrender.com";

// ── Logo ──────────────────────────────────────────────────────────────────────
const ScribbleLogo = ({ size = 36 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <rect width="40" height="40" rx="6" fill="#000" stroke="#00FF87" strokeWidth="1"/>
    <path d="M6 28 C8 24, 10 18, 13 22 C16 26, 17 14, 20 18 C23 22, 25 10, 28 16 C31 22, 33 20, 35 18"
      fill="none" stroke="#00FF87" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    <rect x="8" y="12" width="7" height="5" rx="1" fill="none" stroke="#00FF87" strokeWidth="1.2"/>
    <path d="M8 32 L32 32" stroke="#00FF87" strokeWidth="1.2" strokeLinecap="round"/>
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
      theme: "dark",
      themeVariables: {
        primaryColor: "#00FF87",
        background: "#0A0A0A",
        mainBkg: "#111",
        nodeBorder: "#00FF87",
        clusterBkg: "#111",
        titleColor: "#00FF87",
        edgeLabelBackground: "#111",
        lineColor: "#00FF87"
      },
      flowchart: { curve: "basis", padding: 20 },
      fontSize: 14
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
  @import url('https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{--bg:#000;--surf:#0A0A0A;--surf2:#111;--surf3:#161616;--border:rgba(0,255,135,0.15);--green:#00FF87;--green2:#00CC6A;--text:#E0FFE8;--muted:#3A7A50;--muted2:#4A9060;--r:8px}
  body{background:var(--bg);font-family:'Space Mono',monospace;color:var(--text);min-height:100vh}
  .app{min-height:100vh;display:flex;flex-direction:column}

  /* ── Header ── */
  .hdr{background:var(--surf);border-bottom:1px solid var(--border);padding:12px 20px;display:flex;align-items:center;gap:12px;position:sticky;top:0;z-index:200;box-shadow:0 4px 20px rgba(0,255,135,0.05)}
  .hdr-title h1{font-size:17px;letter-spacing:3px;text-transform:uppercase;color:var(--green);text-shadow:0 0 20px rgba(0,255,135,0.4)}
  .hdr-title p{font-size:9px;color:var(--muted);letter-spacing:2px;text-transform:uppercase;margin-top:1px}
  .hdr-right{margin-left:auto;display:flex;align-items:center;gap:10px}
  .badge{background:var(--green);color:#000;border-radius:4px;padding:2px 9px;font-size:11px;font-weight:700;font-family:'Space Mono',monospace}

  /* ── Layout ── */
  .layout{display:flex;flex:1}

  /* ── Sidenav ── */
  .sidenav{width:220px;background:var(--surf);border-right:1px solid var(--border);padding:20px 10px;display:flex;flex-direction:column;gap:3px;position:sticky;top:57px;height:calc(100vh - 57px);overflow-y:auto}
  .sidenav-section{font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:2px;padding:14px 12px 5px;font-weight:700}
  .sidenav-btn{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:6px;background:none;border:none;color:var(--muted2);cursor:pointer;font-size:11px;font-family:'Space Mono',monospace;width:100%;text-align:left;transition:all .2s;border-left:2px solid transparent}
  .sidenav-btn:hover{background:var(--surf2);color:var(--text);border-left-color:var(--green);padding-left:10px}
  .sidenav-btn.active{background:rgba(0,255,135,.07);color:var(--green);font-weight:700;border-left-color:var(--green)}
  .sidenav-btn .sicon{font-size:14px;width:20px;text-align:center}
  .sidenav-info{background:var(--surf2);border:1px solid var(--border);border-radius:6px;padding:12px;margin-top:auto}
  .info-row{display:flex;justify-content:space-between;font-size:10px;margin-bottom:5px;color:var(--muted2)}
  .info-val{color:var(--green);font-weight:700}

  /* ── Main ── */
  .main{flex:1;overflow:auto;display:flex;flex-direction:column}

  /* ── Workspace ── */
  .workspace{flex:1;display:flex;gap:14px;padding:14px;height:calc(100vh - 57px);min-height:0;overflow:hidden}

  /* ── Panel ── */
  .panel{background:var(--surf);border:1px solid var(--border);border-radius:var(--r);display:flex;flex-direction:column;overflow:hidden}
  .panel-hdr{padding:11px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;background:var(--surf2)}
  .panel-hdr h3{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:var(--green)}
  .panel-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--muted2);padding:7px 12px;border-bottom:1px solid var(--border);background:var(--surf2);flex-shrink:0}

  /* ── Type toggle ── */
  .type-toggle{display:flex;background:rgba(0,255,135,0.05);border:1px solid var(--border);border-radius:5px;padding:3px;gap:2px}
  .type-toggle button{padding:5px 13px;border:none;border-radius:4px;cursor:pointer;font-family:'Space Mono',monospace;font-size:10px;font-weight:700;background:transparent;color:var(--muted2);transition:all .18s;letter-spacing:0.5px}
  .type-toggle button.on{background:var(--green);color:#000}
  .type-toggle button:hover:not(.on){background:rgba(0,255,135,0.08);color:var(--green)}

  /* ── Upload panel ── */
  .upload-panel{width:300px;flex-shrink:0}
  .drop-zone{flex:1;display:flex;align-items:center;justify-content:center;border:1px dashed rgba(0,255,135,0.25);border-radius:6px;margin:12px;cursor:pointer;transition:all .2s;background:rgba(0,255,135,0.02)}
  .drop-zone:hover,.drop-zone.drag{border-color:var(--green);background:rgba(0,255,135,0.05)}
  .drop-inner{display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;padding:24px}
  .drop-icon{font-size:2rem;opacity:0.7}
  .drop-zone p{font-size:11px;color:var(--muted2)}
  .drop-zone .hint{font-size:10px;color:var(--muted);margin-top:2px}
  .img-preview-wrap{flex:1;overflow:auto;padding:12px;display:flex;align-items:flex-start;justify-content:center}
  .img-preview{max-width:100%;border-radius:6px;border:1px solid var(--border)}

  /* ── Buttons ── */
  .btn-primary{background:var(--green);color:#000;border:none;padding:11px 16px;border-radius:6px;font-family:'Space Mono',monospace;font-size:11px;font-weight:700;cursor:pointer;transition:all .18s;width:calc(100% - 24px);margin:0 12px 12px;flex-shrink:0;letter-spacing:0.5px;display:flex;align-items:center;justify-content:center;gap:8px}
  .btn-primary:hover:not(:disabled){background:var(--green2)}
  .btn-primary:disabled{opacity:.45;cursor:not-allowed}
  .btn-ghost{background:transparent;border:1px solid var(--border);color:var(--muted2);padding:6px 12px;border-radius:5px;font-family:'Space Mono',monospace;font-size:10px;font-weight:700;cursor:pointer;transition:all .18s}
  .btn-ghost:hover{border-color:var(--green);color:var(--green)}
  .btn-text{background:none;border:none;color:var(--muted);font-size:10px;cursor:pointer;padding:4px 8px;border-radius:4px;transition:all .18s;font-family:'Space Mono',monospace}
  .btn-text:hover{color:#EF4444;background:rgba(239,68,68,0.08)}
  .btn-dl{background:transparent;border:1px solid var(--border);color:var(--muted2);padding:4px 11px;border-radius:4px;font-family:'Space Mono',monospace;font-size:10px;font-weight:700;cursor:pointer;transition:all .18s;letter-spacing:0.3px}
  .btn-dl:hover{background:var(--green);color:#000;border-color:var(--green)}
  .dl-bar{display:flex;gap:5px}

  /* ── Code + preview ── */
  .result-body{flex:1;display:flex;min-height:0;overflow:hidden}
  .edit-col{width:42%;border-right:1px solid var(--border);display:flex;flex-direction:column;min-height:0}
  .preview-col{flex:1;display:flex;flex-direction:column;min-height:0}
  .code-area{flex:1;width:100%;border:none;outline:none;resize:none;padding:13px;font-family:'Space Mono',monospace;font-size:11px;line-height:1.65;color:#6ACA8A;background:#050505;overflow:auto;white-space:pre;min-height:0}
  .code-area.notes{white-space:pre-wrap;word-wrap:break-word}
  .preview-scroll{flex:1;overflow:auto;padding:14px;min-height:0;background:#050505}
  .preview-scroll::-webkit-scrollbar,.code-area::-webkit-scrollbar,.img-preview-wrap::-webkit-scrollbar{width:4px;height:4px}
  .preview-scroll::-webkit-scrollbar-thumb,.code-area::-webkit-scrollbar-thumb,.img-preview-wrap::-webkit-scrollbar-thumb{background:rgba(0,255,135,0.2);border-radius:2px}

  /* ── Mermaid ── */
  .mermaid-out{overflow-x:auto}
  .mermaid-out svg{max-width:100%;height:auto;border-radius:5px}
  .mermaid-err{background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);color:#EF4444;padding:10px 13px;border-radius:6px;font-size:11px}

  /* ── Notes markdown ── */
  .md-out{font-size:11px;line-height:1.75;color:#6ACA8A}
  .md-out h1{font-size:14px;margin-bottom:10px;color:var(--green);border-bottom:1px solid var(--border);padding-bottom:7px;letter-spacing:1px;text-transform:uppercase}
  .md-out h2{font-size:12px;margin:14px 0 7px;color:var(--green);letter-spacing:0.5px}
  .md-out h3{font-size:11px;margin:11px 0 5px;color:var(--muted2)}
  .md-out p{margin-bottom:8px}
  .md-out ul,.md-out ol{margin:6px 0 6px 18px}
  .md-out li{margin-bottom:3px}
  .md-out strong{font-weight:700;color:var(--text)}
  .md-out code{background:var(--surf2);padding:1px 5px;border-radius:3px;font-family:'Space Mono',monospace;font-size:0.9em;color:var(--green)}
  .md-out blockquote{border-left:2px solid var(--green);padding-left:10px;color:var(--muted2);margin:8px 0}
  .md-out hr{border:none;border-top:1px solid var(--border);margin:12px 0}

  /* ── States ── */
  .empty-state{flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;color:var(--muted2);font-size:11px;text-align:center;padding:32px}
  .empty-icon{font-size:2rem;opacity:0.25;margin-bottom:4px}
  .loading{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:var(--muted2);font-size:11px}
  .spinner{width:30px;height:30px;border:2px solid var(--border);border-top-color:var(--green);border-radius:50%;animation:spin .75s linear infinite}
  .spin{width:14px;height:14px;border:2px solid transparent;border-top-color:currentColor;border-radius:50%;animation:spin .7s linear infinite;display:inline-block}
  @keyframes spin{to{transform:rotate(360deg)}}
  .error-box{background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.25);color:#EF4444;padding:10px 13px;border-radius:6px;font-size:10px;margin:10px;flex-shrink:0}

  /* ── Loading bar ── */
  .loading-bar{height:2px;background:linear-gradient(90deg,var(--green),transparent,var(--green));background-size:200%;animation:lbar 1.2s linear infinite;flex-shrink:0}
  @keyframes lbar{from{background-position:200%}to{background-position:-200%}}

  /* ── Doc Creator ── */
  .doc-workspace{flex:1;display:flex;gap:14px;padding:14px;height:calc(100vh - 57px);min-height:0;overflow:hidden}
  .doc-input-col{width:340px;flex-shrink:0;display:flex;flex-direction:column;gap:11px;overflow-y:auto}
  .doc-input-col::-webkit-scrollbar{width:4px}
  .doc-input-col::-webkit-scrollbar-thumb{background:rgba(0,255,135,0.15);border-radius:2px}
  .doc-output-col{flex:1;min-width:0;display:flex;flex-direction:column}

  /* ── Input cards ── */
  .input-card{background:var(--surf);border:1px solid var(--border);border-radius:var(--r);display:flex;flex-direction:column;overflow:hidden;flex-shrink:0}
  .input-card-hdr{padding:9px 13px;background:var(--surf2);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between}
  .input-card-hdr h4{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:var(--green);display:flex;align-items:center;gap:7px}
  .card-tag{background:rgba(0,255,135,0.1);color:var(--green);border:1px solid rgba(0,255,135,0.2);font-size:8px;font-weight:700;padding:1px 7px;border-radius:3px;letter-spacing:0.5px;text-transform:uppercase}
  .card-tag.opt{background:transparent;color:var(--muted);border-color:var(--border)}
  .prompt-area{width:100%;border:none;outline:none;resize:none;padding:11px 13px;font-family:'Space Mono',monospace;font-size:11px;line-height:1.65;color:#6ACA8A;background:#050505;min-height:120px}
  .prompt-area::placeholder{color:var(--muted);opacity:0.7}
  .ctx-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;padding:11px 13px}
  .field-label{font-size:9px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.7px;margin-bottom:4px}
  .field-input{width:100%;background:var(--surf2);border:1px solid var(--border);border-radius:5px;padding:7px 10px;font-family:'Space Mono',monospace;font-size:11px;color:var(--text);outline:none}
  .field-input:focus{border-color:var(--green)}
  .field-full{padding:0 13px 11px;display:flex;flex-direction:column}

  /* ── Client doc output ── */
  .doc-preview{flex:1;overflow-y:auto;padding:18px 22px;background:#050505}
  .doc-preview::-webkit-scrollbar{width:4px}
  .doc-preview::-webkit-scrollbar-thumb{background:rgba(0,255,135,0.15);border-radius:2px}
  .client-doc{max-width:820px;margin:0 auto;font-family:'Space Mono',monospace;color:var(--text)}
  .client-doc .doc-hero{background:var(--surf2);border:1px solid var(--border);border-radius:8px;padding:24px 28px;margin-bottom:16px;position:relative;overflow:hidden}
  .client-doc .doc-hero::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--green),transparent)}
  .client-doc .doc-hero .d-eyebrow{font-size:8px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:var(--green);margin-bottom:8px}
  .client-doc .doc-hero h1{font-size:18px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--green);margin-bottom:5px;text-shadow:0 0 20px rgba(0,255,135,0.3)}
  .client-doc .doc-hero .d-sub{font-size:10px;color:var(--muted2)}
  .client-doc .doc-hero .d-meta{display:flex;gap:20px;margin-top:16px;flex-wrap:wrap}
  .client-doc .doc-hero .d-meta-item .d-label{font-size:8px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:3px}
  .client-doc .doc-hero .d-meta-item .d-val{font-size:11px;color:var(--text)}
  .client-doc .doc-section{background:var(--surf);border:1px solid var(--border);border-radius:8px;margin-bottom:12px;overflow:hidden}
  .client-doc .sec-hdr{display:flex;align-items:center;gap:10px;padding:11px 16px;background:var(--surf2);border-bottom:1px solid var(--border)}
  .client-doc .sec-num{background:var(--green);color:#000;width:22px;height:22px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0}
  .client-doc .sec-hdr h2{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:var(--green)}
  .client-doc .sec-body{padding:16px}
  .client-doc .stage-card{border:1px solid var(--border);border-radius:6px;margin-bottom:11px;overflow:hidden}
  .client-doc .stage-hdr{display:flex;align-items:center;gap:10px;padding:9px 13px;background:rgba(0,255,135,0.08);border-bottom:1px solid var(--border)}
  .client-doc .stage-label{font-size:8px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted2)}
  .client-doc .stage-name{font-size:11px;font-weight:700;color:var(--green)}
  .client-doc .stage-body{padding:13px;display:grid;grid-template-columns:1fr 1fr;gap:13px}
  .client-doc .stage-col h4{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--muted);margin-bottom:7px}
  .client-doc .script-bubble{background:var(--surf2);border-left:2px solid var(--green);padding:8px 11px;font-size:10px;line-height:1.65;color:#6ACA8A;margin-bottom:6px;border-radius:0 4px 4px 0}
  .client-doc .outcome-chip{display:inline-flex;align-items:center;background:rgba(0,255,135,0.08);border:1px solid rgba(0,255,135,0.2);color:var(--green);font-size:9px;font-weight:700;padding:3px 8px;border-radius:3px;margin:2px 2px 2px 0;letter-spacing:0.3px}
  .client-doc .outcome-chip.red{background:rgba(239,68,68,0.07);border-color:rgba(239,68,68,0.2);color:#EF4444}
  .client-doc .outcome-chip.yellow{background:rgba(249,115,22,0.07);border-color:rgba(249,115,22,0.2);color:#F97316}
  .client-doc .eval-table{width:100%;border-collapse:collapse}
  .client-doc .eval-table th{background:var(--surf2);padding:9px 13px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--green);text-align:left;border-bottom:1px solid var(--border)}
  .client-doc .eval-table td{padding:9px 13px;font-size:10px;border-bottom:1px solid rgba(0,255,135,0.06);color:#6ACA8A;vertical-align:top}
  .client-doc .eval-table tr:last-child td{border-bottom:none}
  .client-doc .eval-table tr:hover td{background:rgba(0,255,135,0.03)}
  .client-doc .score-pill{display:inline-block;font-weight:700;font-size:9px;padding:2px 8px;border-radius:3px;letter-spacing:0.3px}
  .client-doc .score-pill.high{background:rgba(0,255,135,0.12);color:var(--green);border:1px solid rgba(0,255,135,0.25)}
  .client-doc .score-pill.med{background:rgba(249,115,22,0.1);color:#F97316;border:1px solid rgba(249,115,22,0.25)}
  .client-doc .score-pill.low{background:rgba(239,68,68,0.1);color:#EF4444;border:1px solid rgba(239,68,68,0.25)}
  .client-doc .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .client-doc .info-item{background:var(--surf2);border:1px solid var(--border);border-radius:5px;padding:11px 13px}
  .client-doc .i-label{font-size:8px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:var(--muted);margin-bottom:5px}
  .client-doc .i-val{font-size:10px;color:#6ACA8A;line-height:1.6}
  .client-doc .flow-vis{display:flex;align-items:center;gap:0;flex-wrap:wrap;padding:12px 0;margin-bottom:14px}
  .client-doc .flow-node{background:rgba(0,255,135,0.08);border:1px solid rgba(0,255,135,0.3);color:var(--green);font-size:9px;font-weight:700;padding:6px 13px;border-radius:3px;letter-spacing:0.5px;text-transform:uppercase}
  .client-doc .flow-node.end-node{background:rgba(0,255,135,0.15);border-color:var(--green)}
  .client-doc .flow-arr{color:var(--muted);font-size:14px;margin:0 4px}

  /* ── Toast ── */
  .toast{position:fixed;top:68px;left:50%;transform:translateX(-50%);background:var(--surf);border:1px solid var(--border);border-radius:5px;padding:9px 18px;font-size:11px;font-weight:700;z-index:1000;white-space:nowrap;animation:tslide .2s ease;font-family:'Space Mono',monospace}
  @keyframes tslide{from{opacity:0;transform:translateX(-50%) translateY(-6px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
  .toast.ok{border-color:var(--green);color:var(--green)}
  .toast.err{border-color:#EF4444;color:#EF4444}
  .toast.info{border-color:#3B82F6;color:#3B82F6}

  /* ── Responsive ── */
  @media(max-width:767px){
    .sidenav{display:none!important}
    .bottom-nav{display:flex!important}
    .main{padding-bottom:68px}
    .workspace,.doc-workspace{flex-direction:column;height:auto;overflow:auto}
    .upload-panel,.doc-input-col{width:100%}
    .result-body{flex-direction:column}
    .edit-col{width:100%;border-right:none;border-bottom:1px solid var(--border);min-height:180px}
    .client-doc .stage-body,.client-doc .info-grid{grid-template-columns:1fr}
  }
  @media(min-width:768px){.bottom-nav{display:none!important}}

  /* ── Bottom nav ── */
  .bottom-nav{display:none;position:fixed;bottom:0;left:0;right:0;background:var(--surf);border-top:1px solid var(--border);padding:7px 0 13px;z-index:200}
  .bnav-btn{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;background:none;border:none;color:var(--muted2);cursor:pointer;font-family:'Space Mono',monospace;font-size:9px;padding:4px 0;transition:color .2s}
  .bnav-btn.active{color:var(--green)}
  .bnav-icon{font-size:16px;line-height:1}
`;

// ── Toast hook ────────────────────────────────────────────────────────────────
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
  const [image, setImage]           = useState(null);
  const [imgPrev, setImgPrev]       = useState(null);
  const [mode, setMode]             = useState("flowchart");
  const [editContent, setEditContent] = useState("");
  const [svg, setSvg]               = useState("");
  const [svgErr, setSvgErr]         = useState("");
  const [mdHtml, setMdHtml]         = useState("");
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [drag, setDrag]             = useState(false);
  const [hasResult, setHasResult]   = useState(false);

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
    setImage(file);
    setImgPrev(URL.createObjectURL(file));
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
      ? `<h2>Flowchart</h2>${svg ? `<div>${svg}</div>` : ""}<pre style="background:#f1f5f9;padding:16px">${editContent}</pre>`
      : (mdHtml || editContent);
    const html = `<html><head><meta charset="utf-8"/><style>body{font-family:Calibri,Arial,sans-serif;margin:72pt;font-size:11pt;}pre{background:#f1f5f9;padding:12pt;}ul,ol{margin-left:20pt;}</style></head><body>${body}</body></html>`;
    triggerDL(URL.createObjectURL(new Blob(["\ufeff", html], { type: "application/msword" })), `${mode}.doc`);
  };

  return (
    <div className="workspace">
      {/* Upload Panel */}
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
              <div className="drop-icon">◈</div>
              <p><strong style={{ color: "var(--green)" }}>Drop image here</strong></p>
              <p>or click to upload</p>
              <p className="hint">JPG · PNG · WEBP · HEIC</p>
              <button className="btn-ghost" style={{ marginTop: 6 }} onClick={(e) => { e.stopPropagation(); camRef.current.click(); }}>◉ Camera</button>
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
            {loading ? <><span className="spin" /> Analyzing…</> : `✦ Convert to ${mode === "flowchart" ? "Flowchart" : "Clean Notes"}`}
          </button>
        )}
      </div>

      {/* Result Panel */}
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
            <div className="empty-icon">{mode === "flowchart" ? "◈" : "◧"}</div>
            <p style={{ color: "var(--muted2)" }}>Upload a {mode} image and click Convert</p>
            <p style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>Editable result with live preview</p>
          </div>
        )}

        {loading && (
          <div className="loading">
            <div className="spinner" />
            <p>Analyzing with GPT-4o…</p>
            <p style={{ fontSize: 10, color: "var(--muted)" }}>10–20 seconds</p>
          </div>
        )}

        {hasResult && !loading && (
          <div className="result-body">
            <div className="edit-col">
              <div className="panel-label">{mode === "flowchart" ? "⊞ Mermaid Code — Edit to adjust" : "✎ Notes — Edit freely"}</div>
              <textarea className={`code-area${mode === "notes" ? " notes" : ""}`}
                value={editContent} onChange={(e) => setEditContent(e.target.value)}
                spellCheck={mode === "notes"} placeholder={mode === "flowchart" ? "Mermaid.js code…" : "Your notes…"} />
            </div>
            <div className="preview-col">
              <div className="panel-label">◉ Live Preview</div>
              <div className="preview-scroll">
                {mode === "flowchart"
                  ? svgErr
                    ? <div className="mermaid-err">{svgErr}</div>
                    : svg
                      ? <div className="mermaid-out" dangerouslySetInnerHTML={{ __html: svg }} />
                      : <div style={{ color: "var(--muted)", fontSize: 11 }}>Rendering…</div>
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
        body: JSON.stringify({
          scriptPrompt,
          evalPrompt,
          client:  ctx.client,
          product: ctx.product,
          version: ctx.version,
        }),
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
    const styles = `
      body{font-family:Calibri,Arial,sans-serif;margin:48pt;font-size:11pt;color:#1a2332;background:#fff}
      .doc-hero{background:#0d1b2a;color:#fff;padding:20pt;border-radius:4pt;margin-bottom:14pt}
      .d-eyebrow{font-size:8pt;letter-spacing:2px;text-transform:uppercase;color:#00FF87;margin-bottom:6pt}
      h1{font-size:16pt;color:#00FF87;margin-bottom:4pt}
      .d-sub{font-size:9pt;color:#94a3b8}
      .d-meta{display:flex;gap:16pt;margin-top:12pt}
      .d-label{font-size:7pt;text-transform:uppercase;color:#64748b}
      .d-val{font-size:9pt;color:#e2e8f0}
      .doc-section{border:1pt solid #e4e9f0;border-radius:4pt;margin-bottom:12pt}
      .sec-hdr{background:#f8fafc;padding:9pt 13pt;border-bottom:1pt solid #e4e9f0;display:flex;align-items:center;gap:8pt}
      .sec-num{background:#0d1b2a;color:#fff;display:inline-block;padding:2pt 6pt;border-radius:3pt;font-size:8pt;font-weight:bold;margin-right:6pt}
      .sec-hdr h2{font-size:11pt;font-weight:bold;margin:0;text-transform:uppercase;letter-spacing:1px}
      .sec-body{padding:13pt}
      .stage-card{border:1pt solid #e4e9f0;border-radius:4pt;margin-bottom:9pt}
      .stage-hdr{background:#eff6ff;padding:8pt 12pt;border-bottom:1pt solid #e4e9f0}
      .stage-label{font-size:7pt;text-transform:uppercase;color:#64748b;letter-spacing:1px}
      .stage-name{font-size:10pt;font-weight:bold;color:#1d4ed8;display:block}
      .stage-body{padding:10pt}
      .stage-col{display:inline-block;vertical-align:top;width:48%;padding-right:8pt}
      .stage-col h4{font-size:7pt;font-weight:bold;text-transform:uppercase;color:#64748b;margin-bottom:5pt}
      .script-bubble{background:#f8fafc;border-left:2pt solid #0ea5e9;padding:6pt 9pt;font-size:9pt;line-height:1.6;margin-bottom:5pt}
      .eval-table{border-collapse:collapse;width:100%}
      .eval-table th{background:#0d1b2a;color:#fff;padding:7pt 10pt;font-size:8pt;font-weight:bold;text-align:left;border-bottom:1pt solid #e4e9f0}
      .eval-table td{padding:7pt 10pt;font-size:9pt;border-bottom:0.5pt solid #e4e9f0;vertical-align:top}
      .info-grid{display:table;width:100%}
      .info-item{display:table-cell;width:50%;padding-right:10pt;vertical-align:top}
      .i-label{font-size:7pt;font-weight:bold;text-transform:uppercase;color:#64748b;margin-bottom:3pt}
      .i-val{font-size:9pt;line-height:1.5}
      .flow-vis{margin-bottom:12pt}
      .flow-node{display:inline-block;background:#eff6ff;border:1pt solid #bfdbfe;color:#1d4ed8;font-size:8pt;padding:3pt 9pt;border-radius:3pt;margin:2pt}
      .flow-arr{display:inline-block;color:#94a3b8;margin:0 2pt}
      .outcome-chip{display:inline-block;border:0.5pt solid #bbf7d0;background:#f0fdf4;color:#15803d;font-size:8pt;padding:2pt 6pt;border-radius:3pt;margin:2pt}
      .outcome-chip.red{background:#fef2f2;border-color:#fecaca;color:#dc2626}
      .outcome-chip.yellow{background:#fffbeb;border-color:#fde68a;color:#b45309}
      .score-pill{display:inline-block;font-weight:bold;font-size:8pt;padding:1pt 6pt;border-radius:3pt}
      .score-pill.high{background:#dcfce7;color:#166534}
      .score-pill.med{background:#fef9c3;color:#854d0e}
      .score-pill.low{background:#fee2e2;color:#991b1b}
    `;
    const full = `<html><head><meta charset="utf-8"/><style>${styles}</style></head><body>${docHtml}</body></html>`;
    const blob = new Blob(["\ufeff", full], { type: "application/msword" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "AI_Call_Documentation.doc";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  return (
    <div className="doc-workspace">
      {/* Inputs */}
      <div className="doc-input-col">

        {/* Context */}
        <div className="input-card">
          <div className="input-card-hdr"><h4>◈ Document Context</h4></div>
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

        {/* Script Prompt */}
        <div className="input-card">
          <div className="input-card-hdr">
            <h4>◉ Call Script Prompt</h4>
            <span className="card-tag opt">Optional</span>
          </div>
          <textarea className="prompt-area" style={{ minHeight: 170 }}
            placeholder={"Paste your AI call script prompt here…\n\nExample:\n\"You are an AI agent for Swiggy. Introduce the delivery executive job, ask if willing to pay ₹2 onboarding fee. If yes → payment. If no → feedback capture…\""}
            value={scriptPrompt} onChange={(e) => setScriptPrompt(e.target.value)} />
        </div>

        {/* Eval Prompt */}
        <div className="input-card">
          <div className="input-card-hdr">
            <h4>◧ Evaluation Prompt</h4>
            <span className="card-tag opt">Optional</span>
          </div>
          <textarea className="prompt-area" style={{ minHeight: 150 }}
            placeholder={"Paste your evaluation/scoring prompt here…\n\nExample:\n\"Score the call: Opening (20pts), Objection handling (25pts), Pitch clarity (20pts), Closing (20pts), Compliance (15pts). Pass ≥ 70…\""}
            value={evalPrompt} onChange={(e) => setEvalPrompt(e.target.value)} />
        </div>

        {error && <div className="error-box">{error}</div>}

        <button className="btn-primary" style={{ width: "100%", margin: 0 }} onClick={generate} disabled={loading}>
          {loading ? <><span className="spin" /> Generating Document…</> : "✦ Generate Client Document"}
        </button>
      </div>

      {/* Output */}
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
            <p style={{ fontSize: 10, color: "var(--muted)" }}>Generating stages, scripts & evaluation framework</p>
          </div>
        )}

        {!docHtml && !loading && (
          <div className="empty-state">
            <div className="empty-icon">◧</div>
            <p style={{ color: "var(--muted2)" }}>Your client-ready document will appear here</p>
            <p style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>Paste your prompts and click Generate</p>
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
  const [tab, setTab]   = useState("image");
  const [toast, show]   = useToast();

  const TABS = [
    { id: "image", label: "Image → Structure",    icon: "◈" },
    { id: "doc",   label: "Prompt → Client Doc",  icon: "◧" },
  ];

  return (
    <>
      <style>{css}</style>
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      <div className="app">
        {/* Header */}
        <div className="hdr">
          <ScribbleLogo size={34} />
          <div className="hdr-title">
            <h1>Scribble to Structure</h1>
            <p>AI-powered · by Hunar</p>
          </div>
          <div className="hdr-right">
            <span className="badge">GPT-4o</span>
          </div>
        </div>

        <div className="layout">
          {/* Sidenav */}
          <nav className="sidenav">
            <div className="sidenav-section">Tools</div>
            {TABS.map((t) => (
              <button key={t.id} className={`sidenav-btn${tab === t.id ? " active" : ""}`} onClick={() => setTab(t.id)}>
                <span className="sicon">{t.icon}</span> {t.label}
              </button>
            ))}

            <div className="sidenav-section">Guide</div>
            <div style={{ padding: "8px 12px" }}>
              <div style={{ fontSize: 9, color: "var(--muted)", lineHeight: 1.9 }}>
                <div style={{ color: "var(--muted2)", marginBottom: 2 }}>◈ Image → Structure</div>
                <div style={{ paddingLeft: 12, marginBottom: 10 }}>Upload a flowchart or notes photo, convert to editable Mermaid / Markdown</div>
                <div style={{ color: "var(--muted2)", marginBottom: 2 }}>◧ Prompt → Client Doc</div>
                <div style={{ paddingLeft: 12 }}>Paste script & eval prompts, get a detailed client-ready document</div>
              </div>
            </div>

            <div className="sidenav-info">
              <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, fontWeight: 700 }}>Stack</div>
              {[["Model", "GPT-4o"], ["Vision", "Enabled"], ["Output", "SVG · DOC · MD"]].map(([l, v]) => (
                <div key={l} className="info-row">
                  <span>{l}</span>
                  <span className="info-val">{v}</span>
                </div>
              ))}
            </div>
          </nav>

          {/* Main */}
          <main className="main">
            {tab === "image" && <ImageSection showToast={show} />}
            {tab === "doc"   && <DocCreator   showToast={show} />}
          </main>
        </div>

        {/* Mobile bottom nav */}
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
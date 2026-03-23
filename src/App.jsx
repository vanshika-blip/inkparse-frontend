import { useState, useEffect, useRef, useCallback, memo } from "react";

const BACKEND_URL = "https://inkparse-backend.onrender.com";

// ── Mermaid ───────────────────────────────────────────────────────────────────
let mermaidLib = null, mermaidId = 0;
async function getMermaid() {
  if (!mermaidLib) {
    const mod = await import("https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs");
    mermaidLib = mod.default;
    mermaidLib.initialize({ startOnLoad: false, theme: "default", flowchart: { curve: "basis", padding: 20 }, fontSize: 13 });
  }
  return mermaidLib;
}

// ── Marked ────────────────────────────────────────────────────────────────────
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
  @import url('https://fonts.googleapis.com/css2?family=Archivo:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { overflow: hidden; }

  :root {
    --bg: #f7f7f7;
    --surf: #ffffff;
    --surf2: #f9f9f9;
    --surf3: #f2f2f2;
    --border: #e8e8e8;
    --border2: #d8d8d8;
    --ink: #111111;
    --ink2: #555555;
    --muted: #aaaaaa;
    --muted2: #888888;
    --r: 10px;
    --navy: #0D2B4E;
    --teal: #007A7A;
    --gold: #C9882A;
  }

  body { font-family: 'Archivo', sans-serif; background: var(--bg); color: var(--ink); min-height: 100vh; }

  .app { height: 100vh; width: 100vw; max-width: 100%; display: flex; flex-direction: column; overflow: hidden; }

  /* ── Header ── */
  .hdr { background: var(--surf); border-bottom: 1px solid var(--border); padding: 0 20px; height: 52px; display: flex; align-items: center; gap: 16px; flex-shrink: 0; width: 100%; max-width: 100%; overflow: hidden; }
  .hdr-brand { display: flex; align-items: center; gap: 9px; flex-shrink: 0; }
  .hdr-logo { width: 28px; height: 28px; background: var(--ink); border-radius: 7px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .hdr-name { font-size: 14px; font-weight: 700; color: var(--ink); letter-spacing: -0.4px; }
  .hdr-divider { width: 1px; height: 18px; background: var(--border); flex-shrink: 0; }
  .tab-pill { display: flex; background: var(--surf3); border-radius: 8px; padding: 3px; gap: 2px; flex-shrink: 0; }
  .tab-pill-btn { font-family: 'Archivo', sans-serif; font-size: 12px; font-weight: 500; padding: 5px 16px; border-radius: 6px; border: none; background: transparent; color: var(--muted2); cursor: pointer; transition: all 0.15s; white-space: nowrap; }
  .tab-pill-btn.on { background: var(--surf); color: var(--ink); font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .tab-pill-btn:hover:not(.on) { color: var(--ink2); }
  .hdr-right { margin-left: auto; display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
  .status-dot { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; flex-shrink: 0; }
  .hdr-model { font-size: 11px; font-weight: 500; color: var(--muted2); }

  /* ── Main ── */
  .main { flex: 1; width: 100%; min-height: 0; min-width: 0; overflow: hidden; display: flex; flex-direction: column; }

  /* ── Workspace ── */
  .workspace { flex: 1; width: 100%; min-width: 0; display: flex; gap: 12px; padding: 14px; min-height: 0; overflow: hidden; }

  /* ── Panel ── */
  .panel { background: var(--surf); border: 1px solid var(--border); border-radius: var(--r); display: flex; flex-direction: column; overflow: hidden; min-height: 0; }
  .panel-hdr { padding: 10px 14px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
  .panel-title { font-size: 11px; font-weight: 600; color: var(--ink2); text-transform: uppercase; letter-spacing: 0.6px; }
  .panel-label { font-size: 10px; font-weight: 500; color: var(--muted); padding: 6px 12px; border-bottom: 1px solid var(--border); background: var(--surf2); flex-shrink: 0; text-transform: uppercase; letter-spacing: 0.4px; }

  /* ── Upload toggle ── */
  .upload-toggle { display: flex; background: var(--surf3); border-radius: 6px; padding: 2px; gap: 2px; }
  .upload-toggle button { font-family: 'Archivo', sans-serif; font-size: 11px; font-weight: 500; padding: 4px 12px; border-radius: 5px; border: none; background: transparent; color: var(--muted); cursor: pointer; transition: all 0.13s; }
  .upload-toggle button.on { background: var(--surf); color: var(--ink); font-weight: 600; box-shadow: 0 1px 2px rgba(0,0,0,0.08); }

  /* ── Upload panel ── */
  .upload-panel { width: 260px; flex-shrink: 0; }
  .drop-zone { flex: 1; display: flex; align-items: center; justify-content: center; border: 1.5px dashed var(--border2); border-radius: 8px; margin: 12px; cursor: pointer; transition: all 0.18s; background: var(--surf2); }
  .drop-zone:hover, .drop-zone.drag { border-color: #888; background: var(--surf3); }
  .drop-inner { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 28px 20px; text-align: center; }
  .drop-arrow { width: 32px; height: 32px; border-radius: 8px; border: 1.5px solid var(--border2); display: flex; align-items: center; justify-content: center; margin-bottom: 4px; }
  .drop-zone p { font-size: 12px; color: var(--ink2); }
  .drop-hint { font-size: 10px !important; color: var(--muted) !important; margin-top: 2px; }
  .img-preview-wrap { flex: 1; overflow: auto; padding: 12px; display: flex; align-items: flex-start; justify-content: center; }
  .img-preview { max-width: 100%; border-radius: 7px; border: 1px solid var(--border); }

  /* ── Buttons ── */
  .btn-convert { font-family: 'Archivo', sans-serif; font-size: 12px; font-weight: 600; background: var(--ink); color: #fff; border: none; padding: 10px 16px; border-radius: 7px; cursor: pointer; transition: all 0.15s; margin: 0 12px 12px; display: flex; align-items: center; justify-content: center; gap: 8px; flex-shrink: 0; }
  .btn-convert:hover:not(:disabled) { background: #333; }
  .btn-convert:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-cam { font-family: 'Archivo', sans-serif; font-size: 11px; font-weight: 500; background: var(--surf2); border: 1px solid var(--border2); color: var(--ink2); padding: 7px 14px; border-radius: 6px; cursor: pointer; transition: all 0.13s; margin: 0 12px 12px; flex-shrink: 0; }
  .btn-cam:hover { border-color: #aaa; color: var(--ink); }
  .btn-text { background: none; border: none; font-family: 'Archivo', sans-serif; font-size: 11px; color: var(--muted); cursor: pointer; padding: 4px 6px; border-radius: 4px; transition: all 0.13s; }
  .btn-text:hover { color: #ef4444; background: #fef2f2; }
  .btn-dl { font-family: 'Archivo', sans-serif; font-size: 10px; font-weight: 600; background: var(--surf2); border: 1px solid var(--border2); color: var(--ink2); padding: 4px 11px; border-radius: 5px; cursor: pointer; transition: all 0.13s; }
  .btn-dl:hover { background: var(--ink); color: #fff; border-color: var(--ink); }

  /* ── PDF button ── */
  .btn-pdf { font-family: 'Archivo', sans-serif; font-size: 10px; font-weight: 700; background: var(--navy); color: #fff; border: none; padding: 4px 12px; border-radius: 5px; cursor: pointer; transition: all 0.13s; letter-spacing: 0.2px; display: flex; align-items: center; gap: 5px; }
  .btn-pdf:hover:not(:disabled) { background: #1a4a7a; }
  .btn-pdf:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-pdf-spin { width: 9px; height: 9px; border: 1.5px solid transparent; border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; display: inline-block; }

  .dl-bar { display: flex; gap: 6px; align-items: center; }

  /* ── Result panels (Image section) ── */
  .result-panel { flex: 1; min-width: 0; width: 0; }
  .result-body { flex: 1; display: flex; min-height: 0; overflow: hidden; }
  .edit-col { width: 42%; border-right: 1px solid var(--border); display: flex; flex-direction: column; min-height: 0; }
  .preview-col { flex: 1; display: flex; flex-direction: column; min-height: 0; }

  .code-area { flex: 1; width: 100%; border: none; outline: none; resize: none; padding: 13px; font-family: 'Courier New', monospace; font-size: 11px; line-height: 1.7; color: #374151; background: #fafafa; overflow: auto; white-space: pre; min-height: 0; }
  .code-area.notes { white-space: pre-wrap; word-wrap: break-word; font-family: 'Archivo', sans-serif; font-size: 12px; }
  .preview-scroll { flex: 1; overflow: auto; padding: 16px; min-height: 0; background: #fff; }

  /* ── Scrollbars ── */
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-thumb { background: #e0e0e0; border-radius: 2px; }

  /* ── Mermaid ── */
  .mermaid-out { overflow-x: auto; }
  .mermaid-out svg { max-width: 100%; height: auto; border-radius: 6px; }
  .mermaid-err { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; padding: 10px 13px; border-radius: 7px; font-size: 11px; }

  /* ── Notes markdown ── */
  .md-out { font-size: 13px; line-height: 1.8; color: #374151; }
  .md-out h1 { font-size: 18px; font-weight: 700; margin-bottom: 12px; color: #111; border-bottom: 1px solid var(--border); padding-bottom: 8px; }
  .md-out h2 { font-size: 15px; font-weight: 600; margin: 16px 0 8px; color: #222; }
  .md-out h3 { font-size: 13px; font-weight: 600; margin: 12px 0 5px; color: #333; }
  .md-out p { margin-bottom: 9px; }
  .md-out ul, .md-out ol { margin: 6px 0 6px 20px; }
  .md-out li { margin-bottom: 3px; }
  .md-out strong { font-weight: 700; color: #111; }
  .md-out code { background: var(--surf3); padding: 1px 5px; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 0.9em; }
  .md-out blockquote { border-left: 3px solid #ddd; padding-left: 12px; color: var(--muted2); margin: 10px 0; }
  .md-out hr { border: none; border-top: 1px solid var(--border); margin: 14px 0; }

  /* ── States ── */
  .empty-state { flex: 1; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 8px; color: var(--muted); font-size: 12px; text-align: center; padding: 32px; }
  .empty-icon { width: 36px; height: 36px; border-radius: 8px; border: 1.5px dashed var(--border2); margin-bottom: 6px; }
  .loading { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; color: var(--muted2); font-size: 12px; }
  .spinner { width: 26px; height: 26px; border: 2px solid var(--border2); border-top-color: var(--ink); border-radius: 50%; animation: spin 0.75s linear infinite; }
  .spin { width: 12px; height: 12px; border: 2px solid transparent; border-top-color: currentColor; border-radius: 50%; animation: spin 0.7s linear infinite; display: inline-block; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .error-box { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; padding: 10px 13px; border-radius: 7px; font-size: 11px; margin: 10px; flex-shrink: 0; }
  .loading-bar { height: 2px; background: linear-gradient(90deg, #0D2B4E, #007A7A, #C9882A, #0D2B4E); background-size: 300%; animation: lbar 1.6s ease infinite; flex-shrink: 0; }
  @keyframes lbar { 0% { background-position: 0%; } 100% { background-position: 300%; } }

  /* ── Doc workspace ── */
  .doc-workspace { flex: 1; width: 100%; min-width: 0; display: flex; gap: 12px; padding: 14px; min-height: 0; overflow: hidden; }
  .doc-input-col { width: 290px; flex-shrink: 0; display: flex; flex-direction: column; min-height: 0; gap: 10px; }
  .doc-cards-scroll { flex: 1; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; min-height: 0; }
  .doc-output-col { flex: 1; min-width: 0; display: flex; flex-direction: column; }

  /* ── Doc output: full preview only (no editor) ── */
  .doc-preview-full { flex: 1; display: flex; flex-direction: column; min-height: 0; }
  .doc-iframe { flex: 1; border: none; min-height: 0; background: white; width: 100%; border-radius: 0 0 var(--r) var(--r); }

  /* ── Input cards ── */
  .input-card { background: var(--surf); border: 1px solid var(--border); border-radius: var(--r); display: flex; flex-direction: column; overflow: hidden; flex-shrink: 0; }
  .input-card-hdr { padding: 9px 13px; background: var(--surf2); border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
  .input-card-hdr h4 { font-size: 11px; font-weight: 600; color: var(--ink2); text-transform: uppercase; letter-spacing: 0.5px; }
  .card-tag { font-size: 9px; font-weight: 500; color: var(--muted); border: 1px solid var(--border); padding: 1px 7px; border-radius: 3px; }
  .prompt-area { width: 100%; border: none; outline: none; resize: vertical; padding: 11px 13px; font-family: 'Archivo', sans-serif; font-size: 12px; line-height: 1.65; color: #374151; background: #fff; min-height: 90px; }
  .prompt-area::placeholder { color: var(--muted); font-size: 11px; }
  .ctx-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; padding: 11px 13px; }
  .field-label { font-size: 10px; font-weight: 600; color: var(--muted2); text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 4px; }
  .field-input { width: 100%; background: var(--surf2); border: 1px solid var(--border2); border-radius: 6px; padding: 7px 10px; font-family: 'Archivo', sans-serif; font-size: 12px; color: var(--ink); outline: none; transition: border-color 0.13s; }
  .field-input:focus { border-color: #888; }
  .field-full { padding: 0 13px 11px; display: flex; flex-direction: column; }

  /* ── Toast ── */
  .toast { position: fixed; top: 62px; left: 50%; transform: translateX(-50%); background: #fff; border: 1px solid var(--border2); box-shadow: 0 4px 16px rgba(0,0,0,0.08); border-radius: 7px; padding: 9px 18px; font-size: 12px; font-weight: 600; z-index: 1000; white-space: nowrap; animation: tslide 0.2s ease; font-family: 'Archivo', sans-serif; }
  @keyframes tslide { from { opacity: 0; transform: translateX(-50%) translateY(-6px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
  .toast.ok  { border-color: #86efac; color: #166534; }
  .toast.err { border-color: #fca5a5; color: #dc2626; }
  .toast.info{ border-color: #93c5fd; color: #1d4ed8; }

  /* ── Mobile ── */
  @media (max-width: 640px) {
    .workspace, .doc-workspace { flex-direction: column; overflow-y: auto; }
    .upload-panel, .doc-input-col { width: 100%; }
    .tab-pill-btn { padding: 5px 11px; font-size: 11px; }
    .hdr { padding: 0 12px; gap: 10px; }
  }
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

// ── Logo SVG ──────────────────────────────────────────────────────────────────
const Logo = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M2 12 C3 10 4.5 6 6 8.5 C7.5 11 8 4 10 7 C12 10 13 8.5 14 7.5"
      stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

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
  }, [hasResult]);

  const loadFile = (file) => {
    if (!file || !file.type.startsWith("image/")) { setError("Please upload a valid image."); return; }
    setImage(file); setImgPrev(URL.createObjectURL(file));
    setEditContent(""); setSvg(""); setSvgErr(""); setError(""); setHasResult(false); setMdHtml("");
  };

  const reset = () => { setImage(null); setImgPrev(null); setEditContent(""); setSvg(""); setSvgErr(""); setError(""); setHasResult(false); setMdHtml(""); };

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
      const content = data.content.trim();
      setEditContent(content); setHasResult(true);
      if (mode === "flowchart") renderMermaid(content);
      else renderMd(content);
      showToast("Converted ✓", "ok");
    } catch (e) {
      setError("Error: " + e.message);
      showToast("Conversion failed", "err");
    } finally { setLoading(false); }
  };

  const triggerDL = (url, name) => { const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); document.body.removeChild(a); };

  const downloadSVG = () => { if (!svg) return; triggerDL(URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })), "flowchart.svg"); };

  const downloadDOC = () => {
    const body = mode === "flowchart"
      ? `<h2>Flowchart</h2>${svg ? `<div>${svg}</div>` : ""}<pre style="background:#f9fafb;padding:16px">${editContent}</pre>`
      : (mdHtml || editContent);
    const html = `<html><head><meta charset="utf-8"/><style>body{font-family:Calibri,Arial,sans-serif;margin:72pt;font-size:11pt;}</style></head><body>${body}</body></html>`;
    triggerDL(URL.createObjectURL(new Blob(["\ufeff", html], { type: "application/msword" })), `${mode}.doc`);
  };

  return (
    <div className="workspace">
      <div className="panel upload-panel">
        <div className="panel-hdr">
          <span className="panel-title">Upload</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="upload-toggle">
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
              <div className="drop-arrow">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 1v10M2 7l5 5 5-5" stroke="#aaa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <p><strong style={{ fontWeight: 600, color: "#111" }}>Drop image here</strong></p>
              <p>or click to upload</p>
              <p className="drop-hint">JPG · PNG · WEBP · HEIC</p>
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => loadFile(e.target.files[0])} />
            <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => loadFile(e.target.files[0])} />
          </div>
        ) : (
          <div className="img-preview-wrap">
            <img src={imgPrev} alt="Uploaded" className="img-preview" />
          </div>
        )}

        {!imgPrev && <button className="btn-cam" onClick={(e) => { e.stopPropagation(); camRef.current.click(); }}>Use Camera</button>}
        {imgPrev && (
          <button className="btn-convert" onClick={analyze} disabled={loading}>
            {loading ? <><span className="spin" /> Analyzing…</> : `Convert to ${mode === "flowchart" ? "Flowchart" : "Notes"} →`}
          </button>
        )}
      </div>

      <div className="panel result-panel">
        {loading && <div className="loading-bar" />}
        <div className="panel-hdr">
          <span className="panel-title">Result</span>
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
            <div className="empty-icon" />
            <p style={{ fontWeight: 500, color: "#555" }}>Upload an image and click Convert</p>
            <p style={{ fontSize: 11 }}>Editable result with live preview</p>
          </div>
        )}
        {loading && (
          <div className="loading">
            <div className="spinner" />
            <p>Analyzing with GPT-4o…</p>
            <p style={{ fontSize: 11, color: "#bbb" }}>10–20 seconds</p>
          </div>
        )}
        {hasResult && !loading && (
          <div className="result-body">
            <div className="edit-col">
              <div className="panel-label">{mode === "flowchart" ? "Mermaid code" : "Markdown"}</div>
              <textarea
                className={`code-area${mode === "notes" ? " notes" : ""}`}
                value={editContent}
                onChange={(e) => {
                  setEditContent(e.target.value);
                  if (mode === "flowchart") renderMermaid(e.target.value);
                  else renderMd(e.target.value);
                }}
                spellCheck={mode === "notes"}
              />
            </div>
            <div className="preview-col">
              <div className="panel-label">Preview</div>
              <div className="preview-scroll">
                {mode === "flowchart"
                  ? svgErr ? <div className="mermaid-err">{svgErr}</div>
                    : svg ? <div className="mermaid-out" dangerouslySetInnerHTML={{ __html: svg }} />
                    : <div style={{ color: "#bbb", fontSize: 12 }}>Rendering…</div>
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
  const [pdfLoading, setPdfLoading]     = useState(false);
  const [error, setError]               = useState("");

  const iframeRef = useRef(null);

  // Update iframe whenever docHtml changes
  useEffect(() => {
    if (docHtml && iframeRef.current) {
      iframeRef.current.srcdoc = docHtml;
    }
  }, [docHtml]);

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

  // ── PDF: open in new tab with print-colour CSS and trigger print dialog ──
  const downloadPDF = useCallback(() => {
    if (!docHtml || pdfLoading) return;
    setPdfLoading(true);

    try {
      // Inject print-colour CSS into the document before opening
      const printCss = `
        <style id="inkparse-print">
          @media print {
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
            body { margin: 0 !important; }
            .no-print { display: none !important; }
          }
        </style>
      `;

      // Insert print CSS right after <head>
      let printHtml = docHtml;
      if (printHtml.includes("<head>")) {
        printHtml = printHtml.replace("<head>", "<head>" + printCss);
      } else if (printHtml.includes("<HEAD>")) {
        printHtml = printHtml.replace("<HEAD>", "<HEAD>" + printCss);
      } else {
        printHtml = printCss + printHtml;
      }

      // Also inject an auto-print script
      const printScript = `<script>window.addEventListener('load', function(){ setTimeout(function(){ window.print(); }, 800); });<\/script>`;
      if (printHtml.includes("</body>")) {
        printHtml = printHtml.replace("</body>", printScript + "</body>");
      } else {
        printHtml = printHtml + printScript;
      }

      const blob = new Blob([printHtml], { type: "text/html;charset=utf-8" });
      const url  = URL.createObjectURL(blob);
      const win  = window.open(url, "_blank");

      if (!win) {
        // Popup blocked fallback: download as HTML
        const a = document.createElement("a");
        a.href = url;
        a.download = "AI_Call_Documentation.html";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast("Popup blocked — downloaded as HTML instead", "info");
      } else {
        showToast("Print dialog will open — choose 'Save as PDF'", "info");
        // Revoke blob URL after enough time
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    } catch (err) {
      showToast("PDF export failed: " + err.message, "err");
    } finally {
      setPdfLoading(false);
    }
  }, [docHtml, pdfLoading, showToast]);

  // Download raw HTML
  const downloadHTML = useCallback(() => {
    if (!docHtml) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([docHtml], { type: "text/html" }));
    a.download = "AI_Call_Documentation.html";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    showToast("HTML downloaded ✓", "ok");
  }, [docHtml, showToast]);

  return (
    <div className="doc-workspace">

      {/* ── Left: inputs ── */}
      <div className="doc-input-col">
        <div className="doc-cards-scroll">

          <div className="input-card">
            <div className="input-card-hdr"><h4>Context</h4></div>
            <div className="ctx-grid">
              <div>
                <div className="field-label">Client</div>
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

        <button className="btn-convert" style={{ margin: 0, width: "100%" }} onClick={generate} disabled={loading}>
          {loading ? <><span className="spin" /> Generating…</> : "Generate Client Document →"}
        </button>
      </div>

      {/* ── Right: output panel — live preview only ── */}
      <div className="panel doc-output-col">
        {loading && <div className="loading-bar" />}

        <div className="panel-hdr">
          <span className="panel-title">Live Preview</span>
          {docHtml && (
            <div className="dl-bar">
              <button className="btn-dl" onClick={downloadHTML} title="Download .html file">↓ HTML</button>
              <button className="btn-pdf" onClick={downloadPDF} disabled={pdfLoading} title="Opens in new tab — choose Save as PDF in print dialog">
                {pdfLoading ? <><span className="btn-pdf-spin" /> Opening…</> : "⎙ Save as PDF"}
              </button>
            </div>
          )}
        </div>

        {loading && (
          <div className="loading">
            <div className="spinner" />
            <p>GPT-4o is writing your document…</p>
            <p style={{ fontSize: 11, color: "#bbb" }}>Generating stages, scripts & evaluation framework</p>
          </div>
        )}

        {!docHtml && !loading && (
          <div className="empty-state">
            <div className="empty-icon" />
            <p style={{ fontWeight: 500, color: "#555" }}>Your document will appear here</p>
            <p style={{ fontSize: 11 }}>Paste prompts and click Generate</p>
          </div>
        )}

        {/* ── Full-width live iframe preview ── */}
        {docHtml && !loading && (
          <div className="doc-preview-full">
            <iframe
              ref={iframeRef}
              className="doc-iframe"
              title="Document Preview"
              sandbox="allow-same-origin allow-scripts"
              srcdoc={docHtml}
            />
          </div>
        )}
      </div>
    </div>
  );
});

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("image");
  const [toast, show] = useToast();

  return (
    <>
      <style>{css}</style>
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
      <div className="app">
        <header className="hdr">
          <div className="hdr-brand">
            <div className="hdr-logo"><Logo /></div>
            <span className="hdr-name">InkParse</span>
          </div>
          <div className="hdr-divider" />
          <div className="tab-pill">
            <button className={`tab-pill-btn${tab === "image" ? " on" : ""}`} onClick={() => setTab("image")}>Image → Structure</button>
            <button className={`tab-pill-btn${tab === "doc" ? " on" : ""}`} onClick={() => setTab("doc")}>Prompt → Client Doc</button>
          </div>
          <div className="hdr-right">
            <span className="hdr-model">GPT-4o</span>
            <div className="status-dot" />
          </div>
        </header>
        <main className="main">
          {tab === "image" && <ImageSection showToast={show} />}
          {tab === "doc"   && <DocCreator   showToast={show} />}
        </main>
      </div>
    </>
  );
}
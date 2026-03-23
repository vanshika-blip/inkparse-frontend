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

  /* ── Doc output: contenteditable live preview (full width, no HTML editor) ── */
  .doc-result-body { flex: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
  .doc-live-wrap { flex: 1; overflow: auto; min-height: 0; background: var(--surf3); padding: 16px; }
  .doc-live-inner {
    background: white;
    min-height: 100%;
    border-radius: 6px;
    box-shadow: 0 1px 8px rgba(0,0,0,0.07);
    outline: none;
    cursor: text;
    padding: 0;
    overflow: hidden;
  }
  .doc-live-inner:focus-within { box-shadow: 0 0 0 2px rgba(0,122,122,0.18), 0 1px 8px rgba(0,0,0,0.07); }

  /* ── Doc editing toolbar buttons (panel header) ── */
  .doc-tool-btn { font-family: 'Archivo', sans-serif; font-size: 10px; font-weight: 600; background: var(--surf3); border: 1px solid var(--border2); color: var(--ink2); padding: 3px 9px; border-radius: 4px; cursor: pointer; transition: all 0.13s; }
  .doc-tool-btn:hover { background: var(--navy); color: white; border-color: var(--navy); }
  .doc-tool-del:hover { background: #C0392B; border-color: #C0392B; color: white; }

  /* ── Floating text-selection toolbar ── */
  .float-toolbar {
    position: absolute;
    z-index: 200;
    background: #1a1a1a;
    border-radius: 6px;
    padding: 4px 6px;
    display: flex;
    align-items: center;
    gap: 2px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.25);
    transform: translateX(-50%);
    pointer-events: all;
  }
  .float-toolbar button { background: none; border: none; color: white; font-family: 'Archivo', sans-serif; font-size: 12px; font-weight: 600; padding: 3px 7px; border-radius: 4px; cursor: pointer; transition: background 0.1s; }
  .float-toolbar button:hover { background: rgba(255,255,255,0.15); }
  .float-sep { width: 1px; height: 16px; background: rgba(255,255,255,0.2); margin: 0 2px; flex-shrink: 0; }


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

  /* ══════════════════════════════════════
     FLOW CANVAS
  ══════════════════════════════════════ */
  .canvas-workspace { flex: 1; display: flex; min-height: 0; overflow: hidden; }

  /* ── Side palette ── */
  .canvas-palette {
    width: 200px; flex-shrink: 0;
    background: var(--surf);
    border-right: 1px solid var(--border);
    display: flex; flex-direction: column;
    overflow: hidden;
  }
  .palette-hdr { padding: 10px 14px; border-bottom: 1px solid var(--border); }
  .palette-hdr h3 { font-size: 10px; font-weight: 700; color: var(--ink2); text-transform: uppercase; letter-spacing: 0.6px; }
  .palette-body { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 6px; }
  .palette-section { font-size: 9px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; margin: 6px 0 3px; }

  .palette-item {
    border-radius: 6px; padding: 7px 10px; cursor: grab;
    border: 1.5px solid transparent;
    transition: all 0.13s; user-select: none;
    display: flex; align-items: center; gap: 7px;
  }
  .palette-item:hover { transform: translateX(2px); border-color: var(--border2); }
  .palette-item:active { cursor: grabbing; transform: scale(0.97); }
  .pi-icon { width: 20px; height: 20px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
  .pi-label { font-size: 11px; font-weight: 600; }
  .pi-sub   { font-size: 9px; opacity: 0.7; margin-top: 1px; }

  /* Node type colours */
  .pi-stage    { background: #EBF0F7; } .pi-stage    .pi-label { color: #0D2B4E; }
  .pi-decision { background: #FEF5E7; } .pi-decision .pi-label { color: #C9882A; }
  .pi-action   { background: #E6F4F1; } .pi-action   .pi-label { color: #007A7A; }
  .pi-speech   { background: #FFFFFF; border: 1px solid #ddd !important; } .pi-speech .pi-label { color: #374151; }
  .pi-column   { background: #F4F7FA; } .pi-column   .pi-label { color: #374151; }
  .pi-terminal { background: #EBF0F7; } .pi-terminal .pi-label { color: #0D2B4E; }
  .pi-note     { background: #FFFBEB; } .pi-note     .pi-label { color: #92400E; }

  /* ── Canvas area ── */
  .canvas-area {
    flex: 1; position: relative; overflow: hidden;
    background-color: #f8f9fb;
    background-image: radial-gradient(circle, #d1d5db 1px, transparent 1px);
    background-size: 24px 24px;
    cursor: default;
  }
  .canvas-area.connecting { cursor: crosshair; }

  .canvas-svg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
  .canvas-svg .edge { pointer-events: stroke; }
  .canvas-svg .edge:hover { stroke-width: 3; }

  /* ── Nodes ── */
  .flow-node {
    position: absolute;
    border-radius: 8px;
    padding: 9px 13px;
    min-width: 100px;
    cursor: move;
    user-select: none;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    border: 2px solid transparent;
    transition: box-shadow 0.13s, border-color 0.13s;
  }
  .flow-node:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.14); }
  .flow-node.selected { border-color: #3B82F6 !important; box-shadow: 0 0 0 3px rgba(59,130,246,0.2); }
  .flow-node.stage    { background: #EBF0F7; border-color: #B8C9E0; }
  .flow-node.decision { background: #FEF5E7; border-color: #F0C97A; transform-origin: center; clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%); min-width: 150px; min-height: 90px; display:flex; align-items:center; justify-content:center; }
  .flow-node.action   { background: #E6F4F1; border-color: #A7D4CC; }
  .flow-node.script   { background: #F3E8FF; border-color: #C4B5FD; border-radius: 14px; }
  .flow-node.terminal { background: #0D2B4E; border-color: #0D2B4E; border-radius: 24px; text-align: center; }
  .flow-node.note     { background: #FFFBEB; border-color: #FCD34D; border-radius: 2px; box-shadow: 2px 2px 6px rgba(0,0,0,0.1); }

  /* Speech bubble node */
  .flow-node.speech {
    background: #FFFFFF;
    border: 1.5px solid #C4C4C4;
    border-radius: 12px;
    box-shadow: 1px 2px 8px rgba(0,0,0,0.1);
    position: absolute;
  }
  .flow-node.speech::after {
    content: '';
    position: absolute;
    bottom: -10px; left: 18px;
    width: 0; height: 0;
    border-left: 8px solid transparent;
    border-right: 4px solid transparent;
    border-top: 10px solid #C4C4C4;
  }
  .flow-node.speech::before {
    content: '';
    position: absolute;
    bottom: -8px; left: 19px;
    width: 0; height: 0;
    border-left: 7px solid transparent;
    border-right: 3px solid transparent;
    border-top: 9px solid white;
    z-index: 1;
  }

  /* Column header — bold label bar */
  .flow-node.column {
    background: #F4F7FA;
    border: 1.5px solid #D0D7E0;
    border-radius: 5px;
    padding: 7px 12px;
    text-align: center;
    font-weight: 800;
    font-size: 11px;
    letter-spacing: 0.5px;
    color: #374151;
    cursor: move;
    display: flex; align-items: center; justify-content: center;
  }

  .node-title { font-size: 10.5px; font-weight: 700; line-height: 1.35; }
  .node-body  { font-size: 9px; line-height: 1.5; margin-top: 3px; opacity: 0.9; white-space: pre-line; }
  .flow-node.stage    .node-title { color: #0D2B4E; }
  .flow-node.action   .node-title { color: #007A7A; }
  .flow-node.script   .node-title { color: #6D28D9; }
  .flow-node.speech   .node-title { color: #374151; font-style: italic; font-size: 9px; font-weight: 400; }
  .flow-node.speech   .node-body  { font-size: 9px; font-style: italic; color: #374151; }
  .flow-node.terminal .node-title { color: white; text-align: center; font-size: 10px; }
  .flow-node.terminal .node-body  { color: rgba(255,255,255,0.8); }
  .flow-node.note     .node-title { color: #92400E; }

  /* decision label sits centered */
  .flow-node.decision .node-title { color: #C9882A; text-align: center; font-size: 10px; }
  .flow-node.decision .node-body  { color: #92400E; text-align: center; }

  /* connect port dots */
  .port {
    position: absolute; width: 10px; height: 10px; border-radius: 50%;
    background: white; border: 2px solid #94a3b8;
    cursor: crosshair; transition: all 0.1s; z-index: 10;
  }
  .port:hover { background: #3B82F6; border-color: #3B82F6; transform: scale(1.4); }
  .port.top    { top: -5px;    left: 50%;  transform: translateX(-50%); }
  .port.bottom { bottom: -5px; left: 50%;  transform: translateX(-50%); }
  .port.left   { left: -5px;   top: 50%;   transform: translateY(-50%); }
  .port.right  { right: -5px;  top: 50%;   transform: translateY(-50%); }
  .port:hover.top    { transform: translateX(-50%) scale(1.4); }
  .port:hover.bottom { transform: translateX(-50%) scale(1.4); }
  .port:hover.left   { transform: translateY(-50%) scale(1.4); }
  .port:hover.right  { transform: translateY(-50%) scale(1.4); }

  /* ── Node inline editor ── */
  .node-editor-overlay {
    position: fixed; inset: 0; z-index: 500;
    background: rgba(0,0,0,0.3);
    display: flex; align-items: center; justify-content: center;
  }
  .node-editor-box {
    background: white; border-radius: 10px;
    padding: 18px 20px; width: 300px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.18);
  }
  .node-editor-box h4 { font-size: 12px; font-weight: 700; color: var(--ink); margin-bottom: 12px; }
  .node-editor-box label { font-size: 10px; font-weight: 600; color: var(--muted2); text-transform: uppercase; letter-spacing: 0.4px; display: block; margin-bottom: 4px; margin-top: 10px; }
  .node-editor-box input, .node-editor-box textarea {
    width: 100%; border: 1px solid var(--border2); border-radius: 6px;
    padding: 7px 10px; font-family: 'Archivo', sans-serif; font-size: 12px;
    color: var(--ink); outline: none; resize: vertical;
  }
  .node-editor-box input:focus, .node-editor-box textarea:focus { border-color: #007A7A; }
  .node-editor-actions { display: flex; gap: 8px; margin-top: 14px; justify-content: flex-end; }
  .btn-editor-save { font-family: 'Archivo', sans-serif; font-size: 11px; font-weight: 700; background: var(--navy); color: white; border: none; padding: 7px 16px; border-radius: 6px; cursor: pointer; }
  .btn-editor-del  { font-family: 'Archivo', sans-serif; font-size: 11px; font-weight: 600; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; padding: 7px 12px; border-radius: 6px; cursor: pointer; }
  .btn-editor-cancel { font-family: 'Archivo', sans-serif; font-size: 11px; font-weight: 500; background: var(--surf2); color: var(--ink2); border: 1px solid var(--border); padding: 7px 12px; border-radius: 6px; cursor: pointer; }

  /* ── Canvas toolbar ── */
  .canvas-toolbar {
    position: absolute; top: 12px; left: 50%; transform: translateX(-50%);
    background: white; border: 1px solid var(--border);
    border-radius: 8px; padding: 5px 8px;
    display: flex; align-items: center; gap: 4px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.1);
    z-index: 100;
  }
  .ct-btn {
    font-family: 'Archivo', sans-serif; font-size: 10px; font-weight: 600;
    background: none; border: none; color: var(--ink2);
    padding: 4px 9px; border-radius: 5px; cursor: pointer;
    transition: all 0.12s; white-space: nowrap;
  }
  .ct-btn:hover { background: var(--surf3); color: var(--ink); }
  .ct-btn.active { background: var(--navy); color: white; }
  .ct-btn.danger:hover { background: #fef2f2; color: #dc2626; }
  .ct-sep { width: 1px; height: 18px; background: var(--border); margin: 0 2px; }

  /* ── Zoom controls ── */
  .canvas-zoom {
    position: absolute; bottom: 16px; right: 16px;
    display: flex; gap: 4px; z-index: 100;
    background: white; border: 1px solid var(--border); border-radius: 7px;
    padding: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }
  .zoom-btn { font-family: 'Archivo', sans-serif; font-size: 13px; font-weight: 700; background: none; border: none; color: var(--ink2); width: 26px; height: 26px; border-radius: 5px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.1s; }
  .zoom-btn:hover { background: var(--surf3); }
  .zoom-label { font-size: 10px; font-weight: 600; color: var(--muted2); min-width: 36px; display: flex; align-items: center; justify-content: center; }

  /* ── Edge label ── */
  .edge-label { font-size: 9px; font-weight: 600; fill: #6B7280; pointer-events: none; }
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
  const [toolbar, setToolbar]           = useState({ show: false, x: 0, y: 0 });

  const liveRef    = useRef(null);
  const wrapRef    = useRef(null);
  const toolbarRef = useRef(null);

  // ── Inject HTML once after generation ──
  useEffect(() => {
    if (liveRef.current && docHtml) {
      liveRef.current.innerHTML = docHtml;
    }
  }, [docHtml]);

  // ── Hide toolbar on outside click ──
  useEffect(() => {
    const handler = (e) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target)) {
        setToolbar(t => ({ ...t, show: false }));
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Show floating toolbar on text selection ──
  const handleSelect = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !liveRef.current?.contains(sel.anchorNode)) {
      setToolbar(t => ({ ...t, show: false }));
      return;
    }
    const range = sel.getRangeAt(0);
    const rect  = range.getBoundingClientRect();
    const wrap  = wrapRef.current?.getBoundingClientRect() || { left: 0, top: 0 };
    setToolbar({ show: true, x: rect.left - wrap.left + rect.width / 2, y: rect.top - wrap.top - 44 });
  }, []);

  const execCmd = (cmd, value = null) => {
    liveRef.current?.focus();
    document.execCommand(cmd, false, value);
    setToolbar(t => ({ ...t, show: false }));
  };

  // ── Add a new call step row at the bottom of the flow ──
  const addStep = useCallback(() => {
    if (!liveRef.current) return;
    // Find the last .call-flow-step or .flow-step element, count steps
    const existing = liveRef.current.querySelectorAll("[class*='flow-step'], [class*='call-flow-step']");
    const num = existing.length + 1;
    const isEven = num % 2 === 0;
    const pill = isEven ? "#007A7A" : "#0D2B4E";
    const html = `
      <div style="margin-top:4px;">
        <div style="display:flex;align-items:stretch;">
          <div style="width:26px;flex-shrink:0;background:${pill};color:white;font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center;border-radius:4px 0 0 4px;">${num}</div>
          <div style="flex:1;background:#F4F7FA;padding:5px 7px;border-top:1px solid #D0D7E0;border-bottom:1px solid #D0D7E0;" contenteditable="true">
            <div style="font-size:9px;font-weight:700;color:#0D2B4E;">New Step</div>
            <div style="font-size:7.5px;color:#374151;line-height:1.4;margin-top:1px;">Describe what happens in this step</div>
          </div>
          <div style="width:100px;flex-shrink:0;background:#EBF0F7;padding:5px 6px;border-top:1px solid #D0D7E0;border-bottom:1px solid #D0D7E0;">
            <div style="font-size:6.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#6B7280;">Saves</div>
            <div style="font-size:7.5px;color:#007A7A;font-weight:600;margin-top:1px;">variable_name</div>
          </div>
          <div style="width:28px;flex-shrink:0;background:#FEF5E7;display:flex;align-items:center;justify-content:center;font-size:9px;color:#C9882A;font-weight:700;border-top:1px solid #D0D7E0;border-bottom:1px solid #D0D7E0;border-radius:0 4px 4px 0;">→</div>
        </div>
        <div style="margin-left:13px;width:1px;height:6px;background:#007A7A;"></div>
      </div>`;
    // Insert after last flow step, or at end of live area
    if (existing.length > 0) {
      const last = existing[existing.length - 1];
      last.insertAdjacentHTML("afterend", html);
    } else {
      liveRef.current.insertAdjacentHTML("beforeend", html);
    }
    showToast("Step added ✓", "ok");
  }, [showToast]);

  // ── Add a new info card ──
  const addCard = useCallback(() => {
    if (!liveRef.current) return;
    const colors = ["#007A7A", "#C9882A", "#0D2B4E", "#C0392B"];
    const pick = colors[Math.floor(Math.random() * colors.length)];
    const html = `
      <div style="background:#F4F7FA;border-radius:6px;padding:9px 10px;border-left:3px solid ${pick};margin-bottom:10px;margin-top:6px;">
        <div style="font-size:8px;font-weight:800;color:#6B7280;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:5px;" contenteditable="true">NEW CARD TITLE</div>
        <div style="display:flex;align-items:flex-start;gap:5px;margin-top:3px;">
          <span style="width:5px;height:5px;border-radius:50%;background:${pick};flex-shrink:0;margin-top:3px;display:inline-block;"></span>
          <p style="font-size:8px;color:#374151;line-height:1.5;" contenteditable="true">Click to edit this content. You can add your notes, rules, or information here.</p>
        </div>
      </div>`;
    liveRef.current.insertAdjacentHTML("beforeend", html);
    showToast("Card added ✓", "ok");
  }, [showToast]);

  // ── Delete the element the cursor is inside ──
  const deleteBlock = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || !liveRef.current) return;
    let node = sel.anchorNode;
    // Walk up until we find a direct child of liveRef
    while (node && node.parentNode !== liveRef.current) {
      node = node.parentNode;
    }
    if (node && node !== liveRef.current) {
      node.remove();
      showToast("Block deleted", "ok");
    }
    setToolbar(t => ({ ...t, show: false }));
  }, [showToast]);

  const getCurrentHtml = useCallback(() => {
    if (!liveRef.current) return docHtml;
    // Wrap in proper HTML shell for Puppeteer
    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
      <style>
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Inter, Arial, sans-serif; background: #f0f4f8; padding: 20px; }
        [contenteditable] { outline: none; }
      </style>
    </head><body>${liveRef.current.innerHTML}</body></html>`;
  }, [docHtml]);

  const generate = async () => {
    if (!scriptPrompt && !evalPrompt) { setError("Please provide at least one prompt."); return; }
    setLoading(true); setError(""); setDocHtml("");
    if (liveRef.current) liveRef.current.innerHTML = "";
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

  // ── PDF: verify Content-Type before treating as blob ──
  const downloadPDF = useCallback(async () => {
    if (!docHtml || pdfLoading) return;
    setPdfLoading(true);
    showToast("Generating PDF…", "info");
    try {
      const html     = getCurrentHtml();
      const filename = [ctx.client, ctx.product, ctx.version].filter(Boolean).join("_") || "AI_Call_Documentation";
      const res = await fetch(`${BACKEND_URL}/api/html-to-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html, filename }),
      });

      // Check content-type FIRST — if it's JSON, it's an error response
      const contentType = res.headers.get("content-type") || "";
      if (!res.ok || contentType.includes("application/json")) {
        const err = await res.json().catch(() => ({ error: `Server error ${res.status}` }));
        throw new Error(err.error || "PDF generation failed on server");
      }
      if (!contentType.includes("application/pdf")) {
        throw new Error(`Unexpected response type: ${contentType}`);
      }

      const blob = await res.blob();
      if (blob.size < 100) throw new Error("PDF is empty — Puppeteer may have failed");

      const url = URL.createObjectURL(blob);
      const a   = document.createElement("a");
      a.href = url; a.download = filename + ".pdf";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      showToast("PDF downloaded ✓", "ok");
    } catch (err) {
      showToast("PDF failed: " + err.message, "err");
      console.error("PDF error:", err);
    } finally { setPdfLoading(false); }
  }, [docHtml, pdfLoading, ctx, getCurrentHtml, showToast]);

  const downloadHTML = useCallback(() => {
    if (!docHtml) return;
    const html = getCurrentHtml();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    a.download = "AI_Call_Documentation.html";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    showToast("HTML downloaded ✓", "ok");
  }, [docHtml, getCurrentHtml, showToast]);

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

      {/* ── Right: live-editable preview + toolbar ── */}
      <div className="panel doc-output-col">
        {loading && <div className="loading-bar" />}

        {/* ── Panel header ── */}
        <div className="panel-hdr">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="panel-title">Live Preview</span>
            {docHtml && !loading && (
              <>
                {/* Editing action buttons */}
                <button className="doc-tool-btn" onClick={addStep} title="Add a new call flow step">
                  + Step
                </button>
                <button className="doc-tool-btn" onClick={addCard} title="Add a new info card">
                  + Card
                </button>
                <button className="doc-tool-btn doc-tool-del" onClick={deleteBlock} title="Delete the block your cursor is in">
                  ✕ Block
                </button>
              </>
            )}
          </div>
          {docHtml && (
            <div className="dl-bar">
              <button className="btn-dl" onClick={downloadHTML}>↓ HTML</button>
              <button className="btn-pdf" onClick={downloadPDF} disabled={pdfLoading}>
                {pdfLoading ? <><span className="btn-pdf-spin" /> Generating…</> : "↓ PDF"}
              </button>
            </div>
          )}
        </div>

        {/* ── Floating text-format toolbar (shows on selection) ── */}
        {toolbar.show && (
          <div
            ref={toolbarRef}
            className="float-toolbar"
            style={{ left: toolbar.x, top: toolbar.y }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <button onClick={() => execCmd("bold")}        title="Bold"><strong>B</strong></button>
            <button onClick={() => execCmd("italic")}      title="Italic"><em>I</em></button>
            <button onClick={() => execCmd("underline")}   title="Underline"><u>U</u></button>
            <div className="float-sep" />
            <button onClick={() => execCmd("foreColor", "#007A7A")} title="Teal" style={{ color: "#007A7A" }}>A</button>
            <button onClick={() => execCmd("foreColor", "#0D2B4E")} title="Navy" style={{ color: "#0D2B4E" }}>A</button>
            <button onClick={() => execCmd("foreColor", "#C9882A")} title="Gold" style={{ color: "#C9882A" }}>A</button>
            <button onClick={() => execCmd("foreColor", "#C0392B")} title="Red"  style={{ color: "#C0392B" }}>A</button>
            <div className="float-sep" />
            <button onClick={() => execCmd("removeFormat")} title="Clear" style={{ fontSize: 10 }}>✕</button>
          </div>
        )}

        {loading && (
          <div className="loading">
            <div className="spinner" />
            <p>GPT-4o is writing your document…</p>
            <p style={{ fontSize: 11, color: "#bbb" }}>30–60 seconds for a full doc</p>
          </div>
        )}

        {!docHtml && !loading && (
          <div className="empty-state">
            <div className="empty-icon" />
            <p style={{ fontWeight: 500, color: "#555" }}>Your document will appear here</p>
            <p style={{ fontSize: 11 }}>Select text to format · Use + Step / + Card to add blocks</p>
          </div>
        )}

        {/* ── Contenteditable full-page live preview ── */}
        {!loading && (
          <div ref={wrapRef} className="doc-result-body" style={{ display: docHtml ? "flex" : "none", position: "relative" }}>
            <div className="doc-live-wrap">
              <div
                ref={liveRef}
                className="doc-live-inner"
                contentEditable={true}
                suppressContentEditableWarning={true}
                spellCheck={false}
                onMouseUp={handleSelect}
                onKeyUp={handleSelect}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

// ── Section 3: Workflow Stage Doc ────────────────────────────────────────────
const WorkflowDoc = memo(({ showToast }) => {
  const [prompt, setPrompt]       = useState("");
  const [ctx, setCtx]             = useState({ client: "", product: "", version: "v1.0" });
  const [docHtml, setDocHtml]     = useState("");
  const [loading, setLoading]     = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError]         = useState("");
  const liveRef = useRef(null);

  useEffect(() => {
    if (liveRef.current && docHtml) liveRef.current.innerHTML = docHtml;
  }, [docHtml]);

  const getCurrentHtml = useCallback(() => {
    if (!liveRef.current) return docHtml;
    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
      <style>* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; }
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
      body { font-family: Inter, Arial, sans-serif; }</style>
    </head><body>${liveRef.current.innerHTML}</body></html>`;
  }, [docHtml]);

  const generate = async () => {
    if (!prompt.trim()) { setError("Please enter your workflow prompt."); return; }
    setLoading(true); setError(""); setDocHtml("");
    if (liveRef.current) liveRef.current.innerHTML = "";
    try {
      const res = await fetch(`${BACKEND_URL}/api/generate-workflow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, client: ctx.client, product: ctx.product, version: ctx.version }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Generation failed");
      setDocHtml(data.content);
      showToast("Workflow doc generated ✓", "ok");
    } catch (e) {
      setError("Error: " + e.message);
      showToast("Generation failed", "err");
    } finally { setLoading(false); }
  };

  const downloadPNG = useCallback(() => {
    if (!liveRef.current) return;
    showToast("Tip: use ↓ HTML and screenshot for best PNG quality", "info");
  }, [showToast]);

  const downloadPDF = useCallback(async () => {
    if (!docHtml || pdfLoading) return;
    setPdfLoading(true); showToast("Generating PDF…", "info");
    try {
      const html = getCurrentHtml();
      const filename = [ctx.client, ctx.product, ctx.version].filter(Boolean).join("_") || "Workflow_Doc";
      const res = await fetch(`${BACKEND_URL}/api/html-to-pdf`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html, filename }),
      });
      const ct = res.headers.get("content-type") || "";
      if (!res.ok || ct.includes("application/json")) {
        const err = await res.json().catch(() => ({ error: `Server error ${res.status}` }));
        throw new Error(err.error || "PDF failed");
      }
      const blob = await res.blob();
      if (blob.size < 100) throw new Error("PDF empty");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = filename + ".pdf";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      showToast("PDF downloaded ✓", "ok");
    } catch (err) { showToast("PDF failed: " + err.message, "err"); }
    finally { setPdfLoading(false); }
  }, [docHtml, pdfLoading, ctx, getCurrentHtml, showToast]);

  const downloadHTML = useCallback(() => {
    if (!docHtml) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([getCurrentHtml()], { type: "text/html" }));
    a.download = "Workflow_Doc.html";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    showToast("HTML downloaded ✓", "ok");
  }, [docHtml, getCurrentHtml, showToast]);

  return (
    <div className="doc-workspace">
      {/* ── Left inputs ── */}
      <div className="doc-input-col">
        <div className="doc-cards-scroll">
          <div className="input-card">
            <div className="input-card-hdr"><h4>Context</h4></div>
            <div className="ctx-grid">
              <div>
                <div className="field-label">Client</div>
                <input className="field-input" placeholder="e.g. Swiggy" value={ctx.client} onChange={e => setCtx({...ctx, client: e.target.value})} />
              </div>
              <div>
                <div className="field-label">Version</div>
                <input className="field-input" placeholder="v1.0" value={ctx.version} onChange={e => setCtx({...ctx, version: e.target.value})} />
              </div>
            </div>
            <div className="field-full">
              <div className="field-label">Product / Workflow Name</div>
              <input className="field-input" placeholder="e.g. AI Calling Workflow" value={ctx.product} onChange={e => setCtx({...ctx, product: e.target.value})} />
            </div>
          </div>

          <div className="input-card" style={{ flex: 1 }}>
            <div className="input-card-hdr">
              <h4>Workflow Prompt</h4>
              <span className="card-tag" style={{ background: "#EBF0F7", color: "#0D2B4E", borderColor: "#B8C9E0" }}>Stage + Channel flow</span>
            </div>
            <textarea className="prompt-area" style={{ minHeight: 280, resize: "vertical" }}
              placeholder={"Describe your workflow stages and channel scripts. Example:\n\nStage 1 — Raw Lead\nUser actions: Show interest, Install app\nInfo to provide: Pay, Benefits, Process\nExit metric: App Registration\n\nSSU script: 'Your friend said you're interested...'\nReferral script: 'Look like you downloaded the app...'\n\nConfirmation: Will you download the app by tonight?\n\nStage 2 — App Install\n..."}
              value={prompt} onChange={e => setPrompt(e.target.value)} />
          </div>

          {error && <div className="error-box" style={{ margin: 0 }}>{error}</div>}

          {/* Style guide */}
          <div style={{ background: "#EBF0F7", borderRadius: 8, padding: "10px 12px", fontSize: 10, color: "#374151", lineHeight: 1.6 }}>
            <strong style={{ color: "#0D2B4E", display: "block", marginBottom: 4 }}>📋 Format guide</strong>
            Use stage names, channel scripts (SSU / Referral / Non-Agency or your own), user actions, exit metrics, and confirmation questions. The AI will build a colour-coded stage+column table.
          </div>
        </div>

        <button className="btn-convert" style={{ margin: 0, width: "100%" }} onClick={generate} disabled={loading}>
          {loading ? <><span className="spin" /> Generating…</> : "Generate Workflow Doc →"}
        </button>
      </div>

      {/* ── Right: live preview ── */}
      <div className="panel doc-output-col">
        {loading && <div className="loading-bar" />}
        <div className="panel-hdr">
          <span className="panel-title">Workflow Preview</span>
          {docHtml && (
            <div className="dl-bar">
              <button className="btn-dl" onClick={downloadHTML}>↓ HTML</button>
              <button className="btn-pdf" onClick={downloadPDF} disabled={pdfLoading}>
                {pdfLoading ? <><span className="btn-pdf-spin" /> Generating…</> : "↓ PDF"}
              </button>
            </div>
          )}
        </div>

        {loading && (
          <div className="loading">
            <div className="spinner" />
            <p>Building stage diagram…</p>
            <p style={{ fontSize: 11, color: "#bbb" }}>20–40 seconds</p>
          </div>
        )}

        {!docHtml && !loading && (
          <div className="empty-state">
            <div style={{ fontSize: 32, marginBottom: 8 }}>⬜</div>
            <p style={{ fontWeight: 500, color: "#555" }}>Stage + channel workflow will appear here</p>
            <p style={{ fontSize: 11 }}>Paste your flow and click Generate</p>
          </div>
        )}

        {!loading && (
          <div className="doc-result-body" style={{ display: docHtml ? "flex" : "none" }}>
            <div className="doc-live-wrap">
              <div
                ref={liveRef}
                className="doc-live-inner"
                contentEditable={true}
                suppressContentEditableWarning={true}
                spellCheck={false}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

// ── Flow Canvas ───────────────────────────────────────────────────────────────
const NODE_DEFAULTS = {
  stage:    { title: "Stage 1",   body: "Describe this stage\n• Action 1\n• Action 2",  w: 165, h: 80  },
  decision: { title: "Decision?", body: "Yes / No",                                      w: 155, h: 95  },
  action:   { title: "Action",    body: "What happens here",                              w: 160, h: 72  },
  speech:   { title: "",          body: '"Say something to user…"',                       w: 170, h: 70  },
  column:   { title: "CHANNEL",   body: "",                                               w: 140, h: 36  },
  terminal: { title: "Start",     body: "",                                               w: 130, h: 44  },
  note:     { title: "Note",      body: "Add a tip or rule here",                        w: 150, h: 64  },
};

const PALETTE = [
  { type: "stage",    label: "Stage",         sub: "Flow stage box",    icon: "⬜" },
  { type: "decision", label: "Decision",       sub: "Yes / No diamond",  icon: "◇" },
  { type: "action",   label: "Action",         sub: "Task / info block", icon: "▭" },
  { type: "speech",   label: "Script Bubble",  sub: "Dialogue speech",   icon: "💬" },
  { type: "column",   label: "Column Header",  sub: "SSU / Referral…",   icon: "▤" },
  { type: "terminal", label: "Start / End",    sub: "Terminal node",     icon: "◉" },
  { type: "note",     label: "Note",           sub: "Comment / tip",     icon: "📝" },
];

let _nid = 100;
const uid = () => `n${++_nid}`;
const eid = () => `e${++_nid}`;

const PORT_POSITIONS = {
  top:    (w, h) => ({ x: w / 2,     y: 0     }),
  bottom: (w, h) => ({ x: w / 2,     y: h     }),
  left:   (w, h) => ({ x: 0,         y: h / 2 }),
  right:  (w, h) => ({ x: w,         y: h / 2 }),
};

function getPortXY(node, port) {
  const fn = PORT_POSITIONS[port];
  const rel = fn(node.w, node.h);
  return { x: node.x + rel.x, y: node.y + rel.y };
}

// Smooth bezier path between two points
function bezierPath(x1, y1, x2, y2) {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const cx = dx * 0.55;
  const cy = dy * 0.3;
  if (Math.abs(y2 - y1) > Math.abs(x2 - x1)) {
    return `M ${x1} ${y1} C ${x1} ${y1 + cy + cx * 0.4}, ${x2} ${y2 - cy - cx * 0.4}, ${x2} ${y2}`;
  }
  return `M ${x1} ${y1} C ${x1 + cx} ${y1}, ${x2 - cx} ${y2}, ${x2} ${y2}`;
}

const INITIAL_NODES = [
  // Column headers
  { id: "c0", type: "column",   x:  60,  y:  20, w: 165, h: 36, title: "STAGE", body: "" },
  { id: "c1", type: "column",   x: 270,  y:  20, w: 165, h: 36, title: "SSU", body: "" },
  { id: "c2", type: "column",   x: 450,  y:  20, w: 165, h: 36, title: "REFERRAL", body: "" },
  { id: "c3", type: "column",   x: 630,  y:  20, w: 165, h: 36, title: "NON AGENCY", body: "" },
  // Terminal
  { id: "n1", type: "terminal", x:  95,  y:  80, w: 100, h: 38, title: "Start", body: "" },
  // Stage 1
  { id: "n2", type: "stage",    x:  45,  y: 150, w: 180, h: 100, title: "Stage 1 — Raw Lead",
    body: "Action: Show interest · Install App\nInfo: Pay, Benefits, Process\nExit: App Registration" },
  { id: "s1", type: "speech",   x: 270, y: 165, w: 155, h: 70, title: "",
    body: '"Your friend has said you\'re interested in the Swiggy delivery job. Can I help you install the app?"' },
  { id: "s2", type: "speech",   x: 450, y: 165, w: 155, h: 70, title: "",
    body: '"Your friend said you\'re interested. Let me help you install the app. Do you have any questions?"' },
  { id: "s3", type: "speech",   x: 630, y: 165, w: 155, h: 70, title: "",
    body: '"You previously showed interest in the Swiggy delivery job. Let me help you get started."' },
  // Stage 2
  { id: "n3", type: "stage",    x:  45, y: 300, w: 180, h: 100, title: "Stage 2 — App Install",
    body: "Action: Upload docs · Select location\nInfo: Upload docs\nExit: Minimal docs complete" },
  { id: "s4", type: "speech",   x: 270, y: 315, w: 155, h: 70, title: "",
    body: '"Looks like you downloaded the app. Have you uploaded your docs? Let me know if you need help."' },
  { id: "s5", type: "speech",   x: 450, y: 315, w: 155, h: 70, title: "",
    body: '"You\'re almost there! Upload your docs and select Food vs Instamart delivery type."' },
  // Stage 3
  { id: "n4", type: "stage",    x:  45, y: 460, w: 180, h: 100, title: "Stage 3 — Document Upload",
    body: "Action: Pick bag/T-shirt · Make payment\nInfo: Courier or store collection\nExit: Payment received" },
  { id: "s6", type: "speech",   x: 270, y: 475, w: 155, h: 70, title: "",
    body: '"Let me help you with your bag and T-shirt. Please make payment to continue."' },
  { id: "s7", type: "speech",   x: 450, y: 475, w: 155, h: 70, title: "",
    body: '"Let me help you with your bag and T-shirt. Please make payment to continue."' },
  { id: "s8", type: "speech",   x: 630, y: 475, w: 155, h: 70, title: "",
    body: '"Let me help you with your bag and T-shirt. Please make payment to continue."' },
  // Terminal end
  { id: "n5", type: "terminal", x:  95, y: 610, w: 100, h: 38, title: "Stage 4 — Payment Made", body: "" },
];
const INITIAL_EDGES = [
  { id: "e1", from: "n1", fromPort: "bottom", to: "n2", toPort: "top",    label: "" },
  { id: "e2", from: "n2", fromPort: "bottom", to: "n3", toPort: "top",    label: "" },
  { id: "e3", from: "n3", fromPort: "bottom", to: "n4", toPort: "top",    label: "" },
  { id: "e4", from: "n4", fromPort: "bottom", to: "n5", toPort: "top",    label: "" },
];

const NODE_COLORS = {
  stage:    { bg: "#EBF0F7", border: "#B8C9E0", title: "#0D2B4E", body: "#374151" },
  decision: { bg: "#FEF5E7", border: "#F0C97A", title: "#C9882A", body: "#92400E" },
  action:   { bg: "#E6F4F1", border: "#A7D4CC", title: "#007A7A", body: "#374151" },
  speech:   { bg: "#FFFFFF", border: "#C4C4C4", title: "#374151", body: "#374151" },
  column:   { bg: "#F4F7FA", border: "#D0D7E0", title: "#374151", body: "#6B7280" },
  terminal: { bg: "#0D2B4E", border: "#0D2B4E", title: "#FFFFFF", body: "rgba(255,255,255,0.7)" },
  note:     { bg: "#FFFBEB", border: "#FCD34D", title: "#92400E", body: "#374151" },
  // legacy alias
  script:   { bg: "#F3E8FF", border: "#C4B5FD", title: "#6D28D9", body: "#374151" },
};

const FlowCanvas = memo(({ showToast }) => {
  const [nodes, setNodes]         = useState(INITIAL_NODES);
  const [edges, setEdges]         = useState(INITIAL_EDGES);
  const [selected, setSelected]   = useState(null);      // node id
  const [editing, setEditing]     = useState(null);      // node being edited in modal
  const [editForm, setEditForm]   = useState({});
  const [connecting, setConnecting] = useState(null);    // { fromId, fromPort }
  const [pan, setPan]             = useState({ x: 0, y: 0 });
  const [zoom, setZoom]           = useState(1);
  const [dragging, setDragging]   = useState(null);      // { id, ox, oy }
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart]   = useState(null);
  const [mousePos, setMousePos]   = useState({ x: 0, y: 0 });
  const [edgeLabel, setEdgeLabel] = useState({ id: null, val: "" });

  const canvasRef = useRef(null);
  const svgRef    = useRef(null);

  // ── Canvas coordinate transform ──
  const toCanvas = useCallback((clientX, clientY) => {
    const rect = canvasRef.current?.getBoundingClientRect() || { left: 0, top: 0 };
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top  - pan.y) / zoom,
    };
  }, [pan, zoom]);

  // ── Drag node ──
  const onNodeMouseDown = useCallback((e, id) => {
    if (e.button !== 0) return;
    if (connecting) return; // in connect mode, clicks on ports only
    e.stopPropagation();
    setSelected(id);
    const node = nodes.find(n => n.id === id);
    const cv = toCanvas(e.clientX, e.clientY);
    setDragging({ id, ox: cv.x - node.x, oy: cv.y - node.y });
  }, [nodes, connecting, toCanvas]);

  // ── Port click → start/finish connection ──
  const onPortClick = useCallback((e, nodeId, port) => {
    e.stopPropagation();
    if (!connecting) {
      setConnecting({ fromId: nodeId, fromPort: port });
    } else {
      if (connecting.fromId === nodeId) { setConnecting(null); return; }
      // Check not duplicate
      const exists = edges.some(e => e.from === connecting.fromId && e.fromPort === connecting.fromPort && e.to === nodeId && e.toPort === port);
      if (!exists) {
        setEdges(prev => [...prev, { id: eid(), from: connecting.fromId, fromPort: connecting.fromPort, to: nodeId, toPort: port, label: "" }]);
      }
      setConnecting(null);
    }
  }, [connecting, edges]);

  // ── Mouse move (drag + pan + live connection line) ──
  const onCanvasMouseMove = useCallback((e) => {
    const cv = toCanvas(e.clientX, e.clientY);
    setMousePos(cv);
    if (dragging) {
      setNodes(prev => prev.map(n => n.id === dragging.id
        ? { ...n, x: cv.x - dragging.ox, y: cv.y - dragging.oy }
        : n
      ));
    }
    if (isPanning && panStart) {
      setPan({ x: panStart.px + (e.clientX - panStart.cx), y: panStart.py + (e.clientY - panStart.cy) });
    }
  }, [dragging, isPanning, panStart, toCanvas]);

  const onCanvasMouseUp = useCallback(() => {
    setDragging(null);
    setIsPanning(false);
    setPanStart(null);
  }, []);

  const onCanvasMouseDown = useCallback((e) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ cx: e.clientX, cy: e.clientY, px: pan.x, py: pan.y });
      return;
    }
    if (e.button === 0) {
      setSelected(null);
      if (connecting) setConnecting(null);
    }
  }, [pan, connecting]);

  // ── Wheel zoom ──
  const onWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.max(0.3, Math.min(2.5, z * delta)));
  }, []);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  // ── Drop from palette ──
  const onDrop = useCallback((e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData("nodeType");
    if (!type) return;
    const cv = toCanvas(e.clientX, e.clientY);
    const def = NODE_DEFAULTS[type];
    setNodes(prev => [...prev, {
      id: uid(), type,
      x: cv.x - def.w / 2, y: cv.y - def.h / 2,
      w: def.w, h: def.h,
      title: def.title, body: def.body,
    }]);
  }, [toCanvas]);

  // ── Delete selected ──
  const deleteSelected = useCallback(() => {
    if (!selected) return;
    setNodes(prev => prev.filter(n => n.id !== selected));
    setEdges(prev => prev.filter(e => e.from !== selected && e.to !== selected));
    setSelected(null);
    showToast("Deleted", "ok");
  }, [selected, showToast]);

  useEffect(() => {
    const handler = (e) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selected && document.activeElement === document.body) {
        deleteSelected();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selected, deleteSelected]);

  // ── Open edit modal ──
  const openEdit = useCallback((id) => {
    const node = nodes.find(n => n.id === id);
    if (!node) return;
    setEditing(id);
    setEditForm({ title: node.title, body: node.body });
  }, [nodes]);

  const saveEdit = useCallback(() => {
    setNodes(prev => prev.map(n => n.id === editing ? { ...n, ...editForm } : n));
    setEditing(null);
  }, [editing, editForm]);

  // ── Delete edge on click ──
  const deleteEdge = useCallback((id) => {
    setEdges(prev => prev.filter(e => e.id !== id));
  }, []);

  // ── Export as PNG (2× retina, full fidelity) ──
  const exportPNG = useCallback(() => {
    if (!nodes.length) return;
    const PAD = 50;
    const minX = Math.min(...nodes.map(n => n.x)) - PAD;
    const minY = Math.min(...nodes.map(n => n.y)) - PAD;
    const maxX = Math.max(...nodes.map(n => n.x + n.w)) + PAD;
    const maxY = Math.max(...nodes.map(n => n.y + (n.h || 80))) + PAD + 20; // extra for speech tail
    const W = maxX - minX;
    const H = maxY - minY;
    const SCALE = 2;

    const canvas = document.createElement("canvas");
    canvas.width  = W * SCALE;
    canvas.height = H * SCALE;
    const ctx = canvas.getContext("2d");
    ctx.scale(SCALE, SCALE);

    // White background
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, W, H);

    // Subtle dot grid
    ctx.fillStyle = "#E5E7EB";
    for (let gx = 0; gx < W; gx += 28)
      for (let gy = 0; gy < H; gy += 28)
        ctx.fillRect(gx - (minX % 28), gy - (minY % 28), 1.5, 1.5);

    // ── Helper: rounded rect ──
    const roundRect = (x, y, w, h, r) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    };

    // ── Helper: wrap text ──
    const wrapText = (text, x, y, maxW, lineH, maxLines = 5) => {
      const words = text.split(" ");
      let line = "";
      let lineCount = 0;
      for (let i = 0; i < words.length; i++) {
        const test = line + words[i] + " ";
        if (ctx.measureText(test).width > maxW && i > 0) {
          ctx.fillText(line.trim(), x, y + lineCount * lineH);
          line = words[i] + " ";
          lineCount++;
          if (lineCount >= maxLines) break;
        } else {
          line = test;
        }
      }
      if (lineCount < maxLines) ctx.fillText(line.trim(), x, y + lineCount * lineH);
    };

    // ── Draw edges first ──
    edges.forEach(edge => {
      const from = nodes.find(n => n.id === edge.from);
      const to   = nodes.find(n => n.id === edge.to);
      if (!from || !to) return;
      const p1 = getPortXY(from, edge.fromPort);
      const p2 = getPortXY(to,   edge.toPort);
      const x1 = p1.x - minX, y1 = p1.y - minY;
      const x2 = p2.x - minX, y2 = p2.y - minY;

      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1.8;
      ctx.setLineDash([]);
      const path = new Path2D(bezierPath(x1, y1, x2, y2));
      ctx.stroke(path);

      // Arrowhead
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const AW = 9;
      ctx.fillStyle = "#94a3b8";
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - AW * Math.cos(angle - 0.4), y2 - AW * Math.sin(angle - 0.4));
      ctx.lineTo(x2 - AW * Math.cos(angle + 0.4), y2 - AW * Math.sin(angle + 0.4));
      ctx.closePath(); ctx.fill();

      if (edge.label) {
        ctx.font = "bold 9px Arial";
        ctx.fillStyle = "#6B7280";
        ctx.textAlign = "center";
        ctx.fillText(edge.label, (x1 + x2) / 2, (y1 + y2) / 2 - 4);
      }
    });

    // ── Draw nodes ──
    nodes.forEach(node => {
      const nx = node.x - minX;
      const ny = node.y - minY;
      const nw = node.w;
      const nh = node.h || 80;
      const col = NODE_COLORS[node.type] || NODE_COLORS.action;

      ctx.save();

      if (node.type === "decision") {
        // Diamond
        const cx = nx + nw / 2, cy = ny + nh / 2;
        ctx.beginPath();
        ctx.moveTo(cx, ny); ctx.lineTo(nx + nw, cy);
        ctx.lineTo(cx, ny + nh); ctx.lineTo(nx, cy);
        ctx.closePath();
        ctx.fillStyle = col.bg; ctx.fill();
        ctx.strokeStyle = col.border; ctx.lineWidth = 1.5; ctx.stroke();
        // Text
        ctx.font = "bold 9.5px Arial"; ctx.fillStyle = col.title; ctx.textAlign = "center";
        const titleLines = node.title.split("\n");
        titleLines.forEach((l, i) => ctx.fillText(l, cx, cy - (titleLines.length - 1) * 6 + i * 12));
        if (node.body) {
          ctx.font = "9px Arial"; ctx.fillStyle = col.body;
          ctx.fillText(node.body, cx, cy + 14);
        }

      } else if (node.type === "terminal") {
        roundRect(nx, ny, nw, nh, 20);
        ctx.fillStyle = col.bg; ctx.fill();
        ctx.strokeStyle = col.border; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.font = "bold 10px Arial"; ctx.fillStyle = col.title; ctx.textAlign = "center";
        ctx.fillText(node.title, nx + nw / 2, ny + nh / 2 + 4);

      } else if (node.type === "column") {
        roundRect(nx, ny, nw, nh, 4);
        ctx.fillStyle = "#F4F7FA"; ctx.fill();
        ctx.strokeStyle = "#D0D7E0"; ctx.lineWidth = 1; ctx.stroke();
        ctx.font = "bold 11px Arial"; ctx.fillStyle = "#374151"; ctx.textAlign = "center";
        ctx.fillText(node.title, nx + nw / 2, ny + nh / 2 + 4);

      } else if (node.type === "speech") {
        // Speech bubble with tail
        roundRect(nx, ny, nw, nh, 10);
        ctx.fillStyle = "#FFFFFF"; ctx.fill();
        ctx.strokeStyle = "#C4C4C4"; ctx.lineWidth = 1.2; ctx.stroke();
        // Tail
        ctx.beginPath();
        ctx.moveTo(nx + 15, ny + nh);
        ctx.lineTo(nx + 25, ny + nh + 10);
        ctx.lineTo(nx + 35, ny + nh);
        ctx.fillStyle = "#FFFFFF"; ctx.fill();
        ctx.strokeStyle = "#C4C4C4"; ctx.lineWidth = 1;
        ctx.moveTo(nx + 15, ny + nh); ctx.lineTo(nx + 25, ny + nh + 10); ctx.lineTo(nx + 35, ny + nh);
        ctx.stroke();
        // Body text (italic style)
        ctx.font = "italic 8.5px Arial"; ctx.fillStyle = "#374151"; ctx.textAlign = "left";
        const bodyText = node.body || node.title;
        wrapText(bodyText, nx + 10, ny + 16, nw - 20, 12, 4);

      } else {
        // stage / action / note / script
        const r = node.type === "note" ? 2 : node.type === "script" ? 12 : 7;
        roundRect(nx, ny, nw, nh, r);
        ctx.fillStyle = col.bg; ctx.fill();
        ctx.strokeStyle = col.border; ctx.lineWidth = 1.5; ctx.stroke();
        // Title
        ctx.font = "bold 10px Arial"; ctx.fillStyle = col.title; ctx.textAlign = "left";
        ctx.fillText(node.title, nx + 10, ny + 16);
        // Body (pre-line wrapping)
        if (node.body) {
          ctx.font = "9px Arial"; ctx.fillStyle = col.body;
          const bodyLines = node.body.split("\n");
          bodyLines.forEach((line, i) => {
            if (i < 5) ctx.fillText(line, nx + 10, ny + 30 + i * 12);
          });
        }
      }
      ctx.restore();
    });

    canvas.toBlob(blob => {
      if (!blob) { showToast("Export failed", "err"); return; }
      const url = URL.createObjectURL(blob);
      const a   = document.createElement("a");
      a.href = url; a.download = "workflow_canvas.png";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      showToast("PNG downloaded ✓", "ok");
    }, "image/png");
  }, [nodes, edges, showToast]);

  // ── Clear canvas ──
  const clearCanvas = useCallback(() => {
    if (!window.confirm("Clear all nodes and edges?")) return;
    setNodes([]); setEdges([]); setSelected(null);
  }, []);

  // ── Live connection preview line ──
  const liveEdge = connecting ? (() => {
    const fromNode = nodes.find(n => n.id === connecting.fromId);
    if (!fromNode) return null;
    const p = getPortXY(fromNode, connecting.fromPort);
    return bezierPath(p.x, p.y, mousePos.x, mousePos.y);
  })() : null;

  return (
    <div className="canvas-workspace">

      {/* ── Palette sidebar ── */}
      <div className="canvas-palette">
        <div className="palette-hdr"><h3>Blocks</h3></div>
        <div className="palette-body">
          <div className="palette-section">Drag to canvas</div>
          {PALETTE.map(p => (
            <div
              key={p.type}
              className={`palette-item pi-${p.type}`}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("nodeType", p.type)}
              title={p.sub}
            >
              <div className="pi-icon" style={{ fontSize: 14 }}>{p.icon}</div>
              <div>
                <div className="pi-label">{p.label}</div>
                <div className="pi-sub">{p.sub}</div>
              </div>
            </div>
          ))}
          <div className="palette-section" style={{ marginTop: 12 }}>Tips</div>
          <div style={{ fontSize: 9.5, color: "var(--muted2)", lineHeight: 1.7, paddingBottom: 4 }}>
            • Drag blocks to canvas<br/>
            • Click port ● to connect<br/>
            • Double-click to edit<br/>
            • Del / Backspace deletes<br/>
            • Alt+drag or scroll to pan/zoom<br/>
            • ↓ PNG exports the diagram
          </div>
        </div>
      </div>

      {/* ── Canvas ── */}
      <div
        ref={canvasRef}
        className={`canvas-area${connecting ? " connecting" : ""}`}
        onMouseMove={onCanvasMouseMove}
        onMouseUp={onCanvasMouseUp}
        onMouseDown={onCanvasMouseDown}
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        {/* Toolbar */}
        <div className="canvas-toolbar">
          <button className="ct-btn" onClick={() => { setNodes(INITIAL_NODES); setEdges(INITIAL_EDGES); setSelected(null); }} title="Reset to default flow">
            ↺ Reset
          </button>
          <div className="ct-sep" />
          <button className={`ct-btn${connecting ? " active" : ""}`} onClick={() => setConnecting(connecting ? null : { fromId: null, fromPort: null })}>
            {connecting ? "✕ Cancel" : "⟶ Connect"}
          </button>
          <button className="ct-btn danger" onClick={deleteSelected} disabled={!selected}>
            🗑 Delete
          </button>
          <div className="ct-sep" />
          <button className="ct-btn" onClick={exportPNG} style={{ background: "#0D2B4E", color: "white" }}>
            ↓ PNG
          </button>
          <button className="ct-btn danger" onClick={clearCanvas}>Clear</button>
        </div>

        {/* Pan+zoom transform layer */}
        <div style={{ position: "absolute", inset: 0, transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}>

          {/* SVG edges */}
          <svg ref={svgRef} className="canvas-svg" style={{ overflow: "visible" }}>
            <defs>
              <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L0,6 L8,3 z" fill="#94a3b8" />
              </marker>
              <marker id="arrow-hover" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L0,6 L8,3 z" fill="#3B82F6" />
              </marker>
            </defs>

            {edges.map(edge => {
              const from = nodes.find(n => n.id === edge.from);
              const to   = nodes.find(n => n.id === edge.to);
              if (!from || !to) return null;
              const p1 = getPortXY(from, edge.fromPort);
              const p2 = getPortXY(to,   edge.toPort);
              const mx = (p1.x + p2.x) / 2;
              const my = (p1.y + p2.y) / 2;
              return (
                <g key={edge.id}>
                  <path
                    d={bezierPath(p1.x, p1.y, p2.x, p2.y)}
                    stroke="#94a3b8" strokeWidth="1.8" fill="none"
                    markerEnd="url(#arrow)"
                    className="edge"
                    style={{ cursor: "pointer", pointerEvents: "stroke" }}
                    onClick={() => deleteEdge(edge.id)}
                    title="Click to delete"
                  />
                  {/* Clickable wider invisible stroke */}
                  <path
                    d={bezierPath(p1.x, p1.y, p2.x, p2.y)}
                    stroke="transparent" strokeWidth="10" fill="none"
                    style={{ cursor: "pointer", pointerEvents: "stroke" }}
                    onClick={() => deleteEdge(edge.id)}
                  />
                  {edge.label && (
                    <text x={mx} y={my - 5} className="edge-label" textAnchor="middle">{edge.label}</text>
                  )}
                </g>
              );
            })}

            {/* Live connection line */}
            {liveEdge && (
              <path d={liveEdge} stroke="#3B82F6" strokeWidth="1.8" fill="none" strokeDasharray="6,3" />
            )}
          </svg>

          {/* Nodes */}
          {nodes.map(node => {
            const col = NODE_COLORS[node.type] || NODE_COLORS.action;
            const isSelected = selected === node.id;
            const isColumn   = node.type === "column";
            const isSpeech   = node.type === "speech";

            return (
              <div
                key={node.id}
                className={`flow-node ${node.type}${isSelected ? " selected" : ""}`}
                style={{
                  left: node.x, top: node.y,
                  width: node.w,
                  height: node.type === "decision" ? node.h : (isColumn ? node.h : "auto"),
                  background: isSelected ? col.bg : col.bg,
                  borderColor: isSelected ? "#3B82F6" : col.border,
                }}
                onMouseDown={(e) => onNodeMouseDown(e, node.id)}
                onDoubleClick={() => openEdit(node.id)}
              >
                {/* Column header: just centered bold text */}
                {isColumn && (
                  <span style={{ fontWeight: 800, fontSize: 11, letterSpacing: "0.5px", color: "#374151" }}>
                    {node.title}
                  </span>
                )}

                {/* Speech bubble: italic quote body only */}
                {isSpeech && (
                  <div style={{ fontSize: 9, fontStyle: "italic", color: "#374151", lineHeight: 1.5 }}>
                    {node.body || node.title}
                  </div>
                )}

                {/* All other node types */}
                {!isColumn && !isSpeech && (
                  <>
                    {node.title && (
                      <div className="node-title" style={{ color: col.title }}>{node.title}</div>
                    )}
                    {node.body && (
                      <div className="node-body" style={{ color: col.body }}>{node.body}</div>
                    )}
                  </>
                )}

                {/* Connection ports — hidden on column headers */}
                {!isColumn && ["top","bottom","left","right"].map(pos => (
                  <div
                    key={pos}
                    className={`port ${pos}`}
                    onClick={(e) => onPortClick(e, node.id, pos)}
                    title={connecting ? "Connect here" : "Click to start connection"}
                  />
                ))}
              </div>
            );
          })}
        </div>

        {/* Zoom controls */}
        <div className="canvas-zoom">
          <button className="zoom-btn" onClick={() => setZoom(z => Math.min(2.5, z * 1.2))}>+</button>
          <span className="zoom-label">{Math.round(zoom * 100)}%</span>
          <button className="zoom-btn" onClick={() => setZoom(z => Math.max(0.3, z * 0.83))}>−</button>
          <button className="zoom-btn" title="Fit to screen" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>⊡</button>
        </div>

        {/* Help hint when empty */}
        {nodes.length === 0 && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>⬜</div>
              <div style={{ fontWeight: 600 }}>Drag blocks from the left panel</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>or click Reset to load the sample flow</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Node editor modal ── */}
      {editing && (
        <div className="node-editor-overlay" onClick={(e) => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div className="node-editor-box">
            <h4>Edit Node</h4>
            <label>Title</label>
            <input value={editForm.title} onChange={(e) => setEditForm(f => ({ ...f, title: e.target.value }))} autoFocus />
            <label>Body text</label>
            <textarea rows={3} value={editForm.body} onChange={(e) => setEditForm(f => ({ ...f, body: e.target.value }))} />
            <div className="node-editor-actions">
              <button className="btn-editor-del" onClick={() => { deleteSelected(); setEditing(null); }}>Delete</button>
              <button className="btn-editor-cancel" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-editor-save" onClick={saveEdit}>Save</button>
            </div>
          </div>
        </div>
      )}
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
            <button className={`tab-pill-btn${tab === "image"    ? " on" : ""}`} onClick={() => setTab("image")}>Image → Structure</button>
            <button className={`tab-pill-btn${tab === "doc"      ? " on" : ""}`} onClick={() => setTab("doc")}>Prompt → Client Doc</button>
            <button className={`tab-pill-btn${tab === "workflow" ? " on" : ""}`} onClick={() => setTab("workflow")}>Workflow Doc</button>
            <button className={`tab-pill-btn${tab === "flow"     ? " on" : ""}`} onClick={() => setTab("flow")}>Flow Canvas</button>
          </div>
          <div className="hdr-right">
            <span className="hdr-model">GPT-4o</span>
            <div className="status-dot" />
          </div>
        </header>
        <main className="main">
          {tab === "image"    && <ImageSection showToast={show} />}
          {tab === "doc"      && <DocCreator   showToast={show} />}
          {tab === "workflow" && <WorkflowDoc  showToast={show} />}
          {tab === "flow"     && <FlowCanvas   showToast={show} />}
        </main>
      </div>
    </>
  );
}
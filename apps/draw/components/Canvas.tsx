"use client";

import {
  initDraw,
  setCurrentTool,
  setDarkMode,
  undo,
  redo,
  clearCanvas,
  saveDrawingToBackend,
  exportAsPng,
  exportAsSvg,
  exportAsJson,
} from "@/drawgame";
import {
  Circle,
  Eraser,
  Pencil,
  Square,
  Redo,
  Save,
  Trash2,
  Undo,
  Download,
  Users,
  Settings,
  Home,
  Minus,
  ArrowUpRight,
  Type,
  Diamond,
  ZoomIn,
  ZoomOut,
  Sun,
  Moon,
  Copy,
  Check,
  ChevronDown,
  LayoutDashboard,
  FileJson,
  FileCode,
  Image as ImageIcon,
  CheckCircle2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { IconButton } from "./IconButton";
import Link from "next/link";

type Tool =
  | "select"
  | "rectangle"
  | "circle"
  | "diamond"
  | "arrow"
  | "line"
  | "pencil"
  | "text"
  | "eraser";

interface CanvasProps {
  socket: WebSocket;
  roomId: string;
  roomSlug?: string;
  roomName?: string;
  workspaceId?: string;
  workspaceName?: string;
  connectionStatus?: "connected" | "connecting" | "error";
}

export function Canvas({
  roomId,
  socket,
  roomSlug,
  roomName,
  workspaceId,
  workspaceName,
  connectionStatus = "connected",
}: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedTool, setSelectedTool] = useState<Tool>("select");
  const [userCount, setUserCount] = useState<number>(1);
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState<boolean>(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<boolean>(false);

  const displayRoomTitle = roomName || roomSlug || `Room ${roomId}`;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let removeCanvasListeners: (() => void) | undefined;

    void initDraw(
      canvas,
      roomId,
      socket,
      selectedTool,
      {
        onHistoryChange: () => {},
      },
      isDarkMode
    ).then((cleanup) => {
      removeCanvasListeners = cleanup;
    });

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "userCount" && typeof data.count === "number") {
          setUserCount(data.count);
        }
      } catch {
        // Ignore parse error on non-json frames
      }
    };

    socket.addEventListener("message", handleMessage);

    return () => {
      socket.removeEventListener("message", handleMessage);
      removeCanvasListeners?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, socket]);

  useEffect(() => {
    setCurrentTool(selectedTool);
  }, [selectedTool]);

  useEffect(() => {
    setDarkMode(isDarkMode);
  }, [isDarkMode]);

  const handleUndo = () => {
    undo();
  };

  const handleRedo = () => {
    redo();
  };

  const handleClear = () => {
    if (confirm("Are you sure you want to clear the whiteboard canvas for all users in this room?")) {
      clearCanvas();
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const result = await saveDrawingToBackend(roomId);
      if (result.success) {
        setSaveToast("Whiteboard saved successfully!");
      } else {
        setSaveToast(result.message || "Failed to save");
      }
    } catch {
      setSaveToast("Failed to save drawing");
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveToast(null), 3000);
    }
  };


  const handleExportPng = () => {
    exportAsPng(canvasRef.current, displayRoomTitle);
    setIsExportMenuOpen(false);
    setIsMenuOpen(false);
  };

  const handleExportSvg = () => {
    exportAsSvg(undefined, isDarkMode, displayRoomTitle);
    setIsExportMenuOpen(false);
    setIsMenuOpen(false);
  };

  const handleExportJson = () => {
    exportAsJson(undefined, displayRoomTitle);
    setIsExportMenuOpen(false);
    setIsMenuOpen(false);
  };

  const handleCopyRoomId = () => {
    const idToCopy = roomSlug || roomId;
    navigator.clipboard.writeText(idToCopy);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  return (
    <div
      className={`relative h-screen w-screen overflow-hidden transition-colors ${
        isDarkMode ? "bg-slate-950 text-white" : "bg-white text-slate-900"
      }`}
    >
      <canvas
        ref={canvasRef}
        width={typeof window !== "undefined" ? window.innerWidth : 1920}
        height={typeof window !== "undefined" ? window.innerHeight : 1080}
        className="block touch-none"
        style={{
          transform: `scale(${zoomLevel})`,
          transformOrigin: "top left",
        }}
      />

      {/* Top Left Area: Workspace & Room Context Navigation */}
      <div className="fixed top-4 left-4 z-20 flex items-center gap-2">
        <div className="bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl shadow-lg px-3.5 py-2.5 flex items-center gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-violet-600 hover:text-violet-700 transition-colors"
            title="Go to Dashboard"
          >
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center text-white shadow-xs">
              <LayoutDashboard size={15} />
            </div>
          </Link>

          <div className="w-px h-4 bg-slate-200" />

          {/* Breadcrumb info */}
          <div className="flex flex-col">
            {workspaceId && workspaceName ? (
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Link
                  href={`/workspace/${workspaceId}`}
                  className="font-medium hover:text-violet-600 transition-colors truncate max-w-[120px]"
                >
                  {workspaceName}
                </Link>
                <span>/</span>
                <span className="font-semibold text-slate-800 truncate max-w-[140px]">
                  {displayRoomTitle}
                </span>
              </div>
            ) : (
              <span className="text-xs font-semibold text-slate-800 truncate max-w-[160px]">
                {displayRoomTitle}
              </span>
            )}
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
              <span>ID: {roomSlug || roomId}</span>
              <button
                onClick={handleCopyRoomId}
                className="p-0.5 hover:text-violet-600 rounded transition-colors"
                title="Copy Room ID"
              >
                {copiedId ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Center Top: Drawing Toolbar */}
      <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-20 max-w-[95vw] overflow-x-auto">
        <div className="bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl shadow-xl px-3 py-2 flex items-center gap-2">
          {/* Drawing Tools */}
          <div className="flex items-center gap-1 pr-2 border-r border-slate-200">
            <IconButton
              activated={selectedTool === "select"}
              icon={
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
                </svg>
              }
              onClick={() => setSelectedTool("select")}
              tooltip="Select (S)"
            />
            <IconButton
              activated={selectedTool === "rectangle"}
              icon={<Square size={18} />}
              onClick={() => setSelectedTool("rectangle")}
              tooltip="Rectangle (R)"
            />
            <IconButton
              activated={selectedTool === "circle"}
              icon={<Circle size={18} />}
              onClick={() => setSelectedTool("circle")}
              tooltip="Circle (C)"
            />
            <IconButton
              activated={selectedTool === "diamond"}
              icon={<Diamond size={18} />}
              onClick={() => setSelectedTool("diamond")}
              tooltip="Diamond (D)"
            />
            <IconButton
              activated={selectedTool === "arrow"}
              icon={<ArrowUpRight size={18} />}
              onClick={() => setSelectedTool("arrow")}
              tooltip="Arrow (A)"
            />
            <IconButton
              activated={selectedTool === "line"}
              icon={<Minus size={18} />}
              onClick={() => setSelectedTool("line")}
              tooltip="Line (L)"
            />
            <IconButton
              activated={selectedTool === "pencil"}
              icon={<Pencil size={18} />}
              onClick={() => setSelectedTool("pencil")}
              tooltip="Pencil (P)"
            />
            <IconButton
              activated={selectedTool === "text"}
              icon={<Type size={18} />}
              onClick={() => setSelectedTool("text")}
              tooltip="Text (T)"
            />
            <IconButton
              activated={selectedTool === "eraser"}
              icon={<Eraser size={18} />}
              onClick={() => setSelectedTool("eraser")}
              tooltip="Eraser (E)"
            />
          </div>

          {/* History Controls */}
          <div className="flex items-center gap-1 pr-2 border-r border-slate-200">
            <IconButton
              activated={false}
              icon={<Undo size={18} />}
              onClick={handleUndo}
              tooltip="Undo (Ctrl+Z)"
            />
            <IconButton
              activated={false}
              icon={<Redo size={18} />}
              onClick={handleRedo}
              tooltip="Redo (Ctrl+Y)"
            />
            <IconButton
              activated={false}
              icon={<Trash2 size={18} />}
              onClick={handleClear}
              tooltip="Clear Whiteboard"
            />
          </div>

          {/* Save & Export Controls */}
          <div className="flex items-center gap-1.5 relative">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-medium text-xs shadow-xs transition-all active:scale-95 disabled:opacity-75"
              title="Save Whiteboard to Cloud"
            >
              {isSaving ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Save size={15} />
              )}
              <span>Save</span>
            </button>

            {/* Export Dropdown Button */}
            <div className="relative">
              <button
                onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-medium text-xs transition-colors"
                title="Export Whiteboard"
              >
                <Download size={14} />
                <span>Export</span>
                <ChevronDown size={12} />
              </button>

              {isExportMenuOpen && (
                <div className="absolute top-full right-0 mt-2 w-44 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 z-30 animate-in fade-in zoom-in-95 duration-100">
                  <button
                    onClick={handleExportPng}
                    className="w-full px-3.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-violet-50 hover:text-violet-700 flex items-center gap-2.5 transition-colors"
                  >
                    <ImageIcon size={15} className="text-violet-600" />
                    <span>Export PNG</span>
                  </button>
                  <button
                    onClick={handleExportSvg}
                    className="w-full px-3.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-violet-50 hover:text-violet-700 flex items-center gap-2.5 transition-colors"
                  >
                    <FileCode size={15} className="text-indigo-600" />
                    <span>Export SVG</span>
                  </button>
                  <button
                    onClick={handleExportJson}
                    className="w-full px-3.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-violet-50 hover:text-violet-700 flex items-center gap-2.5 transition-colors"
                  >
                    <FileJson size={15} className="text-emerald-600" />
                    <span>Export JSON</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Top Right: Presence, Status & Theme */}
      <div className="fixed top-4 right-4 z-20">
        <div className="bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl shadow-lg px-3.5 py-2.5 flex items-center gap-3">
          {/* Exact Online User Count */}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-50 border border-violet-200/60 text-xs font-semibold text-violet-700"
            title={`${userCount} user${userCount === 1 ? "" : "s"} currently connected to this room`}
          >
            <Users size={14} className="text-violet-600" />
            <span>
              {userCount} {userCount === 1 ? "user" : "users"}
            </span>
          </div>

          <div className="w-px h-4 bg-slate-200" />

          {/* Connection Status Indicator */}
          <div className="flex items-center gap-1.5 text-xs">
            {connectionStatus === "connected" ? (
              <span className="flex items-center gap-1 text-emerald-600 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="hidden sm:inline">Connected</span>
              </span>
            ) : (
              <span className="flex items-center gap-1 text-amber-600 font-medium">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                <span className="hidden sm:inline">Reconnecting</span>
              </span>
            )}
          </div>

          <div className="w-px h-4 bg-slate-200" />

          {/* Dark Mode Toggle */}
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-1 rounded-lg hover:bg-slate-100 transition-colors text-slate-600"
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </div>

      {/* Save Notification Toast */}
      {saveToast && (
        <div className="fixed bottom-16 left-1/2 transform -translate-x-1/2 z-30 animate-in slide-in-from-bottom-4 duration-200">
          <div className="bg-slate-900/90 backdrop-blur-md text-white px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-semibold">
            <CheckCircle2 size={16} className="text-emerald-400" />
            <span>{saveToast}</span>
          </div>
        </div>
      )}

      {/* Bottom Left: Zoom Controls */}
      <div className="fixed bottom-4 left-4 z-20">
        <div className="bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl shadow-lg p-1.5 flex items-center gap-1">
          <button
            onClick={() => setZoomLevel(Math.max(0.2, zoomLevel - 0.1))}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut size={16} />
          </button>
          <span className="text-xs font-semibold text-slate-700 min-w-[3rem] text-center">
            {Math.round(zoomLevel * 100)}%
          </span>
          <button
            onClick={() => setZoomLevel(Math.min(3, zoomLevel + 0.1))}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
            title="Zoom In"
          >
            <ZoomIn size={16} />
          </button>
          <button
            onClick={() => setZoomLevel(1)}
            className="px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 hover:text-slate-800 rounded transition-colors"
            title="Reset Zoom"
          >
            100%
          </button>
        </div>
      </div>

      {/* Bottom Right: Quick Actions Menu */}
      <div className="fixed bottom-4 right-4 z-20">
        <div className="relative">
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl shadow-lg p-3 hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-all"
            title="Settings & Export"
          >
            <Settings size={18} />
          </button>

          {isMenuOpen && (
            <div className="absolute bottom-16 right-0 bg-white border border-slate-200 rounded-2xl shadow-xl py-2 min-w-[200px] z-30 animate-in fade-in zoom-in-95 duration-100">
              <button
                onClick={handleSave}
                className="w-full px-4 py-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
              >
                <Save size={15} className="text-violet-600" />
                <span>Save Whiteboard</span>
              </button>
              <button
                onClick={handleExportPng}
                className="w-full px-4 py-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
              >
                <ImageIcon size={15} className="text-violet-600" />
                <span>Export as PNG</span>
              </button>
              <button
                onClick={handleExportSvg}
                className="w-full px-4 py-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
              >
                <FileCode size={15} className="text-indigo-600" />
                <span>Export as SVG</span>
              </button>
              <button
                onClick={handleExportJson}
                className="w-full px-4 py-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
              >
                <FileJson size={15} className="text-emerald-600" />
                <span>Export as JSON</span>
              </button>
              <div className="my-1 border-t border-slate-100" />
              <Link
                href="/dashboard"
                className="w-full px-4 py-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
              >
                <Home size={15} className="text-slate-500" />
                <span>Return to Workspaces</span>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

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
  copySelected,
  pasteClipboard,
  duplicateSelected,
  deleteSelected,
  selectAll,
  clearSelection,
  updateSelectionStyle,
  commitTextElement,
  setEditingTextId,
  DrawingElement,
  SelectionInfo,
  Tool,
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
  Share2,
  X,
  Bold,
  Italic,
  Link as LinkIcon,
  Palette,
} from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import { IconButton } from "./IconButton";
import Link from "next/link";

interface CanvasProps {
  socket: WebSocket;
  roomId: string;
  roomSlug?: string;
  roomName?: string;
  workspaceId?: string;
  workspaceName?: string;
  connectionStatus?: "connected" | "connecting" | "error" | "auth_required";
}

interface InlineTextEditState {
  element: DrawingElement;
  isNew: boolean;
  text: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  strokeColor: string;
  opacity: number;
}

const PRESET_STROKE_COLORS = [
  "#000000",
  "#ffffff",
  "#ef4444",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#64748b",
];

const PRESET_FILL_COLORS = [
  "transparent",
  "#fee2e2",
  "#dbeafe",
  "#d1fae5",
  "#fef3c7",
  "#ede9fe",
  "#fce7f3",
  "#f1f5f9",
  "#ffffff",
  "#1e293b",
];

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
  const exportDropdownRef = useRef<HTMLDivElement>(null);
  const exportButtonRef = useRef<HTMLButtonElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  const [selectedTool, setSelectedTool] = useState<Tool>("select");
  const [userCount, setUserCount] = useState<number>(1);
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState<boolean>(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<boolean>(false);

  // Selection & Contextual Toolbar State
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null);

  const [editingText, setEditingText] = useState<InlineTextEditState | null>(null);
  const editingTextRef = useRef<InlineTextEditState | null>(null);
  editingTextRef.current = editingText;
  const editorContainerRef = useRef<HTMLDivElement>(null);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  // Share Modal State
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);
  const [copiedShareLink, setCopiedShareLink] = useState<boolean>(false);
  const [copiedShareId, setCopiedShareId] = useState<boolean>(false);
  const displayRoomTitle = roomName || roomSlug || `Room ${roomId}`;

  const commitCurrentText = useCallback((switchToolToSelect = true) => {
    const current = editingTextRef.current;
    if (!current) return;
    setEditingTextId(null);
    const hasText = current.text.trim().length > 0;
    if (hasText) {
      commitTextElement(
        current.element.id,
        current.text,
        current.element.x,
        current.element.y,
        {
          strokeColor: current.strokeColor,
          fontSize: current.fontSize,
          bold: current.bold,
          italic: current.italic,
          opacity: current.opacity,
        },
        current.isNew
      );
    } else if (!current.isNew) {
      commitTextElement(
        current.element.id,
        "",
        current.element.x,
        current.element.y,
        undefined,
        false
      );
    }
    setEditingText(null);
    editingTextRef.current = null;
    if (hasText && switchToolToSelect) {
      setSelectedTool("select");
    }
  }, []);

  // Handle outside clicks to commit active text editor cleanly without blur race conditions
  useEffect(() => {
    if (!editingText) return;

    const handlePointerDownOutside = (e: MouseEvent) => {
      const container = editorContainerRef.current;
      if (container && container.contains(e.target as Node)) {
        return;
      }
      commitCurrentText(true);
    };

    const timer = setTimeout(() => {
      window.addEventListener("mousedown", handlePointerDownOutside, { capture: true });
    }, 80);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousedown", handlePointerDownOutside, { capture: true });
    };
  }, [editingText, commitCurrentText]);

  // Keyboard Shortcuts Handler
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // If user is currently typing in an input or textarea or editingText is active
      const activeTag = (document.activeElement?.tagName || "").toLowerCase();
      if (editingTextRef.current || activeTag === "input" || activeTag === "textarea") {
        if (e.key === "Escape") {
          e.preventDefault();
          commitCurrentText(true);
        } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          commitCurrentText(true);
        }
        return;
      }

      const isMetaOrCtrl = e.metaKey || e.ctrlKey;

      if (isMetaOrCtrl) {
        if (e.key.toLowerCase() === "c") {
          e.preventDefault();
          copySelected();
        } else if (e.key.toLowerCase() === "v") {
          e.preventDefault();
          pasteClipboard();
        } else if (e.key.toLowerCase() === "d") {
          e.preventDefault();
          duplicateSelected();
        } else if (e.key.toLowerCase() === "a") {
          e.preventDefault();
          selectAll();
        } else if (e.key.toLowerCase() === "z") {
          e.preventDefault();
          if (e.shiftKey) {
            redo();
          } else {
            undo();
          }
        } else if (e.key.toLowerCase() === "y") {
          e.preventDefault();
          redo();
        }
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelected();
        return;
      }

      if (e.key === "Escape") {
        clearSelection();
        setContextMenu(null);
        setIsExportMenuOpen(false);
        setIsMenuOpen(false);
        setIsShareModalOpen(false);
        return;
      }

      // Single-key tool switches
      switch (e.key.toLowerCase()) {
        case "s":
        case "v":
          setSelectedTool("select");
          break;
        case "r":
          setSelectedTool("rectangle");
          break;
        case "c":
          setSelectedTool("circle");
          break;
        case "d":
          setSelectedTool("diamond");
          break;
        case "a":
          setSelectedTool("arrow");
          break;
        case "l":
          setSelectedTool("line");
          break;
        case "p":
          setSelectedTool("pencil");
          break;
        case "t":
          setSelectedTool("text");
          break;
        case "e":
          setSelectedTool("eraser");
          break;
      }
    },
    [commitCurrentText]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        exportDropdownRef.current &&
        !exportDropdownRef.current.contains(e.target as Node) &&
        exportButtonRef.current &&
        !exportButtonRef.current.contains(e.target as Node)
      ) {
        setIsExportMenuOpen(false);
      }
      setContextMenu(null);
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Initialize Canvas Drawing Engine
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
        onSelectionChange: (sel) => {
          setSelectionInfo(sel);
        },
        onEditText: (element, isNew) => {
          setEditingTextId(element.id);
          const state: InlineTextEditState = {
            element,
            isNew,
            text: element.text || "",
            fontSize: element.fontSize || 18,
            bold: element.bold || false,
            italic: element.italic || false,
            strokeColor: element.strokeColor,
            opacity: element.opacity ?? 1,
          };
          editingTextRef.current = state;
          setEditingText(state);
        },
        onCommitText: () => {
          commitCurrentText(true);
        },
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

  // Focus textarea ONLY when a new text element starts editing (by active element ID)
  const activeEditingId = editingText?.element.id;
  useEffect(() => {
    if (activeEditingId && textInputRef.current) {
      const textarea = textInputRef.current;
      textarea.focus();
      if (!editingTextRef.current?.isNew && textarea.value) {
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      }

      const timer = setTimeout(() => {
        if (textInputRef.current) {
          textInputRef.current.focus();
          if (!editingTextRef.current?.isNew && textInputRef.current.value) {
            textInputRef.current.setSelectionRange(
              textInputRef.current.value.length,
              textInputRef.current.value.length
            );
          }
        }
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [activeEditingId]);

  const handleUndo = () => undo();
  const handleRedo = () => redo();

  const handleClear = () => {
    if (
      confirm(
        "Are you sure you want to clear the whiteboard canvas for all users in this room?"
      )
    ) {
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

  const handleCanvasContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const getShareUrl = () => {
    if (typeof window === "undefined") return "";
    if (workspaceId) {
      return `${window.location.origin}/workspace/${workspaceId}/room/${roomSlug || roomId}`;
    }
    return `${window.location.origin}/canvas/${roomSlug || roomId}`;
  };

  const handleCopyShareLink = () => {
    const url = getShareUrl();
    navigator.clipboard.writeText(url);
    setCopiedShareLink(true);
    setTimeout(() => setCopiedShareLink(false), 2000);
  };

  const handleCopyShareId = () => {
    navigator.clipboard.writeText(roomSlug || roomId);
    setCopiedShareId(true);
    setTimeout(() => setCopiedShareId(false), 2000);
  };

  return (
    <div
      className={`relative h-screen w-screen overflow-hidden select-none transition-colors ${
        isDarkMode ? "bg-slate-950 text-white" : "bg-white text-slate-900"
      }`}
    >
      <canvas
        ref={canvasRef}
        width={typeof window !== "undefined" ? window.innerWidth : 1920}
        height={typeof window !== "undefined" ? window.innerHeight : 1080}
        onContextMenu={handleCanvasContextMenu}
        className="block touch-none"
        style={{
          transform: `scale(${zoomLevel})`,
          transformOrigin: "top left",
        }}
      />

      {/* Inline Text Area Editor - Clean Excalidraw style */}
      {editingText && (
        <div
          ref={editorContainerRef}
          className="absolute z-50 pointer-events-auto select-text"
          style={{
            left: editingText.element.x * zoomLevel,
            top: editingText.element.y * zoomLevel,
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <textarea
            ref={(node) => {
              textInputRef.current = node;
              if (node) {
                node.focus();
              }
            }}
            autoFocus
            value={editingText.text}
            onChange={(e) => {
              const updated: InlineTextEditState = {
                ...editingText,
                text: e.target.value,
              };
              editingTextRef.current = updated;
              setEditingText(updated);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                commitCurrentText(true);
              } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                commitCurrentText(true);
              }
            }}
            placeholder=""
            rows={1}
            className="bg-white/90 dark:bg-slate-900/90 border border-dashed border-violet-400 dark:border-violet-500 rounded px-1.5 py-0.5 outline-none resize-none overflow-hidden select-text text-slate-900 dark:text-white caret-violet-600 dark:caret-violet-400 shadow-sm"
            style={{
              fontSize: `${(editingText.fontSize || 18) * zoomLevel}px`,
              fontFamily: "system-ui, -apple-system, sans-serif",
              fontWeight: editingText.bold ? "bold" : "normal",
              fontStyle: editingText.italic ? "italic" : "normal",
              color:
                editingText.strokeColor === "#000000" && isDarkMode
                  ? "#ffffff"
                  : editingText.strokeColor === "#ffffff" && !isDarkMode
                  ? "#000000"
                  : editingText.strokeColor,
              lineHeight: 1.3,
              minWidth: "60px",
              minHeight: `${(editingText.fontSize || 18) * 1.35 * zoomLevel + 6}px`,
              width: `${Math.max(
                60,
                (editingText.text.split("\n").reduce((max, line) => Math.max(max, line.length), 0) + 2) *
                  (editingText.fontSize || 18) *
                  0.65 *
                  zoomLevel +
                  16
              )}px`,
              height: `${Math.max(
                (editingText.fontSize || 18) * 1.35 * zoomLevel + 6,
                editingText.text.split("\n").length * (editingText.fontSize || 18) * 1.35 * zoomLevel + 6
              )}px`,
            }}
          />
        </div>
      )}

      {/* Top Left Area: Workspace & Room Context Navigation */}
      <div className="fixed top-4 left-4 z-20 flex items-center gap-2">
        <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-lg px-3.5 py-2.5 flex items-center gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-violet-600 dark:text-violet-400 hover:text-violet-700 transition-colors"
            title="Go to Dashboard"
          >
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center text-white shadow-xs">
              <LayoutDashboard size={15} />
            </div>
          </Link>

          <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />

          {/* Breadcrumb info */}
          <div className="flex flex-col">
            {workspaceId && workspaceName ? (
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <Link
                  href={`/workspace/${workspaceId}`}
                  className="font-medium hover:text-violet-600 dark:hover:text-violet-400 transition-colors truncate max-w-[120px]"
                >
                  {workspaceName}
                </Link>
                <span>/</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[140px]">
                  {displayRoomTitle}
                </span>
              </div>
            ) : (
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[160px]">
                {displayRoomTitle}
              </span>
            )}
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
              <span>ID: {roomSlug || roomId}</span>
              <button
                onClick={handleCopyRoomId}
                className="p-0.5 hover:text-violet-600 dark:hover:text-violet-400 rounded transition-colors"
                title="Copy Room ID"
              >
                {copiedId ? (
                  <Check size={12} className="text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Copy size={12} />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Center Top: Drawing Toolbar */}
      <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-30 max-w-[98vw]">
        <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-xl px-2.5 sm:px-3 py-1.5 sm:py-2 flex items-center gap-1.5 sm:gap-2">
          {/* Drawing Tools */}
          <div className="flex items-center gap-1 pr-2 border-r border-slate-200 dark:border-slate-800">
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
          <div className="flex items-center gap-1 pr-2 border-r border-slate-200 dark:border-slate-800">
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
          <div className="flex items-center gap-1.5 relative shrink-0">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 active:scale-95 text-white font-medium text-xs shadow-xs transition-all disabled:opacity-75"
              title="Save Whiteboard to Cloud"
            >
              {isSaving ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Save size={15} />
              )}
              <span>Save</span>
            </button>

            {/* Export Dropdown Button & Popover */}
            <div className="relative">
              <button
                ref={exportButtonRef}
                onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-all ${
                  isExportMenuOpen
                    ? "border-violet-500 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 shadow-xs"
                    : "border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                }`}
                title="Export Whiteboard"
              >
                <Download
                  size={14}
                  className={isExportMenuOpen ? "text-violet-600" : "text-slate-600 dark:text-slate-400"}
                />
                <span>Export</span>
                <ChevronDown
                  size={12}
                  className={`transition-transform duration-200 ${
                    isExportMenuOpen ? "rotate-180 text-violet-600" : "text-slate-400"
                  }`}
                />
              </button>

              {isExportMenuOpen && (
                <div
                  ref={exportDropdownRef}
                  className="absolute top-full right-0 mt-2 w-52 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150"
                >
                  <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800 mb-1">
                    Export as
                  </div>
                  <button
                    onClick={handleExportPng}
                    className="w-full px-2.5 py-2 text-left rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-violet-50 dark:hover:bg-violet-950/40 hover:text-violet-700 dark:hover:text-violet-300 flex items-center justify-between transition-colors group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center text-violet-600 dark:text-violet-400 group-hover:scale-105 transition-transform">
                        <ImageIcon size={13} />
                      </div>
                      <span className="font-semibold">PNG Image</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">.png</span>
                  </button>
                  <button
                    onClick={handleExportSvg}
                    className="w-full px-2.5 py-2 text-left rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center justify-between transition-colors group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 group-hover:scale-105 transition-transform">
                        <FileCode size={13} />
                      </div>
                      <span className="font-semibold">SVG Vector</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">.svg</span>
                  </button>
                  <button
                    onClick={handleExportJson}
                    className="w-full px-2.5 py-2 text-left rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-700 dark:hover:text-emerald-300 flex items-center justify-between transition-colors group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform">
                        <FileJson size={13} />
                      </div>
                      <span className="font-semibold">JSON Data</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">.json</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Contextual Style Toolbar for Selected Element(s) */}
        {selectionInfo && (
          <div className="mt-2 flex justify-center animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-xl px-3 py-1.5 flex flex-wrap items-center gap-2.5 text-xs">
              {/* Stroke Color */}
              <div className="flex items-center gap-1.5 pr-2 border-r border-slate-200 dark:border-slate-800">
                <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                  Stroke
                </span>
                <div className="flex items-center gap-1">
                  {PRESET_STROKE_COLORS.slice(0, 6).map((color) => (
                    <button
                      key={color}
                      onClick={() => updateSelectionStyle({ strokeColor: color })}
                      className={`w-4 h-4 rounded-full border transition-all ${
                        selectionInfo.strokeColor === color
                          ? "ring-2 ring-violet-500 scale-110"
                          : "border-slate-300 dark:border-slate-600 hover:scale-105"
                      }`}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                  {/* Custom color input */}
                  <label className="relative w-4 h-4 rounded-full border border-slate-300 dark:border-slate-600 cursor-pointer overflow-hidden flex items-center justify-center hover:scale-105 transition-transform">
                    <input
                      type="color"
                      value={selectionInfo.strokeColor || "#8b5cf6"}
                      onChange={(e) =>
                        updateSelectionStyle({ strokeColor: e.target.value })
                      }
                      className="absolute -top-4 -left-4 w-12 h-12 cursor-pointer opacity-0"
                    />
                    <Palette size={10} className="text-slate-500" />
                  </label>
                </div>
              </div>

              {/* Fill / Background Color (for non-pencil/line) */}
              {selectionInfo.type !== "pencil" && selectionInfo.type !== "line" && (
                <div className="flex items-center gap-1.5 pr-2 border-r border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                    Fill
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => updateSelectionStyle({ fillColor: "transparent" })}
                      className={`w-4 h-4 rounded-full border text-[9px] flex items-center justify-center transition-all ${
                        !selectionInfo.fillColor || selectionInfo.fillColor === "transparent"
                          ? "ring-2 ring-violet-500 border-violet-400"
                          : "border-slate-300 dark:border-slate-600"
                      }`}
                      title="Transparent"
                    >
                      <span className="text-slate-400">∅</span>
                    </button>
                    {PRESET_FILL_COLORS.slice(1, 6).map((color) => (
                      <button
                        key={color}
                        onClick={() => updateSelectionStyle({ fillColor: color })}
                        className={`w-4 h-4 rounded-full border transition-all ${
                          selectionInfo.fillColor === color
                            ? "ring-2 ring-violet-500 scale-110"
                            : "border-slate-300 dark:border-slate-600 hover:scale-105"
                        }`}
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                    <label className="relative w-4 h-4 rounded-full border border-slate-300 dark:border-slate-600 cursor-pointer overflow-hidden flex items-center justify-center hover:scale-105 transition-transform">
                      <input
                        type="color"
                        value={
                          selectionInfo.fillColor && selectionInfo.fillColor !== "transparent"
                            ? selectionInfo.fillColor
                            : "#ede9fe"
                        }
                        onChange={(e) =>
                          updateSelectionStyle({ fillColor: e.target.value })
                        }
                        className="absolute -top-4 -left-4 w-12 h-12 cursor-pointer opacity-0"
                      />
                      <Palette size={10} className="text-slate-500" />
                    </label>
                  </div>
                </div>
              )}

              {/* Stroke Width */}
              <div className="flex items-center gap-1 pr-2 border-r border-slate-200 dark:border-slate-800">
                <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                  Width
                </span>
                {[1, 2, 4, 6].map((w) => (
                  <button
                    key={w}
                    onClick={() => updateSelectionStyle({ strokeWidth: w })}
                    className={`px-1.5 py-0.5 rounded text-[11px] font-medium transition-all ${
                      selectionInfo.strokeWidth === w
                        ? "bg-violet-100 dark:bg-violet-900/60 text-violet-700 dark:text-violet-300 font-bold"
                        : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    {w}px
                  </button>
                ))}
              </div>

              {/* Opacity */}
              <div className="flex items-center gap-1 pr-2 border-r border-slate-200 dark:border-slate-800">
                <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                  Opacity
                </span>
                {[1, 0.75, 0.5, 0.25].map((op) => (
                  <button
                    key={op}
                    onClick={() => updateSelectionStyle({ opacity: op })}
                    className={`px-1.5 py-0.5 rounded text-[11px] font-medium transition-all ${
                      Math.abs((selectionInfo.opacity ?? 1) - op) < 0.05
                        ? "bg-violet-100 dark:bg-violet-900/60 text-violet-700 dark:text-violet-300 font-bold"
                        : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    {Math.round(op * 100)}%
                  </button>
                ))}
              </div>

              {/* Text specific controls */}
              {selectionInfo.type === "text" && (
                <div className="flex items-center gap-1.5 pr-2 border-r border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                    Font
                  </span>
                  {[14, 18, 24, 32].map((sz) => (
                    <button
                      key={sz}
                      onClick={() => updateSelectionStyle({ fontSize: sz })}
                      className={`px-1.5 py-0.5 rounded text-[11px] font-medium transition-all ${
                        selectionInfo.fontSize === sz
                          ? "bg-violet-100 dark:bg-violet-900/60 text-violet-700 dark:text-violet-300 font-bold"
                          : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      {sz}
                    </button>
                  ))}

                  <button
                    onClick={() =>
                      updateSelectionStyle({ bold: !selectionInfo.bold })
                    }
                    className={`p-1 rounded transition-all ${
                      selectionInfo.bold
                        ? "bg-violet-100 dark:bg-violet-900/60 text-violet-700 dark:text-violet-300 font-bold"
                        : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                    }`}
                    title="Bold"
                  >
                    <Bold size={13} />
                  </button>

                  <button
                    onClick={() =>
                      updateSelectionStyle({ italic: !selectionInfo.italic })
                    }
                    className={`p-1 rounded transition-all ${
                      selectionInfo.italic
                        ? "bg-violet-100 dark:bg-violet-900/60 text-violet-700 dark:text-violet-300 font-bold"
                        : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                    }`}
                    title="Italic"
                  >
                    <Italic size={13} />
                  </button>
                </div>
              )}

              {/* Quick Actions */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => duplicateSelected()}
                  className="px-2 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-medium transition-colors"
                  title="Duplicate (Ctrl+D)"
                >
                  Duplicate
                </button>
                <button
                  onClick={() => deleteSelected()}
                  className="px-2 py-0.5 rounded hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 text-[11px] font-medium transition-colors"
                  title="Delete (Backspace / Del)"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Top Right: Share, Presence, Status & Theme */}
      <div className="fixed top-4 right-4 z-20">
        <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-lg px-3 py-2 flex items-center gap-2.5">
          {/* Share Button */}
          <button
            onClick={() => setIsShareModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-50 dark:bg-violet-950/40 hover:bg-violet-100 text-violet-700 dark:text-violet-300 font-semibold text-xs transition-all active:scale-95 shadow-2xs"
            title="Share Room link & ID"
          >
            <Share2 size={13} />
            <span>Share</span>
          </button>

          <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />

          {/* Connected Collaborator Count */}
          <div
            className="flex items-center gap-1.5 px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300"
            title={`${userCount} user${userCount === 1 ? "" : "s"} connected`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                connectionStatus === "connected"
                  ? "bg-emerald-500 animate-pulse"
                  : "bg-amber-500 animate-ping"
              }`}
            />
            <span className="font-mono">{userCount}</span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
              {userCount === 1 ? "user" : "users"}
            </span>
          </div>

          {connectionStatus !== "connected" && (
            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium animate-pulse">
              Connecting...
            </span>
          )}

          <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />

          {/* Dark Mode Toggle */}
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-600 dark:text-slate-300"
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDarkMode ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </div>

      {/* Share Room Modal */}
      {isShareModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 relative">
            <button
              onClick={() => setIsShareModalOpen(false)}
              className="absolute top-5 right-5 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center text-violet-600 dark:text-violet-300">
                <Share2 size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Share Whiteboard Room
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Invite collaborators to draw live in this room
                </p>
              </div>
            </div>

            <div className="space-y-3.5 my-4">
              {/* Room & Workspace Info */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 text-xs">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-slate-500">Room Name</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {displayRoomTitle}
                  </span>
                </div>
                {workspaceName && (
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-slate-500">Workspace</span>
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {workspaceName}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Room ID</span>
                  <div className="flex items-center gap-1.5 font-mono text-slate-800 dark:text-slate-200">
                    <span>{roomSlug || roomId}</span>
                    <button
                      onClick={handleCopyShareId}
                      className="p-1 hover:text-violet-600 rounded transition-colors"
                      title="Copy ID"
                    >
                      {copiedShareId ? (
                        <Check size={13} className="text-emerald-500" />
                      ) : (
                        <Copy size={13} />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Shareable Link Box */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Shareable Room URL
                </label>
                <div className="flex items-center gap-2 p-1.5 pl-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl">
                  <input
                    type="text"
                    readOnly
                    value={getShareUrl()}
                    className="w-full bg-transparent text-xs text-slate-700 dark:text-slate-300 outline-none font-mono truncate"
                  />
                  <button
                    onClick={handleCopyShareLink}
                    className="px-3.5 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold transition-all active:scale-95 flex items-center gap-1.5 shrink-0"
                  >
                    {copiedShareLink ? (
                      <>
                        <Check size={13} />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <LinkIcon size={13} />
                        <span>Copy Link</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center">
              Anyone with this link can join and collaborate in real-time.
            </p>
          </div>
        </div>
      )}

      {/* Right-Click Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[160px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-1.5 animate-in fade-in zoom-in-95 duration-100"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => {
              copySelected();
              setContextMenu(null);
            }}
            className="w-full px-3 py-1.5 text-left text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-violet-50 dark:hover:bg-violet-950/40 rounded-xl flex items-center justify-between transition-colors"
          >
            <span>Copy</span>
            <span className="text-[10px] text-slate-400 font-mono">⌘C</span>
          </button>
          <button
            onClick={() => {
              pasteClipboard();
              setContextMenu(null);
            }}
            className="w-full px-3 py-1.5 text-left text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-violet-50 dark:hover:bg-violet-950/40 rounded-xl flex items-center justify-between transition-colors"
          >
            <span>Paste</span>
            <span className="text-[10px] text-slate-400 font-mono">⌘V</span>
          </button>
          <button
            onClick={() => {
              duplicateSelected();
              setContextMenu(null);
            }}
            className="w-full px-3 py-1.5 text-left text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-violet-50 dark:hover:bg-violet-950/40 rounded-xl flex items-center justify-between transition-colors"
          >
            <span>Duplicate</span>
            <span className="text-[10px] text-slate-400 font-mono">⌘D</span>
          </button>
          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
          <button
            onClick={() => {
              deleteSelected();
              setContextMenu(null);
            }}
            className="w-full px-3 py-1.5 text-left text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl flex items-center justify-between transition-colors"
          >
            <span>Delete</span>
            <span className="text-[10px] text-slate-400 font-mono">Del</span>
          </button>
        </div>
      )}

      {/* Save Notification Toast */}
      {saveToast && (
        <div className="fixed bottom-16 left-1/2 transform -translate-x-1/2 z-30 animate-in slide-in-from-bottom-4 duration-200">
          <div className="bg-slate-900/90 text-white px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-semibold">
            <CheckCircle2 size={16} className="text-emerald-400" />
            <span>{saveToast}</span>
          </div>
        </div>
      )}

      {/* Bottom Left: Zoom Controls */}
      <div className="fixed bottom-4 left-4 z-20">
        <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-lg p-1.5 flex items-center gap-1">
          <button
            onClick={() => setZoomLevel(Math.max(0.2, zoomLevel - 0.1))}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut size={16} />
          </button>
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 min-w-[3rem] text-center">
            {Math.round(zoomLevel * 100)}%
          </span>
          <button
            onClick={() => setZoomLevel(Math.min(3, zoomLevel + 0.1))}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors"
            title="Zoom In"
          >
            <ZoomIn size={16} />
          </button>
          <button
            onClick={() => setZoomLevel(1)}
            className="px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded transition-colors"
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
            className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-lg p-3 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-all"
            title="Settings & Export"
          >
            <Settings size={18} />
          </button>

          {isMenuOpen && (
            <div className="absolute bottom-16 right-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl py-2 min-w-[200px] z-30 animate-in fade-in zoom-in-95 duration-100">
              <button
                onClick={handleSave}
                className="w-full px-4 py-2.5 text-left text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5"
              >
                <Save size={15} className="text-violet-600" />
                <span>Save Whiteboard</span>
              </button>
              <button
                onClick={handleExportPng}
                className="w-full px-4 py-2.5 text-left text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5"
              >
                <ImageIcon size={15} className="text-violet-600" />
                <span>Export as PNG</span>
              </button>
              <button
                onClick={handleExportSvg}
                className="w-full px-4 py-2.5 text-left text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5"
              >
                <FileCode size={15} className="text-indigo-600" />
                <span>Export as SVG</span>
              </button>
              <button
                onClick={handleExportJson}
                className="w-full px-4 py-2.5 text-left text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5"
              >
                <FileJson size={15} className="text-emerald-600" />
                <span>Export as JSON</span>
              </button>
              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
              <Link
                href="/dashboard"
                className="w-full px-4 py-2.5 text-left text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5"
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

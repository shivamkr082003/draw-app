import { initDraw, setCurrentTool, setDarkMode, undo, redo, clearCanvas } from "@/drawgame";
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
  MessageCircle,
  Minus,
  ArrowUpRight,
  Type,
  Diamond,
  ZoomIn,
  ZoomOut,
  Sun,
  Moon,
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

export function Canvas({
  roomId,
  socket,
}: {
  socket: WebSocket;
  roomId: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedTool, setSelectedTool] = useState<Tool>("select");
  const [userCount, setUserCount] = useState(1);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);

  useEffect(() => {
    if (canvasRef.current) {
      initDraw(
        canvasRef.current,
        roomId,
        socket,
        selectedTool,
        {
          onHistoryChange: () => {
            
          },
        },
        isDarkMode
      );
    }

    const handleMessage = (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      if (data.type === "userCount") {
        setUserCount(data.count);
      }
    };

    socket.addEventListener("message", handleMessage);
    return () => socket.removeEventListener("message", handleMessage);
  }, [canvasRef, roomId, socket, selectedTool, isDarkMode]);

  useEffect(() => {
    setCurrentTool(selectedTool);
  }, [selectedTool]);

  useEffect(() => {
    setDarkMode(isDarkMode);
  }, [isDarkMode]);

  const handleUndo = () => {
    undo();
    
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) {
        
      }
    }
  };

  const handleRedo = () => {
    redo();
    
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) {
        
      }
    }
  };

  const handleClear = () => {
    clearCanvas();
    
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) {
        
      }
    }
  };

  return (
    <div
      className={`relative h-screen w-screen overflow-hidden transition-colors ${isDarkMode ? "bg-gray-900" : "bg-white"}`}
    >
      <canvas
        ref={canvasRef}
        width={window.innerWidth}
        height={window.innerHeight}
        className="block"
        style={{
          transform: `scale(${zoomLevel})`,
          transformOrigin: "top left",
        }}
      />

      {}
      <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-10">
        <div className="bg-white/95 backdrop-blur-lg border border-gray-200 rounded-2xl shadow-lg px-4 py-3">
          <div className="flex items-center gap-2">
            {}
            <div className="flex items-center gap-1 pr-2 border-r border-gray-200">
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
                tooltip="Select"
              />
              <IconButton
                activated={selectedTool === "rectangle"}
                icon={<Square size={18} />}
                onClick={() => setSelectedTool("rectangle")}
                tooltip="Rectangle"
              />
              <IconButton
                activated={selectedTool === "circle"}
                icon={<Circle size={18} />}
                onClick={() => setSelectedTool("circle")}
                tooltip="Circle"
              />
              <IconButton
                activated={selectedTool === "diamond"}
                icon={<Diamond size={18} />}
                onClick={() => setSelectedTool("diamond")}
                tooltip="Diamond"
              />
              <IconButton
                activated={selectedTool === "arrow"}
                icon={<ArrowUpRight size={18} />}
                onClick={() => setSelectedTool("arrow")}
                tooltip="Arrow"
              />
              <IconButton
                activated={selectedTool === "line"}
                icon={<Minus size={18} />}
                onClick={() => setSelectedTool("line")}
                tooltip="Line"
              />
              <IconButton
                activated={selectedTool === "pencil"}
                icon={<Pencil size={18} />}
                onClick={() => setSelectedTool("pencil")}
                tooltip="Pencil"
              />
              <IconButton
                activated={selectedTool === "text"}
                icon={<Type size={18} />}
                onClick={() => setSelectedTool("text")}
                tooltip="Text"
              />
              <IconButton
                activated={selectedTool === "eraser"}
                icon={<Eraser size={18} />}
                onClick={() => setSelectedTool("eraser")}
                tooltip="Eraser"
              />
            </div>

            {}
            <div className="flex items-center gap-1 pr-2 border-r border-gray-200">
              <IconButton
                activated={false}
                icon={<Undo size={18} />}
                onClick={handleUndo}
                tooltip="Undo"
              />
              <IconButton
                activated={false}
                icon={<Redo size={18} />}
                onClick={handleRedo}
                tooltip="Redo"
              />
              <IconButton
                activated={false}
                icon={<Trash2 size={18} />}
                onClick={handleClear}
                tooltip="Clear All"
              />
            </div>

            {}
            <div className="flex items-center gap-1">
              <IconButton
                activated={false}
                icon={<Save size={18} />}
                onClick={() => {}}
                tooltip="Save"
              />
              <IconButton
                activated={false}
                icon={<Download size={18} />}
                onClick={() => {}}
                tooltip="Export"
              />
            </div>
          </div>
        </div>
      </div>

      {}
      <div className="fixed top-4 right-4 z-10">
        <div className="bg-white/95 backdrop-blur-lg border border-gray-200 rounded-2xl shadow-lg px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Users size={16} />
              <span className="font-medium">{userCount}</span>
            </div>
            <div className="w-px h-4 bg-gray-200"></div>
            <div className="text-xs text-gray-500 font-mono">
              Room: {roomId.slice(-6)}
            </div>
            <div className="w-px h-4 bg-gray-200"></div>
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
              title={
                isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"
              }
            >
              {isDarkMode ? (
                <Sun size={16} className="text-gray-600" />
              ) : (
                <Moon size={16} className="text-gray-600" />
              )}
            </button>
          </div>
        </div>
      </div>

      {}
      <div className="fixed top-4 left-4 z-10">
        <Link href="/">
          <div className="bg-white/95 backdrop-blur-lg border border-gray-200 rounded-2xl shadow-lg p-3 hover:bg-gray-50 transition-all">
            <Home size={20} className="text-gray-600" />
          </div>
        </Link>
      </div>

      {}
      <div className="fixed bottom-4 right-4 z-10">
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="bg-white/95 backdrop-blur-lg border border-gray-200 rounded-2xl shadow-lg p-3 hover:bg-gray-50 transition-all"
        >
          <Settings size={20} className="text-gray-600" />
        </button>

        {isMenuOpen && (
          <div className="absolute bottom-16 right-0 bg-white border border-gray-200 rounded-xl shadow-lg py-2 min-w-[200px]">
            <button className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
              <MessageCircle size={16} />
              Toggle Chat
            </button>
            <button className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
              <Download size={16} />
              Export PNG
            </button>
            <button className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
              <Download size={16} />
              Export SVG
            </button>
          </div>
        )}
      </div>

      <div className="fixed bottom-4 left-4 z-10">
        <div className="bg-white/95 backdrop-blur-lg border border-gray-200 rounded-2xl shadow-lg p-2">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setZoomLevel(Math.max(0.1, zoomLevel - 0.1))}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              title="Zoom Out"
            >
              <ZoomOut size={18} className="text-gray-600" />
            </button>
            <span className="text-sm text-gray-600 min-w-[3rem] text-center">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              onClick={() => setZoomLevel(Math.min(3, zoomLevel + 0.1))}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              title="Zoom In"
            >
              <ZoomIn size={18} className="text-gray-600" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

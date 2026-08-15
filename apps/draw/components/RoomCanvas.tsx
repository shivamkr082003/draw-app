"use client";

import { WS_URL, HTTP_BACKEND } from "@/config";
import { useEffect, useState } from "react";
import { Canvas } from "./Canvas";
import { Loader2, AlertCircle, Home, RefreshCw } from "lucide-react";
import axios from "axios";
import Link from "next/link";

interface RoomCanvasProps {
  roomId: string;
  workspaceId?: string;
}

interface RoomInfo {
  id: number;
  slug: string;
  name?: string | null;
  workspaceId?: string | null;
  workspace?: {
    id: string;
    name: string;
  } | null;
}

export function RoomCanvas({ roomId, workspaceId: propWorkspaceId }: RoomCanvasProps) {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "error"
  >("connecting");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    let ws: WebSocket | null = null;
    let isMounted = true;

    const fetchRoomAndConnect = async () => {
      try {
        setConnectionStatus("connecting");
        // Fetch room metadata
        const response = await axios.get(`${HTTP_BACKEND}/room/${roomId}`);
        const room = response.data?.room;

        if (!room) {
          if (isMounted) {
            setConnectionStatus("error");
            setErrorMessage("Room not found or could not be loaded.");
          }
          return;
        }

        if (isMounted) {
          setRoomInfo(room);
        }

        const token =
          (typeof window !== "undefined" && localStorage.getItem("token")) ||
          "guest_" + Math.random().toString(36).substring(7);

        ws = new WebSocket(`${WS_URL}?token=${token}`);

        ws.onopen = () => {
          if (isMounted) {
            setConnectionStatus("connected");
            setSocket(ws);
          }
          ws?.send(
            JSON.stringify({
              type: "join_room",
              roomId: room.id.toString(),
            })
          );
        };

        ws.onclose = () => {
          if (isMounted) {
            setConnectionStatus("connecting");
            setSocket(null);
          }
        };

        ws.onerror = (error) => {
          console.error("WebSocket error:", error);
          if (isMounted) {
            setConnectionStatus("error");
            setErrorMessage("Failed to connect to the real-time collaboration server");
          }
        };
      } catch (error: unknown) {
        console.error("Failed to fetch room:", error);
        if (isMounted) {
          setConnectionStatus("error");
          let msg = "Unable to load the collaborative room. Please check your connection.";
          if (axios.isAxiosError(error) && error.response?.data?.message) {
            msg = error.response.data.message;
          }
          setErrorMessage(msg);
        }
      }
    };

    fetchRoomAndConnect();

    return () => {
      isMounted = false;
      if (ws) {
        ws.close();
      }
    };
  }, [roomId]);

  if (connectionStatus === "error") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 p-4">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-200/80 p-8 text-center animate-in fade-in duration-200">
          <div className="w-16 h-16 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mx-auto mb-5 shadow-xs">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Room Unavailable</h2>
          <p className="text-sm text-slate-600 mb-6 leading-relaxed">{errorMessage}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold shadow-md shadow-violet-500/20 transition-all flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
            <Link
              href="/dashboard"
              className="px-5 py-2.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
            >
              <Home className="w-4 h-4" />
              Workspaces
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!socket || !roomInfo || connectionStatus === "connecting") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-indigo-50/50 via-white to-purple-50/50 p-4">
        <div className="w-full max-w-sm bg-white/90 backdrop-blur-md rounded-3xl shadow-xl border border-slate-200/80 p-8 text-center animate-in fade-in duration-300">
          <div className="w-14 h-14 rounded-2xl bg-violet-50 text-violet-600 flex items-center justify-center mx-auto mb-4">
            <Loader2 className="w-7 h-7 animate-spin" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-1.5">Connecting to Whiteboard</h2>
          <p className="text-xs text-slate-500 mb-4">
            Setting up real-time collaboration canvas...
          </p>
          <div className="px-3 py-1.5 bg-slate-100 rounded-xl inline-block text-xs font-mono text-slate-600">
            Room: {roomInfo?.name || roomInfo?.slug || roomId}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Canvas
      roomId={roomInfo.id.toString()}
      socket={socket}
      roomSlug={roomInfo.slug}
      roomName={roomInfo.name || undefined}
      workspaceId={roomInfo.workspace?.id || roomInfo.workspaceId || propWorkspaceId || undefined}
      workspaceName={roomInfo.workspace?.name || undefined}
      connectionStatus={connectionStatus}
    />
  );
}

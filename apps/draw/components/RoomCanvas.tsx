"use client";

import { WS_URL, HTTP_BACKEND } from "@/config";
import { useEffect, useState } from "react";
import { Canvas } from "./Canvas";
import { Loader2, AlertCircle, Home, RefreshCw, Lock, ArrowRight, Github, Chrome, Mail, User, Eye, EyeOff } from "lucide-react";
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
    "connecting" | "connected" | "error" | "auth_required"
  >("connecting");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  // Auth form state for direct room join
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    // Check if user has an existing auth token
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const hasValidToken = !!token && !token.startsWith("guest_");
    setIsAuthenticated(hasValidToken);

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

        // If unauthenticated, require login first
        const currentToken = typeof window !== "undefined" ? localStorage.getItem("token") : null;
        if (!currentToken || currentToken.startsWith("guest_")) {
          if (isMounted) {
            setConnectionStatus("auth_required");
          }
          return;
        }

        ws = new WebSocket(`${WS_URL}?token=${currentToken}`);

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
  }, [roomId, isAuthenticated]);

  const handleDirectAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError("");

    try {
      const endpoint = authMode === "signin" ? "/signin" : "/signup";
      const payload =
        authMode === "signin"
          ? { email: authEmail, password: authPassword }
          : { email: authEmail, password: authPassword, name: authName };

      const res = await axios.post(`${HTTP_BACKEND}${endpoint}`, payload);

      let token = res.data.token;
      let userId = res.data.userId || res.data.user?.id;
      let name = res.data.name || res.data.user?.name || authName;

      if (!token && authMode === "signup") {
        const signinRes = await axios.post(`${HTTP_BACKEND}/signin`, {
          email: authEmail,
          password: authPassword,
        });
        token = signinRes.data.token;
        userId = signinRes.data.userId;
        name = signinRes.data.name || name;
      }

      if (token) {
        localStorage.setItem("token", token);
        if (userId) localStorage.setItem("userId", userId);
        if (name) localStorage.setItem("userName", name);
        setIsAuthenticated(true);
        setConnectionStatus("connecting");
      } else {
        setAuthError("Failed to authenticate. Please try signing in.");
      }
    } catch (err: unknown) {
      console.error("Direct auth error:", err);
      let msg = "Authentication failed";
      if (axios.isAxiosError(err) && err.response?.data?.message) {
        msg = err.response.data.message;
      } else if (err instanceof Error) {
        msg = err.message;
      }
      setAuthError(msg);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleOAuthLogin = (provider: "github" | "google") => {
    const currentPath = typeof window !== "undefined" ? window.location.pathname + window.location.search : "";
    if (currentPath) {
      sessionStorage.setItem("returnTo", currentPath);
      window.location.href = `${HTTP_BACKEND}/auth/${provider}?returnTo=${encodeURIComponent(currentPath)}`;
    } else {
      window.location.href = `${HTTP_BACKEND}/auth/${provider}`;
    }
  };

  if (connectionStatus === "auth_required") {
    const roomTitle = roomInfo?.name || roomInfo?.slug || `Room ${roomId}`;
    const wsTitle = roomInfo?.workspace?.name;

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-slate-100 to-indigo-50/30 p-4">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200/80 p-7 sm:p-8 animate-in fade-in zoom-in-95 duration-200">
          <div className="text-center mb-6">
            <div className="w-13 h-13 rounded-2xl bg-gradient-to-br from-violet-600 to-purple-600 text-white flex items-center justify-center mx-auto mb-3.5 shadow-md shadow-violet-500/20">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Sign In to Join Whiteboard
            </h2>
            <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-violet-50 rounded-full border border-violet-100 text-xs font-semibold text-violet-700">
              {wsTitle ? `${wsTitle} / ` : ""}
              <span>{roomTitle}</span>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Authenticate to start collaborating live in this room.
            </p>
          </div>

          {/* Tab buttons */}
          <div className="flex p-1 bg-slate-100 rounded-xl mb-5 text-xs font-semibold">
            <button
              onClick={() => {
                setAuthMode("signin");
                setAuthError("");
              }}
              className={`flex-1 py-2 rounded-lg transition-all ${
                authMode === "signin"
                  ? "bg-white text-violet-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => {
                setAuthMode("signup");
                setAuthError("");
              }}
              className={`flex-1 py-2 rounded-lg transition-all ${
                authMode === "signup"
                  ? "bg-white text-violet-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Create Account
            </button>
          </div>

          <form onSubmit={handleDirectAuth} className="space-y-3.5">
            {authMode === "signup" && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    required={authMode === "signup"}
                    placeholder="Your name"
                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none transition-all"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full pl-9 pr-9 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {authError && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-3 py-2 rounded-xl">
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading}
              className="w-full mt-2 py-2.5 px-4 rounded-xl bg-violet-600 hover:bg-violet-700 active:scale-[0.99] text-white text-xs font-semibold shadow-md shadow-violet-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {authLoading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>{authMode === "signin" ? "Sign In & Join Room" : "Create Account & Join"}</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </form>

          {/* Social OAuth Buttons */}
          <div className="flex items-center my-4">
            <div className="flex-1 border-t border-slate-200" />
            <span className="px-3 text-[11px] text-slate-400 font-medium uppercase tracking-wider">
              or continue with
            </span>
            <div className="flex-1 border-t border-slate-200" />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => handleOAuthLogin("github")}
              className="flex items-center justify-center gap-2 py-2 px-3 border border-slate-200 rounded-xl hover:bg-slate-50 text-xs font-medium text-slate-700 transition-colors"
            >
              <Github size={15} />
              <span>GitHub</span>
            </button>
            <button
              type="button"
              onClick={() => handleOAuthLogin("google")}
              className="flex items-center justify-center gap-2 py-2 px-3 border border-slate-200 rounded-xl hover:bg-slate-50 text-xs font-medium text-slate-700 transition-colors"
            >
              <Chrome size={15} />
              <span>Google</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

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

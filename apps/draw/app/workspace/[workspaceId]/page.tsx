"use client";

import { useEffect, useState, useMemo, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { HTTP_BACKEND } from "@/config";
import { Navbar } from "@/components/Navbar";
import { CreateRoomModal } from "@/components/CreateRoomModal";
import { JoinRoomModal } from "@/components/JoinRoomModal";
import { Button } from "@repo/ui/button";
import {
  Briefcase,
  Layers,
  Plus,
  DoorOpen,
  Search,
  Copy,
  Check,
  Clock,
  ArrowRight,
  AlertCircle,
} from "lucide-react";

interface RoomItem {
  id: number;
  name?: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  adminId: string;
}

interface WorkspaceDetails {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
  roomCount: number;
  rooms: RoomItem[];
}

export default function WorkspaceDetailPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const resolvedParams = use(params);
  const workspaceId = resolvedParams.workspaceId;

  const [workspace, setWorkspace] = useState<WorkspaceDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateRoomOpen, setIsCreateRoomOpen] = useState(false);
  const [isJoinRoomOpen, setIsJoinRoomOpen] = useState(false);
  const [copiedWorkspaceId, setCopiedWorkspaceId] = useState(false);
  const [copiedRoomId, setCopiedRoomId] = useState<string | null>(null);
  const router = useRouter();

  const fetchWorkspace = async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      router.push("/signin");
      return;
    }

    try {
      setLoading(true);
      setError("");
      const response = await axios.get(`${HTTP_BACKEND}/workspaces/${workspaceId}`, {
        headers: { authorization: token },
      });

      setWorkspace(response.data.workspace);
    } catch (err: unknown) {
      console.error("Failed to load workspace:", err);
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 401 || err.response?.status === 403) {
          setError(err.response?.data?.message || "You don't have access to this workspace.");
        } else if (err.response?.status === 404) {
          setError("Workspace not found.");
        } else {
          setError("Unable to load workspace details.");
        }
      } else {
        setError("Unable to load workspace details.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (workspaceId) {
      fetchWorkspace();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const handleCopyWorkspaceId = () => {
    if (!workspace) return;
    navigator.clipboard.writeText(workspace.id);
    setCopiedWorkspaceId(true);
    setTimeout(() => setCopiedWorkspaceId(false), 2000);
  };

  const handleCopyRoom = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    navigator.clipboard.writeText(id);
    setCopiedRoomId(id);
    setTimeout(() => setCopiedRoomId(null), 2000);
  };

  const filteredRooms = useMemo(() => {
    if (!workspace?.rooms) return [];
    if (!searchQuery.trim()) return workspace.rooms;
    const q = searchQuery.toLowerCase();
    return workspace.rooms.filter(
      (r) =>
        (r.name && r.name.toLowerCase().includes(q)) ||
        r.slug.toLowerCase().includes(q) ||
        r.id.toString().includes(q)
    );
  }, [workspace, searchQuery]);

  const formatRelativeTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 5) return "just now";
      if (diffMins < 60) return `${diffMins} mins ago`;
      if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
      if (diffDays === 1) return "yesterday";
      if (diffDays < 30) return `${diffDays} days ago`;
      return date.toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col font-sans">
      <Navbar
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "My Workspaces", href: "/dashboard" },
          { label: workspace?.name || "Workspace" },
        ]}
        onJoinRoom={() => setIsJoinRoomOpen(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {loading ? (
          <div className="space-y-6">
            <div className="h-32 bg-white rounded-3xl p-8 border border-slate-200/80 shadow-xs animate-pulse" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-44 bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs animate-pulse"
                />
              ))}
            </div>
          </div>
        ) : error ? (
          <div className="max-w-md mx-auto my-12 p-8 bg-white rounded-3xl shadow-xl border border-slate-200/80 text-center">
            <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h2>
            <p className="text-sm text-slate-600 mb-6">{error}</p>
            <Link href="/dashboard">
              <Button className="bg-violet-600 hover:bg-violet-700 text-white font-semibold">
                Back to Workspaces
              </Button>
            </Link>
          </div>
        ) : workspace ? (
          <div className="space-y-8">
            {/* Workspace Header Card */}
            <div className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-8 shadow-sm relative overflow-hidden">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-violet-500/20 shrink-0">
                    <Briefcase className="w-7 h-7" />
                  </div>
                  <div>
                    <div className="flex items-center gap-3 flex-wrap mb-1">
                      <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                        {workspace.name}
                      </h1>
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 font-mono text-xs text-slate-700">
                        <span>ID: {workspace.id}</span>
                        <button
                          onClick={handleCopyWorkspaceId}
                          className="p-0.5 hover:text-violet-600 transition-colors"
                          title="Copy Workspace ID"
                        >
                          {copiedWorkspaceId ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                    {workspace.description && (
                      <p className="text-sm text-slate-600 max-w-2xl mb-2">
                        {workspace.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-slate-500 font-medium pt-1">
                      <span className="flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5 text-violet-600" />
                        {workspace.rooms.length} Room{workspace.rooms.length === 1 ? "" : "s"}
                      </span>
                      <span>•</span>
                      <span>Created {new Date(workspace.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                {/* Header Action Buttons */}
                <div className="flex items-center gap-3 self-start md:self-center">
                  <Button
                    variant="outline"
                    onClick={() => setIsJoinRoomOpen(true)}
                    className="px-4 py-2.5 rounded-xl border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-sm shadow-xs flex items-center gap-2"
                  >
                    <DoorOpen className="w-4 h-4 text-violet-600" />
                    Join Room
                  </Button>
                  <Button
                    onClick={() => setIsCreateRoomOpen(true)}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-semibold text-sm shadow-md shadow-violet-500/20 flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Create Room
                  </Button>
                </div>
              </div>
            </div>

            {/* Rooms Management Section */}
            <div>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Existing Rooms</h2>
                  <p className="text-xs text-slate-500">
                    Real-time collaborative drawing rooms in this workspace
                  </p>
                </div>

                <div className="relative w-full sm:max-w-xs">
                  <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search rooms..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 bg-white shadow-xs focus:ring-2 focus:ring-violet-500 focus:border-transparent placeholder:text-slate-400 text-slate-900"
                  />
                </div>
              </div>

              {filteredRooms.length === 0 ? (
                <div className="bg-white rounded-3xl border border-slate-200/80 p-12 text-center shadow-xs max-w-md mx-auto my-6">
                  <div className="w-14 h-14 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto mb-3">
                    <Layers className="w-7 h-7" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-1">
                    {searchQuery ? "No rooms match your search" : "This workspace has no rooms yet"}
                  </h3>
                  <p className="text-xs text-slate-500 mb-5">
                    {searchQuery
                      ? `No rooms matched "${searchQuery}". Try a different keyword.`
                      : "Create your first room to start drawing and collaborating in real-time."}
                  </p>
                  {searchQuery ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSearchQuery("")}
                      className="text-xs"
                    >
                      Clear Filter
                    </Button>
                  ) : (
                    <Button
                      onClick={() => setIsCreateRoomOpen(true)}
                      className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white font-semibold text-xs shadow-md shadow-violet-500/20"
                    >
                      <Plus className="w-4 h-4 mr-1.5" />
                      Create Room
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredRooms.map((room) => {
                    const roomTitle = room.name || room.slug || `Room ${room.id}`;
                    return (
                      <div
                        key={room.id}
                        className="group bg-white rounded-2xl border border-slate-200/90 hover:border-purple-300 hover:shadow-xl hover:shadow-purple-500/5 transition-all duration-300 flex flex-col justify-between p-6"
                      >
                        <div>
                          {/* Room Header */}
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 group-hover:scale-105 transition-transform">
                              <Layers className="w-5 h-5" />
                            </div>
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              <span>Live</span>
                            </div>
                          </div>

                          <Link
                            href={`/workspace/${workspace.id}/room/${room.slug || room.id}`}
                            className="block"
                          >
                            <h3 className="text-base font-bold text-slate-900 group-hover:text-purple-700 transition-colors line-clamp-1 mb-1">
                              {roomTitle}
                            </h3>
                          </Link>

                          {/* Room ID Badge */}
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-mono mb-4">
                            <span>ID: {room.slug || room.id}</span>
                            <button
                              onClick={(e) => handleCopyRoom(room.slug || room.id.toString(), e)}
                              className="p-0.5 hover:text-purple-600 rounded transition-colors"
                              title="Copy Room ID"
                            >
                              {copiedRoomId === (room.slug || room.id.toString()) ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Room Footer */}
                        <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1 text-[11px] text-slate-400">
                            <Clock className="w-3 h-3" />
                            <span>Updated {formatRelativeTime(room.updatedAt)}</span>
                          </div>

                          <Link href={`/workspace/${workspace.id}/room/${room.slug || room.id}`}>
                            <Button
                              size="sm"
                              className="px-3.5 py-1.5 rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-600 hover:text-white font-semibold text-xs transition-all duration-200 flex items-center gap-1"
                            >
                              <span>Open Room</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </Button>
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </main>

      {/* Modals */}
      {workspace && (
        <CreateRoomModal
          isOpen={isCreateRoomOpen}
          workspaceId={workspace.id}
          workspaceName={workspace.name}
          onClose={() => setIsCreateRoomOpen(false)}
          onCreated={(newRoom) => {
            router.push(`/workspace/${workspace.id}/room/${newRoom.slug || newRoom.roomId}`);
          }}
        />
      )}

      <JoinRoomModal
        isOpen={isJoinRoomOpen}
        defaultWorkspaceId={workspace?.id}
        onClose={() => setIsJoinRoomOpen(false)}
      />
    </div>
  );
}

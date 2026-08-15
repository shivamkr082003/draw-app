"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { HTTP_BACKEND } from "@/config";
import { Navbar } from "@/components/Navbar";
import { CreateWorkspaceModal } from "@/components/CreateWorkspaceModal";
import { JoinRoomModal } from "@/components/JoinRoomModal";
import { Button } from "@repo/ui/button";
import {
  Briefcase,
  Layers,
  Plus,
  Search,
  Clock,
  Copy,
  Check,
  Trash2,
  Edit2,
  ArrowRight,
  FolderPlus,
  Users,
  SlidersHorizontal,
  MoreVertical,
} from "lucide-react";

interface WorkspaceItem {
  id: string;
  name: string;
  slug?: string | null;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  roomCount: number;
  rooms?: Array<{
    id: number;
    name: string;
    slug: string;
    updatedAt: string;
  }>;
}

export default function DashboardPage() {
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "name" | "rooms">("recent");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [renameItem, setRenameItem] = useState<{ id: string; name: string } | null>(null);
  const [renameLoading, setRenameLoading] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const router = useRouter();

  const fetchWorkspaces = async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      router.push("/signin");
      return;
    }

    try {
      setLoading(true);
      const response = await axios.get(`${HTTP_BACKEND}/workspaces`, {
        headers: {
          authorization: token,
        },
      });

      setWorkspaces(response.data.workspaces || []);
    } catch (err: unknown) {
      console.error("Failed to load workspaces:", err);
      if (axios.isAxiosError(err) && (err.response?.status === 401 || err.response?.status === 403)) {
        router.push("/signin");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkspaces();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close card menu on outside click
  useEffect(() => {
    const handleClickOutside = () => setActiveMenuId(null);
    if (activeMenuId) {
      window.addEventListener("click", handleClickOutside);
      return () => window.removeEventListener("click", handleClickOutside);
    }
  }, [activeMenuId]);

  const handleCopyId = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDeleteWorkspace = async (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setActiveMenuId(null);
    if (!confirm(`Are you sure you want to delete workspace "${name}" and all its rooms?`)) {
      return;
    }

    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;

    setDeletingId(id);
    try {
      await axios.delete(`${HTTP_BACKEND}/workspaces/${id}`, {
        headers: { authorization: token },
      });
      setWorkspaces((prev) => prev.filter((w) => w.id !== id));
    } catch (err) {
      console.error("Failed to delete workspace:", err);
      alert("Failed to delete workspace. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameItem || !renameItem.name.trim()) return;

    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;

    setRenameLoading(true);
    try {
      await axios.put(
        `${HTTP_BACKEND}/workspaces/${renameItem.id}`,
        { name: renameItem.name.trim() },
        { headers: { authorization: token } }
      );
      setWorkspaces((prev) =>
        prev.map((w) => (w.id === renameItem.id ? { ...w, name: renameItem.name.trim() } : w))
      );
      setRenameItem(null);
    } catch (err) {
      console.error("Failed to rename workspace:", err);
      alert("Failed to rename workspace.");
    } finally {
      setRenameLoading(false);
    }
  };

  const filteredAndSortedWorkspaces = useMemo(() => {
    let list = [...workspaces];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (w) =>
          w.name.toLowerCase().includes(q) ||
          w.id.toLowerCase().includes(q) ||
          (w.description && w.description.toLowerCase().includes(q))
      );
    }

    if (sortBy === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === "rooms") {
      list.sort((a, b) => (b.roomCount || 0) - (a.roomCount || 0));
    } else {
      list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }

    return list;
  }, [workspaces, searchQuery, sortBy]);

  const totalRooms = useMemo(() => {
    return workspaces.reduce((acc, w) => acc + (w.roomCount || 0), 0);
  }, [workspaces]);

  const latestActivity = useMemo(() => {
    if (workspaces.length === 0) return "No activity";
    const sorted = [...workspaces].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    const date = new Date(sorted[0].updatedAt);
    const now = new Date();
    const diffMins = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    if (diffMins < 5) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 30) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }, [workspaces]);

  const formatRelativeTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 5) return "just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return "yesterday";
      if (diffDays < 30) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col font-sans">
      {/* 1. Minimal Navbar with only Join Room on right */}
      <Navbar
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "My Workspaces" }]}
        onJoinRoom={() => setIsJoinOpen(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-9">
        {/* 2. Clean Page Header */}
        <div className="flex items-center justify-between gap-4 pb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              My Workspaces
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Manage your collaborative drawing spaces and rooms.
            </p>
          </div>

          {/* Only show header button if user has workspaces (to avoid duplication in zero-state) */}
          {workspaces.length > 0 && (
            <Button
              onClick={() => setIsCreateOpen(true)}
              className="h-9 px-3.5 sm:px-4 text-xs font-semibold bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white rounded-xl shadow-xs flex items-center gap-1.5 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>New Workspace</span>
            </Button>
          )}
        </div>

        {/* 3. Compact Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <div className="bg-white rounded-xl border border-slate-200/80 p-3.5 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                Workspaces
              </p>
              <p className="text-xl font-bold text-slate-900 mt-0.5">{workspaces.length}</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center">
              <Briefcase className="w-4 h-4" />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/80 p-3.5 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                Rooms
              </p>
              <p className="text-xl font-bold text-slate-900 mt-0.5">{totalRooms}</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/80 p-3.5 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                Collaborators
              </p>
              <p className="text-xl font-bold text-slate-900 mt-0.5">
                {workspaces.length > 0 ? 1 : 0}
              </p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/80 p-3.5 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                Recent Activity
              </p>
              <p className="text-xs font-semibold text-slate-800 mt-1 truncate max-w-[110px]">
                {latestActivity}
              </p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-500 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* 4. Single-Row Search + Filter Toolbar */}
        <div className="mb-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search workspaces by name or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-white shadow-2xs focus:ring-2 focus:ring-violet-500 focus:border-transparent placeholder:text-slate-400 text-slate-900"
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-600 shadow-2xs">
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "recent" | "name" | "rooms")}
                aria-label="Sort workspaces"
                className="bg-transparent border-none text-xs font-medium text-slate-700 focus:outline-hidden cursor-pointer"
              >
                <option value="recent">Recently updated</option>
                <option value="name">Name (A-Z)</option>
                <option value="rooms">Most rooms</option>
              </select>
            </div>

            <span className="text-[11px] text-slate-400 font-medium">
              {filteredAndSortedWorkspaces.length} workspace
              {filteredAndSortedWorkspaces.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        {/* 5. Workspaces Content Area */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-44 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs animate-pulse space-y-3"
              >
                <div className="w-8 h-8 bg-slate-200 rounded-lg" />
                <div className="h-5 w-2/3 bg-slate-200 rounded-md" />
                <div className="h-3 w-1/2 bg-slate-100 rounded-md" />
                <div className="pt-3 border-t border-slate-100 flex justify-between">
                  <div className="h-4 w-16 bg-slate-100 rounded-md" />
                  <div className="h-6 w-20 bg-slate-200 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        ) : workspaces.length === 0 ? (
          /* Zero-state: ONLY ONE create button on the entire page */
          <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center shadow-2xs max-w-md mx-auto my-8">
            <div className="w-12 h-12 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center mx-auto mb-3.5">
              <FolderPlus className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-1">No workspaces yet</h3>
            <p className="text-xs text-slate-500 mb-5 leading-relaxed max-w-xs mx-auto">
              Create a workspace to organize your collaborative rooms and invite teammates.
            </p>
            <Button
              onClick={() => setIsCreateOpen(true)}
              className="h-9 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-semibold text-xs shadow-xs"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Create your first workspace
            </Button>
          </div>
        ) : filteredAndSortedWorkspaces.length === 0 ? (
          /* Search Empty State */
          <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center shadow-2xs max-w-sm mx-auto my-8">
            <Search className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-slate-900 mb-1">No workspaces match</h3>
            <p className="text-xs text-slate-500 mb-4">
              No workspace matched &quot;{searchQuery}&quot;.
            </p>
            <Button
              variant="outline"
              onClick={() => setSearchQuery("")}
              className="h-8 px-3 text-xs text-slate-700 border-slate-200"
            >
              Clear filter
            </Button>
          </div>
        ) : (
          /* 6 & 7. Modern SaaS Workspace Cards Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {filteredAndSortedWorkspaces.map((workspace) => (
              <div
                key={workspace.id}
                className="group relative bg-white rounded-2xl border border-slate-200/80 hover:border-violet-300 hover:shadow-md transition-all duration-200 flex flex-col justify-between p-5"
              >
                <div>
                  {/* Card Top: Icon & Dropdown Options */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-50 to-purple-100 border border-violet-100/60 flex items-center justify-center text-violet-700 shadow-2xs">
                      <Briefcase className="w-4 h-4" />
                    </div>

                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuId(activeMenuId === workspace.id ? null : workspace.id);
                        }}
                        className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                        title="Workspace options"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {activeMenuId === workspace.id && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="absolute top-full right-0 mt-1 w-32 bg-white border border-slate-200 rounded-xl shadow-lg py-1 z-30 animate-in fade-in zoom-in-95 duration-100"
                        >
                          <button
                            onClick={() => {
                              setActiveMenuId(null);
                              setRenameItem({ id: workspace.id, name: workspace.name });
                            }}
                            className="w-full px-3 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                            <span>Rename</span>
                          </button>
                          <button
                            onClick={(e) => handleDeleteWorkspace(workspace.id, workspace.name, e)}
                            disabled={deletingId === workspace.id}
                            className="w-full px-3 py-1.5 text-left text-xs font-medium text-red-600 hover:bg-red-50 flex items-center gap-2"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Title & Description */}
                  <Link href={`/workspace/${workspace.id}`} className="block">
                    <h3 className="text-base font-bold text-slate-900 group-hover:text-violet-700 transition-colors line-clamp-1 mb-1">
                      {workspace.name}
                    </h3>
                  </Link>

                  <p className="text-xs text-slate-500 line-clamp-2 min-h-[32px] mb-3">
                    {workspace.description || "No description provided"}
                  </p>

                  {/* Shortened ID Pill with copy */}
                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-mono mb-4">
                    <span>ID: {workspace.id.slice(0, 8)}...</span>
                    <button
                      onClick={(e) => handleCopyId(workspace.id, e)}
                      className="p-0.5 hover:text-violet-600 rounded transition-colors shrink-0"
                      title="Copy full Workspace ID"
                    >
                      {copiedId === workspace.id ? (
                        <Check className="w-3 h-3 text-emerald-600" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Card Footer: Metadata & Single Open Action */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 text-[11px] text-slate-400">
                    <span className="flex items-center gap-1 font-medium text-slate-600">
                      <Layers className="w-3 h-3 text-violet-600" />
                      {workspace.roomCount || 0} room{workspace.roomCount === 1 ? "" : "s"}
                    </span>
                    <span>•</span>
                    <span className="truncate max-w-[90px]">
                      {formatRelativeTime(workspace.updatedAt)}
                    </span>
                  </div>

                  <Link href={`/workspace/${workspace.id}`}>
                    <Button
                      size="sm"
                      className="h-7 px-2.5 rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-600 hover:text-white font-semibold text-xs transition-all duration-150 flex items-center gap-1"
                    >
                      <span>Open</span>
                      <ArrowRight className="w-3 h-3" />
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Rename Modal */}
      {renameItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white rounded-2xl p-5 shadow-xl border border-slate-200">
            <h4 className="text-sm font-bold text-slate-900 mb-2.5">Rename Workspace</h4>
            <form onSubmit={handleRenameSubmit} className="space-y-3">
              <input
                type="text"
                value={renameItem.name}
                onChange={(e) => setRenameItem({ ...renameItem, name: e.target.value })}
                className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-violet-500"
                required
                autoFocus
              />
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRenameItem(null)}
                  disabled={renameLoading}
                  className="h-7 px-3 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={renameLoading || !renameItem.name.trim()}
                  className="h-7 px-3.5 bg-violet-600 hover:bg-violet-700 text-white text-xs"
                >
                  {renameLoading ? "Saving..." : "Save"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modals */}
      <CreateWorkspaceModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={(ws) => {
          setWorkspaces((prev) => [ws, ...prev]);
          router.push(`/workspace/${ws.id}`);
        }}
      />

      <JoinRoomModal isOpen={isJoinOpen} onClose={() => setIsJoinOpen(false)} />
    </div>
  );
}

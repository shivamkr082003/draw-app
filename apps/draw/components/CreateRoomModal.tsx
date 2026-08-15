"use client";

import { useState } from "react";
import { X, Layers, Plus, AlertCircle } from "lucide-react";
import { Button } from "@repo/ui/button";
import axios from "axios";
import { HTTP_BACKEND } from "@/config";
import { useRouter } from "next/navigation";

interface RoomCreatedResult {
  roomId: number;
  slug: string;
  name: string;
  workspaceId: string;
}

interface CreateRoomModalProps {
  isOpen: boolean;
  workspaceId: string;
  workspaceName?: string;
  onClose: () => void;
  onCreated?: (room: RoomCreatedResult) => void;
}

export function CreateRoomModal({
  isOpen,
  workspaceId,
  workspaceName,
  onClose,
  onCreated,
}: CreateRoomModalProps) {
  const [roomName, setRoomName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomName.trim()) {
      setError("Room name is required");
      return;
    }

    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      setError("Please sign in to create a room");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await axios.post(
        `${HTTP_BACKEND}/workspaces/${workspaceId}/rooms`,
        {
          name: roomName.trim(),
        },
        {
          headers: {
            authorization: token,
            "Content-Type": "application/json",
          },
        }
      );

      const room: RoomCreatedResult = response.data;
      setRoomName("");
      onClose();

      if (onCreated) {
        onCreated(room);
      } else {
        router.push(`/workspace/${workspaceId}/room/${room.slug || room.roomId}`);
      }
    } catch (err: unknown) {
      console.error("Failed to create room:", err);
      let msg = "Failed to create room. Please try again.";
      if (axios.isAxiosError(err) && err.response?.data?.message) {
        msg = err.response.data.message;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200/80 p-6 overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-purple-600">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Create New Room</h3>
              <p className="text-xs text-slate-500">
                Inside: <span className="font-semibold text-slate-700">{workspaceName || "Workspace"}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-sm text-red-600">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Room Name <span className="text-violet-600">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Architecture Design, Brainstorming"
              value={roomName}
              onChange={(e) => {
                setRoomName(e.target.value);
                if (error) setError("");
              }}
              required
              className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm text-slate-900 placeholder:text-slate-400 bg-white"
              autoFocus
            />
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
            <p className="font-medium text-slate-700">Workspace Details</p>
            <p className="truncate">Name: {workspaceName || "Current Workspace"}</p>
            <p className="truncate font-mono text-[11px] text-slate-500">ID: {workspaceId}</p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm text-slate-700 border-slate-300 hover:bg-slate-50"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !roomName.trim()}
              className="px-5 py-2 text-sm font-semibold bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-700 hover:to-violet-700 text-white shadow-md shadow-purple-500/20 flex items-center gap-1.5"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Create Room
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

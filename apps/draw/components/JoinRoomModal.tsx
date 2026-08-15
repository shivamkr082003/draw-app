"use client";

import { useState } from "react";
import { X, DoorOpen, ArrowRight, AlertCircle } from "lucide-react";
import { Button } from "@repo/ui/button";
import axios from "axios";
import { HTTP_BACKEND } from "@/config";
import { useRouter } from "next/navigation";

interface JoinRoomModalProps {
  isOpen: boolean;
  defaultWorkspaceId?: string;
  onClose: () => void;
}

export function JoinRoomModal({
  isOpen,
  defaultWorkspaceId,
  onClose,
}: JoinRoomModalProps) {
  const [roomId, setRoomId] = useState("");
  const [workspaceId, setWorkspaceId] = useState(defaultWorkspaceId || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  if (!isOpen) return null;

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomId.trim()) {
      setError("Room ID or Name is required");
      return;
    }

    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    setLoading(true);
    setError("");

    try {
      if (workspaceId.trim()) {
        // Validate with workspace
        const response = await axios.post(
          `${HTTP_BACKEND}/rooms/join`,
          {
            workspaceId: workspaceId.trim(),
            roomId: roomId.trim(),
          },
          {
            headers: token ? { authorization: token } : {},
          }
        );

        const { workspace, room } = response.data;
        onClose();
        router.push(`/workspace/${workspace.id}/room/${room.slug || room.id}`);
      } else {
        // Direct room verification or navigation
        const trimmed = roomId.trim();
        try {
          const response = await axios.get(`${HTTP_BACKEND}/room/${trimmed}`);
          const room = response.data?.room;
          onClose();
          if (room?.workspaceId) {
            router.push(`/workspace/${room.workspaceId}/room/${room.slug || room.id}`);
          } else {
            router.push(`/canvas/${room?.slug || trimmed}`);
          }
        } catch {
          // If direct lookup fails or is a new slug, navigate to canvas
          onClose();
          router.push(`/canvas/${trimmed}`);
        }
      }
    } catch (err: unknown) {
      console.error("Join room failed:", err);
      let msg = "Failed to join room. Please check the Room ID.";
      if (axios.isAxiosError(err) && err.response?.data?.message) {
        msg = err.response.data.message;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200/80 p-6 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center">
              <DoorOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Join Whiteboard Room</h3>
              <p className="text-xs text-slate-500">Collaborate with others in real-time</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200/80 rounded-xl flex items-start gap-2 text-xs text-red-600">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleJoin} className="mt-4 space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Room ID or Name <span className="text-violet-600">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. 14, architecture-design, project-alpha"
              value={roomId}
              onChange={(e) => {
                setRoomId(e.target.value);
                if (error) setError("");
              }}
              required
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 text-slate-900 placeholder:text-slate-400 bg-white shadow-2xs"
              autoFocus
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-700">
                Workspace ID
              </label>
              <span className="text-[11px] text-slate-400 font-normal">Optional</span>
            </div>
            <input
              type="text"
              placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
              value={workspaceId}
              onChange={(e) => {
                setWorkspaceId(e.target.value);
                if (error) setError("");
              }}
              className="w-full px-3.5 py-2 font-mono text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 text-slate-900 placeholder:text-slate-400 bg-white shadow-2xs"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className="px-3.5 py-1.5 text-xs text-slate-700 border-slate-300 hover:bg-slate-50"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !roomId.trim()}
              className="px-4 py-1.5 text-xs font-semibold bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white shadow-xs flex items-center gap-1.5"
            >
              {loading ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Join Room</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { X, Briefcase, Plus, AlertCircle } from "lucide-react";
import { Button } from "@repo/ui/button";
import axios from "axios";
import { HTTP_BACKEND } from "@/config";
import { useRouter } from "next/navigation";

interface WorkspaceCreatedResult {
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

interface CreateWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (workspace: WorkspaceCreatedResult) => void;
}

export function CreateWorkspaceModal({
  isOpen,
  onClose,
  onCreated,
}: CreateWorkspaceModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Workspace name is required");
      return;
    }

    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      setError("Please sign in to create a workspace");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await axios.post(
        `${HTTP_BACKEND}/workspaces`,
        {
          name: name.trim(),
          description: description.trim() || undefined,
        },
        {
          headers: {
            authorization: token,
            "Content-Type": "application/json",
          },
        }
      );

      const created: WorkspaceCreatedResult = response.data.workspace;
      setName("");
      setDescription("");
      onClose();

      if (onCreated) {
        onCreated(created);
      } else {
        router.push(`/workspace/${created.id}`);
      }
    } catch (err: unknown) {
      console.error("Failed to create workspace:", err);
      let msg = "Failed to create workspace. Please check backend connection.";
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
            <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center text-violet-600">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Create New Workspace</h3>
              <p className="text-xs text-slate-500">Organize your diagrams and rooms</p>
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
              Workspace Name <span className="text-violet-600">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Engineering Team, Design System"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError("");
              }}
              required
              className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 text-sm text-slate-900 placeholder:text-slate-400 bg-white"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Description <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <textarea
              placeholder="Brief description of what this workspace is for..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 text-sm text-slate-900 placeholder:text-slate-400 bg-white resize-none"
            />
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
              disabled={loading || !name.trim()}
              className="px-5 py-2 text-sm font-semibold bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white shadow-md shadow-violet-500/20 flex items-center gap-1.5"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Create Workspace
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

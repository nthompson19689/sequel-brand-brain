"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState, useCallback } from "react";

const ROLES = ["Content", "Marketing", "Sales", "Events", "CMO", "Operations", "Other"];

interface UserRow {
  id: string;
  full_name: string | null;
  email?: string;
  role: string | null;
  is_admin: boolean | null;
  is_active: boolean | null;
  avatar_url: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
}

interface InviteRow {
  id: string;
  email: string;
  role: string | null;
  created_at: string;
  invited_by: string;
}

function getInitials(name: string | null, email?: string): string {
  if (name) {
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  return (email || "?")[0].toUpperCase();
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Never";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function AdminPage() {
  const { profile, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<"users" | "invites">("users");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Invite modal state
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("Other");
  const [inviteLoading, setInviteLoading] = useState(false);

  // Role change modal state
  const [roleModal, setRoleModal] = useState<{ userId: string; current: string } | null>(null);
  const [newRole, setNewRole] = useState("");

  // Confirm remove modal
  const [confirmRemove, setConfirmRemove] = useState<{ userId: string; name: string } | null>(null);

  // Dropdown state
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    const res = await fetch("/api/admin?action=users");
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users || []);
    }
  }, []);

  const fetchInvites = useCallback(async () => {
    const res = await fetch("/api/admin?action=invites");
    if (res.ok) {
      const data = await res.json();
      setInvites(data.invites || []);
    }
  }, []);

  useEffect(() => {
    if (!profile?.is_admin) return;
    setLoading(true);
    Promise.all([fetchUsers(), fetchInvites()]).finally(() => setLoading(false));
  }, [profile, fetchUsers, fetchInvites]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick() {
      setOpenDropdown(null);
    }
    if (openDropdown) {
      document.addEventListener("click", handleClick);
      return () => document.removeEventListener("click", handleClick);
    }
  }, [openDropdown]);

  async function adminAction(body: Record<string, unknown>) {
    setError(null);
    setSuccess(null);
    setActionLoading(String(body.userId || body.email || "action"));
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Action failed");
        return false;
      }
      setSuccess("Done");
      setTimeout(() => setSuccess(null), 2000);
      return true;
    } catch {
      setError("Network error");
      return false;
    } finally {
      setActionLoading(null);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteLoading(true);
    const ok = await adminAction({ action: "invite", email: inviteEmail, role: inviteRole });
    setInviteLoading(false);
    if (ok) {
      setShowInvite(false);
      setInviteEmail("");
      setInviteRole("Other");
      fetchInvites();
    }
  }

  async function handleToggleAdmin(userId: string, currentAdmin: boolean | null) {
    const ok = await adminAction({ action: "toggle_admin", userId, is_admin: !currentAdmin });
    if (ok) fetchUsers();
  }

  async function handleToggleActive(userId: string, currentActive: boolean | null) {
    const action = currentActive === false ? "activate" : "deactivate";
    const ok = await adminAction({ action, userId });
    if (ok) fetchUsers();
  }

  async function handleChangeRole(userId: string, role: string) {
    const ok = await adminAction({ action: "change_role", userId, role });
    if (ok) {
      setRoleModal(null);
      fetchUsers();
    }
  }

  async function handleRemoveUser(userId: string) {
    const ok = await adminAction({ action: "remove_user", userId });
    if (ok) {
      setConfirmRemove(null);
      fetchUsers();
    }
  }

  // Auth loading or not admin
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500" />
      </div>
    );
  }

  if (!profile?.is_admin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="bg-[#1A1228] rounded-2xl border border-[#2A2040] p-12 text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-[#A09CB0] text-sm">You do not have admin privileges to view this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Team Management</h1>
          <p className="text-[#A09CB0] text-sm mt-1">Manage users, roles, and invitations</p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-semibold rounded-xl transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Invite User
        </button>
      </div>

      {/* Feedback */}
      {error && (
        <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-xl bg-green-500/10 border border-green-500/20 px-4 py-3 text-sm text-green-400">
          {success}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-[#1A1228] rounded-xl p-1 border border-[#2A2040] w-fit">
        <button
          onClick={() => setTab("users")}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "users"
              ? "bg-[#7C3AED] text-white"
              : "text-[#A09CB0] hover:text-white hover:bg-[#2A2040]"
          }`}
        >
          Users ({users.length})
        </button>
        <button
          onClick={() => setTab("invites")}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "invites"
              ? "bg-[#7C3AED] text-white"
              : "text-[#A09CB0] hover:text-white hover:bg-[#2A2040]"
          }`}
        >
          Pending Invites ({invites.length})
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500" />
        </div>
      ) : tab === "users" ? (
        <div className="bg-[#1A1228] rounded-2xl border border-[#2A2040] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#2A2040]">
                <th className="text-left text-xs font-medium text-[#6B6680] uppercase tracking-wider px-6 py-4">User</th>
                <th className="text-left text-xs font-medium text-[#6B6680] uppercase tracking-wider px-6 py-4">Role</th>
                <th className="text-left text-xs font-medium text-[#6B6680] uppercase tracking-wider px-6 py-4">Status</th>
                <th className="text-left text-xs font-medium text-[#6B6680] uppercase tracking-wider px-6 py-4">Last Login</th>
                <th className="text-left text-xs font-medium text-[#6B6680] uppercase tracking-wider px-6 py-4">Joined</th>
                <th className="text-right text-xs font-medium text-[#6B6680] uppercase tracking-wider px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2A2040]">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-[#2A2040]/30 transition-colors">
                  {/* User cell */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-[#7C3AED]/20 flex items-center justify-center text-sm font-semibold text-[#7C3AED] shrink-0">
                        {getInitials(u.full_name, u.email)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-white truncate">
                            {u.full_name || "Unnamed"}
                          </span>
                          {u.is_admin && (
                            <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#7C3AED]/20 text-[#7C3AED] uppercase tracking-wide">
                              Admin
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-[#6B6680] truncate block">{u.email || u.id}</span>
                      </div>
                    </div>
                  </td>
                  {/* Role */}
                  <td className="px-6 py-4">
                    <span className="text-sm text-[#A09CB0]">{u.role || "No role"}</span>
                  </td>
                  {/* Status */}
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                        u.is_active === false
                          ? "text-red-400"
                          : "text-green-400"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          u.is_active === false ? "bg-red-400" : "bg-green-400"
                        }`}
                      />
                      {u.is_active === false ? "Inactive" : "Active"}
                    </span>
                  </td>
                  {/* Last login */}
                  <td className="px-6 py-4">
                    <span className="text-sm text-[#6B6680]">{formatDate(u.last_sign_in_at)}</span>
                  </td>
                  {/* Joined */}
                  <td className="px-6 py-4">
                    <span className="text-sm text-[#6B6680]">{formatDate(u.created_at)}</span>
                  </td>
                  {/* Actions */}
                  <td className="px-6 py-4 text-right">
                    <div className="relative inline-block">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenDropdown(openDropdown === u.id ? null : u.id);
                        }}
                        disabled={!!actionLoading}
                        className="p-2 rounded-lg hover:bg-[#2A2040] text-[#6B6680] hover:text-white transition-colors"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                        </svg>
                      </button>
                      {openDropdown === u.id && (
                        <div className="absolute right-0 top-full mt-1 w-52 bg-[#1A1228] border border-[#2A2040] rounded-xl shadow-2xl z-50 py-1 overflow-hidden">
                          <button
                            onClick={() => {
                              setOpenDropdown(null);
                              handleToggleAdmin(u.id, u.is_admin);
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm text-[#A09CB0] hover:bg-[#2A2040] hover:text-white transition-colors"
                          >
                            {u.is_admin ? "Remove Admin" : "Make Admin"}
                          </button>
                          <button
                            onClick={() => {
                              setOpenDropdown(null);
                              setRoleModal({ userId: u.id, current: u.role || "Other" });
                              setNewRole(u.role || "Other");
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm text-[#A09CB0] hover:bg-[#2A2040] hover:text-white transition-colors"
                          >
                            Change Role
                          </button>
                          <button
                            onClick={() => {
                              setOpenDropdown(null);
                              handleToggleActive(u.id, u.is_active);
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm text-[#A09CB0] hover:bg-[#2A2040] hover:text-white transition-colors"
                          >
                            {u.is_active === false ? "Activate" : "Deactivate"}
                          </button>
                          <div className="border-t border-[#2A2040] my-1" />
                          <button
                            onClick={() => {
                              setOpenDropdown(null);
                              setConfirmRemove({ userId: u.id, name: u.full_name || u.email || u.id });
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            Remove User
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-[#6B6680] text-sm">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* Invites tab */
        <div className="bg-[#1A1228] rounded-2xl border border-[#2A2040] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#2A2040]">
                <th className="text-left text-xs font-medium text-[#6B6680] uppercase tracking-wider px-6 py-4">Email</th>
                <th className="text-left text-xs font-medium text-[#6B6680] uppercase tracking-wider px-6 py-4">Role</th>
                <th className="text-left text-xs font-medium text-[#6B6680] uppercase tracking-wider px-6 py-4">Invited</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2A2040]">
              {invites.map((inv) => (
                <tr key={inv.id} className="hover:bg-[#2A2040]/30 transition-colors">
                  <td className="px-6 py-4">
                    <span className="text-sm text-white">{inv.email}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-[#A09CB0]">{inv.role || "Other"}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-[#6B6680]">{formatDate(inv.created_at)}</span>
                  </td>
                </tr>
              ))}
              {invites.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-6 py-12 text-center text-[#6B6680] text-sm">
                    No pending invites.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1A1228] border border-[#2A2040] rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4">Invite User</h3>
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#A09CB0] mb-1.5">Email</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                  className="w-full rounded-xl border border-[#2A2040] bg-[#0F0A1A] px-4 py-3 text-sm text-white placeholder-[#6B6680] focus:outline-none focus:ring-1 focus:ring-[#7C3AED] focus:border-[#7C3AED]"
                  placeholder="colleague@company.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#A09CB0] mb-1.5">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full rounded-xl border border-[#2A2040] bg-[#0F0A1A] px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#7C3AED] focus:border-[#7C3AED]"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInvite(false)}
                  className="flex-1 py-2.5 text-sm font-medium text-[#A09CB0] border border-[#2A2040] rounded-xl hover:bg-[#2A2040] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviteLoading}
                  className="flex-1 py-2.5 text-sm font-semibold text-white bg-[#7C3AED] rounded-xl hover:bg-[#6D28D9] disabled:opacity-50 transition-colors"
                >
                  {inviteLoading ? "Sending..." : "Send Invite"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Role Modal */}
      {roleModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1A1228] border border-[#2A2040] rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4">Change Role</h3>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="w-full rounded-xl border border-[#2A2040] bg-[#0F0A1A] px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#7C3AED] focus:border-[#7C3AED] mb-4"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setRoleModal(null)}
                className="flex-1 py-2.5 text-sm font-medium text-[#A09CB0] border border-[#2A2040] rounded-xl hover:bg-[#2A2040] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleChangeRole(roleModal.userId, newRole)}
                disabled={!!actionLoading}
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-[#7C3AED] rounded-xl hover:bg-[#6D28D9] disabled:opacity-50 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Remove Modal */}
      {confirmRemove && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1A1228] border border-[#2A2040] rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">Remove User</h3>
            <p className="text-sm text-[#A09CB0] mb-6">
              Are you sure you want to permanently remove <strong className="text-white">{confirmRemove.name}</strong>? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmRemove(null)}
                className="flex-1 py-2.5 text-sm font-medium text-[#A09CB0] border border-[#2A2040] rounded-xl hover:bg-[#2A2040] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRemoveUser(confirmRemove.userId)}
                disabled={!!actionLoading}
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

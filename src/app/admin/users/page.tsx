"use client";

import { useState, useEffect } from "react";
import type { User } from "@prisma/client";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = () => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then(({ data }) => {
        setUsers(data ?? []);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const toggleRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === "admin" ? "member" : "admin";
    await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role: newRole }),
    });
    fetchUsers();
  };

  if (loading) {
    return <div className="text-center py-20 text-stone-400">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-bold text-stone-900">Manage Members</h1>

      <div className="card">
        <div className="space-y-3">
          {users.map((user) => (
            <div
              key={user.id}
              className="flex items-center justify-between py-3 border-b border-stone-100 last:border-0"
            >
              <div className="flex items-center gap-3">
                {user.avatarUrl && (
                  <img
                    src={user.avatarUrl}
                    alt=""
                    className="w-8 h-8 rounded-full"
                  />
                )}
                <div>
                  <p className="font-medium text-stone-800">{user.displayName}</p>
                  <p className="text-xs text-stone-400">{user.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    user.role === "admin"
                      ? "bg-coral-50 text-coral-500 border border-coral-200"
                      : "bg-stone-100 text-stone-500"
                  }`}
                >
                  {user.role}
                </span>
                <button
                  onClick={() => toggleRole(user.id, user.role)}
                  className="text-xs text-stone-400 hover:text-stone-600 transition-colors"
                >
                  {user.role === "admin" ? "Make member" : "Make admin"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

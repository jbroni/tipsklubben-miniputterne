"use client";

import { useState, useEffect } from "react";
import type { User } from "@prisma/client";

const ROLE_LABEL: Record<string, string> = { admin: "admin", member: "medlem" };

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
    return <div className="text-center py-20 text-muted">Indlæser...</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold text-ink">Administrér medlemmer</h1>

      <div className="card">
        <div className="space-y-3">
          {users.map((user) => (
            <div
              key={user.id}
              className="flex items-center justify-between py-3 border-b border-line-hairline last:border-0"
            >
              <div className="flex items-center gap-3">
                {user.avatarUrl && (
                  <img src={user.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
                )}
                <div>
                  <p className="font-medium text-ink">{user.displayName}</p>
                  <p className="text-xs text-muted">{user.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    user.role === "admin"
                      ? "bg-signal-soft text-signal border border-[#eed7d0]"
                      : "bg-line-divider text-muted"
                  }`}
                >
                  {ROLE_LABEL[user.role]}
                </span>
                <button
                  onClick={() => toggleRole(user.id, user.role)}
                  className="text-xs text-muted hover:text-ink transition-colors"
                >
                  {user.role === "admin" ? "Gør til medlem" : "Gør til admin"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

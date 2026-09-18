"use client";

import { useState, useEffect } from "react";
import type { User } from "@prisma/client";

type AdminUser = User & { identities: { id: string; authId: string; email: string }[] };

const ROLE_LABEL: Record<string, string> = { admin: "admin", member: "medlem" };

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [linkingState, setLinkingState] = useState<{
    historicUserId: string | null;
    confirming: boolean;
  }>({ historicUserId: null, confirming: false });
  const [selectedTarget, setSelectedTarget] = useState<string>("");
  const [mergeState, setMergeState] = useState<{
    sourceUserId: string | null;
    targetUserId: string | null;
    confirming: boolean;
  }>({ sourceUserId: null, targetUserId: null, confirming: false });
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

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

  const handleLinkHistoric = async () => {
    if (!linkingState.historicUserId || !selectedTarget) return;

    const res = await fetch("/api/admin/users/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceUserId: linkingState.historicUserId,
        targetUserId: selectedTarget,
      }),
    });

    const json = await res.json();
    if (res.ok) {
      setFeedback({ type: "success", message: "Bruger tilknyttet!" });
      setLinkingState({ historicUserId: null, confirming: false });
      setSelectedTarget("");
      setTimeout(() => {
        setFeedback(null);
        fetchUsers();
      }, 2000);
    } else {
      setFeedback({ type: "error", message: json.error || "Fejl ved tilknytning" });
    }
  };

  const handleMergeMembers = async () => {
    if (!mergeState.sourceUserId || !mergeState.targetUserId) return;

    const res = await fetch("/api/admin/users/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceUserId: mergeState.sourceUserId,
        targetUserId: mergeState.targetUserId,
      }),
    });

    const json = await res.json();
    if (res.ok) {
      setFeedback({ type: "success", message: "Medlemmer sammenlagt!" });
      setMergeState({ sourceUserId: null, targetUserId: null, confirming: false });
      setTimeout(() => {
        setFeedback(null);
        fetchUsers();
      }, 2000);
    } else {
      setFeedback({ type: "error", message: json.error || "Fejl ved sammenlægning" });
    }
  };

  if (loading) {
    return <div className="text-center py-20 text-muted">Indlæser...</div>;
  }

  const historicUsers = users.filter((u) => u.authId.startsWith("historic-"));
  const realUsers = users.filter((u) => !u.authId.startsWith("historic-"));

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold text-ink">Administrér medlemmer</h1>

      {/* Historiske spillere linking section */}
      {historicUsers.length > 0 && (
        <div className="card">
          <div className="mb-4 pb-4 border-b border-line-card">
            <h2 className="font-display font-semibold text-lg text-ink">Historiske spillere</h2>
            <p className="text-sm text-muted mt-1">
              Tilknyt en historisk spiller til et aktivt medlemskab
            </p>
          </div>

          <div className="space-y-3">
            {historicUsers.map((user) => (
              <div key={user.id} className="py-3 border-b border-line-hairline last:border-0">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-ink">{user.displayName}</p>
                    <p className="text-xs text-muted">{user.email}</p>
                  </div>

                  {linkingState.historicUserId === user.id ? (
                    <div className="flex items-center gap-2 w-64">
                      <select
                        value={selectedTarget}
                        onChange={(e) => setSelectedTarget(e.target.value)}
                        className="input flex-1 text-sm py-1.5"
                      >
                        <option value="">Vælg medlem...</option>
                        {realUsers.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.displayName}
                          </option>
                        ))}
                      </select>

                      {!linkingState.confirming ? (
                        <button
                          onClick={() => {
                            if (selectedTarget) {
                              setLinkingState({ historicUserId: user.id, confirming: true });
                            }
                          }}
                          disabled={!selectedTarget}
                          className="btn-primary text-sm px-3 py-1.5 disabled:opacity-50"
                        >
                          Næste
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={handleLinkHistoric}
                            className="btn-primary text-sm px-3 py-1.5 bg-signal text-white"
                          >
                            Bekræft
                          </button>
                          <button
                            onClick={() => {
                              setLinkingState({ historicUserId: null, confirming: false });
                              setSelectedTarget("");
                            }}
                            className="btn-secondary text-sm px-3 py-1.5"
                          >
                            Annullér
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setLinkingState({ historicUserId: user.id, confirming: false });
                        setSelectedTarget("");
                        setFeedback(null);
                      }}
                      className="text-sm text-muted hover:text-ink transition-colors"
                    >
                      Tilknyt
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Merge members section */}
      {realUsers.length >= 2 && (
        <div className="card">
          <div className="mb-4 pb-4 border-b border-line-card">
            <h2 className="font-display font-semibold text-lg text-ink">Sammenlæg medlemmer</h2>
            <p className="text-sm text-muted mt-1">
              Sammenslå to konti som tilhører samme person
            </p>
          </div>

          <div className="space-y-3">
            {!mergeState.confirming ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-ink mb-2">
                    Konto der skal slettes
                  </label>
                  <select
                    value={mergeState.sourceUserId || ""}
                    onChange={(e) =>
                      setMergeState({
                        sourceUserId: e.target.value || null,
                        targetUserId: mergeState.targetUserId,
                        confirming: false,
                      })
                    }
                    className="input w-full text-sm py-1.5"
                  >
                    <option value="">Vælg medlem...</option>
                    {realUsers
                      .filter((u) => u.id !== mergeState.targetUserId)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.displayName}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-ink mb-2">
                    Konto der skal bevares
                  </label>
                  <select
                    value={mergeState.targetUserId || ""}
                    onChange={(e) =>
                      setMergeState({
                        sourceUserId: mergeState.sourceUserId,
                        targetUserId: e.target.value || null,
                        confirming: false,
                      })
                    }
                    className="input w-full text-sm py-1.5"
                  >
                    <option value="">Vælg medlem...</option>
                    {realUsers
                      .filter((u) => u.id !== mergeState.sourceUserId)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.displayName}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      if (mergeState.sourceUserId && mergeState.targetUserId) {
                        setMergeState({
                          sourceUserId: mergeState.sourceUserId,
                          targetUserId: mergeState.targetUserId,
                          confirming: true,
                        });
                      }
                    }}
                    disabled={!mergeState.sourceUserId || !mergeState.targetUserId}
                    className="btn-primary text-sm px-3 py-1.5 disabled:opacity-50"
                  >
                    Næste
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-signal-soft border border-[#eed7d0] rounded-lg p-3 text-sm text-signal">
                  <p className="font-medium mb-2">
                    Advarsel: Konto "{
                      users.find((u) => u.id === mergeState.sourceUserId)?.displayName
                    }" bliver slettet permanent.
                  </p>
                  <p className="mb-2">
                    Alle tips og kuponer flyttes til "{
                      users.find((u) => u.id === mergeState.targetUserId)?.displayName
                    }" og kontoen bliver derefter slettet.
                  </p>
                  {users.find((u) => u.id === mergeState.sourceUserId)?.role === "admin" && (
                    <p>
                      Hvis den slettede konto er admin, bliver den nye konto også admin.
                    </p>
                  )}
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setMergeState({
                        sourceUserId: null,
                        targetUserId: null,
                        confirming: false,
                      });
                    }}
                    className="btn-secondary text-sm px-3 py-1.5"
                  >
                    Annullér
                  </button>
                  <button
                    onClick={handleMergeMembers}
                    className="btn-primary text-sm px-3 py-1.5 bg-signal text-white"
                  >
                    Bekræft
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Feedback message */}
      {feedback && (
        <div
          className={`p-3 rounded-lg text-sm font-medium ${
            feedback.type === "success"
              ? "bg-brand-tint text-brand border border-brand"
              : "bg-signal-soft text-signal border border-[#eed7d0]"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* All members section */}
      <div className="card">
        <div className="mb-4 pb-4 border-b border-line-card">
          <h2 className="font-display font-semibold text-lg text-ink">Aktive medlemmer</h2>
        </div>

        <div className="space-y-3">
          {realUsers.map((user) => (
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
                  {user.identities && user.identities.length > 0 && (
                    <div className="space-y-0.5 mt-1">
                      {user.identities.map((identity) => (
                        <p key={identity.id} className="text-xs text-muted">
                          Også: {identity.email}
                        </p>
                      ))}
                    </div>
                  )}
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

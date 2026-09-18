"use client";

import { useState, useEffect } from "react";
import { formatInAppZone } from "@/lib/time";
import type { McpToken } from "@prisma/client";

type TokenListItem = Pick<
  McpToken,
  "id" | "name" | "tokenPrefix" | "createdAt" | "lastUsedAt" | "revokedAt"
>;

interface NewTokenData {
  token: string;
  id: string;
  name: string;
  tokenPrefix: string;
  createdAt: Date;
}

export function McpTokenManager() {
  const [tokens, setTokens] = useState<TokenListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [newToken, setNewToken] = useState<NewTokenData | null>(null);
  const [copyCommand, setCopyCommand] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);

  // Fetch tokens on mount
  useEffect(() => {
    fetchTokens();
  }, []);

  async function fetchTokens() {
    setLoading(true);
    try {
      const res = await fetch("/api/mcp-tokens");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kunne ikke hente tokens");
      setTokens(data.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fejl ved hentning af tokens");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateToken() {
    if (!name.trim()) return;
    setCreating(true);
    setError("");

    try {
      const res = await fetch("/api/mcp-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kunne ikke oprette token");

      setNewToken(data.data);
      setName("");
      await fetchTokens();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fejl ved oprettelse af token");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevokeToken(id: string) {
    if (confirmRevoke !== id) {
      setConfirmRevoke(id);
      return;
    }

    setRevoking(id);
    try {
      const res = await fetch(`/api/mcp-tokens/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Kunne ikke tilbagekalde token");
      }
      setConfirmRevoke(null);
      await fetchTokens();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fejl ved tilbagekaldelse");
    } finally {
      setRevoking(null);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopyCommand(true);
    setTimeout(() => setCopyCommand(false), 2000);
  }

  function formatDate(date: Date | string) {
    return formatInAppZone(date, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const mcpCommand = newToken
    ? `claude mcp add --transport http tips13 ${origin}/api/mcp --header "Authorization: Bearer ${newToken.token}"`
    : "";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display font-semibold text-ink mb-4">API-tokens</h2>

        {/* Create form */}
        <div className="card">
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Navn, fx. Claude på min bærbare"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              className="input flex-1"
              disabled={creating}
            />
            <button
              onClick={handleCreateToken}
              disabled={!name.trim() || creating}
              className="btn-primary !px-6 whitespace-nowrap"
            >
              {creating ? "Opretter..." : "Opret"}
            </button>
          </div>
        </div>

        {error && <p className="text-signal text-sm mt-3">{error}</p>}

        {/* New token display */}
        {newToken && (
          <div className="card bg-info-soft border border-info mt-4">
            <div className="mb-4">
              <p className="text-xs text-muted uppercase tracking-wider font-semibold mb-2">
                ⚠ Din token (vises kun denne gang)
              </p>
              <div className="bg-white rounded-lg p-3 font-mono text-sm text-ink break-all border border-line-pick mb-3">
                {newToken.token}
              </div>
              <button
                onClick={() =>
                  copyToClipboard(newToken.token)
                }
                className="text-xs text-info hover:underline font-medium mb-4 block"
              >
                {copyCommand ? "✓ Kopieret" : "Kopier token"}
              </button>
            </div>

            <div className="mb-3">
              <p className="text-xs text-muted uppercase tracking-wider font-semibold mb-2">
                Brug med Claude:
              </p>
              <div className="bg-white rounded-lg p-3 font-mono text-[11px] text-ink overflow-auto max-h-24 border border-line-pick">
                {mcpCommand}
              </div>
              <button
                onClick={() => copyToClipboard(mcpCommand)}
                className="text-xs text-info hover:underline font-medium mt-2 block"
              >
                {copyCommand ? "✓ Kopieret" : "Kopier kommando"}
              </button>
            </div>

            <p className="text-xs text-muted leading-relaxed">
              Gem denne kommando et sikkert sted. Tokenet vises ikke igen.
            </p>
          </div>
        )}

        {/* Token list */}
        <div className="card mt-4">
          {loading ? (
            <p className="text-muted text-sm">Indlæser tokens...</p>
          ) : tokens.length === 0 ? (
            <p className="text-muted text-sm">Ingen tokens oprettet endnu</p>
          ) : (
            <div className="space-y-3">
              {tokens.map((token) => {
                const isRevoked = token.revokedAt !== null;
                const isRevoking = revoking === token.id;
                const showConfirm = confirmRevoke === token.id;

                return (
                  <div
                    key={token.id}
                    className={`p-3 border rounded-lg ${
                      isRevoked
                        ? "bg-surface-subtle border-line-hairline opacity-50"
                        : "border-line-pick"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-ink">{token.name}</p>
                          {isRevoked && (
                            <span className="text-[10px] font-semibold text-muted-faint uppercase bg-line-divider px-2 py-0.5 rounded">
                              Tilbagekaldt
                            </span>
                          )}
                        </div>
                        <p className="font-mono text-xs text-muted mt-1">
                          {token.tokenPrefix}…
                        </p>
                        <div className="flex gap-4 mt-2 text-xs text-muted-faint">
                          <span>Oprettet: {formatDate(token.createdAt)}</span>
                          <span>
                            {token.lastUsedAt
                              ? `Sidst brugt: ${formatDate(token.lastUsedAt)}`
                              : "Aldrig brugt"}
                          </span>
                        </div>
                      </div>

                      {!isRevoked && (
                        <div className="flex gap-2">
                          {showConfirm ? (
                            <>
                              <button
                                onClick={() => handleRevokeToken(token.id)}
                                disabled={isRevoking}
                                className="text-xs font-medium text-signal hover:underline"
                              >
                                {isRevoking ? "…" : "Ja, slet"}
                              </button>
                              <button
                                onClick={() => setConfirmRevoke(null)}
                                className="text-xs font-medium text-muted hover:underline"
                              >
                                Annullér
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => handleRevokeToken(token.id)}
                              className="btn-danger"
                            >
                              Tilbagekald
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {showConfirm && (
                      <p className="text-xs text-signal mt-2 font-medium">
                        Sikker? Dette kan ikke omgøres.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

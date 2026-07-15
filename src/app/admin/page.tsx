"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";

interface Season {
  id: string;
  name: string;
  startDate: string;
  numRounds: number;
  isActive: boolean;
  rounds: { id: string; roundNumber: number; status: string }[];
}

export default function AdminPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newStartDate, setNewStartDate] = useState("");
  const [newNumRounds, setNewNumRounds] = useState(12);

  const fetchSeasons = () => {
    fetch("/api/seasons")
      .then((r) => r.json())
      .then(({ data }) => {
        setSeasons(data ?? []);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchSeasons();
  }, []);

  const createSeason = async () => {
    if (!newName || !newStartDate) return;
    await fetch("/api/seasons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName,
        startDate: newStartDate,
        numRounds: newNumRounds,
      }),
    });
    setShowCreate(false);
    setNewName("");
    setNewStartDate("");
    fetchSeasons();
  };

  if (loading) {
    return <div className="text-center py-20 text-muted">Indlæser...</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Logo size="compact" />
        <span className="font-mono text-[10px] font-bold text-signal border-[1.5px] border-signal rounded-full px-2.5 py-0.5">
          ADMIN
        </span>
        <div className="flex-1" />
        <Link href="/admin/users" className="btn-secondary text-sm">
          Administrér medlemmer
        </Link>
      </div>

      {/* Create season */}
      {!showCreate ? (
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          + Ny sæson
        </button>
      ) : (
        <div className="card space-y-4">
          <h2 className="font-display font-semibold text-ink">Opret sæson</h2>
          <div>
            <label className="label">Sæsonnavn</label>
            <input
              type="text"
              className="input"
              placeholder="f.eks. Efterår 2026"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Startdato</label>
            <input
              type="date"
              className="input"
              value={newStartDate}
              onChange={(e) => setNewStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Antal runder</label>
            <input
              type="number"
              className="input w-24"
              value={newNumRounds}
              onChange={(e) => setNewNumRounds(Number(e.target.value))}
              min={1}
              max={52}
            />
          </div>
          <div className="flex gap-2">
            <button onClick={createSeason} className="btn-primary">
              Opret
            </button>
            <button onClick={() => setShowCreate(false)} className="btn-secondary">
              Annullér
            </button>
          </div>
        </div>
      )}

      {/* Seasons list */}
      <div className="space-y-4">
        {seasons.map((season) => (
          <div key={season.id} className="card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display text-lg font-semibold text-ink">
                  {season.name}
                </h3>
                <p className="text-xs text-muted">
                  {new Date(season.startDate).toLocaleDateString("da-DK")} ·{" "}
                  {season.numRounds} runder
                  {season.isActive && <span className="text-brand ml-2">Aktiv</span>}
                </p>
              </div>
              <Link
                href={`/admin/rounds?seasonId=${season.id}`}
                className="btn-secondary text-sm"
              >
                Administrér runder
              </Link>
            </div>

            {/* Rounds summary */}
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: season.numRounds }, (_, i) => {
                const round = season.rounds.find((r) => r.roundNumber === i + 1);
                return (
                  <div
                    key={i}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-mono ${
                      round?.status === "completed"
                        ? "bg-brand-tint text-brand border border-brand-tintBorder"
                        : round?.status === "locked"
                        ? "bg-signal-soft text-signal border border-[#eed7d0]"
                        : round?.status === "open"
                        ? "bg-info-soft text-info border border-line-card"
                        : "bg-paper text-muted-ghost border border-line-hairline"
                    }`}
                  >
                    {i + 1}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

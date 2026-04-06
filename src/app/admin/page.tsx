"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

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
    return <div className="text-center py-20 text-stone-400">Loading...</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold text-coral-500">
          Admin Panel
        </h1>
        <Link href="/admin/users" className="btn-secondary text-sm">
          Manage Members
        </Link>
      </div>

      {/* Create season */}
      {!showCreate ? (
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          + New Season
        </button>
      ) : (
        <div className="card space-y-4">
          <h2 className="font-display font-semibold text-stone-800">Create Season</h2>
          <div>
            <label className="label">Season Name</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. Autumn 2026"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Start Date</label>
            <input
              type="date"
              className="input"
              value={newStartDate}
              onChange={(e) => setNewStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Number of Rounds</label>
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
              Create
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="btn-secondary"
            >
              Cancel
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
                <h3 className="font-display text-lg font-semibold text-stone-800">
                  {season.name}
                </h3>
                <p className="text-xs text-stone-400">
                  {new Date(season.startDate).toLocaleDateString("en-GB")} ·{" "}
                  {season.numRounds} rounds
                  {season.isActive && (
                    <span className="text-pitch-500 ml-2">Active</span>
                  )}
                </p>
              </div>
              <Link
                href={`/admin/rounds?seasonId=${season.id}`}
                className="btn-secondary text-sm"
              >
                Manage Rounds
              </Link>
            </div>

            {/* Rounds summary */}
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: season.numRounds }, (_, i) => {
                const round = season.rounds.find(
                  (r) => r.roundNumber === i + 1
                );
                return (
                  <div
                    key={i}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-mono ${
                      round?.status === "completed"
                        ? "bg-pitch-50 text-pitch-500 border border-pitch-200"
                        : round?.status === "locked"
                        ? "bg-amber-50 text-amber-600 border border-amber-200"
                        : round?.status === "open"
                        ? "bg-blue-50 text-blue-500 border border-blue-200"
                        : "bg-stone-50 text-stone-300 border border-stone-100"
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

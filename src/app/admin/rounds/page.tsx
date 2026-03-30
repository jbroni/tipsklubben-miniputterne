"use client";

import { Suspense } from "react";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { RoundStatusBadge } from "@/components/RoundStatusBadge";
import type { RoundStatus, Match, Pick as PickType } from "@prisma/client";

interface RoundData {
  id: string;
  roundNumber: number;
  deadline: string;
  status: RoundStatus;
  matches: Match[];
  _count: { predictions: number };
}

const PICK_LABEL: Record<string, string> = { HOME: "1", DRAW: "X", AWAY: "2" };

function AdminRoundsContent() {
  const searchParams = useSearchParams();
  const seasonId = searchParams.get("seasonId");

  const [rounds, setRounds] = useState<RoundData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newRoundNumber, setNewRoundNumber] = useState(1);
  const [newDeadline, setNewDeadline] = useState("");

  // Match entry state
  const [editingRound, setEditingRound] = useState<string | null>(null);
  const [matchEntries, setMatchEntries] = useState<
    {
      homeTeam: string;
      awayTeam: string;
      league: string;
      kickoff: string;
      oddsHome: string;
      oddsDraw: string;
      oddsAway: string;
    }[]
  >([]);

  // Results entry state
  const [resultsRound, setResultsRound] = useState<string | null>(null);
  const [resultEntries, setResultEntries] = useState<
    Record<string, PickType | "">
  >({});

  const fetchRounds = () => {
    const url = seasonId
      ? `/api/rounds?seasonId=${seasonId}`
      : "/api/rounds";
    fetch(url)
      .then((r) => r.json())
      .then(({ data }) => {
        setRounds(data ?? []);
        setLoading(false);
        // Auto-set next round number
        const maxRound = Math.max(0, ...(data ?? []).map((r: RoundData) => r.roundNumber));
        setNewRoundNumber(maxRound + 1);
      });
  };

  useEffect(() => {
    fetchRounds();
  }, [seasonId]);

  const createRound = async () => {
    if (!seasonId || !newDeadline) return;
    await fetch("/api/rounds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seasonId,
        roundNumber: newRoundNumber,
        deadline: newDeadline,
      }),
    });
    setShowCreate(false);
    fetchRounds();
  };

  const updateStatus = async (roundId: string, status: RoundStatus) => {
    await fetch(`/api/rounds/${roundId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    fetchRounds();
  };

  const startAddMatches = (roundId: string) => {
    setEditingRound(roundId);
    setMatchEntries(
      Array.from({ length: 13 }, () => ({
        homeTeam: "",
        awayTeam: "",
        league: "Premier League",
        kickoff: "",
        oddsHome: "",
        oddsDraw: "",
        oddsAway: "",
      }))
    );
  };

  const saveMatches = async () => {
    if (!editingRound) return;
    const matches = matchEntries.map((m, i) => ({
      matchNumber: i + 1,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      league: m.league,
      kickoff: m.kickoff || new Date().toISOString(),
      oddsHome: parseFloat(m.oddsHome) || 1.0,
      oddsDraw: parseFloat(m.oddsDraw) || 1.0,
      oddsAway: parseFloat(m.oddsAway) || 1.0,
    }));

    await fetch(`/api/rounds/${editingRound}/matches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matches }),
    });
    setEditingRound(null);
    fetchRounds();
  };

  const startEnterResults = (round: RoundData) => {
    setResultsRound(round.id);
    const entries: Record<string, PickType | ""> = {};
    round.matches.forEach((m) => {
      entries[m.id] = m.result ?? "";
    });
    setResultEntries(entries);
  };

  const saveResults = async () => {
    if (!resultsRound) return;
    const results = Object.entries(resultEntries)
      .filter(([, v]) => v !== "")
      .map(([matchId, result]) => ({ matchId, result }));

    await fetch(`/api/rounds/${resultsRound}/results`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "manual", results }),
    });
    setResultsRound(null);
    fetchRounds();
  };

  const autoResolve = async (roundId: string) => {
    await fetch(`/api/rounds/${roundId}/results`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "auto" }),
    });
    fetchRounds();
  };

  if (loading) {
    return <div className="text-center py-20 text-gray-500">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-bold">Manage Rounds</h1>

      {/* Create round */}
      {!showCreate ? (
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          + New Round
        </button>
      ) : (
        <div className="card space-y-4">
          <h2 className="font-display font-semibold">Create Round</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Round Number</label>
              <input
                type="number"
                className="input"
                value={newRoundNumber}
                onChange={(e) => setNewRoundNumber(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="label">Deadline</label>
              <input
                type="datetime-local"
                className="input"
                value={newDeadline}
                onChange={(e) => setNewDeadline(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={createRound} className="btn-primary">Create</button>
            <button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      {/* Match entry form */}
      {editingRound && (
        <div className="card space-y-4">
          <h2 className="font-display font-semibold">Add 13 Matches</h2>
          <div className="space-y-3">
            {matchEntries.map((m, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <span className="col-span-1 text-xs text-gray-500 font-mono">
                  {i + 1}
                </span>
                <input
                  className="col-span-2 input !py-1.5 text-sm"
                  placeholder="Home"
                  value={m.homeTeam}
                  onChange={(e) => {
                    const copy = [...matchEntries];
                    copy[i].homeTeam = e.target.value;
                    setMatchEntries(copy);
                  }}
                />
                <input
                  className="col-span-2 input !py-1.5 text-sm"
                  placeholder="Away"
                  value={m.awayTeam}
                  onChange={(e) => {
                    const copy = [...matchEntries];
                    copy[i].awayTeam = e.target.value;
                    setMatchEntries(copy);
                  }}
                />
                <select
                  className="col-span-2 input !py-1.5 text-sm"
                  value={m.league}
                  onChange={(e) => {
                    const copy = [...matchEntries];
                    copy[i].league = e.target.value;
                    setMatchEntries(copy);
                  }}
                >
                  <option>Premier League</option>
                  <option>Superliga</option>
                  <option>Bundesliga</option>
                  <option>Serie A</option>
                  <option>La Liga</option>
                </select>
                <input
                  className="col-span-1 input !py-1.5 text-sm text-center"
                  placeholder="1"
                  value={m.oddsHome}
                  onChange={(e) => {
                    const copy = [...matchEntries];
                    copy[i].oddsHome = e.target.value;
                    setMatchEntries(copy);
                  }}
                />
                <input
                  className="col-span-1 input !py-1.5 text-sm text-center"
                  placeholder="X"
                  value={m.oddsDraw}
                  onChange={(e) => {
                    const copy = [...matchEntries];
                    copy[i].oddsDraw = e.target.value;
                    setMatchEntries(copy);
                  }}
                />
                <input
                  className="col-span-1 input !py-1.5 text-sm text-center"
                  placeholder="2"
                  value={m.oddsAway}
                  onChange={(e) => {
                    const copy = [...matchEntries];
                    copy[i].oddsAway = e.target.value;
                    setMatchEntries(copy);
                  }}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={saveMatches} className="btn-primary">
              Save Matches
            </button>
            <button
              onClick={() => setEditingRound(null)}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Results entry form */}
      {resultsRound && (
        <div className="card space-y-4">
          <h2 className="font-display font-semibold">Enter Results</h2>
          {rounds
            .find((r) => r.id === resultsRound)
            ?.matches.map((m) => (
              <div key={m.id} className="flex items-center gap-4">
                <span className="text-sm w-48">
                  {m.homeTeam} vs {m.awayTeam}
                </span>
                <div className="flex gap-2">
                  {(["HOME", "DRAW", "AWAY"] as PickType[]).map((pick) => (
                    <button
                      key={pick}
                      onClick={() =>
                        setResultEntries((prev) => ({
                          ...prev,
                          [m.id]: pick,
                        }))
                      }
                      className={`px-3 py-1 rounded text-sm font-mono ${
                        resultEntries[m.id] === pick
                          ? pick === "HOME"
                            ? "pick-btn-home"
                            : pick === "DRAW"
                            ? "pick-btn-draw"
                            : "pick-btn-away"
                          : "pick-btn-unselected"
                      }`}
                    >
                      {PICK_LABEL[pick]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          <div className="flex gap-2">
            <button onClick={saveResults} className="btn-primary">
              Save Results
            </button>
            <button
              onClick={() => setResultsRound(null)}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Rounds list */}
      <div className="space-y-3">
        {rounds.map((round) => (
          <div key={round.id} className="card !p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="font-display font-semibold">
                  Round {round.roundNumber}
                </span>
                <RoundStatusBadge status={round.status} />
              </div>
              <span className="text-xs text-gray-500">
                {round.matches.length} matches ·{" "}
                {Math.floor(round._count.predictions / 13)} submitted
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {round.matches.length === 0 && (
                <button
                  onClick={() => startAddMatches(round.id)}
                  className="btn-secondary text-xs"
                >
                  Add Matches
                </button>
              )}

              {round.status === "open" && (
                <button
                  onClick={() => updateStatus(round.id, "locked")}
                  className="btn-secondary text-xs"
                >
                  Lock Round
                </button>
              )}

              {round.status === "locked" && (
                <>
                  <button
                    onClick={() => startEnterResults(round)}
                    className="btn-secondary text-xs"
                  >
                    Enter Results
                  </button>
                  <button
                    onClick={() => autoResolve(round.id)}
                    className="btn-secondary text-xs"
                  >
                    Auto-resolve
                  </button>
                  <button
                    onClick={() => updateStatus(round.id, "open")}
                    className="btn-secondary text-xs"
                  >
                    Reopen
                  </button>
                </>
              )}

              {round.status === "completed" && (
                <button
                  onClick={() => updateStatus(round.id, "locked")}
                  className="btn-secondary text-xs"
                >
                  Reopen for Edits
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminRoundsPage() {
  return (
    <Suspense fallback={<div className="text-center py-20 text-gray-500">Loading...</div>}>
      <AdminRoundsContent />
    </Suspense>
  );
}

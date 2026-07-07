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
const LEAGUES = ["Premier League", "Superliga", "Bundesliga", "Serie A", "La Liga"];
const API_LEAGUES = ["Premier League", "Bundesliga", "Serie A", "La Liga"];

interface Fixture {
  externalId: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  kickoff: string;
}

function AdminRoundsContent() {
  const searchParams = useSearchParams();
  const seasonId = searchParams.get("seasonId");

  const [rounds, setRounds] = useState<RoundData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newRoundNumber, setNewRoundNumber] = useState(1);
  const [newDeadline, setNewDeadline] = useState("");

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
      externalId: string | null;
    }[]
  >([]);

  const [fixtureLeague, setFixtureLeague] = useState(API_LEAGUES[0]);
  const [fixtureDateFrom, setFixtureDateFrom] = useState("");
  const [fixtureDateTo, setFixtureDateTo] = useState("");
  const [fetchedFixtures, setFetchedFixtures] = useState<Fixture[]>([]);
  const [fixturesLoading, setFixturesLoading] = useState(false);
  const [fixturesError, setFixturesError] = useState<string | null>(null);

  const [resultsRound, setResultsRound] = useState<string | null>(null);
  const [resultEntries, setResultEntries] = useState<Record<string, PickType | "">>({});

  const [autoResolvingRound, setAutoResolvingRound] = useState<string | null>(null);
  const [autoResolveMessages, setAutoResolveMessages] = useState<
    Record<string, { type: "success" | "error"; text: string }>
  >({});

  const fetchRounds = () => {
    const url = seasonId ? `/api/rounds?seasonId=${seasonId}` : "/api/rounds";
    fetch(url)
      .then((r) => r.json())
      .then(({ data }) => {
        setRounds(data ?? []);
        setLoading(false);
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
        externalId: null,
      }))
    );
    setFetchedFixtures([]);
    setFixturesError(null);
  };

  const fetchFixturesFromApi = async () => {
    if (!editingRound || !fixtureDateFrom || !fixtureDateTo) return;
    setFixturesLoading(true);
    setFixturesError(null);
    try {
      const res = await fetch(`/api/rounds/${editingRound}/matches/fetch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          league: fixtureLeague,
          dateFrom: fixtureDateFrom,
          dateTo: fixtureDateTo,
        }),
      });
      const { data, error } = await res.json();
      if (!res.ok) {
        setFixturesError(error ?? "Kunne ikke hente kampe");
        return;
      }
      setFetchedFixtures(data ?? []);
    } finally {
      setFixturesLoading(false);
    }
  };

  const applyFixture = (rowIndex: number, externalId: string) => {
    const fixture = fetchedFixtures.find((f) => f.externalId === externalId);
    const copy = [...matchEntries];
    if (!fixture) {
      copy[rowIndex] = { ...copy[rowIndex], externalId: null };
    } else {
      copy[rowIndex] = {
        ...copy[rowIndex],
        homeTeam: fixture.homeTeam,
        awayTeam: fixture.awayTeam,
        league: fixture.league,
        kickoff: fixture.kickoff.slice(0, 16),
        externalId: fixture.externalId,
      };
    }
    setMatchEntries(copy);
  };

  const updateMatchEntry = (
    index: number,
    field: "homeTeam" | "awayTeam" | "league" | "kickoff",
    value: string
  ) => {
    const copy = [...matchEntries];
    copy[index] = { ...copy[index], [field]: value, externalId: null };
    setMatchEntries(copy);
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
      externalId: m.externalId,
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
    setAutoResolvingRound(roundId);
    setAutoResolveMessages((prev) => {
      const copy = { ...prev };
      delete copy[roundId];
      return copy;
    });
    try {
      const res = await fetch(`/api/rounds/${roundId}/results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "auto" }),
      });
      const { data, error } = await res.json();
      if (!res.ok) {
        setAutoResolveMessages((prev) => ({
          ...prev,
          [roundId]: { type: "error", text: error ?? "Automatisk beregning fejlede" },
        }));
        return;
      }
      setAutoResolveMessages((prev) => ({
        ...prev,
        [roundId]: {
          type: "success",
          text: `${data.updated} kamp${data.updated === 1 ? "" : "e"} opdateret`,
        },
      }));
      fetchRounds();
    } catch {
      setAutoResolveMessages((prev) => ({
        ...prev,
        [roundId]: { type: "error", text: "Automatisk beregning fejlede" },
      }));
    } finally {
      setAutoResolvingRound(null);
    }
  };

  if (loading) {
    return <div className="text-center py-20 text-muted">Indlæser...</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold text-ink">Administrér runder</h1>

      {/* Create round */}
      {!showCreate ? (
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          + Ny runde
        </button>
      ) : (
        <div className="card space-y-4">
          <h2 className="font-display font-semibold text-ink">Opret runde</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Rundenummer</label>
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
            <button onClick={createRound} className="btn-primary">
              Opret
            </button>
            <button onClick={() => setShowCreate(false)} className="btn-secondary">
              Annullér
            </button>
          </div>
        </div>
      )}

      {/* Match entry form */}
      {editingRound && (
        <div className="card space-y-4">
          <h2 className="font-display font-semibold text-ink">Tilføj 13 kampe</h2>

          <div className="space-y-2 border-b border-line pb-4">
            <h3 className="text-sm font-semibold text-ink-secondary">
              Hent kampe fra football-data.org
            </h3>
            <div className="flex flex-wrap gap-2 items-end">
              <div>
                <label className="label">Liga</label>
                <select
                  className="input !py-1.5 text-sm"
                  value={fixtureLeague}
                  onChange={(e) => setFixtureLeague(e.target.value)}
                >
                  {API_LEAGUES.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Fra dato</label>
                <input
                  type="date"
                  className="input !py-1.5 text-sm"
                  value={fixtureDateFrom}
                  onChange={(e) => setFixtureDateFrom(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Til dato</label>
                <input
                  type="date"
                  className="input !py-1.5 text-sm"
                  value={fixtureDateTo}
                  onChange={(e) => setFixtureDateTo(e.target.value)}
                />
              </div>
              <button
                onClick={fetchFixturesFromApi}
                className="btn-secondary text-xs"
                disabled={fixturesLoading || !fixtureDateFrom || !fixtureDateTo}
              >
                {fixturesLoading ? "Henter…" : "Hent kampe"}
              </button>
            </div>
            {fixturesError && <p className="text-xs text-red-600">{fixturesError}</p>}
            {fetchedFixtures.length > 0 && (
              <p className="text-xs text-muted">
                {fetchedFixtures.length} kampe fundet. Vælg dem i rækkerne nedenfor for at
                knytte dem til automatisk resultatberegning.
              </p>
            )}
          </div>

          <div className="space-y-3">
            {matchEntries.map((m, i) => (
              <div
                key={i}
                className="grid grid-cols-[auto_2fr_2fr_2fr_1fr_1fr_1fr_2fr] gap-2 items-center"
              >
                <span className="text-xs text-muted font-mono">{i + 1}</span>
                <input
                  className="input !py-1.5 text-sm"
                  placeholder="Hjemme"
                  value={m.homeTeam}
                  onChange={(e) => updateMatchEntry(i, "homeTeam", e.target.value)}
                />
                <input
                  className="input !py-1.5 text-sm"
                  placeholder="Ude"
                  value={m.awayTeam}
                  onChange={(e) => updateMatchEntry(i, "awayTeam", e.target.value)}
                />
                <select
                  className="input !py-1.5 text-sm"
                  value={m.league}
                  onChange={(e) => updateMatchEntry(i, "league", e.target.value)}
                >
                  {LEAGUES.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
                <input
                  className="input !py-1.5 text-sm text-center"
                  placeholder="1"
                  value={m.oddsHome}
                  onChange={(e) => {
                    const copy = [...matchEntries];
                    copy[i].oddsHome = e.target.value;
                    setMatchEntries(copy);
                  }}
                />
                <input
                  className="input !py-1.5 text-sm text-center"
                  placeholder="X"
                  value={m.oddsDraw}
                  onChange={(e) => {
                    const copy = [...matchEntries];
                    copy[i].oddsDraw = e.target.value;
                    setMatchEntries(copy);
                  }}
                />
                <input
                  className="input !py-1.5 text-sm text-center"
                  placeholder="2"
                  value={m.oddsAway}
                  onChange={(e) => {
                    const copy = [...matchEntries];
                    copy[i].oddsAway = e.target.value;
                    setMatchEntries(copy);
                  }}
                />
                <select
                  className={`input !py-1.5 text-xs ${
                    m.externalId ? "border-green-600 text-green-700" : ""
                  }`}
                  value={m.externalId ?? ""}
                  onChange={(e) => applyFixture(i, e.target.value)}
                >
                  <option value="">– Ikke koblet –</option>
                  {fetchedFixtures.map((f) => (
                    <option key={f.externalId} value={f.externalId}>
                      {f.homeTeam} – {f.awayTeam}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={saveMatches} className="btn-primary">
              Gem kampe
            </button>
            <button onClick={() => setEditingRound(null)} className="btn-secondary">
              Annullér
            </button>
          </div>
        </div>
      )}

      {/* Results entry form */}
      {resultsRound && (
        <div className="card space-y-4">
          <h2 className="font-display font-semibold text-ink">Indtast resultater</h2>
          {rounds
            .find((r) => r.id === resultsRound)
            ?.matches.map((m) => (
              <div key={m.id} className="flex items-center gap-4">
                <span className="text-sm w-48 text-ink-secondary">
                  {m.homeTeam} – {m.awayTeam}
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
                      className={`w-9 h-9 rounded-md font-mono text-sm font-bold flex items-center justify-center ${
                        resultEntries[m.id] === pick
                          ? "bg-brand text-white"
                          : "border-[1.5px] border-line-pick text-muted-faint"
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
              Gem resultater
            </button>
            <button onClick={() => setResultsRound(null)} className="btn-secondary">
              Annullér
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
                <span className="font-display font-semibold text-ink">
                  Runde {round.roundNumber}
                </span>
                <RoundStatusBadge status={round.status} />
              </div>
              <span className="font-mono text-xs text-muted">
                {round.matches.length} kampe ·{" "}
                {Math.floor(round._count.predictions / 13)} indleveret
              </span>
            </div>

            {autoResolveMessages[round.id] && (
              <p
                className={`text-xs mb-2 ${
                  autoResolveMessages[round.id].type === "success"
                    ? "text-green-700"
                    : "text-red-600"
                }`}
              >
                {autoResolveMessages[round.id].text}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {round.matches.length === 0 && (
                <button
                  onClick={() => startAddMatches(round.id)}
                  className="btn-secondary text-xs"
                >
                  Tilføj kampe
                </button>
              )}

              {round.status === "open" && (
                <button
                  onClick={() => updateStatus(round.id, "locked")}
                  className="btn-secondary text-xs"
                >
                  Lås runden
                </button>
              )}

              {round.status === "locked" && (
                <>
                  <button
                    onClick={() => startEnterResults(round)}
                    className="btn-secondary text-xs"
                  >
                    Indtast resultater
                  </button>
                  <button
                    onClick={() => autoResolve(round.id)}
                    className="btn-secondary text-xs"
                    disabled={autoResolvingRound === round.id}
                  >
                    {autoResolvingRound === round.id ? "Beregner…" : "Beregn automatisk"}
                  </button>
                  <button
                    onClick={() => updateStatus(round.id, "open")}
                    className="btn-secondary text-xs"
                  >
                    Genåbn
                  </button>
                </>
              )}

              {round.status === "completed" && (
                <button
                  onClick={() => updateStatus(round.id, "locked")}
                  className="btn-secondary text-xs"
                >
                  Genåbn til redigering
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
    <Suspense fallback={<div className="text-center py-20 text-muted">Indlæser...</div>}>
      <AdminRoundsContent />
    </Suspense>
  );
}

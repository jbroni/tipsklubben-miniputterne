"use client";

import { Suspense } from "react";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { RoundStatusBadge } from "@/components/RoundStatusBadge";
import { parseCouponText, resolveKickoff } from "@/lib/coupon-parser";
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
  const [matchDate, setMatchDate] = useState<string>("");
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

  const [couponText, setCouponText] = useState("");
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponConfirmation, setCouponConfirmation] = useState<{ count: number; type: "success" | "warning" } | null>(null);

  const [fixtureLeague, setFixtureLeague] = useState(API_LEAGUES[0]);
  const [fixtureDateFrom, setFixtureDateFrom] = useState("");
  const [fixtureDateTo, setFixtureDateTo] = useState("");
  const [fetchedFixtures, setFetchedFixtures] = useState<Fixture[]>([]);
  const [fixturesLoading, setFixturesLoading] = useState(false);
  const [fixturesError, setFixturesError] = useState<string | null>(null);
  const [showFixtureFetch, setShowFixtureFetch] = useState(false);

  const [resultsRound, setResultsRound] = useState<string | null>(null);
  const [resultEntries, setResultEntries] = useState<Record<string, PickType | "">>({});

  const [autoResolvingRound, setAutoResolvingRound] = useState<string | null>(null);
  const [autoResolveMessages, setAutoResolveMessages] = useState<
    Record<string, { type: "success" | "error"; text: string }>
  >({});

  const [actionError, setActionError] = useState("");

  // Deadline editing state
  const [editingDeadlineRound, setEditingDeadlineRound] = useState<string | null>(null);
  const [deadlineInputValue, setDeadlineInputValue] = useState("");
  const [reopeningRound, setReopeningRound] = useState<string | null>(null);

  // Helper functions
  const formatDeadline = (deadline: string): string => {
    return new Date(deadline).toLocaleString("da-DK", {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const isDeadlineInPast = (deadline: string): boolean => {
    return new Date(deadline) <= new Date();
  };

  const convertToLocalDatetimeLocal = (isoString: string): string => {
    const date = new Date(isoString);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

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
    setActionError("");
    const res = await fetch("/api/rounds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seasonId,
        roundNumber: newRoundNumber,
        deadline: newDeadline,
      }),
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "Failed to create round" }));
      setActionError(error ?? "Failed to create round");
      return;
    }
    setShowCreate(false);
    fetchRounds();
  };

  const updateStatus = async (roundId: string, status: RoundStatus) => {
    setActionError("");
    const res = await fetch(`/api/rounds/${roundId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "Failed to update status" }));
      setActionError(error ?? "Failed to update status");
      return;
    }
    fetchRounds();
  };

  const updateDeadline = async (roundId: string, deadline: string, includeStatus?: boolean) => {
    setActionError("");
    const body: Record<string, unknown> = { deadline };
    if (includeStatus) {
      body.status = "open";
    }
    const res = await fetch(`/api/rounds/${roundId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "Fejl ved opdatering" }));
      setActionError(error ?? "Fejl ved opdatering");
      return;
    }
    setEditingDeadlineRound(null);
    setReopeningRound(null);
    fetchRounds();
  };

  const startAddMatches = (roundId: string) => {
    setEditingRound(roundId);
    const round = rounds.find((r) => r.id === roundId);
    const deadlineDate = round?.deadline ? new Date(round.deadline) : new Date();
    const resolvedKickoff = resolveKickoff("lør", "00:00", deadlineDate);
    const deadlineDateStr = resolvedKickoff ? resolvedKickoff.split("T")[0] : "";
    setMatchDate(deadlineDateStr);
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
    setCouponText("");
    setCouponError(null);
    setCouponConfirmation(null);
    setFetchedFixtures([]);
    setFixturesError(null);
    setShowFixtureFetch(false);
  };

  const fillMatchesFromCoupon = () => {
    const result = parseCouponText(couponText);
    if (!result.ok) {
      setCouponError(result.error);
      setCouponConfirmation(null);
      return;
    }

    const deadline = rounds.find((r) => r.id === editingRound)?.deadline;
    const deadlineDate = deadline ? new Date(deadline) : new Date();

    const copy = [...matchEntries];
    let firstMatchDate: string | null = null;
    result.matches.forEach((parsed) => {
      if (parsed.matchNumber >= 1 && parsed.matchNumber <= 13) {
        const index = parsed.matchNumber - 1;
        const resolvedKickoff = resolveKickoff(parsed.kickoffDay, parsed.kickoffTime, deadlineDate);
        if (resolvedKickoff && !firstMatchDate) {
          const [datePart] = resolvedKickoff.split("T");
          firstMatchDate = datePart;
        }
        const timeOnly = resolvedKickoff ? resolvedKickoff.split("T")[1] : "";
        copy[index] = {
          ...copy[index],
          homeTeam: parsed.homeTeam,
          awayTeam: parsed.awayTeam,
          oddsHome: parsed.oddsHome,
          oddsDraw: parsed.oddsDraw,
          oddsAway: parsed.oddsAway,
          league: parsed.league,
          kickoff: timeOnly || copy[index].kickoff,
          externalId: null,
        };
      }
    });

    if (firstMatchDate) {
      setMatchDate(firstMatchDate);
    }
    setMatchEntries(copy);
    setCouponError(null);
    setCouponText("");
    setCouponConfirmation({
      count: result.matches.length,
      type: result.matches.length === 13 ? "success" : "warning",
    });
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
      const d = new Date(fixture.kickoff);
      const pad = (n: number) => String(n).padStart(2, "0");
      const timeOnly = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
      const dateOnly = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      copy[rowIndex] = {
        ...copy[rowIndex],
        homeTeam: fixture.homeTeam,
        awayTeam: fixture.awayTeam,
        league: fixture.league,
        kickoff: timeOnly,
        externalId: fixture.externalId,
      };
      if (!matchDate) {
        setMatchDate(dateOnly);
      }
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
    const matches = matchEntries.map((m, i) => {
      let kickoff: string;
      if (matchDate && m.kickoff) {
        kickoff = new Date(`${matchDate}T${m.kickoff}`).toISOString();
      } else if (matchDate) {
        kickoff = new Date(`${matchDate}T00:00`).toISOString();
      } else {
        kickoff = new Date().toISOString();
      }
      return {
        matchNumber: i + 1,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        league: m.league,
        kickoff,
        oddsHome: parseFloat(m.oddsHome.replace(",", ".")) || 1.0,
        oddsDraw: parseFloat(m.oddsDraw.replace(",", ".")) || 1.0,
        oddsAway: parseFloat(m.oddsAway.replace(",", ".")) || 1.0,
        externalId: m.externalId,
      };
    });

    setActionError("");
    const res = await fetch(`/api/rounds/${editingRound}/matches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matches }),
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "Failed to save matches" }));
      setActionError(error ?? "Failed to save matches");
      return;
    }
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

    setActionError("");
    const res = await fetch(`/api/rounds/${resultsRound}/results`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "manual", results }),
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "Failed to save results" }));
      setActionError(error ?? "Failed to save results");
      return;
    }
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

      {actionError && (
        <div className="bg-coral-50 border border-coral-200 text-coral-600 rounded-lg px-4 py-3 text-sm flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError("")} className="text-coral-400 hover:text-coral-600 ml-4">✕</button>
        </div>
      )}

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
            <button onClick={createRound} className="btn-primary !px-3 !py-1.5 text-sm">
              Opret
            </button>
            <button onClick={() => setShowCreate(false)} className="btn-secondary !px-3 !py-1.5 text-sm">
              Annullér
            </button>
          </div>
        </div>
      )}

      {/* Match entry form */}
      {editingRound && (
        <div className="card space-y-4">
          <h2 className="font-display font-semibold text-ink">Tilføj 13 kampe</h2>

          <div className="space-y-3 border-b border-line pb-4">
            <h3 className="text-sm font-semibold text-ink-secondary">
              Indsæt fra kupon
            </h3>
            <div>
              <label className="label">Dato</label>
              <input
                type="date"
                className="input !py-1.5 text-sm"
                value={matchDate}
                onChange={(e) => setMatchDate(e.target.value)}
              />
            </div>
            <textarea
              className="input !py-1.5 text-sm font-mono"
              rows={8}
              placeholder="Kopiér kampene fra kupon-siden og indsæt her"
              value={couponText}
              onChange={(e) => setCouponText(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                onClick={fillMatchesFromCoupon}
                className="btn-secondary text-xs"
                disabled={couponText.trim() === ""}
              >
                Udfyld kampe
              </button>
            </div>
            {couponError && <p className="text-xs text-red-600">{couponError}</p>}
            {couponConfirmation && (
              <p
                className={`text-xs ${
                  couponConfirmation.type === "success"
                    ? "text-green-700"
                    : "text-amber-600"
                }`}
              >
                {couponConfirmation.count === 13
                  ? "13 kampe udfyldt"
                  : couponConfirmation.count > 13
                  ? `Der blev fundet ${couponConfirmation.count} kampe – kun de første 13 er brugt`
                  : `Kun ${couponConfirmation.count} kampe fundet – forventede 13`}
              </p>
            )}
          </div>

          <button
            onClick={() => setShowFixtureFetch(!showFixtureFetch)}
            className="text-xs text-muted hover:text-ink-secondary hover:underline transition-colors"
          >
            Hent kampe fra football-data.org…
          </button>

          {showFixtureFetch && (
            <div className="space-y-2 border-b border-line pb-4">
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
          )}

          <div className="space-y-2">
            <div
              className={`grid gap-2 items-center text-xs text-muted-faint font-medium ${
                fetchedFixtures.length > 0
                  ? "grid-cols-[1.5rem_2fr_2fr_2fr_6rem_3.5rem_3.5rem_3.5rem_2fr]"
                  : "grid-cols-[1.5rem_2fr_2fr_2fr_6rem_3.5rem_3.5rem_3.5rem]"
              }`}
            >
              <span className="w-6"></span>
              <span>Hjemme</span>
              <span>Ude</span>
              <span>Liga</span>
              <span>Tid</span>
              <span>1</span>
              <span>X</span>
              <span>2</span>
              {fetchedFixtures.length > 0 && <span>Kobling</span>}
            </div>
            <datalist id="league-list">
              {LEAGUES.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
            {matchEntries.map((m, i) => (
              <div
                key={i}
                className={`grid gap-2 items-center ${
                  fetchedFixtures.length > 0
                    ? "grid-cols-[1.5rem_2fr_2fr_2fr_6rem_3.5rem_3.5rem_3.5rem_2fr]"
                    : "grid-cols-[1.5rem_2fr_2fr_2fr_6rem_3.5rem_3.5rem_3.5rem]"
                }`}
              >
                <span className="w-6 text-right text-xs text-muted font-mono tabular-nums">
                  {i + 1}
                </span>
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
                <input
                  className="input !py-1.5 text-sm"
                  placeholder="Liga"
                  list="league-list"
                  value={m.league}
                  onChange={(e) => updateMatchEntry(i, "league", e.target.value)}
                />
                <input
                  type="time"
                  className="input !py-1.5 !px-1 text-sm [&::-webkit-calendar-picker-indicator]:hidden"
                  value={m.kickoff}
                  onChange={(e) => updateMatchEntry(i, "kickoff", e.target.value)}
                />
                <input
                  type="text"
                  inputMode="decimal"
                  className="input !py-1.5 !px-1 text-sm text-center w-14"
                  placeholder="1"
                  value={m.oddsHome}
                  onChange={(e) => {
                    const copy = [...matchEntries];
                    copy[i].oddsHome = e.target.value;
                    setMatchEntries(copy);
                  }}
                />
                <input
                  type="text"
                  inputMode="decimal"
                  className="input !py-1.5 !px-1 text-sm text-center w-14"
                  placeholder="X"
                  value={m.oddsDraw}
                  onChange={(e) => {
                    const copy = [...matchEntries];
                    copy[i].oddsDraw = e.target.value;
                    setMatchEntries(copy);
                  }}
                />
                <input
                  type="text"
                  inputMode="decimal"
                  className="input !py-1.5 !px-1 text-sm text-center w-14"
                  placeholder="2"
                  value={m.oddsAway}
                  onChange={(e) => {
                    const copy = [...matchEntries];
                    copy[i].oddsAway = e.target.value;
                    setMatchEntries(copy);
                  }}
                />
                {fetchedFixtures.length > 0 && (
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
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={saveMatches} className="btn-primary !px-3 !py-1.5 text-sm">
              Gem kampe
            </button>
            <button onClick={() => setEditingRound(null)} className="btn-secondary !px-3 !py-1.5 text-sm">
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
            <button onClick={saveResults} className="btn-primary !px-3 !py-1.5 text-sm">
              Gem resultater
            </button>
            <button onClick={() => setResultsRound(null)} className="btn-secondary !px-3 !py-1.5 text-sm">
              Annullér
            </button>
          </div>
        </div>
      )}

      {/* Rounds list */}
      <div className="space-y-3">
        {rounds.map((round) => {
          const deadlineInPast = isDeadlineInPast(round.deadline);
          const isReopenMode = reopeningRound === round.id;
          const isEditingDeadline = editingDeadlineRound === round.id;

          return (
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

              {/* Deadline display and warning */}
              <div className="mb-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-ink-secondary">
                    Deadline: {formatDeadline(round.deadline)}
                  </span>
                  {round.status !== "completed" && !isEditingDeadline && !isReopenMode && (
                    <button
                      onClick={() => {
                        setReopeningRound(null);
                        setEditingDeadlineRound(round.id);
                        setDeadlineInputValue(convertToLocalDatetimeLocal(round.deadline));
                      }}
                      className="text-xs text-muted hover:text-ink transition-colors"
                    >
                      Ændr deadline
                    </button>
                  )}
                </div>
                {round.status === "open" && deadlineInPast && (
                  <p className="text-xs text-red-600 mt-1">
                    Deadline passeret – runden vises som låst
                  </p>
                )}
              </div>

              {/* Deadline edit mode */}
              {isEditingDeadline && (
                <div className="mb-3 flex gap-2 items-end">
                  <div className="flex-1">
                    <input
                      type="datetime-local"
                      className="input !py-1.5 text-sm"
                      value={deadlineInputValue}
                      onChange={(e) => setDeadlineInputValue(e.target.value)}
                    />
                  </div>
                  <button
                    onClick={() => {
                      if (!deadlineInputValue || isNaN(Date.parse(deadlineInputValue))) {
                        setActionError("Vælg venligst en gyldig deadline");
                        return;
                      }
                      const isoString = new Date(deadlineInputValue).toISOString();
                      updateDeadline(round.id, isoString);
                    }}
                    className="btn-primary !px-3 !py-1.5 text-xs"
                    disabled={!deadlineInputValue || isNaN(Date.parse(deadlineInputValue))}
                  >
                    Gem
                  </button>
                  <button
                    onClick={() => {
                      setEditingDeadlineRound(null);
                      setDeadlineInputValue("");
                    }}
                    className="btn-secondary !px-3 !py-1.5 text-xs"
                  >
                    Annullér
                  </button>
                </div>
              )}

              {/* Reopen with deadline mode */}
              {isReopenMode && (
                <div className="mb-3 flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="text-xs text-ink-secondary block mb-1">
                      Ny deadline:
                    </label>
                    <input
                      type="datetime-local"
                      className="input !py-1.5 text-sm"
                      value={deadlineInputValue}
                      onChange={(e) => setDeadlineInputValue(e.target.value)}
                    />
                  </div>
                  <button
                    onClick={() => {
                      if (!deadlineInputValue || isNaN(Date.parse(deadlineInputValue))) {
                        setActionError("Vælg venligst en gyldig deadline");
                        return;
                      }
                      const isoString = new Date(deadlineInputValue).toISOString();
                      updateDeadline(round.id, isoString, true);
                    }}
                    className="btn-primary !px-3 !py-1.5 text-xs"
                    disabled={!deadlineInputValue || isNaN(Date.parse(deadlineInputValue))}
                  >
                    Gem og genåbn
                  </button>
                  <button
                    onClick={() => {
                      setReopeningRound(null);
                      setDeadlineInputValue("");
                    }}
                    className="btn-secondary !px-3 !py-1.5 text-xs"
                  >
                    Annullér
                  </button>
                </div>
              )}

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
                      onClick={() => {
                        if (deadlineInPast) {
                          setEditingDeadlineRound(null);
                          setReopeningRound(round.id);
                          setDeadlineInputValue(convertToLocalDatetimeLocal(round.deadline));
                        } else {
                          updateStatus(round.id, "open");
                        }
                      }}
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
          );
        })}
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

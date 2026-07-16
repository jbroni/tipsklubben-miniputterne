import { describe, it, expect } from "vitest";
import {
  parseCouponText,
  ParsedCouponMatch,
  resolveKickoff,
} from "./coupon-parser";

const COUPON_SAMPLE_EXTENDED = `1
Start
Rosenborg
1

Start
3.00
x

Uafgjort
3.45
2

Rosenborg
2.20
lør 16:00
Norge Eliteserien
2
Lillestrøm
KFUM Oslo
1

Lillestrøm
1.68
x

Uafgjort
3.85
2

KFUM Oslo
4.50
lør 16:00
Norge Eliteserien
3
Kristiansund
Sarpsborg
1

Kristiansund
3.00
x

Uafgjort
3.50
2

Sarpsborg
2.16
lør 16:00
Norge Eliteserien
4
Molde
Brann
1

Molde
2.06
x

Uafgjort
3.65
2

Brann
3.10
lør 18:00
Norge Eliteserien
5
Viking
Sandefjord
1

Viking
1.29
x

Uafgjort
5.50
2

Sandefjord
8.00
lør 18:00
Norge Eliteserien
6
Oulu
Gnistan
1

Oulu
2.10
x

Uafgjort
3.25
2

Gnistan
2.90
lør 16:00
Finland Veikkausliiga
7
Seinajoen
KuPS
1

Seinajoen
2.90
x

Uafgjort
3.50
2

KuPS
2.05
lør 16:00
Finland Veikkausliiga
8
FC Ktp Kotka
PK-35
1

FC Ktp Kotka
1.86
x

Uafgjort
3.10
2

PK-35
3.60
lør 16:00
Finland Ykkosliiga
9
Thor Akureyri
Vikingur Reykjavik
1

Thor Akureyri
12.00
x

Uafgjort
7.25
2

Vikingur Reykjavik
1.09
lør 18:00
Island Urvalsdeild
10
ASC Otelul Galati
FC CFR 1907 Cluj
1

ASC Otelul Galati
3.00
x

Uafgjort
3.00
2

FC CFR 1907 Cluj
2.20
lør 17:30
Rumænien Liga I
11
Universitatea Craiova 1948 Cs
FC Uta Arad
1

Universitatea Craiova 1948 Cs
1.38
x

Uafgjort
4.00
2

FC Uta Arad
6.75
lør 20:15
Rumænien Liga I
12
FK Septemvri Sofia
FC Arda Kardzhali
1

FK Septemvri Sofia
3.65
x

Uafgjort
3.15
2

FC Arda Kardzhali
1.93
lør 18:00
Bulgarien 1. division
13
PFC Ludogorets Razgrad
Lokomotiv Plovdiv
1

PFC Ludogorets Razgrad
1.26
x

Uafgjort
4.75
2

Lokomotiv Plovdiv
8.50
lør 20:15
Bulgarien 1. division`;

describe("parseCouponText", () => {
  describe("full 13-match coupon", () => {
    it("parses real-world sample with all 13 matches and new fields correctly", () => {
      const result = parseCouponText(COUPON_SAMPLE_EXTENDED);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.matches).toHaveLength(13);

        // Check match 1 in full
        expect(result.matches[0]).toEqual({
          matchNumber: 1,
          homeTeam: "Start",
          awayTeam: "Rosenborg",
          oddsHome: "3.00",
          oddsDraw: "3.45",
          oddsAway: "2.20",
          kickoffDay: "lør",
          kickoffTime: "16:00",
          league: "Norge Eliteserien",
        });

        // Check match 13 in full
        expect(result.matches[12]).toEqual({
          matchNumber: 13,
          homeTeam: "PFC Ludogorets Razgrad",
          awayTeam: "Lokomotiv Plovdiv",
          oddsHome: "1.26",
          oddsDraw: "4.75",
          oddsAway: "8.50",
          kickoffDay: "lør",
          kickoffTime: "20:15",
          league: "Bulgarien 1. division",
        });

        // Spot-check match 8: away team "PK-35" and league "Finland Ykkosliiga"
        expect(result.matches[7]).toEqual({
          matchNumber: 8,
          homeTeam: "FC Ktp Kotka",
          awayTeam: "PK-35",
          oddsHome: "1.86",
          oddsDraw: "3.10",
          oddsAway: "3.60",
          kickoffDay: "lør",
          kickoffTime: "16:00",
          league: "Finland Ykkosliiga",
        });

        // Spot-check match 10: away team "FC CFR 1907 Cluj" and league "Rumænien Liga I"
        expect(result.matches[9]).toEqual({
          matchNumber: 10,
          homeTeam: "ASC Otelul Galati",
          awayTeam: "FC CFR 1907 Cluj",
          oddsHome: "3.00",
          oddsDraw: "3.00",
          oddsAway: "2.20",
          kickoffDay: "lør",
          kickoffTime: "17:30",
          league: "Rumænien Liga I",
        });

        // Spot-check match 12: league contains digits and a dot
        expect(result.matches[11]).toEqual({
          matchNumber: 12,
          homeTeam: "FK Septemvri Sofia",
          awayTeam: "FC Arda Kardzhali",
          oddsHome: "3.65",
          oddsDraw: "3.15",
          oddsAway: "1.93",
          kickoffDay: "lør",
          kickoffTime: "18:00",
          league: "Bulgarien 1. division",
        });
      }
    });
  });

  describe("decimal separator handling", () => {
    it("normalizes comma decimal separators in odds to dots", () => {
      const couponText = `1
Team A
Team B
1

Team A
3,45
x

Uafgjort
2,50
2

Team B
1,80
lør 16:00
Test League`;

      const result = parseCouponText(couponText);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.matches[0]).toEqual({
          matchNumber: 1,
          homeTeam: "Team A",
          awayTeam: "Team B",
          oddsHome: "3.45",
          oddsDraw: "2.50",
          oddsAway: "1.80",
          kickoffDay: "lør",
          kickoffTime: "16:00",
          league: "Test League",
        });
      }
    });

    it("normalizes comma in kickoff time to colon", () => {
      const couponText = `1
Team A
Team B
1

Team A
2.00
x

Uafgjort
3.00
2

Team B
4.00
lør 16.00
Test League`;

      const result = parseCouponText(couponText);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.matches[0].kickoffTime).toBe("16:00");
      }
    });

    it("normalizes kickoff day with trailing dot", () => {
      const couponText = `1
Team A
Team B
1

Team A
2.00
x

Uafgjort
3.00
2

Team B
4.00
lør. 16:00
Test League`;

      const result = parseCouponText(couponText);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.matches[0].kickoffDay).toBe("lør");
        expect(result.matches[0].kickoffTime).toBe("16:00");
      }
    });

    it("preserves dots in decimal numbers", () => {
      const couponText = `1
Team A
Team B
1

Team A
1.50
x

Uafgjort
3.00
2

Team B
5.25
lør 16:00
Test League`;

      const result = parseCouponText(couponText);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.matches[0].oddsHome).toBe("1.50");
        expect(result.matches[0].oddsDraw).toBe("3.00");
        expect(result.matches[0].oddsAway).toBe("5.25");
      }
    });

    it("handles integer odds without decimal point", () => {
      const couponText = `1
Team A
Team B
1

Team A
3
x

Uafgjort
2
2

Team B
1
lør 16:00
Test League`;

      const result = parseCouponText(couponText);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.matches[0].oddsHome).toBe("3");
        expect(result.matches[0].oddsDraw).toBe("2");
        expect(result.matches[0].oddsAway).toBe("1");
      }
    });
  });

  describe("case handling", () => {
    it("accepts lowercase x for draw label", () => {
      const couponText = `1
Team A
Team B
1

Team A
2.00
x

Uafgjort
3.00
2

Team B
4.00
lør 16:00
Test League`;

      const result = parseCouponText(couponText);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.matches[0].oddsDraw).toBe("3.00");
      }
    });

    it("accepts uppercase X for draw label", () => {
      const couponText = `1
Team A
Team B
1

Team A
2.00
X

Uafgjort
3.00
2

Team B
4.00
lør 16:00
Test League`;

      const result = parseCouponText(couponText);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.matches[0].oddsDraw).toBe("3.00");
      }
    });

    it("accepts different-case Uafgjort", () => {
      const couponText = `1
Team A
Team B
1

Team A
2.00
x

uafgjort
3.00
2

Team B
4.00
lør 16:00
Test League`;

      const result = parseCouponText(couponText);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.matches[0].oddsDraw).toBe("3.00");
      }
    });

    it("accepts UAFGJORT all uppercase", () => {
      const couponText = `1
Team A
Team B
1

Team A
2.00
x

UAFGJORT
3.00
2

Team B
4.00
lør 16:00
Test League`;

      const result = parseCouponText(couponText);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.matches[0].oddsDraw).toBe("3.00");
      }
    });
  });

  describe("repeated team lines", () => {
    it("tolerates repeated team lines that differ from headers", () => {
      const couponText = `1
Start
Rosenborg
1

Start FC
3.00
x

Uafgjort
3.45
2

Rosenborg BK
2.20
lør 16:00
Test League`;

      const result = parseCouponText(couponText);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should use the header teams, not the repeated lines
        expect(result.matches[0].homeTeam).toBe("Start");
        expect(result.matches[0].awayTeam).toBe("Rosenborg");
      }
    });

    it("handles repeated team lines with completely different text", () => {
      const couponText = `1
Team A
Team B
1

Different Home
2.00
x

Uafgjort
3.00
2

Different Away
4.00
lør 16:00
Test League`;

      const result = parseCouponText(couponText);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.matches[0].homeTeam).toBe("Team A");
        expect(result.matches[0].awayTeam).toBe("Team B");
      }
    });
  });

  describe("partial coupon (< 13 matches)", () => {
    it("accepts a valid 2-match coupon", () => {
      const couponText = `1
Team A
Team B
1

Team A
2.00
x

Uafgjort
3.00
2

Team B
4.00
lør 16:00
Test League
2
Team C
Team D
1

Team C
1.50
x

Uafgjort
3.50
2

Team D
5.00
lør 18:00
Another League`;

      const result = parseCouponText(couponText);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.matches).toHaveLength(2);
        expect(result.matches[0].matchNumber).toBe(1);
        expect(result.matches[1].matchNumber).toBe(2);
      }
    });

    it("accepts a single match coupon", () => {
      const couponText = `1
Single Team
Other Team
1

Single Team
2.00
x

Uafgjort
3.00
2

Other Team
4.00
lør 16:00
Test League`;

      const result = parseCouponText(couponText);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.matches).toHaveLength(1);
        expect(result.matches[0].matchNumber).toBe(1);
      }
    });

    it("accepts a 5-match coupon", () => {
      const couponText = `1
A
B
1

A
2.00
x

Uafgjort
3.00
2

B
4.00
lør 16:00
League 1
2
C
D
1

C
1.50
x

Uafgjort
3.50
2

D
5.00
lør 18:00
League 2
3
E
F
1

E
2.50
x

Uafgjort
2.50
2

F
2.50
lør 20:00
League 3
4
G
H
1

G
1.80
x

Uafgjort
3.20
2

H
4.50
lør 16:30
League 4
5
I
J
1

I
3.00
x

Uafgjort
3.00
2

J
2.20
lør 17:15
League 5`;

      const result = parseCouponText(couponText);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.matches).toHaveLength(5);
        expect(result.matches[4].matchNumber).toBe(5);
        expect(result.matches[4].league).toBe("League 5");
      }
    });
  });

  describe("whitespace handling", () => {
    it("tolerates extra blank lines between lines", () => {
      const couponText = `1
Team A
Team B

1

Team A
2.00

x

Uafgjort
3.00

2

Team B
4.00
lør 16:00
Test League`;

      const result = parseCouponText(couponText);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.matches).toHaveLength(1);
      }
    });

    it("tolerates leading and trailing whitespace on lines", () => {
      const couponText = `  1
  Team A
  Team B
1
  Team A
  2.00
x
  Uafgjort
  3.00
2
  Team B
  4.00
  lør 16:00
  Test League  `;

      const result = parseCouponText(couponText);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.matches[0]).toEqual({
          matchNumber: 1,
          homeTeam: "Team A",
          awayTeam: "Team B",
          oddsHome: "2.00",
          oddsDraw: "3.00",
          oddsAway: "4.00",
          kickoffDay: "lør",
          kickoffTime: "16:00",
          league: "Test League",
        });
      }
    });

    it("handles mixed whitespace and blank lines", () => {
      const couponText = `
1
Team A
Team B
1

Team A
2.00
x

Uafgjort
3.00
2

Team B
4.00
lør 16:00
Test League

`;

      const result = parseCouponText(couponText);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.matches).toHaveLength(1);
      }
    });
  });

  describe("error cases", () => {
    it("returns error for empty input", () => {
      const result = parseCouponText("");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeTruthy();
        expect(typeof result.error).toBe("string");
      }
    });

    it("returns error for whitespace-only input", () => {
      const result = parseCouponText("   \n\n   \n  ");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeTruthy();
      }
    });

    it("returns error when missing Uafgjort line", () => {
      const couponText = `1
Team A
Team B
1

Team A
2.00
x

3.00
2

Team B
4.00
lør 16:00
Test League`;

      const result = parseCouponText(couponText);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("kamp 1");
      }
    });

    it("returns error when missing kickoff line", () => {
      const couponText = `1
Team A
Team B
1

Team A
2.00
x

Uafgjort
3.00
2

Team B
4.00
Test League`;

      const result = parseCouponText(couponText);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("kamp 1");
      }
    });

    it("returns error when kickoff line is malformed (no day prefix)", () => {
      const couponText = `1
Team A
Team B
1

Team A
2.00
x

Uafgjort
3.00
2

Team B
4.00
16:00
Test League`;

      const result = parseCouponText(couponText);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("kamp 1");
      }
    });

    it("returns error when missing league line", () => {
      const couponText = `1
Team A
Team B
1

Team A
2.00
x

Uafgjort
3.00
2

Team B
4.00
lør 16:00`;

      const result = parseCouponText(couponText);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("kamp 1");
      }
    });

    it("returns error when non-numeric odds value", () => {
      const couponText = `1
Team A
Team B
1

Team A
abc
x

Uafgjort
3.00
2

Team B
4.00
lør 16:00
Test League`;

      const result = parseCouponText(couponText);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("kamp 1");
      }
    });

    it("returns error when non-numeric draw odds", () => {
      const couponText = `1
Team A
Team B
1

Team A
2.00
x

Uafgjort
not_a_number
2

Team B
4.00
lør 16:00
Test League`;

      const result = parseCouponText(couponText);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("kamp 1");
      }
    });

    it("returns error when non-numeric away odds", () => {
      const couponText = `1
Team A
Team B
1

Team A
2.00
x

Uafgjort
3.00
2

Team B
invalid
lør 16:00
Test League`;

      const result = parseCouponText(couponText);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("kamp 1");
      }
    });

    it("returns error when match number label is missing", () => {
      const couponText = `Team A
Team B
1

Team A
2.00
x

Uafgjort
3.00
2

Team B
4.00
lør 16:00
Test League`;

      const result = parseCouponText(couponText);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("kamp 1");
      }
    });

    it("returns error when trailing garbage after last complete match", () => {
      const couponText = `1
Team A
Team B
1

Team A
2.00
x

Uafgjort
3.00
2

Team B
4.00
lør 16:00
Test League
Some extra garbage here`;

      const result = parseCouponText(couponText);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("kamp 2");
      }
    });

    it("returns error when 1 label is missing before home odds", () => {
      const couponText = `1
Team A
Team B

Team A
2.00
x

Uafgjort
3.00
2

Team B
4.00
lør 16:00
Test League`;

      const result = parseCouponText(couponText);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("kamp 1");
      }
    });

    it("returns error when x/X label is missing before draw odds", () => {
      const couponText = `1
Team A
Team B
1

Team A
2.00

Uafgjort
3.00
2

Team B
4.00
lør 16:00
Test League`;

      const result = parseCouponText(couponText);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("kamp 1");
      }
    });

    it("returns error when 2 label is missing before away odds", () => {
      const couponText = `1
Team A
Team B
1

Team A
2.00
x

Uafgjort
3.00

Team B
4.00
lør 16:00
Test League`;

      const result = parseCouponText(couponText);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("kamp 1");
      }
    });

    it("returns error when home team line is missing and labels shift", () => {
      const couponText = `1

Team B
1

Team A
2.00
x

Uafgjort
3.00
2

Team B
4.00
lør 16:00
Test League`;

      const result = parseCouponText(couponText);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("kamp 1");
      }
    });

    it("returns error when away team line is missing and labels shift", () => {
      const couponText = `1
Team A

1

Team A
2.00
x

Uafgjort
3.00
2

Team B
4.00
lør 16:00
Test League`;

      const result = parseCouponText(couponText);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("kamp 1");
      }
    });

    it("returns error with correct match number when second match fails", () => {
      const couponText = `1
Team A
Team B
1

Team A
2.00
x

Uafgjort
3.00
2

Team B
4.00
lør 16:00
Test League
2
Team C
Team D
1

Team C
invalid_odds
x

Uafgjort
3.50
2

Team D
5.00
lør 18:00
Another League`;

      const result = parseCouponText(couponText);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("kamp 2");
      }
    });
  });

  describe("match numbering", () => {
    it("assigns sequential match numbers starting from 1", () => {
      const couponText = `1
A
B
1

A
2.00
x

Uafgjort
3.00
2

B
4.00
lør 16:00
L1
2
C
D
1

C
1.50
x

Uafgjort
3.50
2

D
5.00
lør 18:00
L2
3
E
F
1

E
2.50
x

Uafgjort
2.50
2

F
2.50
lør 20:00
L3`;

      const result = parseCouponText(couponText);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.matches[0].matchNumber).toBe(1);
        expect(result.matches[1].matchNumber).toBe(2);
        expect(result.matches[2].matchNumber).toBe(3);
      }
    });
  });

  describe("team name handling", () => {
    it("preserves team names with special characters", () => {
      const couponText = `1
FK Partizan Beograd
OFK Beograd
1

FK Partizan Beograd
1.20
x

Uafgjort
6.00
2

OFK Beograd
12.00
lør 16:00
Test League`;

      const result = parseCouponText(couponText);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.matches[0].homeTeam).toBe("FK Partizan Beograd");
        expect(result.matches[0].awayTeam).toBe("OFK Beograd");
      }
    });

    it("handles team names with numbers in them", () => {
      const couponText = `1
FC 1899 Hoffenheim
Bayern 1860
1

FC 1899 Hoffenheim
2.00
x

Uafgjort
3.00
2

Bayern 1860
4.00
lør 16:00
Test League`;

      const result = parseCouponText(couponText);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.matches[0].homeTeam).toBe("FC 1899 Hoffenheim");
        expect(result.matches[0].awayTeam).toBe("Bayern 1860");
      }
    });

    it("handles team names with multiple spaces", () => {
      const couponText = `1
Real Madrid CF
Manchester United FC
1

Real Madrid CF
2.00
x

Uafgjort
3.00
2

Manchester United FC
4.00
lør 16:00
Test League`;

      const result = parseCouponText(couponText);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.matches[0].homeTeam).toBe("Real Madrid CF");
        expect(result.matches[0].awayTeam).toBe("Manchester United FC");
      }
    });

    it("handles team names with dashes", () => {
      const couponText = `1
PK-35
JJK-Futis
1

PK-35
2.00
x

Uafgjort
3.00
2

JJK-Futis
4.00
lør 16:00
Test League`;

      const result = parseCouponText(couponText);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.matches[0].homeTeam).toBe("PK-35");
        expect(result.matches[0].awayTeam).toBe("JJK-Futis");
      }
    });
  });

  describe("league handling", () => {
    it("preserves league names with numbers and dots", () => {
      const couponText = `1
Team A
Team B
1

Team A
2.00
x

Uafgjort
3.00
2

Team B
4.00
lør 16:00
Bulgarien 1. division`;

      const result = parseCouponText(couponText);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.matches[0].league).toBe("Bulgarien 1. division");
      }
    });

    it("preserves league names with multiple spaces", () => {
      const couponText = `1
Team A
Team B
1

Team A
2.00
x

Uafgjort
3.00
2

Team B
4.00
lør 16:00
Norway Tippeligaen Super Elite`;

      const result = parseCouponText(couponText);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.matches[0].league).toBe("Norway Tippeligaen Super Elite");
      }
    });

    it("preserves league names with special characters", () => {
      const couponText = `1
Team A
Team B
1

Team A
2.00
x

Uafgjort
3.00
2

Team B
4.00
lør 16:00
Süper Lig (Türkiye)`;

      const result = parseCouponText(couponText);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.matches[0].league).toBe("Süper Lig (Türkiye)");
      }
    });
  });

  describe("kickoff handling", () => {
    it("normalizes all weekday abbreviations correctly", () => {
      const tests = [
        { input: "man 16:00", expectedDay: "man" },
        { input: "tir 16:00", expectedDay: "tir" },
        { input: "ons 16:00", expectedDay: "ons" },
        { input: "tor 16:00", expectedDay: "tor" },
        { input: "fre 16:00", expectedDay: "fre" },
        { input: "lør 16:00", expectedDay: "lør" },
        { input: "søn 16:00", expectedDay: "søn" },
      ];

      tests.forEach(({ input, expectedDay }) => {
        const couponText = `1
Team A
Team B
1

Team A
2.00
x

Uafgjort
3.00
2

Team B
4.00
${input}
Test League`;

        const result = parseCouponText(couponText);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.matches[0].kickoffDay).toBe(expectedDay);
        }
      });
    });

    it("normalizes various time formats", () => {
      const tests = [
        { input: "lør 16:00", expectedTime: "16:00" },
        { input: "lør 16.00", expectedTime: "16:00" },
        { input: "lør. 16:00", expectedTime: "16:00" },
        { input: "lør. 16.00", expectedTime: "16:00" },
        { input: "lør 9:00", expectedTime: "09:00" },
        { input: "lør 9.00", expectedTime: "09:00" },
      ];

      tests.forEach(({ input, expectedTime }) => {
        const couponText = `1
Team A
Team B
1

Team A
2.00
x

Uafgjort
3.00
2

Team B
4.00
${input}
Test League`;

        const result = parseCouponText(couponText);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.matches[0].kickoffTime).toBe(expectedTime);
        }
      });
    });
  });
});

describe("resolveKickoff", () => {
  describe("basic functionality", () => {
    it("resolves kickoff to correct datetime-local string format", () => {
      const result = resolveKickoff("lør", "16:00", new Date(2026, 6, 15));
      expect(result).toBe("2026-07-18T16:00");
    });

    it("returns null for unknown weekday abbreviation", () => {
      const result = resolveKickoff("abc", "16:00", new Date(2026, 6, 15));
      expect(result).toBeNull();
    });

    it("returns null for empty weekday", () => {
      const result = resolveKickoff("", "16:00", new Date(2026, 6, 15));
      expect(result).toBeNull();
    });
  });

  describe("weekday resolution", () => {
    it("rolls from Wednesday to next Saturday", () => {
      // July 15, 2026 is a Wednesday
      const wed = new Date(2026, 6, 15);
      const result = resolveKickoff("lør", "16:00", wed);
      expect(result).toBe("2026-07-18T16:00");
    });

    it("returns same day if reference is already on target weekday", () => {
      // July 18, 2026 is a Saturday
      const sat = new Date(2026, 6, 18);
      const result = resolveKickoff("lør", "16:00", sat);
      expect(result).toBe("2026-07-18T16:00");
    });

    it("rolls from Wednesday to next Monday", () => {
      // July 15, 2026 is a Wednesday
      const wed = new Date(2026, 6, 15);
      const result = resolveKickoff("man", "10:00", wed);
      expect(result).toBe("2026-07-20T10:00");
    });

    it("rolls from Wednesday to next Tuesday", () => {
      // July 15, 2026 is a Wednesday
      const wed = new Date(2026, 6, 15);
      const result = resolveKickoff("tir", "14:00", wed);
      expect(result).toBe("2026-07-21T14:00");
    });

    it("returns same day if reference is Wednesday and target is Wednesday", () => {
      // July 15, 2026 is a Wednesday; "ons" is also Wednesday
      // So it should return the same day (on or after)
      const wed = new Date(2026, 6, 15);
      const result = resolveKickoff("ons", "15:00", wed);
      expect(result).toBe("2026-07-15T15:00");
    });

    it("rolls from Wednesday to next Thursday", () => {
      // July 15, 2026 is a Wednesday
      const wed = new Date(2026, 6, 15);
      const result = resolveKickoff("tor", "18:00", wed);
      expect(result).toBe("2026-07-16T18:00");
    });

    it("rolls from Wednesday to next Friday", () => {
      // July 15, 2026 is a Wednesday
      const wed = new Date(2026, 6, 15);
      const result = resolveKickoff("fre", "20:00", wed);
      expect(result).toBe("2026-07-17T20:00");
    });

    it("rolls from Wednesday to next Sunday", () => {
      // July 15, 2026 is a Wednesday
      const wed = new Date(2026, 6, 15);
      const result = resolveKickoff("søn", "19:00", wed);
      expect(result).toBe("2026-07-19T19:00");
    });
  });

  describe("all weekday abbreviations", () => {
    // Use a reference date we know the day of: July 15, 2026 is Wednesday
    const refDate = new Date(2026, 6, 15);
    const expectedResults: Record<string, string> = {
      søn: "2026-07-19T10:00", // next Sunday (4 days after)
      man: "2026-07-20T10:00", // next Monday (5 days after)
      tir: "2026-07-21T10:00", // next Tuesday (6 days after)
      ons: "2026-07-15T10:00", // same day - Wednesday on Wednesday (0 days, or same day)
      tor: "2026-07-16T10:00", // next Thursday (1 day after)
      fre: "2026-07-17T10:00", // next Friday (2 days after)
      lør: "2026-07-18T10:00", // next Saturday (3 days after)
    };

    Object.entries(expectedResults).forEach(([day, expected]) => {
      it(`resolves ${day} correctly`, () => {
        const result = resolveKickoff(day, "10:00", refDate);
        expect(result).toBe(expected);
      });
    });
  });

  describe("time formatting", () => {
    // July 15, 2026 is Wednesday
    const wed = new Date(2026, 6, 15);

    it("handles single-digit hour with zero-padding", () => {
      const result = resolveKickoff("lør", "09:30", wed);
      expect(result).toBe("2026-07-18T09:30");
    });

    it("handles various minute combinations", () => {
      const result1 = resolveKickoff("lør", "16:15", wed);
      expect(result1).toBe("2026-07-18T16:15");

      const result2 = resolveKickoff("lør", "20:45", wed);
      expect(result2).toBe("2026-07-18T20:45");
    });
  });

  describe("year/month boundary cases", () => {
    it("handles month boundary (late June to early July)", () => {
      // June 24, 2026 is Wednesday, next Saturday is June 27
      const jun24 = new Date(2026, 5, 24);
      const result = resolveKickoff("lør", "16:00", jun24);
      expect(result).toBe("2026-06-27T16:00");
    });

    it("handles year boundary (late December to early January)", () => {
      // December 23, 2025 is Wednesday, next Saturday is December 27
      const dec23 = new Date(2025, 11, 23);
      const result = resolveKickoff("lør", "16:00", dec23);
      expect(result).toBe("2025-12-27T16:00");
    });

    it("handles year boundary crossing (December to January)", () => {
      // December 29, 2025 is Monday; asking for Monday should return the same day (on or after)
      const dec29 = new Date(2025, 11, 29);
      const result = resolveKickoff("man", "16:00", dec29);
      expect(result).toBe("2025-12-29T16:00");
    });
  });

  describe("case sensitivity", () => {
    it("is case-insensitive for weekday abbreviations", () => {
      const wed = new Date(2026, 6, 15);

      // lowercase should work
      const resultLower = resolveKickoff("lør", "16:00", wed);
      expect(resultLower).toBe("2026-07-18T16:00");

      // uppercase should also work (implementation calls toLowerCase)
      const resultUpper = resolveKickoff("LØR", "16:00", wed);
      expect(resultUpper).toBe("2026-07-18T16:00");
    });
  });

  describe("time preservation", () => {
    it("preserves exact kickoff time regardless of date calculation", () => {
      const wed = new Date(2026, 6, 15);

      const times = ["08:00", "12:30", "15:45", "20:15"];
      times.forEach((time) => {
        const result = resolveKickoff("lør", time, wed);
        expect(result).toBe(`2026-07-18T${time}`);
      });
    });
  });
});

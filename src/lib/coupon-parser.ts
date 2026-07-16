export interface ParsedCouponMatch {
  matchNumber: number;
  homeTeam: string;
  awayTeam: string;
  oddsHome: string; // decimal string normalized to "." separator, e.g. "3.00"
  oddsDraw: string;
  oddsAway: string;
  kickoffDay: string; // lowercase abbreviation without dot, e.g. "lør"
  kickoffTime: string; // normalized "HH:mm" with ":" separator, e.g. "16:00"
  league: string;
}

export type CouponParseResult =
  | { ok: true; matches: ParsedCouponMatch[] }
  | { ok: false; error: string };

export function parseCouponText(text: string): CouponParseResult {
  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (lines.length === 0) {
    return {
      ok: false,
      error: 'Ingen tekst at fortolke',
    };
  }

  const matches: ParsedCouponMatch[] = [];
  let lineIndex = 0;
  let matchNumber = 1;

  const normalizeOdds = (oddsStr: string): string => {
    return oddsStr.replace(',', '.');
  };

  const parseOdds = (oddsStr: string): string | null => {
    const normalized = normalizeOdds(oddsStr);
    if (/^\d+([.]\d+)?$/.test(normalized)) {
      return normalized;
    }
    return null;
  };

  const parseKickoff = (kickoffStr: string): { day: string; time: string } | null => {
    const match = kickoffStr.match(/^(man|tir|ons|tor|fre|lør|søn)\.?\s+(\d{1,2})[:.]\d{2}$/i);
    if (!match) {
      return null;
    }
    const day = match[1].toLowerCase().replace('.', '');
    const timeMatch = kickoffStr.match(/(\d{1,2})[:.]\d{2}$/);
    if (!timeMatch) {
      return null;
    }
    const timePart = kickoffStr.match(/(\d{1,2}[:.]\d{2})$/);
    if (!timePart) {
      return null;
    }
    const normalizedTime = timePart[1].replace(/[.,]/g, ':');
    const [hourStr, minStr] = normalizedTime.split(':');
    const hour = parseInt(hourStr, 10);
    const min = parseInt(minStr, 10);
    const paddedHour = String(hour).padStart(2, '0');
    const paddedMin = String(min).padStart(2, '0');
    return { day, time: `${paddedHour}:${paddedMin}` };
  };

  while (lineIndex < lines.length) {
    const currentMatchNumber = matchNumber;

    // Expect match number line
    if (lines[lineIndex] !== String(currentMatchNumber)) {
      return {
        ok: false,
        error: `Kunne ikke fortolke kamp ${currentMatchNumber} – uventet linje "${lines[lineIndex]}"`,
      };
    }
    lineIndex++;

    // Expect home team
    if (lineIndex >= lines.length) {
      return {
        ok: false,
        error: `Kunne ikke fortolke kamp ${currentMatchNumber} – hjemmeholdet mangler`,
      };
    }
    const homeTeam = lines[lineIndex];
    lineIndex++;

    // Expect away team
    if (lineIndex >= lines.length) {
      return {
        ok: false,
        error: `Kunne ikke fortolke kamp ${currentMatchNumber} – udeholdet mangler`,
      };
    }
    const awayTeam = lines[lineIndex];
    lineIndex++;

    // Expect "1" label
    if (lineIndex >= lines.length) {
      return {
        ok: false,
        error: `Kunne ikke fortolke kamp ${currentMatchNumber} – odds for "1" mangler`,
      };
    }
    if (lines[lineIndex] !== '1') {
      return {
        ok: false,
        error: `Kunne ikke fortolke kamp ${currentMatchNumber} – uventet linje "${lines[lineIndex]}"`,
      };
    }
    lineIndex++;

    // Expect home team repeated (free text, consume but do not validate)
    if (lineIndex >= lines.length) {
      return {
        ok: false,
        error: `Kunne ikke fortolke kamp ${currentMatchNumber} – hjemmeholdet mangler`,
      };
    }
    lineIndex++;

    // Expect odds for "1"
    if (lineIndex >= lines.length) {
      return {
        ok: false,
        error: `Kunne ikke fortolke kamp ${currentMatchNumber} – oddsværdi for "1" mangler`,
      };
    }
    const oddsHome = parseOdds(lines[lineIndex]);
    if (!oddsHome) {
      return {
        ok: false,
        error: `Kunne ikke fortolke kamp ${currentMatchNumber} – uventet linje "${lines[lineIndex]}"`,
      };
    }
    lineIndex++;

    // Expect "X" label
    if (lineIndex >= lines.length) {
      return {
        ok: false,
        error: `Kunne ikke fortolke kamp ${currentMatchNumber} – odds for "X" mangler`,
      };
    }
    const xLabel = lines[lineIndex].toUpperCase();
    if (xLabel !== 'X') {
      return {
        ok: false,
        error: `Kunne ikke fortolke kamp ${currentMatchNumber} – uventet linje "${lines[lineIndex]}"`,
      };
    }
    lineIndex++;

    // Expect "Uafgjort" label (case-insensitive)
    if (lineIndex >= lines.length) {
      return {
        ok: false,
        error: `Kunne ikke fortolke kamp ${currentMatchNumber} – odds for "X" mangler`,
      };
    }
    if (lines[lineIndex].toLowerCase() !== 'uafgjort') {
      return {
        ok: false,
        error: `Kunne ikke fortolke kamp ${currentMatchNumber} – uventet linje "${lines[lineIndex]}"`,
      };
    }
    lineIndex++;

    // Expect odds for "X"
    if (lineIndex >= lines.length) {
      return {
        ok: false,
        error: `Kunne ikke fortolke kamp ${currentMatchNumber} – oddsværdi for "X" mangler`,
      };
    }
    const oddsDraw = parseOdds(lines[lineIndex]);
    if (!oddsDraw) {
      return {
        ok: false,
        error: `Kunne ikke fortolke kamp ${currentMatchNumber} – uventet linje "${lines[lineIndex]}"`,
      };
    }
    lineIndex++;

    // Expect "2" label
    if (lineIndex >= lines.length) {
      return {
        ok: false,
        error: `Kunne ikke fortolke kamp ${currentMatchNumber} – odds for "2" mangler`,
      };
    }
    if (lines[lineIndex] !== '2') {
      return {
        ok: false,
        error: `Kunne ikke fortolke kamp ${currentMatchNumber} – uventet linje "${lines[lineIndex]}"`,
      };
    }
    lineIndex++;

    // Expect away team repeated (free text, consume but do not validate)
    if (lineIndex >= lines.length) {
      return {
        ok: false,
        error: `Kunne ikke fortolke kamp ${currentMatchNumber} – udeholdet mangler`,
      };
    }
    lineIndex++;

    // Expect odds for "2"
    if (lineIndex >= lines.length) {
      return {
        ok: false,
        error: `Kunne ikke fortolke kamp ${currentMatchNumber} – oddsværdi for "2" mangler`,
      };
    }
    const oddsAway = parseOdds(lines[lineIndex]);
    if (!oddsAway) {
      return {
        ok: false,
        error: `Kunne ikke fortolke kamp ${currentMatchNumber} – uventet linje "${lines[lineIndex]}"`,
      };
    }
    lineIndex++;

    // Expect kickoff (day and time)
    if (lineIndex >= lines.length) {
      return {
        ok: false,
        error: `Kunne ikke fortolke kamp ${currentMatchNumber} – kampstarttidspunkt mangler`,
      };
    }
    const kickoffParsed = parseKickoff(lines[lineIndex]);
    if (!kickoffParsed) {
      return {
        ok: false,
        error: `Kunne ikke fortolke kamp ${currentMatchNumber} – uventet linje "${lines[lineIndex]}"`,
      };
    }
    lineIndex++;

    // Expect league
    if (lineIndex >= lines.length) {
      return {
        ok: false,
        error: `Kunne ikke fortolke kamp ${currentMatchNumber} – liga mangler`,
      };
    }
    const league = lines[lineIndex];
    if (league.length === 0) {
      return {
        ok: false,
        error: `Kunne ikke fortolke kamp ${currentMatchNumber} – liga mangler`,
      };
    }
    lineIndex++;

    matches.push({
      matchNumber: currentMatchNumber,
      homeTeam,
      awayTeam,
      oddsHome,
      oddsDraw,
      oddsAway,
      kickoffDay: kickoffParsed.day,
      kickoffTime: kickoffParsed.time,
      league,
    });

    matchNumber++;
  }

  if (matches.length === 0) {
    return {
      ok: false,
      error: 'Ingen kampe fundet',
    };
  }

  return {
    ok: true,
    matches,
  };
}

export function resolveKickoff(kickoffDay: string, kickoffTime: string, reference: Date): string | null {
  const dayMap: Record<string, number> = {
    'søn': 0,
    'man': 1,
    'tir': 2,
    'ons': 3,
    'tor': 4,
    'fre': 5,
    'lør': 6,
  };

  const targetDayOfWeek = dayMap[kickoffDay.toLowerCase()];
  if (targetDayOfWeek === undefined) {
    return null;
  }

  const date = new Date(reference);
  date.setHours(0, 0, 0, 0);

  const currentDayOfWeek = date.getDay();
  let daysToAdd = targetDayOfWeek - currentDayOfWeek;
  if (daysToAdd < 0) {
    daysToAdd += 7;
  }

  date.setDate(date.getDate() + daysToAdd);

  const [hour, min] = kickoffTime.split(':').map(s => parseInt(s, 10));
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const paddedHour = pad(hour);
  const paddedMin = pad(min);

  return `${year}-${month}-${day}T${paddedHour}:${paddedMin}`;
}

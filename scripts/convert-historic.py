#!/usr/bin/env python3
"""
Convert historic Tips 13 Excel files to JSON.

This script parses Excel files (Miniputterne YYYY.xlsx) containing season data
in the "Enkeltrækker" sheet and exports them as JSON with computed statistics.

Requires: openpyxl 3.1.5+

Usage:
  python scripts/convert-historic.py
"""

import json
import sys
from pathlib import Path
from typing import Optional

try:
    import openpyxl
except ImportError:
    print("Error: openpyxl is required. Install with: pip install openpyxl", file=sys.stderr)
    sys.exit(1)


# Constants
PLAYERS = ["JBA", "MJO", "SBH", "MITO", "SOC", "BVG"]
YEARS = list(range(2017, 2026))


def normalize_value(val: any) -> str | None:
    """Normalize result/pick values to '1', 'X', '2', or None."""
    if val is None:
        return None
    if isinstance(val, str):
        if val.lower() == 'x':
            return 'X'
        if val in ('1', '2'):
            return val
    if isinstance(val, int):
        if val in (1, 2):
            return str(val)
    raise ValueError(f"Invalid value: {val}")


def parse_week_block(ws: openpyxl.worksheet.worksheet.Worksheet,
                     ws_data: openpyxl.worksheet.worksheet.Worksheet,
                     week_start_row: int) -> dict:
    """
    Parse a single week block (13 matches + summary).

    Args:
        ws: The worksheet (formula version, for finding labels)
        ws_data: The worksheet (data_only=True version, for reading computed values)
        week_start_row: Row number where "Uge NN" appears (1-indexed)

    Returns:
        dict with week data
    """
    week_label = ws.cell(row=week_start_row, column=1).value
    if not isinstance(week_label, str) or not week_label.startswith('Uge'):
        raise ValueError(f"Expected week label at row {week_start_row}")

    week_number = int(week_label.split()[1])

    matches = []
    for match_idx in range(13):
        row_num = week_start_row + match_idx
        match_number = match_idx + 1

        # Extract match data (use data_only version to get computed values)
        result = ws_data.cell(row=row_num, column=2).value  # Column B
        fedt_1 = ws_data.cell(row=row_num, column=4).value  # Column D
        fedt_x = ws_data.cell(row=row_num, column=5).value  # Column E
        fedt_2 = ws_data.cell(row=row_num, column=6).value  # Column F

        # Picks for each player (columns H-M = 8-13)
        picks = {}
        for player_idx, player in enumerate(PLAYERS):
            pick_val = ws_data.cell(row=row_num, column=8 + player_idx).value
            picks[player] = normalize_value(pick_val)

        # Validate fedt percentages
        if fedt_1 is not None and not isinstance(fedt_1, int):
            raise ValueError(f"Row {row_num}: fedt_1 should be int, got {type(fedt_1)}: {fedt_1}")
        if fedt_x is not None and not isinstance(fedt_x, int):
            raise ValueError(f"Row {row_num}: fedt_x should be int, got {type(fedt_x)}: {fedt_x}")
        if fedt_2 is not None and not isinstance(fedt_2, int):
            raise ValueError(f"Row {row_num}: fedt_2 should be int, got {type(fedt_2)}: {fedt_2}")

        match = {
            "matchNumber": match_number,
            "result": normalize_value(result),
            "fedtPct": {
                "home": fedt_1,
                "draw": fedt_x,
                "away": fedt_2,
            },
            "picks": picks,
        }
        matches.append(match)

    # Summary row is at week_start_row + 13
    summary_row = week_start_row + 13

    # Extract correct counts for each player (columns H-M = 8-13)
    expected = {}
    for player_idx, player in enumerate(PLAYERS):
        correct_count = ws_data.cell(row=summary_row, column=8 + player_idx).value
        # For fedt score, we need to load with data_only=True, but we'll compute it later
        expected[player] = {
            "points": correct_count,
            "fedt": None,  # Will be filled later
        }

    return {
        "weekNumber": week_number,
        "matches": matches,
        "expected": expected,
        "summary_row": summary_row,  # For later fedt lookup
    }


def compute_fedt(player_picks: dict, matches: list) -> float:
    """
    Compute fedt score for a player based on their actual picks.

    Formula: (sumChosen - sumMin) / (sumMax - sumMin) * 100
    where:
      - sumChosen = sum of fedt percentages for the outcome the player picked
      - sumMin = sum of minimum fedt percentage in each match (only for matches player picked)
      - sumMax = sum of maximum fedt percentage in each match (only for matches player picked)
    """
    sum_chosen = 0
    sum_min = 0
    sum_max = 0

    for match in matches:
        player_pick = player_picks[match["matchNumber"] - 1]  # Get pick for this match
        if player_pick is None:
            # Skip this match if player didn't pick
            continue

        fedt = match["fedtPct"]
        home = fedt["home"]
        draw = fedt["draw"]
        away = fedt["away"]

        # Get the fedt value for the outcome player picked
        if player_pick == "1":
            sum_chosen += home
        elif player_pick == "X":
            sum_chosen += draw
        elif player_pick == "2":
            sum_chosen += away

        # Min and max for this match
        values = [home, draw, away]
        sum_min += min(values)
        sum_max += max(values)

    if sum_max == sum_min:
        # All fedt values are the same for all matches the player picked
        return 100.0

    fedt_score = (sum_chosen - sum_min) / (sum_max - sum_min) * 100
    return fedt_score


def process_file(file_path: Path) -> dict:
    """Parse a single Excel file and return the converted data."""
    print(f"Processing {file_path.name}...", end=" ", flush=True)

    year = int(file_path.stem.split()[-1])

    # Load workbook
    wb = openpyxl.load_workbook(file_path, data_only=False)
    ws = wb["Enkeltrækker"]

    # Also load data_only version for computed formulas
    wb_data = openpyxl.load_workbook(file_path, data_only=True)
    ws_data = wb_data["Enkeltrækker"]

    # Find all week labels
    weeks = []
    for row_num in range(1, ws.max_row + 1):
        cell = ws.cell(row=row_num, column=1)
        if isinstance(cell.value, str) and cell.value.startswith("Uge"):
            weeks.append((row_num, cell.value))

    if len(weeks) != 12:
        raise ValueError(f"Expected 12 weeks, found {len(weeks)}")

    # Validate header row
    header_players = []
    for player_idx in range(6):
        player_name = ws.cell(row=1, column=8 + player_idx).value
        if player_name != PLAYERS[player_idx]:
            raise ValueError(f"Player header mismatch: expected {PLAYERS[player_idx]}, got {player_name}")
        header_players.append(player_name)

    # Parse all weeks
    rounds = []
    total_matches = 0
    all_divergences = []

    for week_idx, (week_row, _) in enumerate(weeks):
        round_data = parse_week_block(ws, ws_data, week_row)
        summary_row = round_data.pop("summary_row")

        # Count matches
        total_matches += len(round_data["matches"])

        # Fill in fedt scores from data_only workbook
        for player_idx, player in enumerate(PLAYERS):
            fedt_value = ws_data.cell(row=summary_row, column=24 + player_idx).value
            round_data["expected"][player]["fedt"] = fedt_value

        # Check for fedt divergences
        divergences = []
        for player_idx, player in enumerate(PLAYERS):
            # Get player's picks for this week
            player_picks = [match["picks"][player] for match in round_data["matches"]]

            # Recompute fedt
            computed_fedt = compute_fedt(player_picks, round_data["matches"])
            sheet_fedt = round_data["expected"][player]["fedt"]

            if sheet_fedt is not None and abs(computed_fedt - sheet_fedt) > 0.01:
                divergences.append(player)
                print(f"\nDIVERGENCE at {year} Uge {round_data['weekNumber']} {player}: computed={computed_fedt:.6f}, sheet={sheet_fedt:.6f}")

        if divergences:
            round_data["fedtDivergences"] = divergences
            all_divergences.extend([(year, round_data["weekNumber"], p) for p in divergences])

        rounds.append(round_data)

    # Compute season stats
    expected_season = {}
    for player in PLAYERS:
        total_points = sum(r["expected"][player]["points"] for r in rounds)
        avg_fedt = sum(r["expected"][player]["fedt"] for r in rounds) / 12
        expected_season[player] = {
            "points": total_points,
            "fedt": avg_fedt,
        }

    # Cross-check season average fedt against sheet row 189
    for player_idx, player in enumerate(PLAYERS):
        sheet_avg = ws_data.cell(row=189, column=24 + player_idx).value
        computed_avg = expected_season[player]["fedt"]
        if sheet_avg is not None and abs(computed_avg - sheet_avg) > 1e-6:
            raise ValueError(
                f"Season average fedt mismatch for {player}: "
                f"computed={computed_avg}, sheet={sheet_avg}"
            )

    data = {
        "year": year,
        "players": PLAYERS,
        "rounds": rounds,
        "expectedSeason": expected_season,
    }

    print(f"OK ({total_matches} matches, divergences: {len(all_divergences)})")

    return data, all_divergences


def main():
    """Main entry point."""
    script_dir = Path(__file__).parent
    repo_root = script_dir.parent
    data_dir = repo_root / "historic-data"
    output_dir = data_dir / "json"

    output_dir.mkdir(parents=True, exist_ok=True)

    all_divergences = []

    # Process each year
    for year in YEARS:
        input_file = data_dir / f"Miniputterne {year}.xlsx"
        if not input_file.exists():
            print(f"Warning: {input_file} not found, skipping", file=sys.stderr)
            continue

        try:
            data, divergences = process_file(input_file)
            all_divergences.extend(divergences)

            # Write JSON output
            output_file = output_dir / f"{year}.json"
            with open(output_file, "w") as f:
                json.dump(data, f, indent=2, sort_keys=True)
                f.write("\n")  # Trailing newline

        except Exception as e:
            print(f"FAILED: {e}", file=sys.stderr)
            return 1

    # Verify we processed all 9 years
    if len(list(output_dir.glob("*.json"))) != 9:
        print(f"Error: Expected 9 JSON files, found {len(list(output_dir.glob('*.json')))}", file=sys.stderr)
        return 1

    # Final summary
    print("\n" + "=" * 60)
    print(f"Successfully processed {len(YEARS)} seasons")
    print(f"Total divergences found: {len(all_divergences)}")
    if all_divergences:
        for year, week, player in all_divergences:
            print(f"  - {year} Uge {week}: {player}")
    print("=" * 60)

    return 0


if __name__ == "__main__":
    sys.exit(main())

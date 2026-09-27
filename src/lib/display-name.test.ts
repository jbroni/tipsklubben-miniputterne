import { describe, it, expect } from "vitest";
import { firstName, buildShortNames, withShortName, nameCode, sortByName, compareByName, type NamedUser } from "./display-name";

describe("firstName", () => {
  it("extracts first token from multi-part name", () => {
    expect(firstName("Jesper Broni Andersen")).toBe("Jesper");
  });

  it("handles surrounding whitespace (spaces and tabs)", () => {
    expect(firstName("  Jesper Broni Andersen  ")).toBe("Jesper");
    expect(firstName("\tJesper Broni Andersen\t")).toBe("Jesper");
  });

  it("handles internal extra whitespace (multiple spaces)", () => {
    expect(firstName("Jesper  Broni   Andersen")).toBe("Jesper");
  });

  it("handles mixed internal whitespace (spaces and tabs)", () => {
    expect(firstName("Jesper\t\tBroni  Andersen")).toBe("Jesper");
  });

  it("returns single token as-is (historic initials)", () => {
    expect(firstName("JBA")).toBe("JBA");
  });

  it("returns single token with surrounding whitespace", () => {
    expect(firstName("  JES  ")).toBe("JES");
  });

  it("returns empty string for empty input", () => {
    expect(firstName("")).toBe("");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(firstName("   ")).toBe("");
    expect(firstName("\t\t")).toBe("");
    expect(firstName("  \t  ")).toBe("");
  });

  it("handles single character", () => {
    expect(firstName("A")).toBe("A");
  });

  it("handles name with leading whitespace and single token", () => {
    expect(firstName("  MortenBech")).toBe("MortenBech");
  });
});

describe("buildShortNames", () => {
  it("returns empty map for empty input", () => {
    const result = buildShortNames([]);
    expect(result.size).toBe(0);
  });

  it("returns user with first name when only one user", () => {
    const users: NamedUser[] = [{ id: "1", displayName: "Alice Smith" }];
    const result = buildShortNames(users);
    expect(result.get("1")).toBe("Alice");
  });

  it("returns users with first names when all first names are unique", () => {
    const users: NamedUser[] = [
      { id: "1", displayName: "Alice Smith" },
      { id: "2", displayName: "Bob Jones" },
      { id: "3", displayName: "Charlie Brown" },
    ];
    const result = buildShortNames(users);
    expect(result.size).toBe(3);
    expect(result.get("1")).toBe("Alice");
    expect(result.get("2")).toBe("Bob");
    expect(result.get("3")).toBe("Charlie");
  });

  it("resolves collisions with initials from last token", () => {
    const users: NamedUser[] = [
      { id: "1", displayName: "Morten Andersen" },
      { id: "2", displayName: "Morten Bech" },
    ];
    const result = buildShortNames(users);
    expect(result.get("1")).toBe("Morten A.");
    expect(result.get("2")).toBe("Morten B.");
  });

  it("uses initial from LAST token, not first of surname", () => {
    const users: NamedUser[] = [
      { id: "1", displayName: "Anna Marie Holm" },
    ];
    const result = buildShortNames(users);
    expect(result.get("1")).toBe("Anna");
  });

  it("uses initial from LAST token in multi-token names", () => {
    const users: NamedUser[] = [
      { id: "1", displayName: "Anna Marie Holm" },
      { id: "2", displayName: "Anna Betty Smith" },
    ];
    const result = buildShortNames(users);
    expect(result.get("1")).toBe("Anna H.");
    expect(result.get("2")).toBe("Anna S.");
  });

  it("falls back to full name when initials also collide", () => {
    const users: NamedUser[] = [
      { id: "1", displayName: "Morten Andersen" },
      { id: "2", displayName: "Morten Arnesen" },
    ];
    const result = buildShortNames(users);
    expect(result.get("1")).toBe("Morten Andersen");
    expect(result.get("2")).toBe("Morten Arnesen");
  });

  it("single-token name in collision falls back to full name", () => {
    const users: NamedUser[] = [
      { id: "1", displayName: "Morten" },
      { id: "2", displayName: "Morten Bech" },
    ];
    const result = buildShortNames(users);
    expect(result.get("1")).toBe("Morten");
    expect(result.get("2")).toBe("Morten B.");
  });

  it("single-token name in collision has no initial to use", () => {
    const users: NamedUser[] = [
      { id: "1", displayName: "Morten" },
      { id: "2", displayName: "Morten" },
    ];
    const result = buildShortNames(users);
    expect(result.get("1")).toBe("Morten");
    expect(result.get("2")).toBe("Morten");
  });

  it("non-colliding user keeps first name when others collide", () => {
    const users: NamedUser[] = [
      { id: "1", displayName: "Alice Smith" },
      { id: "2", displayName: "Bob Jones" },
      { id: "3", displayName: "Bob Brown" },
    ];
    const result = buildShortNames(users);
    expect(result.get("1")).toBe("Alice");
    expect(result.get("2")).toBe("Bob J.");
    expect(result.get("3")).toBe("Bob B.");
  });

  it("maps empty displayName to empty string", () => {
    const users: NamedUser[] = [
      { id: "1", displayName: "" },
      { id: "2", displayName: "Alice Smith" },
    ];
    const result = buildShortNames(users);
    expect(result.get("1")).toBe("");
    expect(result.get("2")).toBe("Alice");
  });

  it("maps whitespace-only displayName to empty string", () => {
    const users: NamedUser[] = [
      { id: "1", displayName: "   " },
      { id: "2", displayName: "Alice Smith" },
    ];
    const result = buildShortNames(users);
    expect(result.get("1")).toBe("");
    expect(result.get("2")).toBe("Alice");
  });

  it("is order-independent: same users in reversed order give equal map", () => {
    const users: NamedUser[] = [
      { id: "1", displayName: "Alice Smith" },
      { id: "2", displayName: "Bob Jones" },
      { id: "3", displayName: "Bob Brown" },
    ];
    const usersReversed: NamedUser[] = [
      { id: "3", displayName: "Bob Brown" },
      { id: "2", displayName: "Bob Jones" },
      { id: "1", displayName: "Alice Smith" },
    ];

    const result = buildShortNames(users);
    const resultReversed = buildShortNames(usersReversed);

    expect(result.get("1")).toBe(resultReversed.get("1"));
    expect(result.get("2")).toBe(resultReversed.get("2"));
    expect(result.get("3")).toBe(resultReversed.get("3"));
  });

  it("handles case-insensitive collision detection", () => {
    const users: NamedUser[] = [
      { id: "1", displayName: "morten x" },
      { id: "2", displayName: "Morten Y" },
    ];
    const result = buildShortNames(users);
    expect(result.get("1")).toBe("morten X.");
    expect(result.get("2")).toBe("Morten Y.");
  });

  it("preserves case of original name in output", () => {
    const users: NamedUser[] = [
      { id: "1", displayName: "morten andersen" },
      { id: "2", displayName: "MORTEN BECH" },
    ];
    const result = buildShortNames(users);
    expect(result.get("1")).toBe("morten A.");
    expect(result.get("2")).toBe("MORTEN B.");
  });

  it("historic placeholders stay unchanged (JBA)", () => {
    const users: NamedUser[] = [
      { id: "1", displayName: "JBA" },
    ];
    const result = buildShortNames(users);
    expect(result.get("1")).toBe("JBA");
  });

  it("historic placeholders stay unchanged (JES)", () => {
    const users: NamedUser[] = [
      { id: "1", displayName: "JES" },
    ];
    const result = buildShortNames(users);
    expect(result.get("1")).toBe("JES");
  });

  it("three-way collision resolved with initials", () => {
    const users: NamedUser[] = [
      { id: "1", displayName: "John Smith" },
      { id: "2", displayName: "John Anderson" },
      { id: "3", displayName: "John Blake" },
    ];
    const result = buildShortNames(users);
    expect(result.get("1")).toBe("John S.");
    expect(result.get("2")).toBe("John A.");
    expect(result.get("3")).toBe("John B.");
  });

  it("returns Map type", () => {
    const users: NamedUser[] = [{ id: "1", displayName: "Alice" }];
    const result = buildShortNames(users);
    expect(result).toBeInstanceOf(Map);
  });

  it("handles users with leading/trailing whitespace in displayName", () => {
    const users: NamedUser[] = [
      { id: "1", displayName: "  Alice Smith  " },
      { id: "2", displayName: "Alice Jones" },
    ];
    const result = buildShortNames(users);
    expect(result.get("1")).toBe("Alice S.");
    expect(result.get("2")).toBe("Alice J.");
  });

  it("partial collision: some users have unique first names, others collide", () => {
    const users: NamedUser[] = [
      { id: "1", displayName: "Alice Smith" },
      { id: "2", displayName: "Bob Jones" },
      { id: "3", displayName: "Bob Anderson" },
      { id: "4", displayName: "Charlie Brown" },
    ];
    const result = buildShortNames(users);
    expect(result.get("1")).toBe("Alice");
    expect(result.get("2")).toBe("Bob J.");
    expect(result.get("3")).toBe("Bob A.");
    expect(result.get("4")).toBe("Charlie");
  });

  it("all users with same first name collide", () => {
    const users: NamedUser[] = [
      { id: "1", displayName: "John Smith" },
      { id: "2", displayName: "John Jones" },
      { id: "3", displayName: "John Brown" },
    ];
    const result = buildShortNames(users);
    expect(result.get("1")).toBe("John S.");
    expect(result.get("2")).toBe("John J.");
    expect(result.get("3")).toBe("John B.");
  });

  it("mixed: some resolve with initials, some fall back to full name", () => {
    const users: NamedUser[] = [
      { id: "1", displayName: "Morten Andersen" },
      { id: "2", displayName: "Morten Arnesen" },
      { id: "3", displayName: "Morten Bech" },
    ];
    const result = buildShortNames(users);
    expect(result.get("1")).toBe("Morten Andersen");
    expect(result.get("2")).toBe("Morten Arnesen");
    expect(result.get("3")).toBe("Morten B.");
  });
});

describe("withShortName", () => {
  it("replaces displayName when the id is in the map", () => {
    interface UserWithAvatar extends NamedUser {
      avatarUrl?: string;
    }
    const user: UserWithAvatar = { id: "1", displayName: "Alice Smith" };
    const shortNames = new Map([["1", "Alice"]]);
    const result = withShortName(user, shortNames);
    expect(result.displayName).toBe("Alice");
  });

  it("keeps the original displayName when the id is missing", () => {
    const user: NamedUser = { id: "1", displayName: "Alice Smith" };
    const shortNames = new Map([["2", "Bob"]]);
    const result = withShortName(user, shortNames);
    expect(result.displayName).toBe("Alice Smith");
  });

  it("preserves extra fields and does not mutate the input object", () => {
    interface UserWithAvatar extends NamedUser {
      avatarUrl?: string;
    }
    const user: UserWithAvatar = { id: "1", displayName: "Alice Smith", avatarUrl: "http://avatar.png" };
    const shortNames = new Map([["1", "Alice"]]);
    const result = withShortName(user, shortNames);
    expect(result.avatarUrl).toBe("http://avatar.png");
    expect(result.displayName).toBe("Alice");
    expect(user.displayName).toBe("Alice Smith"); // Original is not mutated
  });
});

describe("nameCode", () => {
  it("converts single name to three-letter code", () => {
    expect(nameCode("Jesper")).toBe("JES");
  });

  it("converts first name with initial to three-letter code", () => {
    expect(nameCode("Morten A.")).toBe("MOA");
  });

  it("differentiates names with different initials", () => {
    expect(nameCode("Morten A.")).toBe("MOA");
    expect(nameCode("Morten B.")).toBe("MOB");
  });

  it("preserves historic initials", () => {
    expect(nameCode("JBA")).toBe("JBA");
  });

  it("handles short names", () => {
    expect(nameCode("Bo")).toBe("BO");
  });

  it("uppercases lowercase input with initial", () => {
    expect(nameCode("morten a.")).toBe("MOA");
  });

  it("uses fallback pattern for full names without initial", () => {
    expect(nameCode("Morten Andersen")).toBe("MOR");
  });

  it("returns empty string for empty input", () => {
    expect(nameCode("")).toBe("");
  });
});

describe("sortByName", () => {
  it("Danish letters sort after Z in the order Æ < Ø < Å", () => {
    const items = [
      { id: "id1", displayName: "Zack" },
      { id: "id2", displayName: "Åse" },
      { id: "id3", displayName: "Ærlig" },
      { id: "id4", displayName: "Øjvind" },
    ];
    const sorted = sortByName(items);
    expect(sorted.map(i => i.displayName)).toEqual(["Zack", "Ærlig", "Øjvind", "Åse"]);
  });

  it("mixed case: exact order assertion", () => {
    const items = [
      { id: "id1", displayName: "åse" },
      { id: "id2", displayName: "Ærlig" },
      { id: "id3", displayName: "øjvind" },
      { id: "id4", displayName: "Anna" },
    ];
    const sorted = sortByName(items);
    const names = sorted.map(i => i.displayName);
    expect(names).toEqual(["Anna", "Ærlig", "øjvind", "åse"]);
  });

  it('"Aa" collates as Å: "Aage" sorts after "Zack"', () => {
    const items = [
      { id: "id1", displayName: "Aage" },
      { id: "id2", displayName: "Zack" },
      { id: "id3", displayName: "Anders" },
    ];
    const sorted = sortByName(items);
    const names = sorted.map(i => i.displayName);
    expect(names).toEqual(["Anders", "Zack", "Aage"]);
  });

  it("identical displayNames ordered by id using plain code-unit comparison", () => {
    const items = [
      { id: "a", displayName: "Alice" },
      { id: "B", displayName: "Alice" },
      { id: "m", displayName: "Alice" },
    ];
    const sorted = sortByName(items);
    // "B" < "a" < "m" in code-unit order (65 < 97 < 109)
    expect(sorted.map(i => i.id)).toEqual(["B", "a", "m"]);
  });

  it("does not mutate input and returns a new array with same object identities and preserved extra fields", () => {
    interface UserWithExtra extends NamedUser {
      points?: number;
    }
    const item1: UserWithExtra = { id: "a1", displayName: "Charlie", points: 50 };
    const item2: UserWithExtra = { id: "b1", displayName: "Alice", points: 100 };
    const items = [item1, item2];
    const sorted = sortByName(items);

    // Input order unchanged
    expect(items[0]).toBe(item1);
    expect(items[1]).toBe(item2);

    // Different array instance
    expect(sorted).not.toBe(items);

    // Same objects by identity, reordered
    expect(sorted[0]).toBe(item2);
    expect(sorted[1]).toBe(item1);

    // Extra fields preserved
    expect(sorted[0].points).toBe(100);
    expect(sorted[1].points).toBe(50);
  });
});

describe("compareByName", () => {
  it("returns 0 only for identical name and id", () => {
    const user1 = { id: "a1", displayName: "Alice" };
    const user2 = { id: "a1", displayName: "Alice" };
    expect(compareByName(user1, user2)).toBe(0);
  });

  it("returns negative when first user sorts before second, positive otherwise", () => {
    const alice = { id: "a1", displayName: "Alice" };
    const bob = { id: "b1", displayName: "Bob" };
    expect(compareByName(alice, bob)).toBeLessThan(0);
    expect(compareByName(bob, alice)).toBeGreaterThan(0);
  });
});

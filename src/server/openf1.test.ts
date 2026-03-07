import { describe, it, expect } from "vitest";
import { transformDriverStandings, transformTeamStandings } from "./transforms";
import { getDriverColors, getConstructorColors } from "@/lib/scoring";
import type { ApiDriverChampionship, ApiTeamChampionship, ApiDriver, RaceResult } from "@/types";

describe("transformDriverStandings", () => {
  const mockDrivers: ApiDriver[] = [
    {
      meeting_key: 1254,
      session_key: 9693,
      driver_number: 1,
      broadcast_name: "M VERSTAPPEN",
      full_name: "Max VERSTAPPEN",
      name_acronym: "VER",
      team_name: "Red Bull Racing",
      team_colour: "3671C6",
      first_name: "Max",
      last_name: "Verstappen",
      headshot_url: "https://example.com/verstappen.png",
      country_code: "NL",
    },
    {
      meeting_key: 1254,
      session_key: 9693,
      driver_number: 4,
      broadcast_name: "L NORRIS",
      full_name: "Lando NORRIS",
      name_acronym: "NOR",
      team_name: "McLaren",
      team_colour: "FF8000",
      first_name: "Lando",
      last_name: "Norris",
      headshot_url: "https://example.com/norris.png",
      country_code: "GB",
    },
  ];

  const mockApiStandings: ApiDriverChampionship[] = [
    {
      meeting_key: 1254,
      session_key: 9693,
      driver_number: 4,
      position_start: null,
      position_current: 1,
      points_start: 0,
      points_current: 25,
    },
    {
      meeting_key: 1254,
      session_key: 9693,
      driver_number: 1,
      position_start: null,
      position_current: 2,
      points_start: 0,
      points_current: 18,
    },
  ];

  it("transforms API standings to app format with correct field mappings", () => {
    const result = transformDriverStandings(mockApiStandings, mockDrivers, 9693);

    expect(result).toHaveLength(2);

    // First driver (Norris - P1)
    expect(result[0]).toEqual({
      position: 1,
      driver_number: 4,
      driver_first_name: "Lando",
      driver_last_name: "Norris",
      driver_name_acronym: "NOR",
      team_name: "McLaren",
      team_colour: "FF8000",
      points: 25,
      session_key: 9693,
    });

    // Second driver (Verstappen - P2)
    expect(result[1]).toEqual({
      position: 2,
      driver_number: 1,
      driver_first_name: "Max",
      driver_last_name: "Verstappen",
      driver_name_acronym: "VER",
      team_name: "Red Bull Racing",
      team_colour: "3671C6",
      points: 18,
      session_key: 9693,
    });
  });

  it("uses position_current for position field", () => {
    const result = transformDriverStandings(mockApiStandings, mockDrivers, 9693);
    expect(result[0].position).toBe(1);
    expect(result[1].position).toBe(2);
  });

  it("uses points_current for points field", () => {
    const result = transformDriverStandings(mockApiStandings, mockDrivers, 9693);
    expect(result[0].points).toBe(25);
    expect(result[1].points).toBe(18);
  });

  it("includes team_colour from driver data", () => {
    const result = transformDriverStandings(mockApiStandings, mockDrivers, 9693);
    expect(result[0].team_colour).toBe("FF8000"); // McLaren orange
    expect(result[1].team_colour).toBe("3671C6"); // Red Bull blue
  });

  it("throws error for missing driver info", () => {
    const standingsWithUnknownDriver: ApiDriverChampionship[] = [
      {
        meeting_key: 1254,
        session_key: 9693,
        driver_number: 99,
        position_start: null,
        position_current: 3,
        points_start: 0,
        points_current: 15,
      },
    ];

    expect(() =>
      transformDriverStandings(standingsWithUnknownDriver, mockDrivers, 9693)
    ).toThrow("Driver #99 not found");
  });

  it("throws error for empty drivers array", () => {
    expect(() =>
      transformDriverStandings(mockApiStandings, [], 9693)
    ).toThrow("Driver #4 not found");
  });

  it("handles empty standings array", () => {
    const result = transformDriverStandings([], mockDrivers, 9693);
    expect(result).toHaveLength(0);
  });
});

describe("transformTeamStandings", () => {
  const mockDrivers: ApiDriver[] = [
    {
      meeting_key: 1254,
      session_key: 9693,
      driver_number: 4,
      broadcast_name: "L NORRIS",
      full_name: "Lando NORRIS",
      name_acronym: "NOR",
      team_name: "McLaren",
      team_colour: "FF8000",
      first_name: "Lando",
      last_name: "Norris",
      headshot_url: "https://example.com/norris.png",
      country_code: "GB",
    },
    {
      meeting_key: 1254,
      session_key: 9693,
      driver_number: 16,
      broadcast_name: "C LECLERC",
      full_name: "Charles LECLERC",
      name_acronym: "LEC",
      team_name: "Ferrari",
      team_colour: "E8002D",
      first_name: "Charles",
      last_name: "Leclerc",
      headshot_url: "https://example.com/leclerc.png",
      country_code: "MC",
    },
    {
      meeting_key: 1254,
      session_key: 9693,
      driver_number: 1,
      broadcast_name: "M VERSTAPPEN",
      full_name: "Max VERSTAPPEN",
      name_acronym: "VER",
      team_name: "Red Bull Racing",
      team_colour: "3671C6",
      first_name: "Max",
      last_name: "Verstappen",
      headshot_url: "https://example.com/verstappen.png",
      country_code: "NL",
    },
  ];

  const mockApiTeamStandings: ApiTeamChampionship[] = [
    {
      meeting_key: 1254,
      session_key: 9693,
      team_name: "McLaren",
      position_start: null,
      position_current: 1,
      points_start: 0,
      points_current: 27,
    },
    {
      meeting_key: 1254,
      session_key: 9693,
      team_name: "Ferrari",
      position_start: null,
      position_current: 2,
      points_start: 0,
      points_current: 22,
    },
    {
      meeting_key: 1254,
      session_key: 9693,
      team_name: "Red Bull Racing",
      position_start: null,
      position_current: 3,
      points_start: 0,
      points_current: 18,
    },
  ];

  it("transforms API team standings to app format with team colours", () => {
    const result = transformTeamStandings(mockApiTeamStandings, mockDrivers, 9693);

    expect(result).toHaveLength(3);

    expect(result[0]).toEqual({
      position: 1,
      team_name: "McLaren",
      team_colour: "FF8000",
      points: 27,
      session_key: 9693,
    });

    expect(result[1]).toEqual({
      position: 2,
      team_name: "Ferrari",
      team_colour: "E8002D",
      points: 22,
      session_key: 9693,
    });

    expect(result[2]).toEqual({
      position: 3,
      team_name: "Red Bull Racing",
      team_colour: "3671C6",
      points: 18,
      session_key: 9693,
    });
  });

  it("uses position_current for position field", () => {
    const result = transformTeamStandings(mockApiTeamStandings, mockDrivers, 9693);
    expect(result[0].position).toBe(1);
    expect(result[1].position).toBe(2);
    expect(result[2].position).toBe(3);
  });

  it("uses points_current for points field", () => {
    const result = transformTeamStandings(mockApiTeamStandings, mockDrivers, 9693);
    expect(result[0].points).toBe(27);
    expect(result[1].points).toBe(22);
    expect(result[2].points).toBe(18);
  });

  it("extracts team colours from driver data", () => {
    const result = transformTeamStandings(mockApiTeamStandings, mockDrivers, 9693);
    expect(result[0].team_colour).toBe("FF8000"); // McLaren
    expect(result[1].team_colour).toBe("E8002D"); // Ferrari
    expect(result[2].team_colour).toBe("3671C6"); // Red Bull
  });

  it("returns empty team_colour when team not found in drivers", () => {
    const standingsWithUnknownTeam: ApiTeamChampionship[] = [
      {
        meeting_key: 1254,
        session_key: 9693,
        team_name: "Unknown Team",
        position_start: null,
        position_current: 1,
        points_start: 0,
        points_current: 10,
      },
    ];

    const result = transformTeamStandings(standingsWithUnknownTeam, mockDrivers, 9693);
    expect(result[0].team_colour).toBe("");
  });

  it("handles empty standings array", () => {
    const result = transformTeamStandings([], mockDrivers, 9693);
    expect(result).toHaveLength(0);
  });

  it("handles empty drivers array (no colours available)", () => {
    const result = transformTeamStandings(mockApiTeamStandings, [], 9693);
    expect(result).toHaveLength(3);
    expect(result[0].team_colour).toBe("");
    expect(result[1].team_colour).toBe("");
  });

  it("preserves original team names", () => {
    const result = transformTeamStandings(mockApiTeamStandings, mockDrivers, 9693);
    expect(result[0].team_name).toBe("McLaren");
    expect(result[2].team_name).toBe("Red Bull Racing");
  });
});

describe("getDriverColors", () => {
  const mockRaceResults: RaceResult[] = [
    {
      sessionKey: 9693,
      location: "Melbourne",
      date: "2024-03-24",
      circuitName: "Albert Park",
      countryName: "Australia",
      driverStandings: [
        {
          position: 1,
          driver_number: 4,
          driver_first_name: "Lando",
          driver_last_name: "Norris",
          driver_name_acronym: "NOR",
          team_name: "McLaren",
          team_colour: "FF8000",
          points: 25,
          session_key: 9693,
        },
        {
          position: 2,
          driver_number: 1,
          driver_first_name: "Max",
          driver_last_name: "Verstappen",
          driver_name_acronym: "VER",
          team_name: "Red Bull Racing",
          team_colour: "3671C6",
          points: 18,
          session_key: 9693,
        },
      ],
      teamStandings: [],
    },
  ];

  it("extracts driver colors from race results", () => {
    const colors = getDriverColors(mockRaceResults);

    expect(colors["Lando Norris"]).toBe("FF8000");
    expect(colors["Max Verstappen"]).toBe("3671C6");
  });

  it("uses the most recent race result", () => {
    const multipleRaces: RaceResult[] = [
      {
        ...mockRaceResults[0],
        driverStandings: [
          {
            ...mockRaceResults[0].driverStandings[0],
            team_colour: "OLD_COLOR",
          },
        ],
      },
      {
        ...mockRaceResults[0],
        sessionKey: 9694,
        driverStandings: [
          {
            ...mockRaceResults[0].driverStandings[0],
            team_colour: "NEW_COLOR",
          },
        ],
      },
    ];

    const colors = getDriverColors(multipleRaces);
    expect(colors["Lando Norris"]).toBe("NEW_COLOR");
  });

  it("returns empty object for empty race results", () => {
    const colors = getDriverColors([]);
    expect(colors).toEqual({});
  });
});

describe("getConstructorColors", () => {
  const mockRaceResults: RaceResult[] = [
    {
      sessionKey: 9693,
      location: "Melbourne",
      date: "2024-03-24",
      circuitName: "Albert Park",
      countryName: "Australia",
      driverStandings: [],
      teamStandings: [
        {
          position: 1,
          team_name: "McLaren",
          team_colour: "FF8000",
          points: 43,
          session_key: 9693,
        },
        {
          position: 2,
          team_name: "Red Bull Racing",
          team_colour: "3671C6",
          points: 36,
          session_key: 9693,
        },
      ],
    },
  ];

  it("extracts constructor colors from race results", () => {
    const colors = getConstructorColors(mockRaceResults);

    expect(colors["McLaren"]).toBe("FF8000");
    expect(colors["Red Bull Racing"]).toBe("3671C6");
  });

  it("returns empty object for empty race results", () => {
    const colors = getConstructorColors([]);
    expect(colors).toEqual({});
  });
});

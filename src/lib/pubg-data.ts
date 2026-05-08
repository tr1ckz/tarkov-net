export type PubgSecretRoom = {
  name: string;
  mapGridArea: string;
  howToOpen: string;
  expectedLoot: string;
  risk: "low" | "medium" | "high";
  x: number;
  y: number;
};

export type PubgMapMarker = {
  id: string;
  label: string;
  type: "hot-drop" | "secret-room" | "vehicle-route";
  x: number;
  y: number;
  notes: string;
};

export type PubgMapIntel = {
  slug: string;
  name: string;
  mapImage: string;
  sizeKm: string;
  terrain: string;
  bestFor: string;
  hotDrops: string[];
  vehicleRoutes: string[];
  priorityCompounds: string[];
  midgameFocus: string;
  endgameNotes: string;
  secretRooms: PubgSecretRoom[];
  markers: PubgMapMarker[];
};

export type PubgRegionMeta = {
  region: "americas" | "europe" | "asia";
  title: string;
  rankedTempo: string;
  lootRouteFocus: string[];
  vehicleSpawnPriorities: string[];
  rankedRotationPlan: string[];
  mapBias: string[];
};

export const pubgMaps: PubgMapIntel[] = [
  {
    slug: "erangel",
    name: "Erangel",
    mapImage: "/pubg/maps/Erangel_Main_No_Text_Low_Res.png",
    sizeKm: "8x8",
    terrain: "Mixed fields, compounds, and ridgelines",
    bestFor: "Balanced squads with strong vehicle rotations",
    hotDrops: ["Pochinki", "School", "Georgopol", "Military Base"],
    vehicleRoutes: ["Mylta Power to Yasnaya road spine", "West coast highway loop", "Pochinki crossroads loop"],
    priorityCompounds: ["Rozhok hill compounds", "South George crate edge", "Mansion and prison ridge"],
    midgameFocus: "Hold bridge control and elevated compounds around central circles.",
    endgameNotes: "Use smoke walls aggressively in open circles and deny ridges with crossfires.",
    secretRooms: [
      {
        name: "Erangel Secret Basement 1",
        mapGridArea: "62.95% / 8.09%",
        howToOpen: "Use an Erangel Secret Basement Key to unlock basement entrances.",
        expectedLoot: "High-tier weapons, armor, and utility from basement crates.",
        risk: "medium",
        x: 62.95,
        y: 8.09
      },
      {
        name: "Erangel Secret Basement 2",
        mapGridArea: "16.72% / 22.38%",
        howToOpen: "Use an Erangel Secret Basement Key to unlock basement entrances.",
        expectedLoot: "High-tier weapons, armor, and utility from basement crates.",
        risk: "medium",
        x: 16.72,
        y: 22.38
      },
      {
        name: "Erangel Secret Basement 3",
        mapGridArea: "50.95% / 23.67%",
        howToOpen: "Use an Erangel Secret Basement Key to unlock basement entrances.",
        expectedLoot: "High-tier weapons, armor, and utility from basement crates.",
        risk: "medium",
        x: 50.95,
        y: 23.67
      },
      {
        name: "Erangel Secret Basement 4",
        mapGridArea: "79.72% / 25.35%",
        howToOpen: "Use an Erangel Secret Basement Key to unlock basement entrances.",
        expectedLoot: "High-tier weapons, armor, and utility from basement crates.",
        risk: "medium",
        x: 79.72,
        y: 25.35
      },
      {
        name: "Erangel Secret Basement 5",
        mapGridArea: "31.6% / 27.53%",
        howToOpen: "Use an Erangel Secret Basement Key to unlock basement entrances.",
        expectedLoot: "High-tier weapons, armor, and utility from basement crates.",
        risk: "medium",
        x: 31.6,
        y: 27.53
      },
      {
        name: "Erangel Secret Basement 6",
        mapGridArea: "66.23% / 41.82%",
        howToOpen: "Use an Erangel Secret Basement Key to unlock basement entrances.",
        expectedLoot: "High-tier weapons, armor, and utility from basement crates.",
        risk: "medium",
        x: 66.23,
        y: 41.82
      },
      {
        name: "Erangel Secret Basement 7",
        mapGridArea: "19.3% / 43.41%",
        howToOpen: "Use an Erangel Secret Basement Key to unlock basement entrances.",
        expectedLoot: "High-tier weapons, armor, and utility from basement crates.",
        risk: "medium",
        x: 19.3,
        y: 43.41
      },
      {
        name: "Erangel Secret Basement 8",
        mapGridArea: "37.06% / 45.59%",
        howToOpen: "Use an Erangel Secret Basement Key to unlock basement entrances.",
        expectedLoot: "High-tier weapons, armor, and utility from basement crates.",
        risk: "medium",
        x: 37.06,
        y: 45.59
      },
      {
        name: "Erangel Secret Basement 9",
        mapGridArea: "56.6% / 54.82%",
        howToOpen: "Use an Erangel Secret Basement Key to unlock basement entrances.",
        expectedLoot: "High-tier weapons, armor, and utility from basement crates.",
        risk: "medium",
        x: 56.6,
        y: 54.82
      },
      {
        name: "Erangel Secret Basement 10",
        mapGridArea: "82.5% / 59.78%",
        howToOpen: "Use an Erangel Secret Basement Key to unlock basement entrances.",
        expectedLoot: "High-tier weapons, armor, and utility from basement crates.",
        risk: "medium",
        x: 82.5,
        y: 59.78
      },
      {
        name: "Erangel Secret Basement 11",
        mapGridArea: "32.79% / 62.36%",
        howToOpen: "Use an Erangel Secret Basement Key to unlock basement entrances.",
        expectedLoot: "High-tier weapons, armor, and utility from basement crates.",
        risk: "medium",
        x: 32.79,
        y: 62.36
      },
      {
        name: "Erangel Secret Basement 12",
        mapGridArea: "15.93% / 67.71%",
        howToOpen: "Use an Erangel Secret Basement Key to unlock basement entrances.",
        expectedLoot: "High-tier weapons, armor, and utility from basement crates.",
        risk: "medium",
        x: 15.93,
        y: 67.71
      },
      {
        name: "Erangel Secret Basement 13",
        mapGridArea: "53.13% / 72.38%",
        howToOpen: "Use an Erangel Secret Basement Key to unlock basement entrances.",
        expectedLoot: "High-tier weapons, armor, and utility from basement crates.",
        risk: "medium",
        x: 53.13,
        y: 72.38
      },
      {
        name: "Erangel Secret Basement 14",
        mapGridArea: "40.83% / 80.61%",
        howToOpen: "Use an Erangel Secret Basement Key to unlock basement entrances.",
        expectedLoot: "High-tier weapons, armor, and utility from basement crates.",
        risk: "medium",
        x: 40.83,
        y: 80.61
      },
      {
        name: "Erangel Secret Basement 15",
        mapGridArea: "69.1% / 82.1%",
        howToOpen: "Use an Erangel Secret Basement Key to unlock basement entrances.",
        expectedLoot: "High-tier weapons, armor, and utility from basement crates.",
        risk: "medium",
        x: 69.1,
        y: 82.1
      }
    ],
    markers: [
      {
        id: "erangel-school",
        label: "School",
        type: "hot-drop",
        x: 49,
        y: 41,
        notes: "Fast armor and AR starts, frequent early 3rd-party pressure."
      },
      {
        id: "erangel-military",
        label: "Military Base",
        type: "hot-drop",
        x: 60,
        y: 84,
        notes: "High loot ceiling; commit only with bridge rotation plan."
      },
      {
        id: "erangel-west-route",
        label: "West Highway Route",
        type: "vehicle-route",
        x: 18,
        y: 52,
        notes: "Reliable vehicle chain for hard north-south shifts."
      }
    ]
  },
  {
    slug: "miramar",
    name: "Miramar",
    mapImage: "/pubg/maps/Miramar_Main_No_Text_Low_Res.png",
    sizeKm: "8x8",
    terrain: "Desert hills, long sight-lines, sparse cover",
    bestFor: "Precision teams with DMR/sniper confidence",
    hotDrops: ["Hacienda del Patron", "Pecado", "Los Leones", "San Martin"],
    vehicleRoutes: ["Pecado to Chumacera ridge loop", "Los Leones southern highway", "San Martin to Power Grid ridge route"],
    priorityCompounds: ["Power Grid ridge", "El Pozo high compounds", "Impala east hard cover"],
    midgameFocus: "Prioritize vehicle uptime and occupy hard-cover compounds before zone shifts.",
    endgameNotes: "Late circles punish slow rotations; always pre-scout depressions and rocks.",
    secretRooms: [],
    markers: [
      {
        id: "miramar-hacienda",
        label: "Hacienda",
        type: "hot-drop",
        x: 43,
        y: 49,
        notes: "Explosive early fights with top-tier weapon density."
      },
      {
        id: "miramar-los-leones",
        label: "Los Leones",
        type: "hot-drop",
        x: 64,
        y: 63,
        notes: "Urban split looting works best with 4-stack comms."
      },
      {
        id: "miramar-ridge-route",
        label: "Power Grid Route",
        type: "vehicle-route",
        x: 56,
        y: 46,
        notes: "Great for midgame elevation control and scout angles."
      }
    ]
  },
  {
    slug: "taego",
    name: "Taego",
    mapImage: "/pubg/maps/Taego_Main_No_Text_Low_Res.png",
    sizeKm: "8x8",
    terrain: "Rice fields, towns, and mountain edges",
    bestFor: "Fast loot/opening tempo with key-driven power spikes",
    hotDrops: ["School", "Terminal", "Ho San", "Yong Cheon"],
    vehicleRoutes: ["Terminal to central farm roads", "Ho San river ring", "Airport perimeter road"],
    priorityCompounds: ["Terminal roof compounds", "East river villages", "Airfield hard cover blocks"],
    midgameFocus: "Play around crate sight-lines and key-room routes near major roads.",
    endgameNotes: "Avoid low fields in final circles unless you have smoke and vehicles in reserve.",
    secretRooms: [
      {
        name: "Taego Secret Room 1",
        mapGridArea: "16.81% / 14.88%",
        howToOpen: "Use a Taego Secret Room Key found as world loot.",
        expectedLoot: "High-tier armor, weapons, and utility spikes.",
        risk: "high",
        x: 16.81,
        y: 14.88
      },
      {
        name: "Taego Secret Room 2",
        mapGridArea: "31.79% / 16.37%",
        howToOpen: "Use a Taego Secret Room Key found as world loot.",
        expectedLoot: "High-tier armor, weapons, and utility spikes.",
        risk: "high",
        x: 31.79,
        y: 16.37
      },
      {
        name: "Taego Secret Room 3",
        mapGridArea: "59.47% / 21.23%",
        howToOpen: "Use a Taego Secret Room Key found as world loot.",
        expectedLoot: "High-tier armor, weapons, and utility spikes.",
        risk: "high",
        x: 59.47,
        y: 21.23
      },
      {
        name: "Taego Secret Room 4",
        mapGridArea: "43.79% / 23.61%",
        howToOpen: "Use a Taego Secret Room Key found as world loot.",
        expectedLoot: "High-tier armor, weapons, and utility spikes.",
        risk: "high",
        x: 43.79,
        y: 23.61
      },
      {
        name: "Taego Secret Room 5",
        mapGridArea: "84.07% / 25%",
        howToOpen: "Use a Taego Secret Room Key found as world loot.",
        expectedLoot: "High-tier armor, weapons, and utility spikes.",
        risk: "high",
        x: 84.07,
        y: 25
      },
      {
        name: "Taego Secret Room 6",
        mapGridArea: "15.52% / 33.04%",
        howToOpen: "Use a Taego Secret Room Key found as world loot.",
        expectedLoot: "High-tier armor, weapons, and utility spikes.",
        risk: "high",
        x: 15.52,
        y: 33.04
      },
      {
        name: "Taego Secret Room 7",
        mapGridArea: "87.15% / 40.77%",
        howToOpen: "Use a Taego Secret Room Key found as world loot.",
        expectedLoot: "High-tier armor, weapons, and utility spikes.",
        risk: "high",
        x: 87.15,
        y: 40.77
      },
      {
        name: "Taego Secret Room 8",
        mapGridArea: "12.34% / 41.17%",
        howToOpen: "Use a Taego Secret Room Key found as world loot.",
        expectedLoot: "High-tier armor, weapons, and utility spikes.",
        risk: "high",
        x: 12.34,
        y: 41.17
      },
      {
        name: "Taego Secret Room 9",
        mapGridArea: "73.65% / 47.03%",
        howToOpen: "Use a Taego Secret Room Key found as world loot.",
        expectedLoot: "High-tier armor, weapons, and utility spikes.",
        risk: "high",
        x: 73.65,
        y: 47.03
      },
      {
        name: "Taego Secret Room 10",
        mapGridArea: "54.21% / 60.91%",
        howToOpen: "Use a Taego Secret Room Key found as world loot.",
        expectedLoot: "High-tier armor, weapons, and utility spikes.",
        risk: "high",
        x: 54.21,
        y: 60.91
      },
      {
        name: "Taego Secret Room 11",
        mapGridArea: "12.24% / 64.39%",
        howToOpen: "Use a Taego Secret Room Key found as world loot.",
        expectedLoot: "High-tier armor, weapons, and utility spikes.",
        risk: "high",
        x: 12.24,
        y: 64.39
      },
      {
        name: "Taego Secret Room 12",
        mapGridArea: "78.42% / 68.26%",
        howToOpen: "Use a Taego Secret Room Key found as world loot.",
        expectedLoot: "High-tier armor, weapons, and utility spikes.",
        risk: "high",
        x: 78.42,
        y: 68.26
      },
      {
        name: "Taego Secret Room 13",
        mapGridArea: "60.56% / 78.87%",
        howToOpen: "Use a Taego Secret Room Key found as world loot.",
        expectedLoot: "High-tier armor, weapons, and utility spikes.",
        risk: "high",
        x: 60.56,
        y: 78.87
      },
      {
        name: "Taego Secret Room 14",
        mapGridArea: "29.61% / 79.07%",
        howToOpen: "Use a Taego Secret Room Key found as world loot.",
        expectedLoot: "High-tier armor, weapons, and utility spikes.",
        risk: "high",
        x: 29.61,
        y: 79.07
      },
      {
        name: "Taego Secret Room 15",
        mapGridArea: "77.42% / 88.49%",
        howToOpen: "Use a Taego Secret Room Key found as world loot.",
        expectedLoot: "High-tier armor, weapons, and utility spikes.",
        risk: "high",
        x: 77.42,
        y: 88.49
      }
    ],
    markers: [
      {
        id: "taego-terminal",
        label: "Terminal",
        type: "hot-drop",
        x: 42,
        y: 57,
        notes: "Fast opening gear and strong vehicle exits."
      },
      {
        id: "taego-hosan-secret",
        label: "Ho San Secret Rooms",
        type: "secret-room",
        x: 63,
        y: 42,
        notes: "Key-access cluster with high late-game utility value."
      },
      {
        id: "taego-river-route",
        label: "River Rotation Loop",
        type: "vehicle-route",
        x: 57,
        y: 48,
        notes: "Stable fallback path if center compounds are contested."
      }
    ]
  },
  {
    slug: "deston",
    name: "Deston",
    mapImage: "/pubg/maps/Deston_Main_No_Text_Low_Res.png",
    sizeKm: "8x8",
    terrain: "Urban towers, swamps, and coastal lowlands",
    bestFor: "Vertical fighting and aggressive repositioning",
    hotDrops: ["Ripton", "Concert", "Arena", "Buxley"],
    vehicleRoutes: ["Ripton ring road", "Arena to Buxley split", "North coast cut-through"],
    priorityCompounds: ["Ripton tower blocks", "Arena hard cover", "Buxley ridge houses"],
    midgameFocus: "Control overwatch roofs and rotate early into power positions with ascenders.",
    endgameNotes: "Final circles often split hard cover; preserve utility for tower and low-ground pushes.",
    secretRooms: [
      {
        name: "Deston Security Room 1",
        mapGridArea: "33.99% / 6.97%",
        howToOpen: "Use a Deston Security Keycard to unlock the room.",
        expectedLoot: "Weapons, armor, attachments, and tactical utility.",
        risk: "high",
        x: 33.99,
        y: 6.97
      },
      {
        name: "Deston Security Room 2",
        mapGridArea: "63.65% / 11.44%",
        howToOpen: "Use a Deston Security Keycard to unlock the room.",
        expectedLoot: "Weapons, armor, attachments, and tactical utility.",
        risk: "high",
        x: 63.65,
        y: 11.44
      },
      {
        name: "Deston Security Room 3",
        mapGridArea: "23.68% / 18.56%",
        howToOpen: "Use a Deston Security Keycard to unlock the room.",
        expectedLoot: "Weapons, armor, attachments, and tactical utility.",
        risk: "high",
        x: 23.68,
        y: 18.56
      },
      {
        name: "Deston Security Room 4",
        mapGridArea: "24.27% / 21.44%",
        howToOpen: "Use a Deston Security Keycard to unlock the room.",
        expectedLoot: "Weapons, armor, attachments, and tactical utility.",
        risk: "high",
        x: 24.27,
        y: 21.44
      },
      {
        name: "Deston Security Room 5",
        mapGridArea: "82% / 22.94%",
        howToOpen: "Use a Deston Security Keycard to unlock the room.",
        expectedLoot: "Weapons, armor, attachments, and tactical utility.",
        risk: "high",
        x: 82,
        y: 22.94
      },
      {
        name: "Deston Security Room 6",
        mapGridArea: "62.46% / 24.73%",
        howToOpen: "Use a Deston Security Keycard to unlock the room.",
        expectedLoot: "Weapons, armor, attachments, and tactical utility.",
        risk: "high",
        x: 62.46,
        y: 24.73
      },
      {
        name: "Deston Security Room 7",
        mapGridArea: "38.05% / 33.16%",
        howToOpen: "Use a Deston Security Keycard to unlock the room.",
        expectedLoot: "Weapons, armor, attachments, and tactical utility.",
        risk: "high",
        x: 38.05,
        y: 33.16
      },
      {
        name: "Deston Security Room 8",
        mapGridArea: "55.71% / 33.76%",
        howToOpen: "Use a Deston Security Keycard to unlock the room.",
        expectedLoot: "Weapons, armor, attachments, and tactical utility.",
        risk: "high",
        x: 55.71,
        y: 33.76
      },
      {
        name: "Deston Security Room 9",
        mapGridArea: "20.59% / 41.69%",
        howToOpen: "Use a Deston Security Keycard to unlock the room.",
        expectedLoot: "Weapons, armor, attachments, and tactical utility.",
        risk: "high",
        x: 20.59,
        y: 41.69
      },
      {
        name: "Deston Security Room 10",
        mapGridArea: "56.21% / 49.93%",
        howToOpen: "Use a Deston Security Keycard to unlock the room.",
        expectedLoot: "Weapons, armor, attachments, and tactical utility.",
        risk: "high",
        x: 56.21,
        y: 49.93
      },
      {
        name: "Deston Security Room 11",
        mapGridArea: "81.71% / 52.09%",
        howToOpen: "Use a Deston Security Keycard to unlock the room.",
        expectedLoot: "Weapons, armor, attachments, and tactical utility.",
        risk: "high",
        x: 81.71,
        y: 52.09
      },
      {
        name: "Deston Security Room 12",
        mapGridArea: "75% / 52.58%",
        howToOpen: "Use a Deston Security Keycard to unlock the room.",
        expectedLoot: "Weapons, armor, attachments, and tactical utility.",
        risk: "high",
        x: 75,
        y: 52.58
      },
      {
        name: "Deston Security Room 13",
        mapGridArea: "19.2% / 55.58%",
        howToOpen: "Use a Deston Security Keycard to unlock the room.",
        expectedLoot: "Weapons, armor, attachments, and tactical utility.",
        risk: "high",
        x: 19.2,
        y: 55.58
      },
      {
        name: "Deston Security Room 14",
        mapGridArea: "79.53% / 57.65%",
        howToOpen: "Use a Deston Security Keycard to unlock the room.",
        expectedLoot: "Weapons, armor, attachments, and tactical utility.",
        risk: "high",
        x: 79.53,
        y: 57.65
      },
      {
        name: "Deston Security Room 15",
        mapGridArea: "74.87% / 57.75%",
        howToOpen: "Use a Deston Security Keycard to unlock the room.",
        expectedLoot: "Weapons, armor, attachments, and tactical utility.",
        risk: "high",
        x: 74.87,
        y: 57.75
      },
      {
        name: "Deston Security Room 16",
        mapGridArea: "43.61% / 70.76%",
        howToOpen: "Use a Deston Security Keycard to unlock the room.",
        expectedLoot: "Weapons, armor, attachments, and tactical utility.",
        risk: "high",
        x: 43.61,
        y: 70.76
      },
      {
        name: "Deston Security Room 17",
        mapGridArea: "14.74% / 76.61%",
        howToOpen: "Use a Deston Security Keycard to unlock the room.",
        expectedLoot: "Weapons, armor, attachments, and tactical utility.",
        risk: "high",
        x: 14.74,
        y: 76.61
      },
      {
        name: "Deston Security Room 18",
        mapGridArea: "67.72% / 77.31%",
        howToOpen: "Use a Deston Security Keycard to unlock the room.",
        expectedLoot: "Weapons, armor, attachments, and tactical utility.",
        risk: "high",
        x: 67.72,
        y: 77.31
      }
    ],
    markers: [
      {
        id: "deston-ripton",
        label: "Ripton",
        type: "hot-drop",
        x: 34,
        y: 56,
        notes: "Vertical fights and heavy third-party probability."
      },
      {
        id: "deston-security",
        label: "Security Room Belt",
        type: "secret-room",
        x: 49,
        y: 49,
        notes: "Keycard economy route for armor-heavy endgames."
      },
      {
        id: "deston-coast-route",
        label: "Coastal Vehicle Route",
        type: "vehicle-route",
        x: 67,
        y: 63,
        notes: "Safe disengage corridor when center towers collapse."
      }
    ]
  },
  {
    slug: "vikendi",
    name: "Vikendi",
    mapImage: "/pubg/maps/Vikendi_Main_No_Text_Low_Res.png",
    sizeKm: "6x6",
    terrain: "Snow, forests, and dense micro-cover",
    bestFor: "Stealth movement and quick compound fights",
    hotDrops: ["Castle", "Cosmodrome", "Winery", "Dino Park"],
    vehicleRoutes: ["Castle to Cosmodrome snow lane", "Winery outer-ring road", "North cliff descent route"],
    priorityCompounds: ["Castle plateau", "Cosmodrome warehouse edges", "Abbey tree-line compounds"],
    midgameFocus: "Leverage snow terrain concealment and hard-shift with backup vehicles.",
    endgameNotes: "Play edge intelligently; center can overexpose in snow fields.",
    secretRooms: [
      {
        name: "Vikendi Keycard Bunker 1",
        mapGridArea: "64.64% / 16.86%",
        howToOpen: "Use a Vikendi Security Keycard to access bunker loot.",
        expectedLoot: "High-tier weapons, armor, and utility in bunker crates.",
        risk: "high",
        x: 64.64,
        y: 16.86
      },
      {
        name: "Vikendi Keycard Bunker 2",
        mapGridArea: "33.59% / 19.74%",
        howToOpen: "Use a Vikendi Security Keycard to access bunker loot.",
        expectedLoot: "High-tier weapons, armor, and utility in bunker crates.",
        risk: "high",
        x: 33.59,
        y: 19.74
      },
      {
        name: "Vikendi Keycard Bunker 3",
        mapGridArea: "76.15% / 23.01%",
        howToOpen: "Use a Vikendi Security Keycard to access bunker loot.",
        expectedLoot: "High-tier weapons, armor, and utility in bunker crates.",
        risk: "high",
        x: 76.15,
        y: 23.01
      },
      {
        name: "Vikendi Keycard Bunker 4",
        mapGridArea: "71.78% / 37.1%",
        howToOpen: "Use a Vikendi Security Keycard to access bunker loot.",
        expectedLoot: "High-tier weapons, armor, and utility in bunker crates.",
        risk: "high",
        x: 71.78,
        y: 37.1
      },
      {
        name: "Vikendi Keycard Bunker 5",
        mapGridArea: "49.96% / 39.18%",
        howToOpen: "Use a Vikendi Security Keycard to access bunker loot.",
        expectedLoot: "High-tier weapons, armor, and utility in bunker crates.",
        risk: "high",
        x: 49.96,
        y: 39.18
      },
      {
        name: "Vikendi Keycard Bunker 6",
        mapGridArea: "58.09% / 43.25%",
        howToOpen: "Use a Vikendi Security Keycard to access bunker loot.",
        expectedLoot: "High-tier weapons, armor, and utility in bunker crates.",
        risk: "high",
        x: 58.09,
        y: 43.25
      },
      {
        name: "Vikendi Keycard Bunker 7",
        mapGridArea: "81.11% / 46.63%",
        howToOpen: "Use a Vikendi Security Keycard to access bunker loot.",
        expectedLoot: "High-tier weapons, armor, and utility in bunker crates.",
        risk: "high",
        x: 81.11,
        y: 46.63
      },
      {
        name: "Vikendi Keycard Bunker 8",
        mapGridArea: "16.92% / 48.21%",
        howToOpen: "Use a Vikendi Security Keycard to access bunker loot.",
        expectedLoot: "High-tier weapons, armor, and utility in bunker crates.",
        risk: "high",
        x: 16.92,
        y: 48.21
      },
      {
        name: "Vikendi Keycard Bunker 9",
        mapGridArea: "29.12% / 69.05%",
        howToOpen: "Use a Vikendi Security Keycard to access bunker loot.",
        expectedLoot: "High-tier weapons, armor, and utility in bunker crates.",
        risk: "high",
        x: 29.12,
        y: 69.05
      },
      {
        name: "Vikendi Keycard Bunker 10",
        mapGridArea: "74.36% / 72.32%",
        howToOpen: "Use a Vikendi Security Keycard to access bunker loot.",
        expectedLoot: "High-tier weapons, armor, and utility in bunker crates.",
        risk: "high",
        x: 74.36,
        y: 72.32
      }
    ],
    markers: [
      {
        id: "vikendi-castle",
        label: "Castle",
        type: "hot-drop",
        x: 46,
        y: 45,
        notes: "High-reward central fight with exposed exits."
      },
      {
        id: "vikendi-cave",
        label: "Cave / Lab Route",
        type: "secret-room",
        x: 52,
        y: 36,
        notes: "Power-spike loot path; punishable if delayed in blue."
      },
      {
        id: "vikendi-snow-route",
        label: "Snow Ridge Vehicle Route",
        type: "vehicle-route",
        x: 30,
        y: 52,
        notes: "Stealthy macro route with multiple hard-cover branches."
      }
    ]
  },
  {
    slug: "sanhok",
    name: "Sanhok",
    mapImage: "/pubg/maps/Sanhok_Main_No_Text_Low_Res.jpg",
    sizeKm: "4x4",
    terrain: "Jungle, rivers, and dense foliage",
    bestFor: "Fast-paced squads who thrive in close-range fights",
    hotDrops: ["Paradise Resort", "Bootcamp", "Cave", "Ruins"],
    vehicleRoutes: ["Bootcamp to Pai Nan river road", "Camp Alpha to Quarry ridge", "South beach vehicle loop"],
    priorityCompounds: ["Paradise Resort central buildings", "Bootcamp military structures", "Cave compound"],
    midgameFocus: "Constant pressure rotation through jungle paths; vehicles are secondary here.",
    endgameNotes: "Final circles in Sanhok collapse fast — pre-position inside zone by phase 4.",
    secretRooms: [],
    markers: [
      {
        id: "sanhok-paradise",
        label: "Paradise Resort",
        type: "hot-drop",
        x: 55,
        y: 38,
        notes: "High loot density hotel complex with vertical fights."
      },
      {
        id: "sanhok-bootcamp",
        label: "Bootcamp",
        type: "hot-drop",
        x: 45,
        y: 55,
        notes: "Military-grade loot with fully exposed open lanes."
      },
      {
        id: "sanhok-cave",
        label: "Cave",
        type: "hot-drop",
        x: 38,
        y: 72,
        notes: "Unique underground loot corridor — watch all entry points."
      },
      {
        id: "sanhok-river-route",
        label: "River Road Route",
        type: "vehicle-route",
        x: 50,
        y: 45,
        notes: "Fast rotate using the central river road spine."
      }
    ]
  },
  {
    slug: "karakin",
    name: "Karakin",
    mapImage: "/pubg/maps/Karakin_Main_No_Text_Low_Res.jpg",
    sizeKm: "2x2",
    terrain: "Arid hills, bunkers, and destructible walls",
    bestFor: "Aggressive entry-fraggers who exploit breachable cover",
    hotDrops: ["Al Habar", "Cargo Ship", "Bahr Sahir", "Hadiqa Nemo"],
    vehicleRoutes: ["Al Habar to Bahr Sahir hilltop road", "East perimeter breaching path", "Cargo Ship north approach"],
    priorityCompounds: ["Al Habar elevated structures", "Bahr Sahir cliff buildings", "Hadiqa Nemo garden compound"],
    midgameFocus: "Use sticky bombs to breach walls and create new angles the opponent doesn't expect.",
    endgameNotes: "Karakin finals are always brutal CQC — hold elevated broken-wall cover.",
    secretRooms: [],
    markers: [
      {
        id: "karakin-habar",
        label: "Al Habar",
        type: "hot-drop",
        x: 42,
        y: 35,
        notes: "Dense urban fights with breakable walls everywhere."
      },
      {
        id: "karakin-bahr",
        label: "Bahr Sahir",
        type: "hot-drop",
        x: 60,
        y: 58,
        notes: "Elevated cliff town with dominant angles on approaching squads."
      },
      {
        id: "karakin-breach-route",
        label: "Breach Route",
        type: "vehicle-route",
        x: 50,
        y: 45,
        notes: "Main vehicle rotation path cutting through the map center."
      }
    ]
  }
];

export const pubgGuides = [
  {
    title: "Early Game Priorities",
    points: [
      "Land with at least two disengage routes and one vehicle spawn nearby.",
      "Split your squad looting by building lane to reduce overlap and speed up first rotation.",
      "Call the first hard rotate before the first blue closes if your map is 8x8."
    ]
  },
  {
    title: "Utility Discipline",
    points: [
      "Target a minimum of 3 smokes per player by phase 5.",
      "Use one player as dedicated utility anchor in every final-circle crash.",
      "When contesting compounds, layer flashes before opening smokes."
    ]
  },
  {
    title: "Secret Room Routing",
    points: [
      "Only detour for keys if circle allows a safe return to vehicle routes.",
      "Treat secret rooms as power spikes, not guaranteed win conditions.",
      "If a nearby squad heard the key-room open, expect a delayed third-party setup."
    ]
  }
];

export const pubgRegions: PubgRegionMeta[] = [
  {
    region: "americas",
    title: "Americas Queue Meta",
    rankedTempo: "High early-fight pressure with aggressive crash timings after phase 3.",
    lootRouteFocus: [
      "Erangel: split-drop edge compounds and regroup with 2-car minimum.",
      "Deston: loot vertical blocks quickly, then rotate through coastal hard cover.",
      "Taego: prioritize key-route looting only if first circle favors return path."
    ],
    vehicleSpawnPriorities: [
      "Secure 2 vehicles before first zone close on 8x8 maps.",
      "Keep one reserve vehicle hidden near late-game fallback ridge.",
      "Avoid single-vehicle all-in rotations in ranked finals."
    ],
    rankedRotationPlan: [
      "Phase 1-2: edge info + beacon style scouting.",
      "Phase 3-4: claim hard cover before hard-shift closes.",
      "Phase 5+: utility-first micro-rotates, no open-field ego peeks."
    ],
    mapBias: ["Erangel", "Deston", "Miramar"]
  },
  {
    region: "europe",
    title: "Europe Queue Meta",
    rankedTempo: "Methodical midgame with disciplined hold-and-clear macro play.",
    lootRouteFocus: [
      "Miramar: long-loot then early ridge takeover.",
      "Vikendi: compact loot + quick phase-2 position lock.",
      "Erangel: prioritize center-access compounds over kill chasing."
    ],
    vehicleSpawnPriorities: [
      "Maintain one scout vehicle and one hard-shift vehicle.",
      "Use roads only for transition windows, then ditch behind cover.",
      "Save fuel for phase-5 emergency repositioning."
    ],
    rankedRotationPlan: [
      "Play circle probability, not pure edge greed.",
      "Anchor one player for rear security on every compound transition.",
      "Final phases: force utility trades before committing full crash."
    ],
    mapBias: ["Miramar", "Erangel", "Vikendi"]
  },
  {
    region: "asia",
    title: "Asia Queue Meta",
    rankedTempo: "Fast opening tempo, frequent early contests, and decisive late crashes.",
    lootRouteFocus: [
      "Taego: high-speed key and compound routing with strict timing cuts.",
      "Erangel: aggressive split control around school/pochinki belts.",
      "Deston: vertical pressure routes through ripton and arena sectors."
    ],
    vehicleSpawnPriorities: [
      "Secure transport immediately after first armor tier is online.",
      "Replace damaged vehicles proactively before phase 4.",
      "Stagger vehicle spacing during rotates to avoid single spray wipes."
    ],
    rankedRotationPlan: [
      "Win first major terrain line by phase 3.",
      "Use smoke walls as moving hard cover, not final panic tools.",
      "In final circles, force timing windows on weak-side duos first."
    ],
    mapBias: ["Taego", "Erangel", "Deston"]
  }
];

export function getPubgMapBySlug(slug: string) {
  return pubgMaps.find((entry) => entry.slug === slug);
}

export function getPubgRegionBySlug(region: string) {
  return pubgRegions.find((entry) => entry.region === region);
}

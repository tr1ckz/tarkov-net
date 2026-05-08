export type PubgSecretRoom = {
  name: string;
  mapGridArea: string;
  howToOpen: string;
  expectedLoot: string;
  risk: "low" | "medium" | "high";
};

export type PubgMapIntel = {
  slug: string;
  name: string;
  sizeKm: string;
  terrain: string;
  bestFor: string;
  hotDrops: string[];
  midgameFocus: string;
  endgameNotes: string;
  secretRooms: PubgSecretRoom[];
};

export const pubgMaps: PubgMapIntel[] = [
  {
    slug: "erangel",
    name: "Erangel",
    sizeKm: "8x8",
    terrain: "Mixed fields, compounds, and ridgelines",
    bestFor: "Balanced squads with strong vehicle rotations",
    hotDrops: ["Pochinki", "School", "Georgopol", "Military Base"],
    midgameFocus: "Hold bridge control and elevated compounds around central circles.",
    endgameNotes: "Use smoke walls aggressively in open circles and deny ridges with crossfires.",
    secretRooms: []
  },
  {
    slug: "miramar",
    name: "Miramar",
    sizeKm: "8x8",
    terrain: "Desert hills, long sight-lines, sparse cover",
    bestFor: "Precision teams with DMR/sniper confidence",
    hotDrops: ["Hacienda del Patron", "Pecado", "Los Leones", "San Martin"],
    midgameFocus: "Prioritize vehicle uptime and occupy hard-cover compounds before zone shifts.",
    endgameNotes: "Late circles punish slow rotations; always pre-scout depressions and rocks.",
    secretRooms: []
  },
  {
    slug: "taego",
    name: "Taego",
    sizeKm: "8x8",
    terrain: "Rice fields, towns, and mountain edges",
    bestFor: "Fast loot/opening tempo with key-driven power spikes",
    hotDrops: ["School", "Terminal", "Ho San", "Yong Cheon"],
    midgameFocus: "Play around crate sight-lines and key-room routes near major roads.",
    endgameNotes: "Avoid low fields in final circles unless you have smoke and vehicles in reserve.",
    secretRooms: [
      {
        name: "Taego Secret Room Cluster - Ho San Belt",
        mapGridArea: "Around Ho San and east-river compounds",
        howToOpen: "Use Taego Secret Room Key from world spawns and loot crates.",
        expectedLoot: "High-tier armor, emergency pickups, and weapon upgrades.",
        risk: "high"
      },
      {
        name: "Taego Secret Room Cluster - Buk San Sa",
        mapGridArea: "North-central temple and village compounds",
        howToOpen: "Taego Secret Room Key",
        expectedLoot: "High weapon density and late-game utility stacks.",
        risk: "medium"
      }
    ]
  },
  {
    slug: "deston",
    name: "Deston",
    sizeKm: "8x8",
    terrain: "Urban towers, swamps, and coastal lowlands",
    bestFor: "Vertical fighting and aggressive repositioning",
    hotDrops: ["Ripton", "Concert", "Arena", "Buxley"],
    midgameFocus: "Control overwatch roofs and rotate early into power positions with ascenders.",
    endgameNotes: "Final circles often split hard cover; preserve utility for tower and low-ground pushes.",
    secretRooms: [
      {
        name: "Security Keycard Rooms - Ripton",
        mapGridArea: "Major city towers and locked interiors",
        howToOpen: "Find Security Keycard in high-tier loot areas.",
        expectedLoot: "Advanced armor, attachments, and tactical utility.",
        risk: "high"
      },
      {
        name: "Security Keycard Rooms - Arena / Concert Sector",
        mapGridArea: "Central entertainment district compounds",
        howToOpen: "Security Keycard",
        expectedLoot: "High-value guns and med stacks for mid-to-late game fights.",
        risk: "medium"
      }
    ]
  },
  {
    slug: "vikendi",
    name: "Vikendi",
    sizeKm: "6x6",
    terrain: "Snow, forests, and dense micro-cover",
    bestFor: "Stealth movement and quick compound fights",
    hotDrops: ["Castle", "Cosmodrome", "Winery", "Dino Park"],
    midgameFocus: "Leverage snow terrain concealment and hard-shift with backup vehicles.",
    endgameNotes: "Play edge intelligently; center can overexpose in snow fields.",
    secretRooms: [
      {
        name: "Vikendi Cave / Lab Access Routes",
        mapGridArea: "Mountain cave entrances and underground access points",
        howToOpen: "Use map triggers and route timing to enter before zone collapse.",
        expectedLoot: "High-tier gear bursts and rare utility options.",
        risk: "high"
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

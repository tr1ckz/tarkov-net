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
    sizeKm: "8x8",
    terrain: "Mixed fields, compounds, and ridgelines",
    bestFor: "Balanced squads with strong vehicle rotations",
    hotDrops: ["Pochinki", "School", "Georgopol", "Military Base"],
    vehicleRoutes: ["Mylta Power to Yasnaya road spine", "West coast highway loop", "Pochinki crossroads loop"],
    priorityCompounds: ["Rozhok hill compounds", "South George crate edge", "Mansion and prison ridge"],
    midgameFocus: "Hold bridge control and elevated compounds around central circles.",
    endgameNotes: "Use smoke walls aggressively in open circles and deny ridges with crossfires.",
    secretRooms: [],
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
        name: "Taego Secret Room Cluster - Ho San Belt",
        mapGridArea: "Around Ho San and east-river compounds",
        howToOpen: "Use Taego Secret Room Key from world spawns and loot crates.",
        expectedLoot: "High-tier armor, emergency pickups, and weapon upgrades.",
        risk: "high",
        x: 63,
        y: 42
      },
      {
        name: "Taego Secret Room Cluster - Buk San Sa",
        mapGridArea: "North-central temple and village compounds",
        howToOpen: "Taego Secret Room Key",
        expectedLoot: "High weapon density and late-game utility stacks.",
        risk: "medium",
        x: 47,
        y: 23
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
        name: "Security Keycard Rooms - Ripton",
        mapGridArea: "Major city towers and locked interiors",
        howToOpen: "Find Security Keycard in high-tier loot areas.",
        expectedLoot: "Advanced armor, attachments, and tactical utility.",
        risk: "high",
        x: 34,
        y: 56
      },
      {
        name: "Security Keycard Rooms - Arena / Concert Sector",
        mapGridArea: "Central entertainment district compounds",
        howToOpen: "Security Keycard",
        expectedLoot: "High-value guns and med stacks for mid-to-late game fights.",
        risk: "medium",
        x: 49,
        y: 49
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
        name: "Vikendi Cave / Lab Access Routes",
        mapGridArea: "Mountain cave entrances and underground access points",
        howToOpen: "Use map triggers and route timing to enter before zone collapse.",
        expectedLoot: "High-tier gear bursts and rare utility options.",
        risk: "high",
        x: 52,
        y: 36
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

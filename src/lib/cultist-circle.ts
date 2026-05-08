export type CultistRecipe = {
  sacrifice: string;
  timer: string;
  reward: string;
  sacrificeIcon?: string;
  rewardIcon?: string;
  confidence?: "high" | "medium";
  note?: string;
};

export const CULTIST_FIGURE_RECIPES: CultistRecipe[] = [
  {
    sacrifice: "1x Pointy guy Figurine",
    timer: "66m",
    reward: "1x Rusty Bloody Key",
    sacrificeIcon: "Pointy guy Figurine",
    rewardIcon: "Rusty Bloody Key",
    confidence: "high"
  },
  {
    sacrifice: "1x Count Bloodsucker Figurine",
    timer: "66m",
    reward: "1x Medical Bloodset",
    sacrificeIcon: "Count Bloodsucker Figurine",
    rewardIcon: "Medical Bloodset",
    confidence: "high"
  },
  {
    sacrifice: "1x Petya Crooker Figurine",
    timer: "66m",
    reward: "1x Video cassette with Cyborg killer movie",
    sacrificeIcon: "Petya Crooker Figurine",
    rewardIcon: "Video cassette with Cyborg killer movie",
    confidence: "high"
  },
  {
    sacrifice: "1x Nailhead Figurine",
    timer: "66m",
    reward: "1x Pack of nails",
    sacrificeIcon: "Nailhead Figurine",
    rewardIcon: "Pack of nails",
    confidence: "high"
  },
  {
    sacrifice: "1x Xenoalien Figurine",
    timer: "66m",
    reward: "1x Xenomorph Sealing Foam",
    sacrificeIcon: "Xenoalien Figurine",
    rewardIcon: "Xenomorph Sealing Foam",
    confidence: "high"
  },
  {
    sacrifice: "1x Reshala Figurine",
    timer: "66m",
    reward: "1x Golden TT-33 pistol",
    sacrificeIcon: "Reshala Figurine",
    rewardIcon: "Tokarev TT-33 7.62x25 TT pistol",
    confidence: "high"
  },
  {
    sacrifice: "1x Killa Figurine",
    timer: "66m",
    reward: "Killa helmet reward package",
    sacrificeIcon: "Killa Figurine",
    rewardIcon: "Maska-1SCh",
    confidence: "high",
    note: "Usually reported as Maska-1SCh (Killa Edition), sometimes with the matching face shield."
  },
  {
    sacrifice: "1x Tagilla Figurine",
    timer: "66m",
    reward: "Tagilla mask reward package",
    sacrificeIcon: "Tagilla Figurine",
    rewardIcon: "Tagilla",
    confidence: "high",
    note: "Usually reported as UBEY or Gorilla."
  },
  {
    sacrifice: "1x BEAR Operative Figurine",
    timer: "66m",
    reward: "1x Grizzly medical kit",
    sacrificeIcon: "BEAR Operative Figurine",
    rewardIcon: "Grizzly",
    confidence: "high"
  },
  {
    sacrifice: "1x USEC Operative Figurine",
    timer: "66m",
    reward: "1x HighCom Trooper TFO body armor",
    sacrificeIcon: "USEC Operative Figurine",
    rewardIcon: "HighCom Trooper TFO body armor",
    confidence: "high"
  },
  {
    sacrifice: "1x Ryzhy Figurine",
    timer: "66m",
    reward: "1x Odolbos injector + 1x Pack of Sugar",
    sacrificeIcon: "Ryzhy Figurine",
    rewardIcon: "Odolbos",
    confidence: "high"
  },
  {
    sacrifice: "1x Scav Figurine",
    timer: "66m",
    reward: "Scav backpack and/or Scav vest",
    sacrificeIcon: "Scav Figurine",
    rewardIcon: "Scav Backpack",
    confidence: "high"
  },
  {
    sacrifice: "1x Den Figurine",
    timer: "66m",
    reward: "Deadlyslob beard oil and/or Baddie's red beard",
    sacrificeIcon: "Den Figurine",
    rewardIcon: "Deadlyslob's beard oil",
    confidence: "medium"
  },
  {
    sacrifice: "1x Politician Mutkevich Figurine",
    timer: "66m",
    reward: "3x Tarkovskaya Vodka",
    sacrificeIcon: "Politician Mutkevich Figurine",
    rewardIcon: "Bottle of Tarkovskaya Vodka",
    confidence: "high"
  },
  {
    sacrifice: "1x Ded Moroz Figurine",
    timer: "66m",
    reward: "1x Santa's Bag",
    sacrificeIcon: "Ded Moroz Figurine",
    rewardIcon: "Santa's Bag",
    confidence: "high"
  },
  {
    sacrifice: "1x Elvisvista Figurine",
    timer: "66m",
    reward: "1x Elvisvista Figurine + 1x Baseball Cap",
    sacrificeIcon: "Elvisvista Figurine",
    rewardIcon: "Baseball Cap",
    confidence: "medium"
  },
  {
    sacrifice: "1x Mastichin Figurine",
    timer: "66m",
    reward: "1x Voron's Hideout Key + 1x Note with Code Word Voron + 1x Raven",
    sacrificeIcon: "Mastichin Figurine",
    rewardIcon: "Voron's Hideout Key",
    confidence: "high"
  },
  {
    sacrifice: "1x Cultist Figurine",
    timer: "66m",
    reward: "Cultist-themed reward",
    sacrificeIcon: "Cultist Figurine",
    rewardIcon: "Cultist Knife",
    confidence: "medium",
    note: "Sources conflict between Spooky Skull Mask, 1-3 Cultist Knives, and a 5x Figurine recipe for a single knife."
  },
  {
    sacrifice: "Nailhead + Xenoalien + Pointy guy + Petya Crooker + Count Bloodsucker",
    timer: "66m",
    reward: "1x Tagilla welding mask 'ZABEY' (replica)",
    sacrificeIcon: "Pointy guy Figurine",
    rewardIcon: "Tagilla's welding mask",
    confidence: "high",
    note: "The known fixed five-figure Labyrinth set recipe."
  }
];

export const CULTIST_CONTAINER_AND_QUEST_RECIPES: CultistRecipe[] = [
  {
    sacrifice: "1x Secure Container Kappa",
    timer: "66m",
    reward: "Kappa novelty return",
    sacrificeIcon: "Secure container Kappa",
    rewardIcon: "Waist pouch",
    confidence: "medium",
    note: "Sources conflict between Waist Pouch and Kappa (Desecrated)."
  },
  {
    sacrifice: "1x Secure Container Gamma (Unheard)",
    timer: "6m",
    reward: "1x Secure Container Gamma (EoD)",
    sacrificeIcon: "Secure container Gamma",
    rewardIcon: "Secure container Gamma",
    confidence: "high"
  },
  {
    sacrifice: "1x Bottle of Fierce Hatchling Moonshine",
    timer: "repeatable",
    reward: "Chance at active quest FIR items",
    sacrificeIcon: "Bottle of Fierce Hatchling moonshine",
    confidence: "high",
    note: "Useful for Collector and other turn-in quests when paired with the high-value threshold behavior."
  },
  {
    sacrifice: "1x Physical Bitcoin",
    timer: "repeatable",
    reward: "Chance at active quest FIR items",
    sacrificeIcon: "Physical Bitcoin",
    confidence: "high"
  },
  {
    sacrifice: "Any sacrifice hitting >= 400k base value",
    timer: "6h or 14h",
    reward: "25% chance for quest/hideout item output",
    confidence: "high",
    note: "This is the main non-fixed route for Kappa/Collector progression items."
  }
];

export const CULTIST_KEY_AND_ACCESS_RECIPES: CultistRecipe[] = [
  {
    sacrifice: "1x Pointy guy Figurine",
    timer: "66m",
    reward: "1x Rusty Bloody Key",
    sacrificeIcon: "Pointy guy Figurine",
    rewardIcon: "Rusty Bloody Key",
    confidence: "high"
  },
  {
    sacrifice: "1x Mastichin Figurine",
    timer: "66m",
    reward: "1x Voron's Hideout Key package",
    sacrificeIcon: "Mastichin Figurine",
    rewardIcon: "Voron's Hideout Key",
    confidence: "high"
  },
  {
    sacrifice: "1x Labrys Research Notes",
    timer: "66m",
    reward: "1x Labrys Access Card",
    sacrificeIcon: "Labrys Research Notes",
    rewardIcon: "Labrys Access Card",
    confidence: "high"
  },
  {
    sacrifice: "1x 6-STEN-140 military battery",
    timer: "66m",
    reward: "1x Old house toilet Key",
    sacrificeIcon: "6-STEN-140-M military battery",
    rewardIcon: "Old house toilet key",
    confidence: "high"
  },
  {
    sacrifice: "1x Domontovich Ushanka Hat",
    timer: "66m",
    reward: "1x Supply department key + flare package",
    sacrificeIcon: "Domontovich ushanka",
    rewardIcon: "Supply department director's office room key",
    confidence: "high"
  },
  {
    sacrifice: "1x Mr. Kerman's Cat hologram",
    timer: "66m",
    reward: "1x TerraGroup Labs Access keycard + hologram return",
    sacrificeIcon: "Mr. Kerman's Cat hologram",
    rewardIcon: "TerraGroup Labs access keycard",
    confidence: "high"
  },
  {
    sacrifice: "5x SAS Drives",
    timer: "14h tier",
    reward: "High chance at keys / streamer items / rare utility loot",
    sacrificeIcon: "Secure Flash drive",
    confidence: "medium",
    note: "Often cited for marked-room and rare key hunting, but not truly fixed."
  },
  {
    sacrifice: "5x SSD Drives",
    timer: "14h tier",
    reward: "High-value tech / streamer / occasional key-adjacent loot",
    sacrificeIcon: "SSD drive",
    confidence: "medium"
  }
];

export const CULTIST_OTHER_FIXED_RECIPES: CultistRecipe[] = [
  {
    sacrifice: "1x LEDX Skin Transilluminator",
    timer: "666m",
    reward: "1x TerraGroup Blue Folders",
    sacrificeIcon: "LEDX Skin Transilluminator",
    rewardIcon: "TerraGroup 'Blue Folders' materials",
    confidence: "high"
  },
  {
    sacrifice: "1x Physical Bitcoin",
    timer: "666m",
    reward: "2x GreenBat + 2x Tetriz",
    sacrificeIcon: "Physical Bitcoin",
    rewardIcon: "Tetriz portable game console",
    confidence: "high"
  },
  {
    sacrifice: "1x Relaxation room key",
    timer: "66m",
    reward: "1x Bottle of Fierce Hatchling Moonshine",
    sacrificeIcon: "Relaxation room key",
    rewardIcon: "Bottle of Fierce Hatchling moonshine",
    confidence: "high"
  },
  {
    sacrifice: "1x Tigrezsq Splint",
    timer: "66m",
    reward: "1x Golden Egg",
    sacrificeIcon: "Tigzresq splint",
    rewardIcon: "Golden egg",
    confidence: "high"
  },
  {
    sacrifice: "1x Augmentin",
    timer: "66m",
    reward: "1x xTG-12 Antidote injector",
    sacrificeIcon: "Augmentin antibiotics",
    rewardIcon: "xTG-12 Antidote injector",
    confidence: "high"
  },
  {
    sacrifice: "Pumpkin with sweets",
    timer: "66m",
    reward: "Jack-o'-lantern tactical pumpkin helmet",
    sacrificeIcon: "Pumpkin with sweets",
    rewardIcon: "Jack-o'-lantern tactical pumpkin helmet",
    confidence: "high"
  },
  {
    sacrifice: "Jack-o'-lantern tactical pumpkin helmet",
    timer: "66m",
    reward: "Random food / drink return",
    sacrificeIcon: "Jack-o'-lantern tactical pumpkin helmet",
    confidence: "high"
  },
  {
    sacrifice: "1x Soap",
    timer: "66m",
    reward: "1x Awl",
    sacrificeIcon: "Soap",
    rewardIcon: "Awl",
    confidence: "high"
  },
  {
    sacrifice: "1x Zarya stun grenade",
    timer: "66m",
    reward: "2x Light bulb",
    sacrificeIcon: "Zarya stun grenade",
    rewardIcon: "Light bulb",
    confidence: "high"
  },
  {
    sacrifice: "Red + White + Purple Christmas ornaments",
    timer: "66m",
    reward: "Ded Moroz Hat + Ded Moroz Figurine",
    sacrificeIcon: "Christmas Tree Ornament (Red)",
    rewardIcon: "Ded Moroz figurine",
    confidence: "high"
  }
];

export const CULTIST_THRESHOLD_NOTES = [
  ">= 350,001 base value pushes you into the 14h high-value tier.",
  ">= 400,000 base value gives a 25% chance at the 6h quest/hideout output pool; otherwise it stays in the 14h high-value tier.",
  "Moonshine, Bitcoin, and 400k threshold sacrifices are the practical repeatable route for Collector/Kappa progress.",
  "A lot of community-reported 'recipes' are really high-value tier outcomes, not true fixed exchanges."
];

export const CULTIST_SOURCES = [
  "Tarkov.help article on Cultist Circle recipes",
  "CultistCircle.com threshold calculator and tier explanations",
  "PlayerAuctions 2026 fixed recipe roundup",
  "Community cross-checking where official-style sources conflict"
];

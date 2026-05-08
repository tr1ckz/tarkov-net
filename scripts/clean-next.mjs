import { promises as fs } from "node:fs";
import path from "node:path";

const TARGETS = [".next", "next-cache", ".next-runtime"];

async function removeTarget(target) {
  const fullPath = path.join(process.cwd(), target);

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      await fs.rm(fullPath, {
        recursive: true,
        force: true,
        maxRetries: 2,
        retryDelay: 150
      });
      return;
    } catch (error) {
      if (attempt === 4) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
    }
  }
}

for (const target of TARGETS) {
  try {
    await removeTarget(target);
    console.log(`cleaned ${target}`);
  } catch (error) {
    console.warn(`failed to clean ${target}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

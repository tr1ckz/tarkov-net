import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800";
const CACHE_DIR = path.join(process.cwd(), ".item-icon-cache");

function safeItemId(itemId: string) {
  return itemId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function placeholderSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="10" fill="#2f3328"/><path d="M14 46L32 16L50 46Z" fill="#666b58"/></svg>`;
}

function getCachePaths(itemId: string) {
  const safeId = safeItemId(itemId);
  return {
    dataPath: path.join(CACHE_DIR, `${safeId}.bin`),
    metaPath: path.join(CACHE_DIR, `${safeId}.json`)
  };
}

type CacheMeta = {
  contentType: string;
  updatedAt: number;
};

async function readCached(itemId: string) {
  const { dataPath, metaPath } = getCachePaths(itemId);

  try {
    const [metaRaw, data] = await Promise.all([fs.readFile(metaPath, "utf-8"), fs.readFile(dataPath)]);
    const meta = JSON.parse(metaRaw) as CacheMeta;

    if (!meta?.updatedAt || Date.now() - meta.updatedAt > CACHE_TTL_MS) {
      return null;
    }

    return {
      data,
      contentType: meta.contentType || "image/png"
    };
  } catch {
    return null;
  }
}

async function writeCache(itemId: string, contentType: string, data: Buffer) {
  const { dataPath, metaPath } = getCachePaths(itemId);

  await fs.mkdir(CACHE_DIR, { recursive: true });
  await Promise.all([
    fs.writeFile(dataPath, data),
    fs.writeFile(
      metaPath,
      JSON.stringify({
        contentType,
        updatedAt: Date.now()
      })
    )
  ]);
}

function imageResponse(data: Buffer, contentType: string) {
  return new Response(data, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": CACHE_CONTROL
    }
  });
}

function fallbackResponse() {
  return new Response(placeholderSvg(), {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": CACHE_CONTROL
    }
  });
}

export async function GET(_request: Request, context: { params: { itemId: string } }) {
  const itemId = context.params.itemId;
  const cached = await readCached(itemId);

  if (cached) {
    return imageResponse(cached.data, cached.contentType);
  }

  const item = await prisma.cachedItem.findUnique({
    where: { id: itemId },
    select: { iconLink: true }
  });

  if (!item?.iconLink) {
    return fallbackResponse();
  }

  try {
    const remote = await fetch(item.iconLink, { cache: "no-store" });
    if (!remote.ok) {
      return fallbackResponse();
    }

    const arrayBuffer = await remote.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = remote.headers.get("content-type") || "image/png";

    await writeCache(itemId, contentType, buffer);

    return imageResponse(buffer, contentType);
  } catch {
    return fallbackResponse();
  }
}

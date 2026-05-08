"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  itemId: string;
  itemSlug: string;
  itemName: string;
  isFavorited: boolean;
};

export function FavoriteButton({ itemId, itemSlug, itemName, isFavorited }: Props) {
  const [favorited, setFavorited] = useState(isFavorited);
  const [pending, startTransition] = useTransition();

  const toggleFavorite = () => {
    startTransition(async () => {
      const method = favorited ? "DELETE" : "POST";
      const endpoint = favorited ? `/api/favorites/${itemId}` : "/api/favorites";

      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: favorited
          ? undefined
          : JSON.stringify({
              itemId,
              itemSlug,
              itemName
            })
      });

      if (response.ok) {
        setFavorited(!favorited);
      }
    });
  };

  return (
    <Button
      type="button"
      onClick={toggleFavorite}
      variant={favorited ? "default" : "outline"}
      disabled={pending}
      className="h-8 px-2"
      aria-label={favorited ? "Remove from watchlist" : "Add to watchlist"}
    >
      <Star className="mr-1 h-4 w-4" fill={favorited ? "currentColor" : "none"} />
      {favorited ? "Saved" : "Watch"}
    </Button>
  );
}

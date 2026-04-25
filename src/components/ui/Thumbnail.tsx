"use client";

import { useState } from "react";

interface ThumbnailProps {
  src: string;
}

export function Thumbnail({ src }: ThumbnailProps) {
  const [error, setError] = useState(false);
  if (!src || error) {
    return (
      <div className="w-14 h-14 border-2 border-border bg-muted flex items-center justify-center shrink-0">
        <svg
          className="w-4 h-4 text-muted-foreground/40"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3H21m-3.75 3H21"
          />
        </svg>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="w-14 h-14 border-2 border-border object-cover shrink-0"
      onError={() => setError(true)}
      loading="lazy"
    />
  );
}

import type { Spot } from "./types.ts";

/** Page order. The first Spot with data also supplies the shared tides and daylight. */
export const spots: Spot[] = [
  {
    id: "muizenberg",
    name: "Muizenberg",
    slug: "Muizenberg",
    // The channel's /live URL follows the stream when it restarts with a new video ID
    webcam: "https://www.youtube.com/channel/UCef_Yfk6baScsTCcDxzXE5Q/live",
  },
  { id: "bigbay", name: "Big Bay", slug: "Big-Bay", webcam: "https://bigbaylifesaving.co.za/" },
  // "Long-Beach" is in Massachusetts and "Llandudno" is in Wales
  { id: "longbeach", name: "Long Beach", slug: "Long-Beach_2", webcam: null },
  { id: "llandudno", name: "Llandudno", slug: "Llandudno_1", webcam: null },
];

export const forecastUrl = (spot: Spot) => `https://www.surf-forecast.com/breaks/${spot.slug}/forecasts/latest`;

export const SMM_PLATFORM_LABELS = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  telegram: "Telegram",
  facebook: "Facebook",
  twitter: "Twitter / X",
  spotify: "Spotify",
  soundcloud: "SoundCloud",
  twitch: "Twitch",
  shopee: "Shopee",
  linkedin: "LinkedIn",
  reddit: "Reddit",
  discord: "Discord",
  threads: "Threads",
  bluesky: "Bluesky",
  snapchat: "Snapchat",
  pinterest: "Pinterest",
  other: "Autres",
};

export const SMM_PLATFORM_KEYS = Object.keys(SMM_PLATFORM_LABELS);

const NON_PLATFORM_RULES = [
  /website\s+(?:cheap\s+)?traffic/i,
  /web\s+traffic/i,
  /traffic\s+website/i,
];

const PLATFORM_RULES = [
  ["threads", /threads/i],
  ["instagram", /instagram/i],
  ["tiktok", /tiktok/i],
  ["youtube", /youtube|youtu\.be/i],
  ["telegram", /telegram/i],
  ["facebook", /facebook|\bfb\b/i],
  ["twitter", /twitter|\btweets?\b|\bx\.com\b|\bx\b/i],
  ["spotify", /spotify/i],
  ["soundcloud", /soundcloud/i],
  ["twitch", /twitch/i],
  ["shopee", /shopee/i],
  ["linkedin", /linkedin/i],
  ["reddit", /reddit/i],
  ["discord", /discord/i],
  ["bluesky", /bluesky/i],
  ["snapchat", /snapchat/i],
  ["pinterest", /pinterest/i],
];

export function detectSmmPlatform(...values) {
  const text = values.filter(Boolean).join(" ");
  if (NON_PLATFORM_RULES.some((pattern) => pattern.test(text))) return "other";
  for (const [key, pattern] of PLATFORM_RULES) {
    if (pattern.test(text)) return key;
  }
  return "other";
}

export function smmPlatformLabel(key) {
  return SMM_PLATFORM_LABELS[key] || SMM_PLATFORM_LABELS.other;
}

import { detectSmmPlatform } from "../services/smmPlatforms.js";

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function test(name, fn) {
  try {
    fn();
    console.log(`  OK ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

test("website traffic reste 'other' malgré les referrers", () => {
  assertEqual(
    detectSmmPlatform("Website Traffic", "Website Traffic from USA + Choose Referrer"),
    "other",
    "plateforme"
  );
});

test("website cheap traffic reste 'other'", () => {
  assertEqual(
    detectSmmPlatform("Website Cheap Traffic WorldWide Speed ~5,000/Day", "Facebook referrer"),
    "other",
    "plateforme"
  );
});

test("Instagram détecté normalement", () => {
  assertEqual(detectSmmPlatform("Instagram Likes", "S1 Instagram Likes (10/1K)"), "instagram", "plateforme");
});

test("TikTok détecté normalement", () => {
  assertEqual(detectSmmPlatform("TikTok Views", "S1 TikTok Views"), "tiktok", "plateforme");
});

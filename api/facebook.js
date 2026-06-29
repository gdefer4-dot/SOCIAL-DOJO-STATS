import { createClient } from "redis";

let redis;

async function getRedis() {
  if (!redis) {
    redis = createClient({
      url: process.env.REDIS_URL
    });

    redis.on("error", (err) => console.error("Redis error", err));
    await redis.connect();
  }

  return redis;
}

function getParisDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((p) => [p.type, p.value])
  );

  const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
  return { dateKey };
}

function getMondayKey(date = new Date()) {
  const parisDate = new Date(
    date.toLocaleString("en-US", { timeZone: "Europe/Paris" })
  );

  const day = parisDate.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  parisDate.setDate(parisDate.getDate() + diff);

  return getParisDateParts(parisDate).dateKey;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const pageId = process.env.FACEBOOK_PAGE_ID;
  const token = process.env.FACEBOOK_ACCESS_TOKEN;

  if (!pageId || !token) {
    return res.status(500).json({
      ok: false,
      message: "FACEBOOK_PAGE_ID ou FACEBOOK_ACCESS_TOKEN manquant dans Vercel."
    });
  }

  try {
    const url = `https://graph.facebook.com/v25.0/${pageId}?fields=name,followers_count,fan_count&access_token=${token}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || data.error) {
      return res.status(500).json({
        ok: false,
        message: data.error?.message || "Erreur Facebook Graph API",
        raw: data
      });
    }

    const followers = Number(data.followers_count ?? data.fan_count ?? 0);
    const client = await getRedis();

    const { dateKey } = getParisDateParts();
    const weekKey = getMondayKey();

    const todayStartKey = `facebook:start:day:${dateKey}`;
    const weekStartKey = `facebook:start:week:${weekKey}`;
    const historyKey = "facebook:history";

    let todayStart = await client.get(todayStartKey);
    if (todayStart === null) {
      todayStart = String(followers);
      await client.set(todayStartKey, todayStart);
    }

    let weekStart = await client.get(weekStartKey);
    if (weekStart === null) {
      weekStart = String(followers);
      await client.set(weekStartKey, weekStart);
    }

    await client.hSet(historyKey, dateKey, String(followers));

    const rawHistory = await client.hGetAll(historyKey);
    const history = Object.entries(rawHistory)
      .map(([date, value]) => ({ date, value: Number(value) }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30);

    return res.status(200).json({
      ok: true,
      pageName: data.name || "Dojo-club Vieux-Condé",
      followers,
      today: followers - Number(todayStart),
      week: followers - Number(weekStart),
      history,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error.message
    });
  }
}

import { createClient } from "redis";

let redisClient = null;

async function getRedis() {
  if (!process.env.REDIS_URL) return null;

  if (!redisClient) {
    redisClient = createClient({ url: process.env.REDIS_URL });
    redisClient.on("error", (err) => console.error("Redis error:", err));
    await redisClient.connect();
  }

  return redisClient;
}

function getDateKey() {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function getWeekKey() {
  const now = new Date();
  const parisDate = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  const day = parisDate.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  parisDate.setDate(parisDate.getDate() + diff);

  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(parisDate);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  try {
    const pageId = process.env.FACEBOOK_PAGE_ID;
    const token = process.env.FACEBOOK_ACCESS_TOKEN;

    if (!pageId || !token) {
      return res.status(500).json({
        ok: false,
        message: "FACEBOOK_PAGE_ID ou FACEBOOK_ACCESS_TOKEN manquant."
      });
    }

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

    let today = 0;
    let week = 0;
    let history = [{ date: getDateKey(), value: followers }];

    try {
      const redis = await getRedis();

      if (redis) {
        const todayKey = getDateKey();
        const weekKey = getWeekKey();

        const todayStartKey = `facebook:start:day:${todayKey}`;
        const weekStartKey = `facebook:start:week:${weekKey}`;
        const historyKey = "facebook:history";

        let todayStart = await redis.get(todayStartKey);
        if (todayStart === null) {
          todayStart = String(followers);
          await redis.set(todayStartKey, todayStart);
        }

        let weekStart = await redis.get(weekStartKey);
        if (weekStart === null) {
          weekStart = String(followers);
          await redis.set(weekStartKey, weekStart);
        }

        await redis.hSet(historyKey, todayKey, String(followers));

        const rawHistory = await redis.hGetAll(historyKey);

        history = Object.entries(rawHistory)
          .map(([date, value]) => ({ date, value: Number(value) }))
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(-30);

        today = followers - Number(todayStart);
        week = followers - Number(weekStart);
      }
    } catch (redisError) {
      console.error("Redis désactivé temporairement :", redisError.message);
    }

    return res.status(200).json({
      ok: true,
      pageName: data.name || "Dojo-club Vieux-Condé",
      followers,
      today,
      week,
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

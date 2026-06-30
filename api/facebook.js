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

function dateKey(date = new Date()) {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function mondayKey() {
  const paris = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  const day = paris.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  paris.setDate(paris.getDate() + diff);
  return dateKey(paris);
}

function monthKey() {
  return dateKey().slice(0, 7) + "-01";
}

function sortHistory(rawHistory) {
  return Object.entries(rawHistory)
    .map(([date, value]) => ({ date, value: Number(value) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function lastBefore(history, key) {
  return [...history].reverse().find((item) => item.date < key);
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
    let month = 0;
    let history = [{ date: dateKey(), value: followers }];

    const redis = await getRedis();

    if (redis) {
      const todayKey = dateKey();
      const weekBaseKey = mondayKey();
      const monthBaseKey = monthKey();

      const historyKey = "facebook:history";
      const weekStartKey = `facebook:start:week:${weekBaseKey}`;
      const monthStartKey = `facebook:start:month:${monthBaseKey}`;

      const rawHistory = await redis.hGetAll(historyKey);
      const previousHistory = sortHistory(rawHistory);

      const yesterdayValue = lastBefore(previousHistory, todayKey);

      today = yesterdayValue ? followers - yesterdayValue.value : 0;

      let weekStart = await redis.get(weekStartKey);
      if (weekStart === null) {
        const beforeWeek = lastBefore(previousHistory, weekBaseKey);
        weekStart = String(beforeWeek ? beforeWeek.value : followers);
        await redis.set(weekStartKey, weekStart);
      }

      let monthStart = await redis.get(monthStartKey);
      if (monthStart === null) {
        const beforeMonth = lastBefore(previousHistory, monthBaseKey);
        monthStart = String(beforeMonth ? beforeMonth.value : followers);
        await redis.set(monthStartKey, monthStart);
      }

      week = followers - Number(weekStart);
      month = followers - Number(monthStart);

      await redis.hSet(historyKey, todayKey, String(followers));

      const updatedHistory = await redis.hGetAll(historyKey);
      history = sortHistory(updatedHistory).slice(-30);
    }

    return res.status(200).json({
      ok: true,
      pageName: data.name || "Dojo-club Vieux-Condé",
      followers,
      today,
      week,
      month,
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

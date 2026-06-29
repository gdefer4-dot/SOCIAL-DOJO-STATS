export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const token = process.env.FACEBOOK_ACCESS_TOKEN;

  if (!pageId || !token) {
    return res.status(500).json({ ok: false, message: "Variables Vercel manquantes." });
  }

  try {
    const url = `https://graph.facebook.com/v25.0/${pageId}?fields=name,followers_count,fan_count&access_token=${token}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || data.error) {
      return res.status(500).json({ ok: false, message: data.error?.message || "Erreur Facebook API", raw: data });
    }

    return res.status(200).json({
      ok: true,
      pageName: data.name || "Dojo-club Vieux-Condé",
      followers: Number(data.followers_count ?? data.fan_count ?? 0),
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
}

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

    return res.status(200).json({
      ok: true,
      pageName: data.name || "Dojo-club Vieux-Condé",
      followers,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error.message
    });
  }
}

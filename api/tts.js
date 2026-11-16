export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { text } = req.body || {};
    if (!text) {
      return res.status(400).json({ error: "텍스트가 없습니다." });
    }

    const response = await fetch("https://tiktok-tts.weilnet.workers.dev/api/generation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: text.slice(0, 280),
        voice: "kr_002",
      }),
    });

    const data = await response.json();
    if (!data.data) {
      return res.status(500).json({ error: "TTS 생성 실패" });
    }

    return res.status(200).json({ audioBase64: data.data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { imageBase64, prompt } = JSON.parse(event.body || "{}");
    if (!imageBase64) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "이미지 데이터가 없습니다." }),
      };
    }

    const userQuestion = prompt && prompt.trim()
      ? prompt.trim()
      : "지금 카메라에 보이는 사물이나 글씨, 문제가 무엇인지 핵심만 알려줘.";

    const systemInstruction = `너는 아이언맨의 AI 비서 '자비스(J.A.R.V.I.S. VISION)'야.
사용자가 카메라로 비추는 화면을 보고 릴스/쇼츠처럼 빠르고 에너지 넘치게 반말로 대답해.
규칙:
1. 사물이나 글씨를 물으면 무엇인지 1~2문장으로 핵심만 딱 짚어줘.
2. 수학 문제나 교과서 문제가 보이면 정답과 핵심 풀이 과정을 3문장 이내로 아주 쉽게 설명해 줘.
3. 음성(TTS)으로 바로 읽을 거니까 마크다운 기호(*, #, -)나 특수문자, 이모지는 절대 쓰지 마.`;

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    // 1순위: Gemini 2.5 Flash Vision
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      try {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemInstruction }] },
              contents: [
                {
                  parts: [
                    { text: userQuestion },
                    {
                      inlineData: {
                        mimeType: "image/jpeg",
                        data: cleanBase64,
                      },
                    },
                  ],
                },
              ],
            }),
          }
        );

        if (geminiRes.ok) {
          const geminiData = await geminiRes.json();
          const reply = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (reply) {
            return {
              statusCode: 200,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ reply: reply.trim(), engine: "gemini" }),
            };
          }
        }
      } catch (e) {
        console.error("Gemini Vision Error, falling back to Groq:", e);
      }
    }

    // 2순위 백업: Groq Vision (Llama 4 Scout)
    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey) {
      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: "meta-llama/llama-4-scout-17b-16e-instruct",
          messages: [
            { role: "system", content: systemInstruction },
            {
              role: "user",
              content: [
                { type: "text", text: userQuestion },
                {
                  type: "image_url",
                  image_url: { url: `data:image/jpeg;base64,${cleanBase64}` },
                },
              ],
            },
          ],
          max_tokens: 300,
        }),
      });

      if (groqRes.ok) {
        const groqData = await groqRes.json();
        const reply = groqData?.choices?.[0]?.message?.content;
        if (reply) {
          return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reply: reply.trim(), engine: "groq" }),
          };
        }
      }
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ error: "비전 엔진 응답 실패. API 키를 확인해 주세요." }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}

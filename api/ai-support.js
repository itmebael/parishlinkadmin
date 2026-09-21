const defaultModel = process.env.OPENAI_MODEL || "gpt-5";

async function readJsonBody(request) {
  if (request.body && typeof request.body === "object") {
    return request.body;
  }

  if (typeof request.body === "string") {
    return JSON.parse(request.body || "{}");
  }

  let rawBody = "";

  for await (const chunk of request) {
    rawBody += chunk;
  }

  return rawBody ? JSON.parse(rawBody) : {};
}

function getFallbackReply(message, user = {}) {
  const normalizedMessage = String(message || "").toLowerCase();
  const parishName = user.parishName || "your linked parish";

  if (normalizedMessage.includes("certificate") || normalizedMessage.includes("request")) {
    return "Open My Requests to check your certificate request. When the parish uploads the certificate, the request card will show a View Certificate button.";
  }

  if (normalizedMessage.includes("appointment") || normalizedMessage.includes("book")) {
    return `Go to Appointments, choose an open parish date, select a visit time, then submit the request. It will be saved under My Requests for ${parishName}.`;
  }

  if (normalizedMessage.includes("announcement") || normalizedMessage.includes("notice")) {
    return "Parish announcements are based on the parish linked to your profile. Only published announcements for your parish will appear.";
  }

  return "I can help with certificate requests, appointment bookings, parish announcements, uploaded certificates, and account questions. Please share your request type and reference number if you have one.";
}

function getOutputText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  return (payload?.output || [])
    .flatMap((item) => item?.content || [])
    .filter((content) => content?.type === "output_text" && content?.text)
    .map((content) => content.text)
    .join("\n")
    .trim();
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ message: "Method not allowed." });
    return;
  }

  let requestBody = {};

  try {
    requestBody = await readJsonBody(request);
  } catch {
    response.status(400).json({ message: "Invalid JSON request body." });
    return;
  }

  const { messages = [], user = {} } = requestBody;
  const latestUserMessage =
    [...messages].reverse().find((message) => message?.role === "user")?.content || "";

  if (!process.env.OPENAI_API_KEY) {
    response.status(200).json({
      reply: getFallbackReply(latestUserMessage, user),
      mode: "fallback"
    });
    return;
  }

  try {
    const transcript = messages
      .slice(-10)
      .map((message) => `${message.role === "assistant" ? "Assistant" : "Member"}: ${message.content}`)
      .join("\n");

    const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: defaultModel,
        store: false,
        max_output_tokens: 360,
        instructions:
          "You are Dio AI Support for a parish service portal. Be warm, concise, and practical. Help with certificate requests, appointment bookings, parish announcements, uploaded certificates, and account profile questions. Never invent database status. Ask for the reference number when needed, and tell the member when parish staff must verify something.",
        input: [
          `Member name: ${user.name || "Not provided"}`,
          `Linked parish: ${user.parishName || "Not linked"}`,
          "Conversation:",
          transcript
        ].join("\n")
      })
    });

    const payload = await openAiResponse.json();

    if (!openAiResponse.ok) {
      response.status(openAiResponse.status).json({
        message: payload?.error?.message || "AI support is not available right now."
      });
      return;
    }

    response.status(200).json({
      reply: getOutputText(payload) || getFallbackReply(latestUserMessage, user),
      mode: "ai"
    });
  } catch (error) {
    response.status(200).json({
      reply: getFallbackReply(latestUserMessage, user),
      mode: "fallback",
      message: error instanceof Error ? error.message : "AI fallback used."
    });
  }
}

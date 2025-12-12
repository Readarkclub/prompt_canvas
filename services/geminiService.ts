import { PromptType, Attachment } from "../types";

const LOCAL_API_BASE = "/api/gemini";
const gatewayBaseRaw = import.meta.env.VITE_GEMINI_GATEWAY_URL as string | undefined;
const GATEWAY_BASE = gatewayBaseRaw ? gatewayBaseRaw.replace(/\/+$/, "") : "";
const USING_GATEWAY = Boolean(GATEWAY_BASE);
const API_BASE = USING_GATEWAY ? GATEWAY_BASE : LOCAL_API_BASE;
const GEMINI_REST_BASE = USING_GATEWAY ? `${API_BASE}/v1beta` : "";
const textModelFromEnv = import.meta.env.VITE_GEMINI_TEXT_MODEL as string | undefined;
const imageModelFromEnv = import.meta.env.VITE_GEMINI_IMAGE_MODEL as string | undefined;
const TEXT_MODEL = (textModelFromEnv || "").trim() || "gemini-3-pro-preview";
const IMAGE_MODEL = (imageModelFromEnv || "").trim() || "gemini-3-pro-image-preview";

type GenerateContentResult = any;

function extractCandidateText(result: GenerateContentResult): string {
  return result?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callGenerateContent(model: string, body: any): Promise<GenerateContentResult> {
  const url = `${GEMINI_REST_BASE}/models/${encodeURIComponent(model)}:generateContent`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

/**
 * Diagnostic helper to check API Key status from Edge Function
 */
export const getApiKeyInfo = async () => {
  if (USING_GATEWAY) {
    try {
      const result = await callGenerateContent(TEXT_MODEL, {
        contents: [{ parts: [{ text: "ping" }] }],
        generationConfig: { maxOutputTokens: 1 },
      });

      const ok = Boolean(extractCandidateText(result));
      return {
        status: ok ? "valid_format" : "invalid_format",
        length: 0,
        preview: ok ? "gateway" : "N/A",
        message: ok ? "Gateway reachable" : "Gateway response empty",
      };
    } catch (e: any) {
      return {
        status: "missing",
        length: 0,
        preview: "N/A",
        message: e?.message || "Gateway unreachable",
      };
    }
  }

  try {
    const response = await fetch(`${API_BASE}/health`);
    if (!response.ok) {
      throw new Error('Health check failed');
    }
    return await response.json();
  } catch (e) {
    return {
      status: 'error',
      length: 0,
      preview: 'N/A',
      message: 'Unable to connect to API'
    };
  }
};

/**
 * Auto-categorize the user's input to decide if it's a visual prompt or a text/reasoning task.
 */
export const classifyPrompt = async (input: string): Promise<{ type: PromptType, title: string, tags: string[] }> => {
  if (USING_GATEWAY) {
    const prompt = `Analyze the following user prompt: "${input}".

  Your task is to classify this prompt into one of two types: IMAGE or TEXT.

  CRITICAL RULES:
  1. Set type to "TEXT" if:
     - The prompt is a system instruction, role definition (e.g., "You are an expert...", "Act as a director...", "你是一个...").
     - The prompt asks to *write* or *refine* a prompt (e.g., "Write a prompt for Sora", "Create a JSON template").
     - The prompt is conversational, a question, or a request for code/reasoning.

  2. Set type to "IMAGE" ONLY if:
     - The prompt is a direct visual description of a scene intended to be rendered immediately as a picture (e.g., "A stunning photo of...", "Cyberpunk city street", "一只猫...").

  Also provide a short title (max 5 words) and 3 relevant tags. If the input is Chinese, please provide the title and tags in Chinese.

  Respond in JSON format: {"type": "IMAGE" or "TEXT", "title": "...", "tags": ["...", "...", "..."]}`;

    try {
      const result = await callGenerateContent(TEXT_MODEL, {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
        },
      });

      const responseText = extractCandidateText(result);
      if (!responseText) throw new Error("Empty response from Gemini");

      const parsed = JSON.parse(responseText);
      return {
        type: parsed.type === "IMAGE" ? PromptType.IMAGE : PromptType.TEXT,
        title: parsed.title || input.slice(0, 10),
        tags: parsed.tags || [],
      };
    } catch (e) {
      console.warn("Prompt classification failed, using default.", e);
      return {
        type: PromptType.TEXT,
        title: input.slice(0, 15) + (input.length > 15 ? "..." : ""),
        tags: ["新提示词"],
      };
    }
  }

  try {
    const response = await fetch(`${API_BASE}/classify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Classification failed');
    }

    const result = await response.json();
    return {
      type: result.type === "IMAGE" ? PromptType.IMAGE : PromptType.TEXT,
      title: result.title || input.slice(0, 10),
      tags: result.tags || []
    };
  } catch (e) {
    console.warn("Prompt classification failed, using default.", e);
    return {
      type: PromptType.TEXT,
      title: input.slice(0, 15) + (input.length > 15 ? "..." : ""),
      tags: ["新提示词"]
    };
  }
};

/**
 * Generate an image based on the prompt.
 * Supports optional reference image for image-to-image generation.
 */
export const generateImage = async (prompt: string, referenceImageBase64?: string): Promise<string> => {
  if (USING_GATEWAY) {
    const parts: any[] = [{ text: prompt }];

    if (referenceImageBase64) {
      const matches = referenceImageBase64.match(/^data:(.+);base64,(.+)$/);
      if (matches) {
        parts.push({
          inlineData: {
            mimeType: matches[1],
            data: matches[2],
          },
        });
      }
    }

    const result = await callGenerateContent(IMAGE_MODEL, {
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ["image", "text"],
      },
    });

    const outputParts = result?.candidates?.[0]?.content?.parts || [];
    for (const part of outputParts) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }

    throw new Error("No image data returned from Gemini");
  }

  const response = await fetch(`${API_BASE}/generate-image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      referenceImage: referenceImageBase64,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Image generation failed');
  }

  const result = await response.json();
  return result.imageUrl;
};

/**
 * Convert a standard image prompt into a detailed video generation prompt.
 */
export const convertToVideoPrompt = async (
  originalPrompt: string,
  settings: any
): Promise<string> => {
  if (USING_GATEWAY) {
    const settingsJson = JSON.stringify(settings || {});
    const systemPrompt = `Rewrite the following image prompt into a highly detailed video generation prompt suitable for a model like Sora or Grok.
Original Prompt: "${originalPrompt}"

Apply these video settings: ${settingsJson}

Include specific keywords for camera movement, lighting, and motion. Output ONLY the raw prompt text.`;

    const result = await callGenerateContent(TEXT_MODEL, {
      contents: [{ parts: [{ text: systemPrompt }] }],
    });

    const responseText = extractCandidateText(result);
    return responseText || originalPrompt;
  }

  const response = await fetch(`${API_BASE}/video-prompt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: originalPrompt,
      settings,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Video prompt conversion failed');
  }

  const result = await response.json();
  return result.videoPrompt;
};

/**
 * Chat with the model for reasoning tasks.
 * Supports optional attachments (images, docs, etc.) for multimodal chat.
 */
export const sendChatMessage = async (history: any[], newMessage: string, attachments?: Attachment[]) => {
  if (USING_GATEWAY) {
    const contents: any[] = [];

    if (history && Array.isArray(history)) {
      for (const h of history) {
        const parts: any[] = [{ text: h.text }];

        if (h.attachments && h.attachments.length > 0) {
          for (const att of h.attachments) {
            const matches = att.data.match(/^data:(.+);base64,(.+)$/);
            if (matches) {
              parts.push({
                inlineData: {
                  mimeType: matches[1],
                  data: matches[2],
                },
              });
            }
          }
        }

        contents.push({
          role: h.role === "user" ? "user" : "model",
          parts,
        });
      }
    }

    const currentParts: any[] = [{ text: newMessage || "" }];
    if (attachments && attachments.length > 0) {
      for (const att of attachments) {
        const matches = att.data.match(/^data:(.+);base64,(.+)$/);
        if (matches) {
          currentParts.push({
            inlineData: {
              mimeType: matches[1],
              data: matches[2],
            },
          });
        }
      }
    }
    contents.push({ role: "user", parts: currentParts });

    const result = await callGenerateContent(TEXT_MODEL, { contents });
    return extractCandidateText(result);
  }

  const response = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      history,
      message: newMessage,
      attachments,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Chat request failed');
  }

  const result = await response.json();
  return result.text;
};

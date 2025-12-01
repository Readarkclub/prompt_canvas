import { PromptType, Attachment } from "../types";

const API_BASE = '/api/gemini';

/**
 * Diagnostic helper to check API Key status from Edge Function
 */
export const getApiKeyInfo = async () => {
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

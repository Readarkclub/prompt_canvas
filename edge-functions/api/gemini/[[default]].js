/**
 * EdgeOne Pages Edge Function - Gemini API Gateway
 *
 * Routes:
 *   POST /api/gemini/classify      - Classify prompt type
 *   POST /api/gemini/generate-image - Generate image from prompt
 *   POST /api/gemini/chat          - Chat with AI
 *   POST /api/gemini/video-prompt  - Convert to video prompt
 *   GET  /api/gemini/health        - Health check & API key diagnostics
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// CORS headers for all responses
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Helper: Create JSON response with CORS
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      ...corsHeaders,
    },
  });
}

// Helper: Create error response
function errorResponse(message, status = 500) {
  console.error(`[Error] ${message}`);
  return jsonResponse({ error: message }, status);
}

// Helper: Call Gemini API
async function callGeminiAPI(endpoint, apiKey, body) {
  const url = `${GEMINI_API_BASE}${endpoint}?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// Route: POST /api/gemini/classify
async function handleClassify(requestBody, apiKey) {
  const { input } = requestBody;

  if (!input) {
    return errorResponse('Missing required field: input', 400);
  }

  const prompt = `Analyze the following user prompt: "${input}".

  Your task is to classify this prompt into one of two types: IMAGE or TEXT.

  CRITICAL RULES:
  1. Set type to "TEXT" if:
     - The prompt is a system instruction, role definition (e.g., "You are an expert...", "Act as a director...", "你是一位...").
     - The prompt asks to *write* or *refine* a prompt (e.g., "Write a prompt for Sora", "Create a JSON template").
     - The prompt is conversational, a question, or a request for code/reasoning.

  2. Set type to "IMAGE" ONLY if:
     - The prompt is a direct visual description of a scene intended to be rendered immediately as a picture (e.g., "A stunning photo of...", "Cyberpunk city street", "一只猫...").

  Also provide a short title (max 5 words) and 3 relevant tags. If the input is Chinese, please provide the title and tags in Chinese.

  Respond in JSON format: {"type": "IMAGE" or "TEXT", "title": "...", "tags": ["...", "...", "..."]}`;

  try {
    const result = await callGeminiAPI('/models/gemini-3-pro-preview:generateContent', apiKey, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });

    const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!responseText) {
      throw new Error('Empty response from Gemini');
    }

    const parsed = JSON.parse(responseText);
    return jsonResponse({
      type: parsed.type === 'IMAGE' ? 'IMAGE' : 'TEXT',
      title: parsed.title || input.slice(0, 10),
      tags: parsed.tags || [],
    });
  } catch (e) {
    console.warn('Classification failed, using fallback:', e.message);
    return jsonResponse({
      type: 'TEXT',
      title: input.slice(0, 15) + (input.length > 15 ? '...' : ''),
      tags: ['新提示词'],
    });
  }
}

// Route: POST /api/gemini/generate-image
async function handleGenerateImage(requestBody, apiKey) {
  const { prompt, referenceImage } = requestBody;

  if (!prompt) {
    return errorResponse('Missing required field: prompt', 400);
  }

  const parts = [{ text: prompt }];

  // Add reference image if provided
  if (referenceImage) {
    const matches = referenceImage.match(/^data:(.+);base64,(.+)$/);
    if (matches) {
      parts.push({
        inlineData: {
          mimeType: matches[1],
          data: matches[2],
        },
      });
    }
  }

  try {
    const result = await callGeminiAPI('/models/gemini-3-pro-image-preview:generateContent', apiKey, {
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ['image', 'text'],
      },
    });

    const outputParts = result.candidates?.[0]?.content?.parts || [];
    for (const part of outputParts) {
      if (part.inlineData) {
        return jsonResponse({
          imageUrl: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
        });
      }
    }

    throw new Error('No image data returned from Gemini');
  } catch (e) {
    return errorResponse(`Image generation failed: ${e.message}`);
  }
}

// Route: POST /api/gemini/chat
async function handleChat(requestBody, apiKey) {
  const { history, message, attachments } = requestBody;

  if (!message && (!attachments || attachments.length === 0)) {
    return errorResponse('Missing required field: message or attachments', 400);
  }

  // Build contents array from history
  const contents = [];

  if (history && Array.isArray(history)) {
    for (const h of history) {
      const parts = [{ text: h.text }];

      // Add attachments from history
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
        role: h.role === 'user' ? 'user' : 'model',
        parts,
      });
    }
  }

  // Add current message
  const currentParts = [{ text: message || '' }];
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
  contents.push({ role: 'user', parts: currentParts });

  try {
    const result = await callGeminiAPI('/models/gemini-3-pro-preview:generateContent', apiKey, {
      contents,
    });

    const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text;
    return jsonResponse({ text: responseText || '' });
  } catch (e) {
    return errorResponse(`Chat failed: ${e.message}`);
  }
}

// Route: POST /api/gemini/video-prompt
async function handleVideoPrompt(requestBody, apiKey) {
  const { prompt: originalPrompt, settings } = requestBody;

  if (!originalPrompt) {
    return errorResponse('Missing required field: prompt', 400);
  }

  const settingsJson = JSON.stringify(settings || {});
  const systemPrompt = `Rewrite the following image prompt into a highly detailed video generation prompt suitable for a model like Sora or Grok.
Original Prompt: "${originalPrompt}"

Apply these video settings: ${settingsJson}

Include specific keywords for camera movement, lighting, and motion. Output ONLY the raw prompt text.`;

  try {
    const result = await callGeminiAPI('/models/gemini-3-pro-preview:generateContent', apiKey, {
      contents: [{ parts: [{ text: systemPrompt }] }],
    });

    const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text;
    return jsonResponse({ videoPrompt: responseText || originalPrompt });
  } catch (e) {
    return errorResponse(`Video prompt conversion failed: ${e.message}`);
  }
}

// Route: GET /api/gemini/health
async function handleHealth(apiKey) {
  if (!apiKey) {
    return jsonResponse({
      status: 'missing',
      length: 0,
      preview: 'N/A',
      message: 'API Key is not configured',
    });
  }

  const isValidFormat = apiKey.startsWith('AIza');
  const hasWhitespace = /\s/.test(apiKey);

  return jsonResponse({
    status: isValidFormat && !hasWhitespace ? 'valid_format' : 'invalid_format',
    length: apiKey.length,
    preview: `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`,
    hasWhitespace,
    message: isValidFormat ? 'API Key format looks valid' : 'API Key format may be invalid',
  });
}

// Main request handler
export async function onRequest({ request, params, env }) {
  const path = params.default?.join('/') || '';
  const method = request.method;

  console.log(`[${method}] /api/gemini/${path}`);

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Get API key from environment
  const apiKey = env.GEMINI_API_KEY;

  // Route handling
  try {
    // Health check (no API key required for checking status)
    if (path === 'health' && method === 'GET') {
      return handleHealth(apiKey);
    }

    // All other routes require API key
    if (!apiKey) {
      return errorResponse('API Key is not configured', 500);
    }

    // Parse request body for POST requests
    let body = {};
    if (method === 'POST') {
      try {
        body = await request.json();
      } catch (e) {
        return errorResponse('Invalid JSON body', 400);
      }
    }

    // Route dispatch
    switch (path) {
      case 'classify':
        if (method !== 'POST') return errorResponse('Method not allowed', 405);
        return handleClassify(body, apiKey);

      case 'generate-image':
        if (method !== 'POST') return errorResponse('Method not allowed', 405);
        return handleGenerateImage(body, apiKey);

      case 'chat':
        if (method !== 'POST') return errorResponse('Method not allowed', 405);
        return handleChat(body, apiKey);

      case 'video-prompt':
        if (method !== 'POST') return errorResponse('Method not allowed', 405);
        return handleVideoPrompt(body, apiKey);

      default:
        return errorResponse(`Unknown route: /api/gemini/${path}`, 404);
    }
  } catch (e) {
    console.error('Unhandled error:', e);
    return errorResponse(`Internal server error: ${e.message}`);
  }
}

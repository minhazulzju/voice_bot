interface GenerateReplyOptions {
  prompt: string;
  systemPrompt?: string;
}

// Fallback empathetic responses (English) - SHORT and CONCISE
const empatheticResponsesEN = [
  "I hear you. That sounds tough.",
  "I understand. That must be difficult.",
  "You're not alone in feeling this way.",
  "That's a challenging situation. I'm here to listen.",
  "Thank you for sharing. Your feelings matter.",
  "It's okay to feel this way. You'll get through this.",
  "I'm sorry you're going through this.",
];

// Fallback empathetic responses (Chinese) - SHORT and CONCISE
const empatheticResponsesCN = [
  "我理解。那一定很难。",
  "你不是一个人。我在这里。",
  "感谢你的分享。你的感受很重要。",
  "这是一个挑战。你会度过这一关。",
  "我很遗憾你要经历这个。",
  "那听起来很困难。坚持下去。",
  "你很勇敢。继续前进。",
];

/**
 * Detect if text is in Chinese or English
 */
function detectLanguage(text: string): 'zh-CN' | 'en-US' {
  // Simple detection: if text contains Chinese characters, it's Chinese
  const chineseCharRegex = /[\u4E00-\u9FFF\u3400-\u4DBF]/g;
  const chineseChars = text.match(chineseCharRegex);
  
  // If more than 30% of characters are Chinese, consider it Chinese
  if (chineseChars && chineseChars.length / text.length > 0.3) {
    return 'zh-CN';
  }
  return 'en-US';
}

export async function generateReply({ prompt, systemPrompt }: GenerateReplyOptions): Promise<string> {
  try {
    // Auto-detect input language
    const inputLanguage = detectLanguage(prompt);
    
    // Instruction that tells LLM to respond CONTEXTUALLY and BRIEFLY
    const languageInstruction = inputLanguage === 'zh-CN'
      ? `你是一个同情心强的AI助手。根据用户说的话，给出相关的、个性化的回应。
使用中文回应。只用1-2句话。直接回应用户的具体情况：`
      : `You are an empathetic AI assistant. Listen to what the user says and respond directly to their specific situation.
Keep your response brief - only 1-2 sentences. Be relevant and personal to what they shared.
User said:`;
    
    const empatheticPrompt = `${languageInstruction}\n"${prompt}"`;

    const response = await fetch('/api/generate-reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: empatheticPrompt, systemPrompt }),
    });

    if (!response.ok) {
      throw new Error(`Generate reply failed: ${response.status}`);
    }

    const json = await response.json();
    return json.text;
  } catch (error) {
    // Fallback: return a random empathetic response in detected language
    console.log('Using fallback empathetic response (API unavailable)');
    const inputLanguage = detectLanguage(prompt);
    const responses = inputLanguage === 'zh-CN' ? empatheticResponsesCN : empatheticResponsesEN;
    const randomIndex = Math.floor(Math.random() * responses.length);
    return responses[randomIndex];
  }
}

/**
 * Export language detection for use in other files
 */
export { detectLanguage };

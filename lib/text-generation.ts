interface GenerateReplyOptions {
  prompt: string;
  systemPrompt?: string;
}

export async function generateReply({ prompt, systemPrompt }: GenerateReplyOptions): Promise<string> {
  // Prepend instruction to ensure empathetic feedback
  const empatheticPrompt = `Provide an empathetic response to the following prompt: ${prompt}`;

  const response = await fetch('/api/generate-reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt: empatheticPrompt, systemPrompt }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(`Generate reply failed: ${errorData.error}`);
  }

  const json = await response.json();
  return json.text;
}

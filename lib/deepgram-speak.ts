interface SpeakOptions {
  apiKey: string;
  text: string;
  model?: string;
  format?: 'wav' | 'linear16' | 'mp3';
}

export async function synthesizeWithDeepgram({
  apiKey,
  text,
  model = 'aura-asteria-en',
  format = 'linear16',
}: SpeakOptions): Promise<ArrayBuffer> {
  const url = `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(model)}&encoding=${format}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: format === 'linear16' ? 'audio/wav' : 'audio/mpeg',
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Deepgram Speak failed: ${response.status} ${errorText}`);
  }

  return await response.arrayBuffer();
}

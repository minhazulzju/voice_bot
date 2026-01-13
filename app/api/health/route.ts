import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type ServiceStatus = {
  ok: boolean;
  status?: number;
  error?: string;
};

export async function GET() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  async function checkOpenAI(): Promise<ServiceStatus> {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return { ok: false, error: 'Missing OPENAI_API_KEY' };
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: { Authorization: `Bearer ${key}` },
        signal: controller.signal,
      });
      return { ok: res.ok, status: res.status, error: res.ok ? undefined : await safeText(res) };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'OpenAI check failed' };
    }
  }

  async function checkGroq(): Promise<ServiceStatus> {
    const key = process.env.GROQ_API_KEY;
    if (!key) return { ok: false, error: 'Missing GROQ_API_KEY' };
    try {
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        method: 'GET',
        headers: { Authorization: `Bearer ${key}` },
        signal: controller.signal,
      });
      return { ok: res.ok, status: res.status, error: res.ok ? undefined : await safeText(res) };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'Groq check failed' };
    }
  }

  async function checkAzureSpeech(): Promise<ServiceStatus> {
    const key = process.env.AZURE_SPEECH_KEY;
    const region = process.env.AZURE_SPEECH_REGION || 'eastasia';
    if (!key) return { ok: false, error: 'Missing AZURE_SPEECH_KEY' };
    try {
      const res = await fetch(`https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': '0',
        },
        signal: controller.signal,
      });
      return { ok: res.ok, status: res.status, error: res.ok ? undefined : await safeText(res) };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'Azure Speech check failed' };
    }
  }

  async function checkDeepgram(): Promise<ServiceStatus | null> {
    const key = process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY || process.env.DEEPGRAM_API_KEY;
    if (!key) return null; // optional
    try {
      const res = await fetch('https://api.deepgram.com/v1/me', {
        method: 'GET',
        headers: { Authorization: `Token ${key}` },
        signal: controller.signal,
      });
      return { ok: res.ok, status: res.status, error: res.ok ? undefined : await safeText(res) };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'Deepgram check failed' };
    }
  }

  try {
    const [openai, groq, azure, deepgramMaybe] = await Promise.all([
      checkOpenAI(),
      checkGroq(),
      checkAzureSpeech(),
      checkDeepgram(),
    ]);

    const services: Record<string, ServiceStatus> = {
      openai,
      groq,
      azureSpeech: azure,
    };
    if (deepgramMaybe) services.deepgram = deepgramMaybe;

    return NextResponse.json({ services, timestamp: new Date().toISOString() });
  } finally {
    clearTimeout(timeout);
  }
}

async function safeText(res: Response): Promise<string | undefined> {
  try {
    return await res.text();
  } catch {
    return undefined;
  }
}

const BASE_URL = import.meta.env.VITE_API_URL || '';

export type AltTextMode = 'general' | 'seo' | 'accessibility' | 'ecommerce';
export type AltTextLanguage = 'english' | 'roman_urdu' | 'hindi';

export interface AltTextResult {
  short_alt_text: string;
  seo_alt_text: string;
  accessibility_alt_text: string;
  ecommerce_alt_text: string;
  notes?: string;
}

interface ApiErrorShape {
  error?: {
    code?: string;
    message?: string;
  };
}

export async function generateAltText(input: {
  file: File;
  keyword?: string;
  mode: AltTextMode;
  language: AltTextLanguage;
}): Promise<AltTextResult> {
  const form = new FormData();
  form.append('image', input.file);
  form.append('keyword', input.keyword || '');
  form.append('mode', input.mode);
  form.append('language', input.language);

  const response = await fetch(`${BASE_URL}/api/alt-text`, {
    method: 'POST',
    body: form,
  });

  const data = (await response.json().catch(() => ({}))) as AltTextResult & ApiErrorShape;
  if (!response.ok) {
    throw new Error(data.error?.message || 'Failed to generate alt text.');
  }

  return data;
}

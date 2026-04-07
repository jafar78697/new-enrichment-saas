import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#F6F7F2',
        surface: '#FFFFFF',
        subtle: '#EEF2EA',
        'text-primary': '#14202B',
        'text-secondary': '#52606D',
        'text-muted': '#7B8794',
        'border-soft': '#D8E1D7',
        'border-strong': '#BCC8BB',
        brand: { primary: '#0F766E', hover: '#115E59', secondary: '#0F4C81' },
        signal: '#F59E0B',
        success: '#15803D',
        danger: '#DC2626',
        info: '#2563EB',
      },
      fontFamily: {
        heading: ['Space Grotesk', 'sans-serif'],
        body: ['Manrope', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;

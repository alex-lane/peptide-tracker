import type { Config } from 'tailwindcss';

// Dark-first redesign palette. Inspired by saturated fintech UIs:
// near-black bg, vibrant purple primary, pink + cyan accents, status
// semantics retained from the M11 baseline.
//
// `paper-*` and `ink-*` are kept as legacy aliases so existing screens
// keep compiling untouched during the UI-M2 refactor pass.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ─── New token system ───────────────────────────────────────────
        bg: {
          base: '#0B0B14',
          surface: '#13131F',
          elevated: '#1A1A2A',
        },
        border: {
          subtle: '#262638',
          strong: '#3A3A52',
        },
        text: {
          primary: '#F0F0F5',
          secondary: '#9090A8',
          muted: '#5A5A70',
        },
        accent: {
          primary: '#7C5CFF',
          'primary-hover': '#9279FF',
          'primary-glow': 'rgba(124, 92, 255, 0.35)',
          pink: '#F472B6',
          cyan: '#22D3EE',
        },

        // ─── Legacy aliases (paper / ink) ──────────────────────────────
        // Old screens reference these; map them to the new tokens so the
        // theme switch doesn't ripple. Removed once UI-M2 lands and every
        // primitive uses the new tokens directly.
        paper: {
          50: '#1A1A2A', // → bg.elevated
          100: '#13131F', // → bg.surface
          200: '#1A1A2A', // → bg.elevated
          300: '#262638', // → border.subtle
        },
        ink: {
          50: '#9090A8', // → text.secondary
          100: '#9090A8', // → text.secondary
          200: '#F0F0F5', // → text.primary
          300: '#F0F0F5', // → text.primary
        },

        // ─── Semantic / status ─────────────────────────────────────────
        warn: {
          DEFAULT: '#F59E0B',
          fg: '#0B0B14',
        },
        success: {
          DEFAULT: '#34D399',
          fg: '#0B0B14',
        },
        danger: {
          DEFAULT: '#F43F5E',
          fg: '#0B0B14',
        },
        status: {
          pending: '#9090A8',
          logged: '#34D399',
          missed: '#F43F5E',
          synced: '#22D3EE',
          offline: '#F59E0B',
        },
      },
      fontFamily: {
        // Inter unifies display + body; JetBrains Mono stays for numerics.
        display: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'IBM Plex Mono', 'Menlo', 'monospace'],
      },
      fontSize: {
        xs: ['13px', '18px'],
        sm: ['15px', '22px'],
        base: ['17px', '26px'],
        lg: ['22px', '30px'],
        xl: ['28px', '36px'],
        num: ['14px', '20px'],
      },
      spacing: {
        '0.5': '2px',
        '1': '4px',
        '2': '8px',
        '3': '12px',
        '4': '16px',
        '6': '24px',
        '8': '32px',
        '12': '48px',
        '16': '64px',
      },
      borderRadius: {
        none: '0',
        sm: '4px',
        DEFAULT: '8px',
        md: '10px',
        lg: '14px',
        xl: '20px',
        full: '9999px',
      },
      boxShadow: {
        none: 'none',
        glow: '0 0 24px rgba(124, 92, 255, 0.35)',
        'glow-pink': '0 0 24px rgba(244, 114, 182, 0.30)',
        'glow-cyan': '0 0 24px rgba(34, 211, 238, 0.30)',
        card: '0 1px 0 rgba(255, 255, 255, 0.03) inset',
      },
      transitionDuration: {
        '120': '120ms',
        '240': '240ms',
      },
      transitionTimingFunction: {
        'ease-out-fast': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
} satisfies Config;

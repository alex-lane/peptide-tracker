import type { Config } from 'tailwindcss';

// Lab-notebook visual identity per autoplan TD1.
// Serif display + monospace numerics + paper-toned backgrounds, no card shadows.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Paper / ink palette
        paper: {
          50: '#FBF8F1',
          100: '#F8F4EC',
          200: '#F0E9D8',
          300: '#E5DAC0',
        },
        ink: {
          50: '#5C5851',
          100: '#3F3C36',
          200: '#2A2823',
          300: '#1C1A17',
        },
        // Semantic
        warn: {
          DEFAULT: '#B26A00',
          fg: '#FFFBF2',
        },
        success: {
          DEFAULT: '#2E5E3E',
          fg: '#F2FBF4',
        },
        danger: {
          DEFAULT: '#9B2C2C',
          fg: '#FFF5F5',
        },
        // Status tokens (for dose schedules / sync state)
        status: {
          pending: '#7A6A4F',
          logged: '#2E5E3E',
          missed: '#9B2C2C',
          synced: '#5C5851',
          offline: '#B26A00',
        },
      },
      fontFamily: {
        // Display: humanist serif (loaded via @import in index.css for now)
        display: ['Source Serif 4', 'Source Serif Pro', 'Lora', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'IBM Plex Mono', 'Menlo', 'monospace'],
      },
      fontSize: {
        // 13/15/17/22/28 + mono-14
        xs: ['13px', '18px'],
        sm: ['15px', '22px'],
        base: ['17px', '26px'],
        lg: ['22px', '30px'],
        xl: ['28px', '36px'],
        num: ['14px', '20px'],
      },
      spacing: {
        // 4-base, opinionated set: 4 / 8 / 12 / 16 / 24 / 32
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
        // Opinionated subset: 0 / 4 / 12
        none: '0',
        sm: '4px',
        DEFAULT: '4px',
        md: '12px',
        lg: '12px',
        full: '9999px',
      },
      boxShadow: {
        // Lab-notebook: NO shadows. Separators only.
        none: 'none',
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

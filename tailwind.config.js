/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Nord theme-aware colors (swap between dark/light via CSS vars)
        nord0: 'var(--nord0)',
        nord1: 'var(--nord1)',
        nord2: 'var(--nord2)',
        nord3: 'var(--nord3)',
        nord4: 'var(--nord4)',
        nord5: 'var(--nord5)',
        nord6: 'var(--nord6)',
        // Nord Frost (static — same in both themes)
        nord7: '#8FBCBB',
        nord8: '#88C0D0',
        nord9: '#81A1C1',
        nord10: '#5E81AC',
        // Nord Aurora (static)
        nord11: '#BF616A',
        nord12: '#D08770',
        nord13: '#EBCB8B',
        nord14: '#A3BE8C',
        nord15: '#B48EAD',
        // Semantic mapping (theme-aware via CSS vars)
        muse: {
          bg: 'var(--muse-bg)',
          surface: 'var(--muse-surface)',
          surfaceHover: 'var(--muse-surface-hover)',
          border: 'var(--muse-border)',
          borderLight: 'var(--muse-border-light)',
          primary: '#88C0D0',
          primaryHover: '#8FBCBB',
          primaryMuted: '#5E81AC',
          accent: '#81A1C1',
          text: 'var(--muse-text)',
          textSecondary: 'var(--muse-text-secondary)',
          textMuted: 'var(--muse-text-muted)',
          green: '#A3BE8C',
          greenBg: 'var(--muse-surface)',
          orange: '#D08770',
          orangeBg: 'var(--muse-surface)',
          red: '#BF616A',
          redBg: 'var(--muse-surface)',
          blue: '#5E81AC',
          yellow: '#EBCB8B',
          purple: '#B48EAD',
        },
      },
      fontFamily: {
        sans: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'monospace'],
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '0px',
        none: '0px',
        sm: '0px',
        md: '0px',
        lg: '0px',
        xl: '0px',
        '2xl': '0px',
        '3xl': '0px',
        full: '0px',
      },
      animation: {
        'slide-up': 'slideUp 0.15s ease-out',
        'slide-down': 'slideDown 0.15s ease-out',
        'fade-in': 'fadeIn 0.1s ease-out',
        'scale-in': 'scaleIn 0.1s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'blink': 'blink 1s step-end infinite',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(4px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-4px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.98)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
      },
    },
  },
  plugins: [],
};

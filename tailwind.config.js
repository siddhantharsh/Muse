/** @type {import('tailwindcss').Config} */
export default {
  content: ['./app.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Theme-aware palette slots (RGB channel vars for opacity support)
        nord0: 'rgb(var(--nord0) / <alpha-value>)',
        nord1: 'rgb(var(--nord1) / <alpha-value>)',
        nord2: 'rgb(var(--nord2) / <alpha-value>)',
        nord3: 'rgb(var(--nord3) / <alpha-value>)',
        nord4: 'rgb(var(--nord4) / <alpha-value>)',
        nord5: 'rgb(var(--nord5) / <alpha-value>)',
        nord6: 'rgb(var(--nord6) / <alpha-value>)',
        // Accents and status colours (theme-aware too)
        nord7: 'rgb(var(--nord7) / <alpha-value>)',
        nord8: 'rgb(var(--nord8) / <alpha-value>)',
        nord9: 'rgb(var(--nord9) / <alpha-value>)',
        nord10: 'rgb(var(--nord10) / <alpha-value>)',
        nord11: 'rgb(var(--nord11) / <alpha-value>)',
        nord12: 'rgb(var(--nord12) / <alpha-value>)',
        nord13: 'rgb(var(--nord13) / <alpha-value>)',
        nord14: 'rgb(var(--nord14) / <alpha-value>)',
        nord15: 'rgb(var(--nord15) / <alpha-value>)',
        // Semantic mapping (theme-aware via CSS vars)
        muse: {
          bg: 'var(--muse-bg)',
          surface: 'var(--muse-surface)',
          surfaceHover: 'var(--muse-surface-hover)',
          border: 'var(--muse-border)',
          borderLight: 'var(--muse-border-light)',
          primary: 'rgb(var(--nord8))',
          primaryHover: 'rgb(var(--nord7))',
          primaryMuted: 'rgb(var(--nord10))',
          accent: 'rgb(var(--nord9))',
          text: 'var(--muse-text)',
          textSecondary: 'var(--muse-text-secondary)',
          textMuted: 'var(--muse-text-muted)',
          green: 'rgb(var(--nord14))',
          greenBg: 'var(--muse-surface)',
          orange: 'rgb(var(--nord12))',
          orangeBg: 'var(--muse-surface)',
          red: 'rgb(var(--nord11))',
          redBg: 'var(--muse-surface)',
          blue: 'rgb(var(--nord10))',
          yellow: 'rgb(var(--nord13))',
          purple: 'rgb(var(--nord15))',
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

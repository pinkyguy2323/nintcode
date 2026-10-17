/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        graphite: {
          950: '#0b0d12',
          900: '#10131a',
          850: '#151923',
          800: '#1b2130',
          700: '#242c40',
          600: '#323b55',
        },
        nint: {
          violet: '#7c5cff',
          blue: '#38e1ff',
          ice: '#f2f6ff',
          mint: '#00e0a4',
        },
      },
      borderRadius: { '2xl': '1rem', '3xl': '1.4rem' },
      boxShadow: {
        glow: '0 0 42px -10px rgba(124,92,255,.6)',
        card: '0 12px 40px -18px rgba(0,0,0,.7)',
      },
      keyframes: {
        pulseDot: { '0%,100%': { opacity: '1' }, '50%': { opacity: '.35' } },
        shimmer: { '0%': { backgroundPosition: '-400px 0' }, '100%': { backgroundPosition: '400px 0' } },
        rise: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
      },
      animation: {
        pulseDot: 'pulseDot 1.2s ease-in-out infinite',
        rise: 'rise .25s ease-out',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Cascadia Code', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};

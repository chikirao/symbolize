/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#000000',
        panel: '#000000',
        line: '#2e2e2e',
        line2: '#4a4a4a',
        fg: '#ffffff',
        fg2: '#a0a0a0',
        fg3: '#6b6b6b',
        off: '#4d4d4d',
      },
      fontFamily: {
        mono: ['"Ubuntu Mono"', '"JetBrains Mono"', '"DejaVu Sans Mono"', '"Courier New"', 'monospace'],
      },
      fontSize: {
        xxs: ['10px', '13px'],
        xs2: ['11px', '14px'],
        sm2: ['13px', '16px'],
      },
    },
  },
  plugins: [],
}

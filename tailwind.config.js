/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        surface: {
          50: '#fafbfc',
          100: '#f4f6f8',
          200: '#e9ecf0',
          300: '#d5dae1',
          400: '#9aa5b4',
        },
        // CleanDictate dark theme color namespace
        cd: {
          bg: '#0D0D1A',
          card: '#1A1A2E',
          accent: '#E94560',
          text: '#E8E8E8',
          subtle: '#8E8E93',
          rewrite: '#5856D6',
          'mic-idle': '#1C1C1E',
          'mic-rec': '#E94560',
          'mic-proc': '#8E8E93',
        },
      },
      fontFamily: {
        sans: ['Segoe UI', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        'xl': '1rem',
        '2xl': '1.25rem',
      }
    },
  },
  plugins: [],
}

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: '#0b1220',
        panel: '#101827',
        'panel-secondary': '#0c1424',
        text: '#e8eef9',
        muted: '#93a4bf',
        accent: '#5b9dff',
        'accent-secondary': '#31d0aa',
        ok: '#46d369',
        warn: '#ffb020',
        danger: '#ff5c7a'
      },
      boxShadow: {
        panel: '0 8px 22px rgba(0, 0, 0, 0.32)'
      },
      borderRadius: {
        soft: '12px'
      },
      fontFamily: {
        sans: [
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif'
        ]
      }
    }
  },
  plugins: []
};

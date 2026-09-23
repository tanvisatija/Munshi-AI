/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Palette is Paytm cyan + navy only, plus semantic colours. Nothing else.
      colors: {
        cerulean: { DEFAULT: '#00BAF2', 50: '#E6F8FE', 100: '#CCF1FC', 200: '#99E3F9', 600: '#00A3D6', 700: '#0088B8' },
        navy: { DEFAULT: '#002E6E', 50: '#E8EEF6', 100: '#D1DCEC', 700: '#00265C', 900: '#001A40' },
        canvas: '#F5F7FA',
        success: { DEFAULT: '#1DB954', 50: '#E8F8EE', 700: '#12813A' },
        warning: { DEFAULT: '#FFB020', 50: '#FFF6E6', 700: '#9A6400' },
        danger: { DEFAULT: '#E5484D', 50: '#FDECEC', 700: '#B4262B' },
      },
      fontFamily: {
        // Poppins + Inter approximate Paytm's visual style; they are NOT Paytm's proprietary typeface.
        heading: ['Poppins', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        // Blue-tinted, soft. Never grey.
        card: '0 1px 3px rgba(0,46,110,0.06), 0 6px 20px rgba(0,98,168,0.07)',
        lift: '0 10px 32px rgba(0,70,140,0.16)',
        nav: '0 -4px 20px rgba(0,46,110,0.08)',
      },
      borderRadius: { card: '18px' },
    },
  },
  plugins: [],
};

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Helvetica Neue"', 'Helvetica', '"PingFang TC"', '"Microsoft JhengHei"', '"Heiti TC"', 'Arial', 'sans-serif'],
        mono: ['"Helvetica Neue"', 'Helvetica', '"PingFang TC"', '"Microsoft JhengHei"', '"Heiti TC"', 'Arial', 'sans-serif']
      }
    },
  },
  plugins: [],
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Instrument Serif"', "Georgia", "serif"],
        sans: ['"DM Sans"', "-apple-system", "sans-serif"],
        contract: ['"Source Serif 4"', "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};

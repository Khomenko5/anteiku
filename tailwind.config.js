// tailwind.config.js
module.exports = {
  content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Твій Dark Mode: RGB(48, 45, 40)
        'dark-coffee': 'rgb(48, 45, 40)',
        // Твій Light Mode: RGB(213, 196, 176)
        'latte': 'rgb(213, 196, 176)',
        // Акцентний колір для кнопок (золотистий)
        'accent-coffee': '#D97706',
      },
    },
  },
  plugins: [],
}
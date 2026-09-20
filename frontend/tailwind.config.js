/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eefcf8',
          100: '#d4f5ee',
          200: '#a8ebdd',
          300: '#6dd9c5',
          400: '#33c1a8',
          500: '#17a88e',
          600: '#0d8a74',
          700: '#006d5c',
          800: '#005d50',
          900: '#004d42',
          950: '#003d34',
          deep: '#005d50',
          ink: '#00473f',
          mist: '#edf7f5',
          line: '#dce9e7',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

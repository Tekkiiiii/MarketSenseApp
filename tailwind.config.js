/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                obsidian: '#0a0a0a',
                charcoal: '#141414',
                blood: '#e11d48',    // Rose-600 / Red
                blaze: '#f97316',    // Orange-500
                crimson: '#9f1239'   // Rose-800
            }
        },
    },
    plugins: [],
}

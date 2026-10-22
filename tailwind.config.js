/** Design tokens live in src/styles.css as RGB channels so Tailwind alpha modifiers work. */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,jsx,mjs}'],
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        raised: token('raised'),
        line: token('line'),
        strong: token('line-strong'),
        ink: token('ink'),
        muted: token('muted'),
        faint: token('faint'),
        accent: token('accent'),
        ok: token('ok'),
        warn: token('warn'),
        bad: token('bad'),
      },
      fontFamily: {
        sans: ['Vazirmatn', 'system-ui', 'sans-serif'],
        num: ['"Inter Variable"', 'Vazirmatn', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { card: '14px' },
    },
  },
  plugins: [],
};

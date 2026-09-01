import forms from '@tailwindcss/forms';
import containerQueries from '@tailwindcss/container-queries';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  darkMode: "class",
  theme: {
    extend: {
      "colors": {
        "secondary-container": "#fed255",
        "secondary-fixed": "#ffe08e",
        "on-secondary-container": "#735a00",
        "inverse-on-surface": "#eaf1ff",
        "surface-container-high": "#dce9ff",
        "secondary-fixed-dim": "#ecc246",
        "error": "#ba1a1a",
        "tertiary-container": "#727576",
        "surface-container-lowest": "#ffffff",
        "surface-container-highest": "#d3e4fe",
        "on-error": "#ffffff",
        "on-primary-fixed": "#00210e",
        "error-container": "#ffdad6",
        "inverse-primary": "#64dd91",
        "on-secondary-fixed": "#241a00",
        "primary-container": "#008649",
        "outline-variant": "#bdcabc",
        "outline": "#6d7a6f",
        "secondary": "#755b00",
        "tertiary-fixed-dim": "#c5c7c8",
        "surface-container": "#e5eeff",
        "background": "#f8f9ff",
        "primary-fixed-dim": "#64dd91",
        "on-tertiary-container": "#fbfdfe",
        "tertiary": "#5a5c5d",
        "on-tertiary-fixed": "#191c1d",
        "on-primary": "#ffffff",
        "surface-container-low": "#eff4ff",
        "on-secondary": "#ffffff",
        "tertiary-fixed": "#e1e3e4",
        "on-surface-variant": "#3e4a3f",
        "on-tertiary-fixed-variant": "#444748",
        "on-tertiary": "#ffffff",
        "surface-dim": "#cbdbf5",
        "surface-bright": "#f8f9ff",
        "on-surface": "#0b1c30",
        "on-primary-container": "#f6fff4",
        "surface-tint": "#006d3a",
        "on-secondary-fixed-variant": "#584400",
        "primary": "#006a39",
        "primary-fixed": "#82faab",
        "on-primary-fixed-variant": "#00522b",
        "surface-variant": "#d3e4fe",
        "on-error-container": "#93000a",
        "on-background": "#0b1c30",
        "inverse-surface": "#213145",
        "surface": "#f8f9ff"
      },
      "borderRadius": {
        "DEFAULT": "0.25rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
        "full": "9999px"
      },
      "spacing": {
        "2xl": "48px",
        "sm": "8px",
        "margin-desktop": "32px",
        "lg": "24px",
        "xl": "32px",
        "xs": "4px",
        "base": "4px",
        "margin-mobile": "16px",
        "gutter": "24px",
        "3xl": "64px",
        "max-width": "1440px",
        "md": "16px"
      },
      "fontFamily": {
        "label-md": ["Outfit", "sans-serif"],
        "headline-md": ["Outfit", "sans-serif"],
        "display-lg": ["Outfit", "sans-serif"],
        "headline-lg": ["Outfit", "sans-serif"],
        "headline-xl": ["Outfit", "sans-serif"],
        "display-lg-mobile": ["Outfit", "sans-serif"],
        "label-sm": ["Outfit", "sans-serif"],
        "body-md": ["Outfit", "sans-serif"],
        "body-lg": ["Outfit", "sans-serif"]
      },
      "fontSize": {
        "label-md": ["13px", {"lineHeight": "18px", "fontWeight": "500"}],
        "headline-md": ["20px", {"lineHeight": "28px", "fontWeight": "600"}],
        "display-lg": ["48px", {"lineHeight": "56px", "letterSpacing": "-0.02em", "fontWeight": "700"}],
        "headline-lg": ["24px", {"lineHeight": "32px", "fontWeight": "600"}],
        "headline-xl": ["30px", {"lineHeight": "38px", "letterSpacing": "-0.01em", "fontWeight": "600"}],
        "display-lg-mobile": ["32px", {"lineHeight": "40px", "letterSpacing": "-0.02em", "fontWeight": "700"}],
        "label-sm": ["11px", {"lineHeight": "16px", "letterSpacing": "0.05em", "fontWeight": "600"}],
        "body-md": ["14px", {"lineHeight": "20px", "fontWeight": "400"}],
        "body-lg": ["16px", {"lineHeight": "24px", "fontWeight": "400"}]
      }
    }
  },
  plugins: [
    forms,
    containerQueries
  ]
};


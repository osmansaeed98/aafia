// Lets phones add Aafia to the home screen like an app.
export default function manifest() {
  return {
    name: "عافية Aafia",
    short_name: "عافية",
    description: "احجز لدكتور أو مستشفى ليك ولأهلك",
    start_url: "/",
    display: "standalone",
    dir: "rtl",
    lang: "ar",
    background_color: "#FBF6EE",
    theme_color: "#0E5A4C",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

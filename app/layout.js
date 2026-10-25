export const metadata = {
  title: "Aafia",
  description: "Aafia web app",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

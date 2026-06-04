import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VoteVista — Know Your Constituency",
  description:
    "Visualize electoral candidates, their assets, criminal records, and the work of your MLA. POC: C.V. Raman Nagar (AC 161), Bengaluru.",
};

// Runs before paint to apply the saved/system theme and avoid a flash.
const themeScript = `
(function () {
  try {
    var t = localStorage.getItem('theme');
    var dark = t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

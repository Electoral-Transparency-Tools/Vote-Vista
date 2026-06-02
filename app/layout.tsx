import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VoteVista — Know Your Constituency",
  description:
    "Visualize electoral candidates, their assets, criminal records, and the work of your MLA. POC: C.V. Raman Nagar (AC 161), Bengaluru.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Doorway — Your store, open to what’s next",
    template: "%s · Doorway",
  },
  description:
    "Prepare your store for agent-assisted shopping. Review your catalog, set your rules, and keep every purchase in human hands.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <a href="#page-content" className="skip-link">
          Skip to content
        </a>
        <div id="page-content">{children}</div>
      </body>
    </html>
  );
}

import "./globals.css";

export const metadata = {
  title: "Venice Deep Research",
  description: "Deep research workflow powered by Venice and Brave Search.",
  metadataBase: new URL("https://venice-deep-research.fly.dev"),
  openGraph: {
    title: "Venice Deep Research",
    description: "Deep research workflow powered by Venice and Brave Search.",
    url: "https://venice-deep-research.fly.dev",
    siteName: "Venice Deep Research",
    images: [
      {
        url: "https://venice-deep-research.fly.dev/og-image.png",
        width: 1200,
        height: 630,
        alt: "Venice Deep Research UI"
      }
    ],
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Venice Deep Research",
    description: "Deep research workflow powered by Venice and Brave Search.",
    images: ["https://venice-deep-research.fly.dev/og-image.png"]
  }
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

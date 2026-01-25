import "./globals.css";

export const metadata = {
  title:
    "OpenDeepResesarch, fork of \"ThinkDepth.ai Deep Research\", powered by Venice and Brave Search",
  description:
    "OpenDeepResesarch is a fork of ThinkDepth.ai Deep Research powered by Venice and Brave Search."
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

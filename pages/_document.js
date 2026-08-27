import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta charSet="utf-8" />
        <meta name="color-scheme" content="light dark" />
        <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)" />

        <link rel="preconnect" href="https://cdn.adamliu.uk" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://a.basemaps.cartocdn.com" crossOrigin="anonymous" />

        <meta
          name="description"
          content="A-Stuff is an archive of scanned objects, each one pinned to the coordinate where it was picked up."
        />
        <meta
          name="keywords"
          content="a-stuff personal archive, travel archive, interactive map, 3D objects, passkey admin, quiet interface"
        />

        <meta property="og:title" content="A-Stuff" />
        <meta
          property="og:description"
          content="An archive of scanned objects, each one pinned to the coordinate where it was picked up."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://a-stuff.vercel.app" />
        <meta property="og:image" content="/og-image.jpg" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="A-Stuff" />
        <meta
          name="twitter:description"
          content="An archive of scanned objects, each one pinned to the coordinate where it was picked up."
        />
        <meta name="twitter:image" content="/og-image.jpg" />

        <link
          rel="icon"
          href="/favicon.ico"
          type="image/x-icon"
        />
        <link
          rel="shortcut icon"
          href="/favicon.ico"
          type="image/x-icon"
        />
      </Head>
      <body className="antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}

import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta charSet="utf-8" />
        <meta name="theme-color" content="#f7f6f2" />
        <meta name="color-scheme" content="light" />

        <meta
          name="description"
          content="Voyage Artifacts is a quiet archive of travel objects, presented as an interactive map and minimal admin workspace."
        />
        <meta
          name="keywords"
          content="voyage artifacts, travel archive, interactive map, 3D objects, passkey admin, quiet interface"
        />

        <meta property="og:title" content="Voyage Artifacts" />
        <meta
          property="og:description"
          content="A quiet archive of travel objects, with a calm map-led public page and a matching admin workspace."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://voyage-artifacts.vercel.app" />
        <meta property="og:image" content="/og-image.jpg" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Voyage Artifacts" />
        <meta
          name="twitter:description"
          content="A quiet archive of travel objects, presented as an interactive map and minimal admin workspace."
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

import { Martian_Mono } from 'next/font/google';
import "@/styles/globals.css";
import 'leaflet/dist/leaflet.css';

// Mode E monospace context: Martian Mono first, Letter Gothic / Courier New behind it.
const martianMono = Martian_Mono({
  subsets: ['latin'],
  display: 'swap',
});

export default function App({ Component, pageProps }) {
  return (
    <>
      <style jsx global>{`
        :root {
          --font-mono-loaded: ${martianMono.style.fontFamily};
        }
      `}</style>
      <Component {...pageProps} />
    </>
  );
}

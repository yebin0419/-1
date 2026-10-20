import "./globals.css";

export const metadata = {
  title: "김예빈의 지뢰게임",
  description: "Next.js + Vercel + Supabase 로 만든 지뢰게임",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

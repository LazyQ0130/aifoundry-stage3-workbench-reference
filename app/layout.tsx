import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "个人知识工作台",
  description: "把我平时收集的资料整理在这里。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

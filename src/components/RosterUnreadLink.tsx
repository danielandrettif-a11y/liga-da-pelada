"use client";

import Link from "next/link";
import { type ReactNode } from "react";

export function RosterUnreadLink({
  href,
  unread,
  className = "",
  children,
}: {
  href: string;
  unread: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`${className} ${unread ? "rounded-2xl ring-2 ring-danger/85 shadow-[0_0_20px_rgba(239,68,68,.22)]" : ""}`}
    >
      {children}
    </Link>
  );
}

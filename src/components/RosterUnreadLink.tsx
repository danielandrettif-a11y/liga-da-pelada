"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useRef } from "react";
import { markRosterActivitySeenThrough } from "@/lib/actions/registrations";

let activeSeenRequest: Promise<{ success: boolean; error?: string }> | null = null;

export function RosterUnreadLink({
  href,
  unread,
  seenThrough,
  className = "",
  children,
}: {
  href: string;
  unread: boolean;
  seenThrough: string | null;
  className?: string;
  children: ReactNode;
}) {
  const linkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const element = linkRef.current;
    if (!unread || !seenThrough || !element) return;

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.55)) return;
      observer.disconnect();

      if (!activeSeenRequest) {
        activeSeenRequest = markRosterActivitySeenThrough(seenThrough).finally(() => {
          activeSeenRequest = null;
        });
      }
      void activeSeenRequest.then((result) => {
        if (result.success) window.dispatchEvent(new CustomEvent("roster-unread-cleared"));
      });
    }, { threshold: [0.55] });

    observer.observe(element);
    return () => observer.disconnect();
  }, [seenThrough, unread]);

  return (
    <Link
      ref={linkRef}
      href={href}
      className={`${className} ${unread ? "rounded-2xl ring-2 ring-danger/85 shadow-[0_0_20px_rgba(239,68,68,.22)]" : ""}`}
    >
      {children}
    </Link>
  );
}

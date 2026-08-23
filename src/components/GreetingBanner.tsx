"use client";

import { useEffect, useState } from "react";
import { ShareAppButton } from "./ShareAppButton";
import { InboxBell } from "./InboxBell";
import type { InboxNotification } from "@/lib/actions/inbox";

function greetingForHour(hour: number) {
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}

export function GreetingBanner({
  name,
  inbox = [],
}: {
  name: string | null;
  inbox?: InboxNotification[];
}) {
  const [greeting, setGreeting] = useState("Olá");

  useEffect(() => {
    setGreeting(greetingForHour(new Date().getHours()));
  }, []);

  return (
    <section className="flex items-center justify-between gap-3 animate-fade-in px-1 py-1">
      <div className="min-w-0">
        <p className="truncate font-athletic text-2xl font-black text-foreground">
          {greeting}{name ? `, ${name}` : ""}!
        </p>
        <p className="mt-0.5 text-sm font-medium text-muted">Vamos jogar?</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <InboxBell notifications={inbox} />
        <ShareAppButton className="shadow-sm" />
      </div>
    </section>
  );
}

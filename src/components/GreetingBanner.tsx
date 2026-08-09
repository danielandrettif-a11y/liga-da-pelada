"use client";

import { useEffect, useState } from "react";

function greetingForHour(hour: number) {
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}

export function GreetingBanner({ name }: { name: string | null }) {
  const [greeting, setGreeting] = useState("Olá");

  useEffect(() => {
    setGreeting(greetingForHour(new Date().getHours()));
  }, []);

  return (
    <section className="animate-fade-in px-1 py-1">
      <p className="font-athletic text-2xl font-black text-foreground">
        {greeting}{name ? `, ${name}` : ""}!
      </p>
      <p className="mt-1 text-sm font-medium text-muted">Vamos jogar?</p>
    </section>
  );
}

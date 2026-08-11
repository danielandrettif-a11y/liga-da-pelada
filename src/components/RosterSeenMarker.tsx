"use client";

import { useEffect } from "react";
import { markRosterActivitySeen } from "@/lib/actions/registrations";

export function RosterSeenMarker() {
  useEffect(() => {
    void markRosterActivitySeen();
  }, []);
  return null;
}

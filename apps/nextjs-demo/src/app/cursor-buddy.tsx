"use client";

import { CursorBuddy } from "cursor-buddy/react";
import { toast } from "sonner";

// Client component wrapper to allow passing the `onError` prop.
export function CursorBuddyWrapper() {
  return (
    <CursorBuddy
      onError={(err) => {
        toast.error(err.message);
      }}
      endpoint="/api/cursor-buddy"
    />
  );
}

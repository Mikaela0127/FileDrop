"use client";
import { useEffect } from "react";
import { reportClientFailure } from "../lib/operations/client-diagnostics";

export default function GlobalError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    reportClientFailure("render");
  }, []);
  return (
    <html lang="en">
      <body>
        <main role="alert">
          <h1>FileDrop is temporarily unavailable</h1>
          <p>
            Please try again. Note the time if you need help troubleshooting.
          </p>
          <button onClick={retry}>Try again</button>
        </main>
      </body>
    </html>
  );
}

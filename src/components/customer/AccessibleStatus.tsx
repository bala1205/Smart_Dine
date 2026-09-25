import { useEffect, useRef } from "react";

export function AccessibleStatus({
  message,
  level = "polite",
}: {
  message: string;
  level?: "polite" | "assertive";
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) {
      // Ensure screen reader announces
      ref.current.textContent = message;
    }
  }, [message]);
  return (
    <div
      ref={ref}
      role="status"
      aria-live={level}
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  );
}

export function AccessibleAlert({
  message,
}: {
  message: string;
}) {
  return (
    <div role="alert" aria-live="assertive" className="sr-only">
      {message}
    </div>
  );
}

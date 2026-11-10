"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";

export function ProductTableRow({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  const router = useRouter();
  function onKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      router.push(href);
    }
  }

  return (
    <tr
      aria-label={label}
      className="product-table-row"
      onClick={() => router.push(href)}
      onKeyDown={onKeyDown}
      role="link"
      tabIndex={0}
    >
      {children}
    </tr>
  );
}

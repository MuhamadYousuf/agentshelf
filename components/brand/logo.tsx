import Link from "next/link";

type LogoProps = {
  href?: string;
  wordmark?: boolean;
  className?: string;
};

export function Logo({
  href = "/",
  wordmark = true,
  className,
}: LogoProps) {
  return (
    <Link
      aria-label="AgentShelf home"
      className={`brand-link${className ? ` ${className}` : ""}`}
      href={href}
    >
      <svg aria-hidden="true" className="brand-mark" fill="none" viewBox="0 0 36 36">
        <path
          d="M7 24.5h22M10 24.5v4h16v-4M12 19h12"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
        <path
          d="m23.5 5.5 1.6 4.3 4.4 1.7-4.4 1.6-1.6 4.4-1.7-4.4-4.3-1.6 4.3-1.7 1.7-4.3Z"
          fill="currentColor"
        />
      </svg>
      {wordmark ? <span className="brand-wordmark">AgentShelf</span> : null}
    </Link>
  );
}

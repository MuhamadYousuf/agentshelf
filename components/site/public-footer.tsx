import Link from "next/link";

const repository = "https://github.com/MuhamadYousuf/agentshelf";

export function PublicFooter() {
  return (
    <footer className="public-footer">
      <div className="public-footer-inner">
        <span>AgentShelf · Sandbox demo, no real money.</span>
        <nav aria-label="Public footer">
          <a href={repository} rel="noreferrer" target="_blank">GitHub</a>
          <Link href="/security">Security</Link>
          <Link href="/tour">Judge tour</Link>
        </nav>
      </div>
    </footer>
  );
}

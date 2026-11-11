import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CopilotMarkdown } from "./copilot-markdown";

describe("CopilotMarkdown", () => {
  it("renders bold and italic emphasis", () => {
    const markup = renderToStaticMarkup(<CopilotMarkdown text="**Paid** with *Agent Pass*." />);
    expect(markup).toContain("<strong>Paid</strong>");
    expect(markup).toContain("<em>Agent Pass</em>");
  });

  it("renders simple bullet lists and line breaks", () => {
    const markup = renderToStaticMarkup(<CopilotMarkdown text={"Orders:\n- One\n- **Two**\nNext line"} />);
    expect(markup).toContain("<ul><li>One</li><li><strong>Two</strong></li></ul>");
    expect(markup).toContain("<br/>");
  });

  it("renders HTML-like model output as escaped text", () => {
    const markup = renderToStaticMarkup(<CopilotMarkdown text={'<img src=x onerror="alert(1)">'} />);
    expect(markup).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(markup).not.toContain("<img");
  });
});

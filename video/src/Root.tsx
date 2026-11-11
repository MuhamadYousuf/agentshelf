import React from "react";
import { Composition, Still } from "remotion";
import { Main, TOTAL_FRAMES } from "./Main";
import { Thumbnail } from "./Thumbnail";
import { FPS } from "./theme";

export const Root: React.FC = () => (
  <>
    <Composition id="AgentShelf" component={Main} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} />
    <Still id="Thumbnail" component={Thumbnail} width={1280} height={720} />
  </>
);

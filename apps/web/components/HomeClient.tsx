"use client";

import { IntroSplash, useIntroGate } from "../components/IntroSplash";
import { SentinelDashboard } from "../components/SentinelDashboard";

export function HomeClient() {
  const { mounted, showIntro, completeIntro } = useIntroGate();

  if (!mounted) {
    return <div className="intro-placeholder" aria-hidden />;
  }

  return (
    <>
      {showIntro ? <IntroSplash onComplete={completeIntro} /> : null}
      <div className={`app-root ${showIntro ? "app-root-hidden" : "app-root-visible"}`}>
        <SentinelDashboard />
      </div>
    </>
  );
}

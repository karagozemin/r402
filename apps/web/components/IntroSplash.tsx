"use client";

import logo from "../../../r402.png";
import Image from "next/image";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";

const INTRO_KEY = "r402-intro-seen";
const INTRO_MS = 3200;
const STEPS = ["Plan", "Permit", "Execute", "Anchor"];

type IntroSplashProps = {
  onComplete: () => void;
};

export function IntroSplash({ onComplete }: IntroSplashProps) {
  const [exiting, setExiting] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const doneRef = useRef(false);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setExiting(true);
    setProgress(100);
    setActiveStep(STEPS.length - 1);
    window.setTimeout(onComplete, 520);
  }, [onComplete]);

  useEffect(() => {
    const start = performance.now();
    let frame = 0;

    function tick(now: number) {
      const elapsed = now - start;
      const ratio = Math.min(elapsed / INTRO_MS, 1);
      setProgress(ratio * 100);
      setActiveStep(Math.min(STEPS.length - 1, Math.floor(ratio * STEPS.length)));
      if (ratio < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        finish();
      }
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [finish]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Enter" || event.key === "Escape") finish();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [finish]);

  return (
    <div className={`intro ${exiting ? "intro-exit" : "intro-enter"}`} role="dialog" aria-label="r402 Sentinel intro">
      <div className="intro-glow intro-glow-one" />
      <div className="intro-glow intro-glow-two" />

      <div className="intro-content">
        <div className="intro-logo-wrap">
          <Image src={logo} alt="r402" width={88} height={88} className="intro-logo" priority />
        </div>
        <p className="intro-eyebrow">Proof-bound agent firewall</p>
        <h1 className="intro-title">
          <span>r402</span> Sentinel
        </h1>
        <p className="intro-tagline">
          Bounded permissions. Protected payments. Undeniable proofs.
        </p>
        <div className="intro-steps" aria-hidden>
          {STEPS.map((step, index) => (
            <Fragment key={step}>
              {index > 0 ? (
                <i className={index <= activeStep ? "intro-step-line active" : "intro-step-line"} />
              ) : null}
              <span className={index <= activeStep ? "active" : ""}>{step}</span>
            </Fragment>
          ))}
        </div>
        <div className="intro-progress" aria-hidden>
          <span className="intro-progress-bar" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
}

export function useIntroGate() {
  const [showIntro, setShowIntro] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const seen = sessionStorage.getItem(INTRO_KEY);
    setShowIntro(!seen);
    setMounted(true);
  }, []);

  const completeIntro = useCallback(() => {
    sessionStorage.setItem(INTRO_KEY, "1");
    setShowIntro(false);
  }, []);

  return { mounted, showIntro, completeIntro };
}

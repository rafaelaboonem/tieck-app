import { LazyMotion, domAnimation, m } from "framer-motion";
import type { ReactNode } from "react";

// Wraps children with framer-motion's LazyMotion using the smaller
// `domAnimation` feature bundle. Use the `m` component instead of `motion`
// inside descendants to keep the initial bundle small.
export function MotionProvider({ children }: { children: ReactNode }) {
  return <LazyMotion features={domAnimation} strict>{children}</LazyMotion>;
}

export { m };
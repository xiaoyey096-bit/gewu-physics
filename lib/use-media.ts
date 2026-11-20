import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

export interface Breakpoint {
  /** ≥1280：三栏并列 */
  desktop: boolean;
  /** ≥1024：左栏内联，右栏覆盖 */
  tablet: boolean;
  /** <1024：抽屉 + 底部 Tab */
  mobile: boolean;
}

export function useBreakpoint(): Breakpoint {
  const desktop = useMediaQuery("(min-width: 1280px)");
  const tablet = useMediaQuery("(min-width: 1024px)");
  return { desktop, tablet, mobile: !tablet };
}

export function useReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}
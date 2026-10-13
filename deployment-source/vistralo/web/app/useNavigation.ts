import {
  useEffect,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import type { AppMode } from "../contracts";
export function useNavigation({
  mode,
  authenticated,
  collapsed,
  mobileNavigation,
  drawer,
  navigationRef,
  drawerReturnFocus,
  setMobileNavigation,
  setDrawer,
  setMenu,
}: {
  mode: AppMode;
  authenticated: boolean;
  collapsed: boolean;
  mobileNavigation: boolean;
  drawer: boolean;
  navigationRef: RefObject<HTMLElement | null>;
  drawerReturnFocus: RefObject<HTMLElement | null>;
  setMobileNavigation: Dispatch<SetStateAction<boolean>>;
  setDrawer: Dispatch<SetStateAction<boolean>>;
  setMenu: Dispatch<SetStateAction<string>>;
}) {
  useEffect(() => {
    localStorage.setItem("vistralo-rail", collapsed ? "collapsed" : "expanded");
  }, [collapsed]);
  useEffect(() => {
    if (mode === "cloud" && !authenticated) {
      setDrawer(false);
      setMenu("");
    }
  }, [mode, authenticated]);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const change = () => {
      const wasInNavigation = navigationRef.current?.contains(
        document.activeElement,
      );
      setMobileNavigation(query.matches);
      setDrawer(false);
      setMenu("");
      if (query.matches && wasInNavigation)
        requestAnimationFrame(() =>
          document.getElementById("navigation-trigger")?.focus(),
        );
    };
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (!mobileNavigation || !drawer) return;
    const navigation = navigationRef.current;
    if (!navigation) return;
    const focusable = () =>
      Array.from(
        navigation.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(
        (element) =>
          element.tabIndex >= 0 &&
          !element.closest("[inert]") &&
          element.getClientRects().length > 0 &&
          getComputedStyle(element).visibility !== "hidden",
      );
    const focusStart = () =>
      (
        navigation.querySelector<HTMLElement>(
          'button[aria-label="Close navigation"]',
        ) ||
        focusable()[0] ||
        navigation
      ).focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    focusStart();
    const key = (event: KeyboardEvent) => {
      // A native modal opened from navigation owns focus until it closes.
      if (document.querySelector("dialog[open]")) return;
      // The drawer owns keyboard interaction; background window shortcuts must
      // not select projects or open search/create controls behind it.
      event.stopPropagation();
      if (
        event.key === "Escape" ||
        ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b")
      ) {
        event.preventDefault();
        setMenu("");
        setDrawer(false);
      } else if (event.key === "Tab") {
        const targets = focusable();
        const first = targets[0],
          last = targets[targets.length - 1];
        if (!first) {
          event.preventDefault();
          navigation.focus();
        } else if (
          !navigation.contains(document.activeElement) ||
          (event.shiftKey && document.activeElement === first) ||
          (!event.shiftKey && document.activeElement === last)
        ) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        }
      }
    };
    const containFocus = (event: FocusEvent) => {
      if (
        !document.querySelector("dialog[open]") &&
        !navigation.contains(event.target as Node)
      )
        focusStart();
    };
    document.addEventListener("keydown", key);
    document.addEventListener("focusin", containFocus);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("focusin", containFocus);
      document.body.style.overflow = previousOverflow;
      requestAnimationFrame(() => {
        if (
          !window.matchMedia("(max-width: 767px)").matches ||
          document.querySelector("dialog[open]")
        )
          return;
        const target = drawerReturnFocus.current;
        if (target?.isConnected && !target.closest("[inert]")) target.focus();
        else document.getElementById("navigation-trigger")?.focus();
      });
    };
  }, [mobileNavigation, drawer]);
}

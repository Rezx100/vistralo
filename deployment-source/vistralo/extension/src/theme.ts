// Matches the app: light by default, dark when the system asks for it.
const dark = matchMedia("(prefers-color-scheme: dark)");
const apply = () => document.documentElement.setAttribute("data-theme", dark.matches ? "dark" : "light");
apply();
dark.addEventListener("change", apply);

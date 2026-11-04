"use client";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
export default function ThemeToggle() { const [dark, setDark] = useState(false); // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const saved = localStorage.getItem("clinic-theme") === "dark"; setDark(saved); document.documentElement.classList.toggle("dark-mode", saved); }, []); function toggle() { const next = !dark; setDark(next); localStorage.setItem("clinic-theme", next ? "dark" : "light"); document.documentElement.classList.toggle("dark-mode", next); } return <button type="button" className="theme-toggle no-print" onClick={toggle} aria-label={dark ? "الوضع النهاري" : "الوضع الليلي"} title={dark ? "الوضع النهاري" : "الوضع الليلي"}>{dark ? <Sun size={17} /> : <Moon size={17} />}</button>; }

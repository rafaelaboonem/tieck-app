import React, { useEffect, useRef, useState } from "react";

const PRESET_ROWS = [
  ["#FFFFFF", "#FFD7D7", "#FFE0CC", "#FFF4CC", "#E0F0CC", "#CCE6FF", "#E0D4FF", "#FFD4F0"],
  ["#F0F0F0", "#FFB3B3", "#FFC299", "#FFE999", "#C2E199", "#99CCFF", "#C2A8FF", "#FFA8E0"],
  ["#9E9E9E", "#FF6B6B", "#FF8C42", "#FFD93D", "#8BC34A", "#3D9BFF", "#9A6BFF", "#FF52BD"],
  ["#424242", "#D32F2F", "#E65100", "#F9A825", "#558B2F", "#1565C0", "#5E35B1", "#C2185B"],
  ["#1E1E1E", "#7F1010", "#A04000", "#9C7A00", "#33691E", "#0D47A1", "#311B92", "#880E4F"],
];

interface Props {
  value: string;
  onChange: (color: string) => void;
  onReset: () => void;
}

export function ColorPicker({ value, onChange, onReset }: Props) {
  const [hex, setHex] = useState(value);
  const [hue, setHue] = useState(40);
  const [sat, setSat] = useState(0.85);
  const [val, setVal] = useState(0.95);
  const sqRef = useRef<HTMLDivElement>(null);
  const draggingSq = useRef(false);
  const draggingHue = useRef(false);

  const hexToHsv = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    const s = max === 0 ? 0 : d / max;
    const v = max;
    if (d !== 0) {
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return { h: h * 360, s, v };
  };

  const hsvToHex = (h: number, s: number, v: number) => {
    const c = v * s;
    const hh = ((h % 360) + 360) % 360 / 60;
    const x = c * (1 - Math.abs((hh % 2) - 1));
    let r = 0, g = 0, b = 0;
    if (hh < 1) { r = c; g = x; }
    else if (hh < 2) { r = x; g = c; }
    else if (hh < 3) { g = c; b = x; }
    else if (hh < 4) { g = x; b = c; }
    else if (hh < 5) { r = x; b = c; }
    else { r = c; b = x; }
    const m = v - c;
    const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };

  useEffect(() => {
    if (/^#[0-9a-fA-F]{6}$/.test(value)) {
      setHex(value);
      const { h, s, v } = hexToHsv(value);
      if (s > 0.01) setHue(h);
      setSat(s);
      setVal(v);
    }
  }, [value]);

  const updateFromSV = (clientX: number, clientY: number) => {
    const el = sqRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    setSat(x);
    setVal(1 - y);
    const c = hsvToHex(hue, x, 1 - y);
    setHex(c);
    onChange(c);
  };

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (draggingSq.current) updateFromSV(e.clientX, e.clientY);
      if (draggingHue.current) {
        const target = document.getElementById("hue-bar");
        if (target) {
          const r = target.getBoundingClientRect();
          const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
          const newHue = x * 360;
          setHue(newHue);
          const c = hsvToHex(newHue, sat, val);
          setHex(c);
          onChange(c);
        }
      }
    };
    const up = () => { draggingSq.current = false; draggingHue.current = false; };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [hue, sat, val, onChange]);

  const pickPreset = (c: string) => {
    setHex(c);
    onChange(c);
  };

  return (
    <div
      className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-2xl p-3 w-[280px]"
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* Saturation/Lightness square */}
      <div
        ref={sqRef}
        className="relative w-full h-[140px] rounded-lg cursor-crosshair overflow-hidden"
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hue}, 100%, 50%))`,
        }}
        onMouseDown={(e) => {
          draggingSq.current = true;
          updateFromSV(e.clientX, e.clientY);
        }}
      >
        <div
          className="absolute w-3.5 h-3.5 rounded-full border-2 border-white shadow-md -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{ left: `${sat * 100}%`, top: `${(1 - val) * 100}%` }}
        />
      </div>

      {/* Hue bar */}
      <div
        id="hue-bar"
        className="relative w-full h-3 rounded-full mt-3 cursor-pointer"
        style={{
          background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
        }}
        onMouseDown={(e) => {
          draggingHue.current = true;
          const r = e.currentTarget.getBoundingClientRect();
          const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
          const newHue = x * 360;
          setHue(newHue);
          const c = hsvToHex(newHue, sat, val);
          setHex(c);
          onChange(c);
        }}
      >
        <div
          className="absolute w-3.5 h-3.5 rounded-full border-2 border-white shadow-md -translate-x-1/2 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ left: `${(hue / 360) * 100}%`, backgroundColor: `hsl(${hue}, 100%, 50%)` }}
        />
      </div>

      {/* Preset grid */}
      <div className="grid grid-cols-8 gap-1.5 mt-3">
        {PRESET_ROWS.flat().map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => pickPreset(c)}
            className="w-full aspect-square rounded-md border border-neutral-200 dark:border-neutral-700 hover:scale-110 transition-transform"
            style={{ backgroundColor: c }}
            aria-label={c}
          />
        ))}
      </div>

      {/* Hex */}
      <div className="flex items-center gap-2 mt-3 px-2 py-1.5 border border-neutral-200 dark:border-neutral-700 rounded-md">
        <div className="w-5 h-5 rounded border border-neutral-300" style={{ backgroundColor: hex }} />
        <input
          type="text"
          value={hex}
          onChange={(e) => {
            const v = e.target.value;
            setHex(v);
            if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v);
          }}
          className="flex-1 text-sm bg-transparent outline-none min-w-0"
        />
        <button
          type="button"
          onClick={onReset}
          className="text-neutral-500 hover:text-neutral-900 dark:hover:text-white text-sm"
          title="Limpar cor"
        >
          T<span className="text-xs">×</span>
        </button>
      </div>
    </div>
  );
}
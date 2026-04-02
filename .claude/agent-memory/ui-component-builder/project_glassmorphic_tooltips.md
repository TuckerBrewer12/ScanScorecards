---
name: Glassmorphic tooltip style
description: Approved inline style object for Recharts tooltip contentStyle
type: project
---

Recharts `tooltipStyle` object:
```ts
{
  fontSize: 12,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.6)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.75)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
}
```

SVG custom tooltips (framer-motion `motion.div`) use Tailwind: `bg-white/95 backdrop-blur-sm rounded-xl border border-gray-100 shadow-lg px-3 py-2.5 text-xs`.

**Why:** Consistent material depth / glassmorphism across all chart tooltips.

**How to apply:** Any new Recharts chart should use the inline `tooltipStyle` object above. Any new custom SVG tooltip should use the Tailwind classes above.

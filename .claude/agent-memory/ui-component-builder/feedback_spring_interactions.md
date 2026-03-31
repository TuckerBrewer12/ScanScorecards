---
name: Spring micro-interaction pattern
description: Approved pattern for adding spring hover/tap to interactive cards and table rows
type: feedback
---

Interactive BentoCards use `interactive` prop + `whileHover/whileTap` in the component itself. Non-interactive cards render as plain `div`. Pattern: `whileHover={{ scale: 1.01, boxShadow: "0 10px 32px rgba(0,0,0,0.08)" }} whileTap={{ scale: 0.98 }} transition={{ type: "spring", stiffness: 400, damping: 17 }}`.

Table rows (`motion.tr`) use the same spring with `whileHover={{ scale: 1.01, backgroundColor: "rgba(249,250,251,1)" }}`.

**Why:** Only interactive (clickable/navigatable) elements should have micro-interactions — purely decorative containers should not.

**How to apply:** Check if a card has `onClick` or navigates somewhere before marking it `interactive`. `BentoCard` now accepts `interactive?: boolean` and `onClick?: () => void`.

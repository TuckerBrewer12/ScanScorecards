---
name: Glass PageHeader with useScroll
description: PageHeader is a fixed glassmorphic sticky bar using framer-motion useScroll/useTransform
type: project
---

`PageHeader` is `position: fixed, top-0, left-64, right-0, z-40`. At scroll=0 it is fully transparent (massive h1 on the canvas). By scroll=50px it transitions to `rgba(248,250,248,0.85)` with `backdrop-blur(24px)` and a faint bottom border + shadow. Font size animates from 36px → 20px. `AppLayout` compensates with `pt-20` on `<main>`.

**Why:** Apple-native feel — title reads as a page hero at top, compresses into a sticky navigation label on scroll. All pages that use `PageHeader` inherit this behavior automatically.

**How to apply:** Any new page should use `<PageHeader title="..." subtitle="..." />` to participate in this system. Do not add separate hero headings inside page body — the fixed header IS the heading.

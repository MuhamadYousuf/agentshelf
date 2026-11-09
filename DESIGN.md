---
name: AgentShelf
description: A warm, considered storefront system for independent shops and agent buyers.
colors:
  primary: "#3B2ED0"
  agent-amber: "#F5A524"
  success: "#12A150"
  destructive: "#E5484D"
  paper: "#FAF8F5"
  ink: "#14141F"
  surface: "#FFFDFA"
  primary-foreground: "#FFFFFF"
  muted: "#F1EEE9"
  muted-foreground: "#5B5964"
  secondary-foreground: "#242331"
  agent-soft: "#FFF2D7"
  agent-ink: "#674604"
  border: "#E6E1D9"
  input: "#D8D2C9"
  sidebar: "#F4F1EC"
  sidebar-accent: "#EAE6F8"
  sidebar-accent-foreground: "#251D7C"
  sidebar-border: "#E2DDD5"
typography:
  display:
    fontFamily: "Instrument Serif, Georgia, serif"
    fontSize: "clamp(64px, 7.2vw, 92px)"
    fontWeight: 400
    lineHeight: 0.94
    letterSpacing: "-0.038em"
  display-compact:
    fontFamily: "Instrument Serif, Georgia, serif"
    fontSize: "clamp(57px, 16vw, 74px)"
    fontWeight: 400
    lineHeight: 0.94
    letterSpacing: "-0.038em"
  headline:
    fontFamily: "Instrument Serif, Georgia, serif"
    fontSize: "clamp(42px, 5vw, 57px)"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Instrument Serif, Georgia, serif"
    fontSize: "25px"
    fontWeight: 400
    lineHeight: 1.08
    letterSpacing: "-0.03em"
  body:
    fontFamily: "Inter, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Inter, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.08em"
  nav:
    fontFamily: "Inter, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.4
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
rounded:
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "16px"
  auth: "18px"
  card: "20px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "rgb(59 46 208 / 90%)"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
  button-hero:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.pill}"
    padding: "12px 22px"
    height: "48px"
  button-secondary:
    backgroundColor: "rgba(255, 253, 250, 0.65)"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "12px 22px"
    height: "48px"
  navigation-link:
    textColor: "#4D4A55"
    typography: "{typography.nav}"
  input:
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "4px 12px"
    height: "36px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "24px"
  agent-badge:
    backgroundColor: "{colors.agent-soft}"
    textColor: "{colors.agent-ink}"
    rounded: "{rounded.pill}"
    padding: "5px 8px"
---

# Design System: AgentShelf

## Overview

**Creative North Star: "The Maker's Open Shelf"**

AgentShelf should feel like a small workshop opened to new customers: welcoming, careful with craft, and fluent in commerce without looking like a payment processor. Warm paper and dark ink create a quiet base. Deep indigo gives actions a decisive voice, while amber appears sparingly where an agent-specific cue helps people scan.

An editorial serif gives the most important sentences a distinctive voice; Inter keeps shop operations, product details, and agent terms clear. Borders and tonal shifts separate most surfaces, with soft shadows reserved for the hero preview and sign-in card. Product examples stay visibly illustrative rather than posing as customer proof.

**Key Characteristics:**
- Warm paper with strong ink contrast.
- Instrument Serif for display and Inter for product and merchant UI.
- Indigo for primary actions; amber for agent cues.
- Product-forward layouts with measured spacing.

## Colors

The palette pairs a warm paper field and soft neutral surfaces with deep indigo; amber and semantic colors appear in small, purposeful roles.

### Primary
- **Deep Shelf Indigo**: the primary action and focused-control color.
- **Maker Amber**: an agent cue for badges and small highlights, not a page-wide wash.

### Neutral
- **Warm Paper**: the page background.
- **Soft Porcelain**: cards and popovers.
- **Ink** and **Quiet Charcoal**: primary and secondary text.
- **Workshop Mist** and **Muted Type**: recessed surfaces and lower-priority copy.
- **Fine Border** and **Input Stone**: card edges, dividers, and form strokes.
- **Sidebar Linen**, **Sidebar Lavender**, and **Sidebar Border**: the merchant navigation surface and selected state.

### Status Colors
- **Kiln Green**: positive or successful states.
- **Clear Red**: destructive actions and errors.
- **Agent Cream** and **Agent Umber**: the badge fill and foreground pair for agent readiness.

**The Indigo Action Rule.** Put the primary action in deep indigo; reserve amber for agent-specific cues and highlights.

## Typography

**Display Font:** Instrument Serif (with Georgia, serif fallback)  
**Body Font:** Inter (with Arial, sans-serif fallback)  
**Label/Mono Font:** Inter for compact labels; a system monospace stack for endpoint text.

**Character:** The display face is expressive and editorial, while Inter carries information density without competing with it. The serif is for key display lines and product titles; merchant controls remain in Inter.

### Hierarchy
- **Display** (Instrument Serif 400, clamp(64px, 7.2vw, 92px), 0.94 line height): the landing hero.
- **Compact display** (Instrument Serif 400, clamp(57px, 16vw, 74px), 0.94 line height): the landing hero at narrow widths.
- **Headline** (Instrument Serif 400, clamp(42px, 5vw, 57px), 1 line height): auth, merchant, and storefront page titles.
- **Title** (Instrument Serif 400, 25px, 1.08 line height): storefront product titles.
- **Body** (400, 16px, 1.55 line height): default reading and form text.
- **Label** (600–650, 10–13px, lightly tracked): compact metadata and category labels.
- **Navigation** (Inter 400, 14px, 1.4 line height): desktop navigation links.
- **Endpoint** (400, 12px, monospace): copyable MCP URL.

**The Serif Signal Rule.** Keep Instrument Serif on display lines and product names; use Inter for controls, supporting copy, and navigation.

## Layout

The main page container tops out at 1240px with 48px side gutters. At 980px and below it uses a 760px maximum with 40px gutters; at 640px and below it uses a 540px maximum with 32px gutters. The landing hero changes from a two-column composition to one column below 980px, and the product grid steps from three columns to two, then one. Merchant navigation changes from a fixed desktop rail to a sheet on compact screens.

Use 8px, 12px, 16px, and 24px intervals for common component gaps and padding; larger 32px and 48px steps create section breathing room. Keep actions close to their supporting text and preserve generous space around display headlines.

## Elevation & Depth

Depth is restrained and hybrid: hairline borders and small tonal shifts do most of the work. Ambient shadows lift only the hero preview and sign-in card; routine product cards remain border-led.

### Shadow Vocabulary
- **Hero preview** (0 24px 56px rgba(32, 27, 63, 0.10)): diffuse separation from the page.
- **Sign-in card** (0 18px 50px rgba(31, 28, 53, 0.06)): a quieter lift for the focused form surface.

**The Quiet Depth Rule.** Default to borders and warm surface shifts; reserve shadows for the two prominent surfaces that need separation.

## Shapes

The shared radius base is 12px. UI primitives use 8–16px corners; sign-in and hero surfaces use 18–20px corners. Chips and prominent landing actions use a full pill. Use one-pixel warm borders for cards and fields; keep the hero preview clipped inside its rounded frame.

## Components

### Buttons
Primary actions use a compact rounded control in merchant UI and a fuller pill on the landing page.
- **Primary:** deep-indigo fill, white text, 10px radius, 36px default height, and 16px horizontal padding.
- **Hero primary:** deep-indigo pill, 48px minimum height, and 22px horizontal padding.
- **Secondary:** translucent porcelain fill, stone border, and the same pill shape as the hero action.
- **Hover / Focus:** primary buttons shift slightly in indigo on hover; focus uses a visible indigo ring with a 3px halo.

### Chips
The Agent-ready badge uses a warm amber tint, umber text, a thin gold border, and a pill silhouette. Technical endpoint text uses the monospace stack inside a bordered chip.

### Cards / Containers
- **Corner Style:** 12–20px depending on surface; product cards use 14px, the hero preview uses 20px.
- **Background:** porcelain over warm paper.
- **Shadow Strategy:** border-led for catalog cards; soft ambient lift only where named in Elevation & Depth.
- **Border:** one-pixel warm neutral.
- **Internal Padding:** 19–24px for product details and card content.

### Inputs / Fields
Fields use a warm stone border, transparent fill over the surrounding card, and 10px corners. Keyboard focus adds an indigo border and halo; invalid fields use the destructive color.

### Navigation
Landing navigation uses a quiet Inter link row and a compact brand mark. At 980px and below the row collapses while the brand and primary action remain; merchant navigation becomes a sheet.

### Signature Component: Agent-Ready Listing Preview
The first viewport shows a listing panel with maker-set price-floor context, an example request, and shop-rule status. It uses a bordered porcelain frame, a modest image placeholder, and compact product details to make the product promise concrete.

## Do's and Don'ts

### Do:
- **Do** keep the theme light and the background warm.
- **Do** pair Instrument Serif display text with Inter UI text.
- **Do** use indigo for primary actions and amber for agent cues.
- **Do** show price and maker-set floor together where both are relevant.
- **Do** identify the hero product panel as an illustrative preview.

### Don't:
- **Don't** use PayPal's logo or brand colors.
- **Don't** present synthetic demo shops, products, or metrics as real customer proof.
- **Don't** introduce a dark theme unless a later brief changes the light-only requirement.


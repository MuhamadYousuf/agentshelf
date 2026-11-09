# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js App Router, TypeScript strict mode, Tailwind CSS, and pnpm. Vercel Hobby is the deployment target; Neon Postgres is the production database.

## Users

Small shop merchants photograph and publish their products. AI agents discover those shops, negotiate within merchant rules, and buy on behalf of their users.

## Product Purpose

AgentShelf helps small shops become discoverable and purchasable by AI agents, with payments planned through PayPal.

## Positioning

Merchants publish agent-readable shops with their own negotiation policies. Agents can receive signed quotes or use a buyer-issued Agent Pass with a spending mandate.

## Operating Context

The merchant flow is capture, AI-assisted listing draft, and publish. Agents discover products through an MCP server, negotiate within merchant rules, and pay. Merchants review agent orders in a dashboard and manage them with a copilot.

## Capabilities and Constraints

This foundation phase includes schema, authentication, page shells, and local demo data. It makes no PayPal or AI calls. Future payments are intended to use PayPal sandbox, PayPal Vault v3 for Agent Pass, and the PayPal Agent Toolkit for the copilot.

## Brand Commitments

The product is named AgentShelf. Do not use PayPal's logo or brand colors; the text "PayPal" may be used where the product needs to identify the payment provider.

## Evidence on Hand

The brief supplies a synthetic demo shop, Maya's Clay Studio, and five sample products. Do not present invented merchants, customers, or outcome metrics as real proof.

## Product Principles

- Keep merchants in control of pricing, discounts, and order acceptance.
- Make the agent purchase path legible to both the merchant and the buyer.
- Use a spending mandate when an agent can act for a buyer.
- Keep payments on the merchant's configured payment path.

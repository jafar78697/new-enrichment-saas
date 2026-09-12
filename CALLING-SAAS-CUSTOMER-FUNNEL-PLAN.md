# Calling SaaS Customer Funnel Plan

## Current Step

Public home page at `https://voicecalling.space/` should introduce JentoAI as a cold-calling system for USA and Canada, explain demo access, show billing information, and send customers to the login/start flow.

## Flow

1. Customer lands on `/`.
2. Customer reads intro, billing, and more-information sections.
3. Customer clicks `Start Free Demo`.
4. Customer logs in or uses the future Google login/demo account flow.
5. Customer reaches dashboard with limited demo allowance.
6. Customer can place 1-2 demo calls from an assigned trial number.
7. After demo allowance is used, billing dashboard becomes the primary screen.
8. Customer chooses number quantity and monthly calling package.
9. Customer pays by JazzCash and submits transaction proof/screenshot.
10. Admin reviews payment, approves it, assigns/purchases numbers, and activates access.

## Remaining Implementation

- Add Google login or passwordless demo signup.
- Create trial tenant/user automatically with a demo-call limit.
- Add a demo number pool for trial accounts.
- Enforce 1-2 free calls in backend metering.
- Show upgrade prompt after demo calls are used.
- Make customer billing package use `$20 per number / month` as the primary option.
- Add screenshot upload/paste support instead of proof URL only.
- Keep admin operations separate at `/admin`: customers, payment queue, approved payments, number assignment, and activation history.

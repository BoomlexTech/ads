# AI Pilots: buttons and screens

Status as of 2026-10-09. Everything below is local only and has not been deployed.

## Done
- **Navigation:**
  - The main menu button hides and shows the side navigation.
  - Refresh also reloads Change history.
  - **Billing** (left rail): Summary works out spend this month, last month and the last 30 days from the account's cost data, adds up enabled campaigns' daily budgets and shows an estimated month total (labelled as an estimate), plus the billing profile. Settings holds the billing profile (name, address, email, phone, tax ID, currency), which admins edit inline and Change history logs. Billing activity, Documents, Payment methods, Promotions and Billing transfers show an empty state, because no payment provider is connected.
  - The **"Get the app" card** is back. Admins add the app link on the card, and the QR code is made from that link. Admins can also edit the title and text. Read-only users see the card only once a link is set.
- **Top bar:**
  - **Quick help** panel with articles written for this app. Every "Learn more" link opens it at the right topic.
  - **Appearance → Spacing:** Large, Medium, Small, Extra small.
  - **Top search:** recent campaigns, Advisor suggestions and Send feedback.
  - **Feedback** dialog. Feedback is saved on the server and admins see it on a Feedback page.
  - **Create (+) menu** in the left rail, for admins only.
- **Ask Advisor** is now a chat:
  - Welcome summary, 30-day snapshot and insight cards, all worked out from the account data.
  - Follow-up questions, history, and a message box.
  - It answers "Analyze ad" and "How can I optimize <campaign>?" from that ad's or campaign's own numbers.
- **Tables:**
  - Campaign-type views (Search / Video / Demand Gen / Display campaigns).
  - Saved filter, status filters, and an Add filter search box.
  - Create submenus that work by click and keyboard.
  - Saved column sets, and the "Show recommended columns" switch.
  - Stacked chart, Layers grouping, and Segment by time or ad format.
  - Monday or Sunday week start, and typed start and end dates.
  - Viewers see no edit, create or upload controls.
- **Ads create menu:** Responsive search ad, Video ad, Responsive display ad, Demand Gen ad, Ad variation (not available yet), and **Upload display ads**, which creates a display ad from images you upload.
- **Asset details** page for every ad ("View asset details"):
  - Assets table, policy banner and "Analyze ad".
  - CSV download.
  - Shows a note when the ad hasn't been set up in the edit page yet.
- **Ad edit page:**
  - Suggested images menu and hover actions.
  - Image, logo and video guideline popovers.
  - **More ideas** dialog for headlines, descriptions and the long headline, with Suggested, Asset library and Generated tabs. "Generated" builds ideas from your text with templates; no AI service is involved, and it says so.
  - Additional format options.
  - Ad URL options: tracking template, URL suffix, custom parameters, Test and mobile URL.

## Still to build: send a screenshot or a short description
1. Overview page
2. Recommendations page
3. Insights and reports
4. Experiments
5. Campaign groups
6. Assets list (account level)
7. Audiences, keywords and content
8. Goals: Summary, Conversions, Measurement
9. Tools: which of the 11 items you want (the rest stay hidden or muted)
10. Admin pages: Account settings, Preferences, Notifications, Access and security, Policy
11. Create view and saving filters as a view
12. Add filter field pickers (Performance, Conversions, Campaign name, ...)
13. Reports: predefined reports and report editor
14. Custom column builder
15. Budget simulator
16. Campaign drafts
17. Ad variation
18. Image crop / edit
19. Terms and AI policy: your own wording is needed

These show as "Not available" in the app until they're built.

## Not faked
- **Billing records:** with no payment provider connected there are no invoices, payments, balances, promotions or transfers to show, and nobody can type them in. The currency setting is a label only and converts nothing.
- **AI image generation, website scan and stock images:** these need a real image service.
- **Missing segments and columns:** Device and network segments, and the Engagements and Video views columns, have no data behind them.

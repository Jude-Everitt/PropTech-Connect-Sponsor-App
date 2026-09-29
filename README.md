# PropTech Connect Sponsor Portal

A project management tool for sponsors taking part in PropTech Connect. It highlights campaign details and roadmaps, with an admin portal for PTC staff to track sponsor progress going into an event.

## Google Sheets Sync

The importer uses one Google Sheet per event. The sponsor roster and sponsor names come only from column E of the `Contracts` tab; rows from other tabs are merged only when their company matches a sponsor on that roster. Use the first row as headers with contract details such as `tier` and `entitlements`. Entitlements can be comma-separated (`panel,booth`) or represented by boolean columns such as `panel`, `roundtable`, and `booth`. The complete matched source data is stored in each sponsor's `contract_details` JSON field.

After running the schema, register an event and its sheet in Supabase:

```sql
insert into public.events (name, start_date, location, google_sheet_id, google_sheet_range)
values (
	'PropTech Connect Middle East 27',
	'2027-03-18',
	'Middle East',
	'YOUR_SHEET_ID',
	'Contracts!A:ZZ'
);
```

The sheet ID is the value between `/d/` and `/edit` in the Google Sheets URL. The admin **Sync now** button reads only the current event's sheet; the scheduled sync reads every event with a configured sheet.

Add these server-only values to `.env.local` and to the deployment environment:

```env
SUPABASE_SERVICE_ROLE_KEY=your-server-only-supabase-key
CRON_SECRET=a-long-random-secret
```

Share the Google Sheet with `GOOGLE_SERVICE_ACCOUNT_EMAIL`. `vercel.json` schedules `/api/sync/sheet` every 15 minutes, but the schedule only runs after deployment to Vercel on a plan that supports Cron. Configure `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, and the Google credentials in the Vercel project's production environment before deployment. `CRON_SECRET` must be the same value used by the deployed cron request and route. The manual **Sync now** button remains available to admins.

The sheet sync is additive: it finds sponsors by normalized company name, sponsor-event links by `(sponsor_id, event_id)`, and tasks by `(sponsor_event_id, title)`. Existing tasks are updated only with sync-owned descriptive/entitlement fields; sponsor submissions, status, deadlines, and file metadata are left intact. The database also enforces uniqueness on normalized sponsor names, sponsor-event links, and task titles per sponsor-event.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

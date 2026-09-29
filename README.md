# PropTech Connect Sponsor Portal

## Google Sheets Sync

The importer uses one Google Sheet per event. Use the first row as headers with columns such as `company_name`, `tier`, and `entitlements`. Entitlements can be comma-separated (`panel,booth`) or represented by boolean columns such as `panel`, `roundtable`, and `booth`. The complete source row is stored in each sponsor's `contract_details` JSON field.

After running the schema, register an event and its sheet in Supabase:

```sql
insert into public.events (name, start_date, location, google_sheet_id, google_sheet_range)
values (
	'PropTech Connect Middle East 27',
	'2027-03-18',
	'Middle East',
	'YOUR_SHEET_ID',
	'Sheet1!A:Z'
);
```

The sheet ID is the value between `/d/` and `/edit` in the Google Sheets URL. The admin sync button reads only the current event's sheet; the scheduled sync reads every event with a configured sheet.

Add these server-only values to `.env.local` and to the deployment environment:

```env
SUPABASE_SERVICE_ROLE_KEY=your-server-only-supabase-key
CRON_SECRET=a-long-random-secret
```

Share the Google Sheet with `GOOGLE_SERVICE_ACCOUNT_EMAIL`. The admin deliverables page has a manual **Sync spreadsheet** button, and `vercel.json` schedules the same sync every 15 minutes. Vercel Cron requires a Vercel plan that supports cron jobs.

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
